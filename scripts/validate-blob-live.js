require('dotenv').config({ quiet: true });
const { randomUUID, createHash } = require('node:crypto');
const { createCanvas } = require('@napi-rs/canvas');
const { SquareCloudBlob } = require('@squarecloud/blob');
const config = require('../src/config');

function sampleImage(color) {
  const canvas = createCanvas(256, 256);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = '#ffffff';
  for (let y = 0; y < 256; y += 16) for (let x = (y % 32 ? 8 : 0); x < 256; x += 32) context.fillRect(x, y, 8, 8);
  return canvas.toBuffer('image/png');
}

function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function report(operation, value = 'ok') { process.stdout.write(operation + ': ' + value + '\n'); }
let operation = 'startup';

async function main() {
  const apiKey = process.env.SQUARECLOUD_API_KEY;
  if (!apiKey) throw new Error('SQUARECLOUD_API_KEY ausente.');
  if (!config.guildId) throw new Error('SERVER_ID ausente para o namespace de validação.');
  const blob = new SquareCloudBlob(apiKey, { maxRetries: 1 });
  const prefix = 'kiryu/' + config.guildId + '/validation/' + randomUUID();
  const firstBuffer = sampleImage('#c0265a');
  const secondBuffer = sampleImage('#1e8073');
  let firstId = '';
  let replacementId = '';

  try {
    const created = await blob.put(firstBuffer, {
      name: 'phase-2-3-check', filename: 'check.png', mime_type: 'image/png', prefix,
      private: false, security_hash: false, overwrite: false, checksum_sha256: digest(firstBuffer),
    });
    firstId = created.id;
    if (!firstId || !created.url) throw new Error('Upload não retornou ID e URL permanentes.');
    report('upload', 'ok');

    operation = 'metadata';
    const metadata = await blob.info(firstId);
    if (Number(metadata.size) !== firstBuffer.length) throw new Error('Metadados não correspondem ao objeto enviado.');
    report('metadata', 'ok');

    operation = 'list';
    const page = await blob.listPage({ prefix, limit: 25 });
    if (!page.objects.some((object) => object.id === firstId)) throw new Error('A listagem não encontrou o objeto enviado.');
    report('list', 'ok');

    operation = 'download';
    const link = await blob.downloadUrl(firstId, { expires: 600 });
    const response = await fetch(link.url, { signal: AbortSignal.timeout(20_000) });
    const downloaded = Buffer.from(await response.arrayBuffer());
    if (!response.ok || digest(downloaded) !== digest(firstBuffer)) throw new Error('O conteúdo baixado não corresponde ao upload.');
    report('download', 'ok');

    await new Promise((resolve) => setTimeout(resolve, 1100));
    operation = 'replace';
    const replaced = await blob.put(secondBuffer, {
      name: 'phase-2-3-check', filename: 'check.png', mime_type: 'image/png', prefix,
      private: false, security_hash: true, overwrite: false, checksum_sha256: digest(secondBuffer),
    });
    replacementId = replaced.id;
    if (!replacementId || replacementId === firstId || !replaced.url) throw Object.assign(new Error('Replacement did not create a versioned object.'), { code: 'REPLACEMENT_VERSION_INVALID' });
    report('replacement upload', 'ok');
    operation = 'replacement metadata';
    const afterReplace = await blob.info(replacementId);
    if (Number(afterReplace.size) !== secondBuffer.length) throw Object.assign(new Error('Replacement metadata size mismatch.'), { code: 'REPLACEMENT_SIZE_MISMATCH' });
    if (afterReplace.etag === metadata.etag) throw Object.assign(new Error('Replacement did not change the object etag.'), { code: 'REPLACEMENT_ETAG_UNCHANGED' });
    report('replacement metadata', 'ok');
    operation = 'replacement download';
    const replacementLink = await blob.downloadUrl(replacementId, { expires: 600 });
    const replacementResponse = await fetch(replacementLink.url, { signal: AbortSignal.timeout(20_000) });
    const replacementBytes = Buffer.from(await replacementResponse.arrayBuffer());
    if (!replacementResponse.ok) throw Object.assign(new Error('Replacement download failed.'), { code: 'REPLACEMENT_HTTP_' + replacementResponse.status });
    if (digest(replacementBytes) !== digest(secondBuffer)) throw Object.assign(new Error('Replacement content hash mismatch.'), { code: 'REPLACEMENT_HASH_MISMATCH' });
    report('replace', 'ok');

    try {
      operation = 'statistics';
      const stats = await blob.stats();
      if (!stats.usage) throw new Error('Estatísticas sem dados de utilização.');
      report('stats', 'ok');
    } catch (error) {
      if (error?.code === 'PREFIX_NOT_ALLOWED') report('stats', 'restrito pelo escopo da chave');
      else throw error;
    }
  } finally {
    const ids = [...new Set([replacementId, firstId].filter(Boolean))];
    if (ids.length) {
      const result = await blob.delete(ids);
      if (result.failed?.length || result.not_found?.length) throw new Error('A limpeza dos objetos de validação não foi concluída.');
      report('delete', 'ok');
    }
  }
}

main().catch((error) => {
  const status = error?.status ? ' HTTP ' + error.status : '';
  const code = error?.code || error?.cause?.code || error?.name || 'erro';
  process.stderr.write('Falha na validação real do Blob em ' + operation + ': ' + String(code).slice(0, 60) + status + '. A credencial não foi exibida.\n');
  process.exitCode = 1;
});
