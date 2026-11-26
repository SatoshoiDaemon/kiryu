const { randomUUID, createHash } = require('node:crypto');
const { SquareCloudBlob } = require('@squarecloud/blob');
const BlobObject = require('../database/models/BlobObject');
const metrics = require('./performanceMetrics');

const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 100 * 1024 * 1024;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const CACHE_TTL_MS = 120_000;
const imageTypes = new Map([
  ['image/png', { ext: 'png', signature: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { ext: 'jpg', signature: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ['image/gif', { ext: 'gif', signature: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) }],
  ['image/webp', { ext: 'webp', signature: (b) => b.length >= 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' }],
]);
const downloadCache = new Map();
let cacheBytes = 0;
let blobClient;

function getClient() {
  const key = process.env.SQUARECLOUD_API_KEY;
  if (!key) throw Object.assign(new Error('O armazenamento Square Cloud não está configurado.'), { code: 'BLOB_NOT_CONFIGURED' });
  if (!blobClient) blobClient = new SquareCloudBlob(key, { maxRetries: 2 });
  return blobClient;
}

function validateImage(buffer, filename, { maxBytes = DEFAULT_MAX_FILE_BYTES, minBytes = 512 } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('O arquivo recebido é inválido.');
  if (buffer.length < minBytes) throw new RangeError('A imagem precisa ter pelo menos 512 bytes.');
  if (buffer.length > maxBytes) throw new RangeError('A imagem ultrapassa o limite de ' + Math.round(maxBytes / 1024 / 1024) + ' MB.');
  const declaredExt = String(filename || '').split('.').pop().toLowerCase();
  const entry = [...imageTypes.entries()].find(([, value]) => value.ext === declaredExt);
  const detected = [...imageTypes.entries()].find(([, value]) => value.signature(buffer));
  if (!detected || (entry && entry[0] !== detected[0])) throw new RangeError('Envie uma imagem PNG, JPEG, GIF ou WebP válida.');
  return { mimeType: detected[0], extension: detected[1].ext };
}

function sanitizeName(name) {
  const clean = String(name || 'asset').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/\.\./g, '-').replace(/^[^A-Za-z0-9_]+/, '').slice(0, 80);
  return clean || 'asset';
}

async function readBoundedResponse(response, maxBytes) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new RangeError('O arquivo ultrapassa o limite de tamanho aceito.');
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new RangeError('O arquivo ultrapassa o limite de tamanho aceito.');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RangeError('O arquivo ultrapassa o limite de tamanho aceito.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function cacheSet(id, buffer, contentType) {
  if (buffer.length > MAX_CACHE_BYTES / 2) return;
  const previous = downloadCache.get(id);
  if (previous) cacheBytes -= previous.buffer.length;
  downloadCache.set(id, { buffer, contentType, expiresAt: Date.now() + CACHE_TTL_MS });
  cacheBytes += buffer.length;
  while (cacheBytes > MAX_CACHE_BYTES && downloadCache.size) {
    const oldestKey = downloadCache.keys().next().value;
    cacheBytes -= downloadCache.get(oldestKey).buffer.length;
    downloadCache.delete(oldestKey);
  }
}

function cacheDelete(id) {
  const key = String(id);
  const cached = downloadCache.get(key);
  if (cached) cacheBytes = Math.max(0, cacheBytes - cached.buffer.length);
  downloadCache.delete(key);
}

async function upload({ guildId, category = 'other', name, filename, buffer, createdBy, maxFileBytes = 0, replaceObjectId = '' }) {
  const started = metrics.performance.now();
  const { GuildConfig } = require('../database');
  const guildConfig = await GuildConfig.findById(String(guildId)).select('storage').lean();
  if (guildConfig?.storage?.uploadsEnabled === false) throw new RangeError('Os uploads para o Blob estão pausados neste servidor.');
  const fileLimit = Math.min(100 * 1024 * 1024, Number(guildConfig?.storage?.maxFileBytes || DEFAULT_MAX_FILE_BYTES), Number(maxFileBytes || 100 * 1024 * 1024));
  const validation = validateImage(buffer, filename, { maxBytes: fileLimit });
  const quotaLimit = Number(guildConfig?.storage?.maxBytes || 0);
  if (quotaLimit > 0) {
    const [usage, replaced] = await Promise.all([
      BlobObject.aggregate([{ $match: { guildId: String(guildId), deletedAt: null } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]),
      replaceObjectId ? BlobObject.findOne({ _id: String(replaceObjectId), guildId: String(guildId), deletedAt: null }).lean() : null,
    ]);
    const supportedRefs = new Set(['profile', 'product', 'template', 'message', 'trigger', 'badge', 'frame', 'cosmetic', 'design-system', 'casino']);
    const canReclaim = replaced && replaced.references.every((ref) => supportedRefs.has(ref.system));
    const remaining = (usage[0]?.bytes || 0) - (canReclaim ? replaced.size : 0);
    if (remaining + buffer.length > quotaLimit) throw new RangeError('O limite local de armazenamento deste servidor seria excedido.');
  }
  const safeFilename = sanitizeName(filename).replace(/\.[^.]+$/, '') + '.' + validation.extension;
  const objectName = sanitizeName(name || safeFilename.replace(/\.[^.]+$/, '')) + '-' + randomUUID().slice(0, 8);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  let uploaded;
  try {
    uploaded = await getClient().put(buffer, {
      name: objectName,
      filename: safeFilename,
      mime_type: validation.mimeType,
      prefix: 'kiryu/' + String(guildId) + '/' + category,
      security_hash: true,
      private: false,
      checksum_sha256: sha256,
    });
    const doc = await BlobObject.create({
      _id: uploaded.id, guildId: String(guildId), category, name: String(name || safeFilename).slice(0, 100),
      filename: safeFilename, mimeType: validation.mimeType, size: buffer.length, url: uploaded.url,
      etag: uploaded.etag || '', sha256: uploaded.sha256 || sha256, createdBy: String(createdBy), references: [],
    });
    cacheSet(doc._id, buffer, validation.mimeType);
    return doc.toObject();
  } catch (error) {
    if (uploaded?.id) await getClient().delete(uploaded.id).catch(() => {});
    throw error;
  } finally { metrics.record('blob', 'upload', metrics.performance.now() - started); }
}

async function fetchDiscordAttachment(attachment, { maxBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  if (!attachment || !/^https:\/\//i.test(String(attachment.url || ''))) throw new RangeError('Selecione um anexo de imagem do Discord.');
  if (Number(attachment.size) > maxBytes) throw new RangeError('O anexo ultrapassa o limite de ' + Math.round(maxBytes / 1024 / 1024) + ' MB.');
  const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Não foi possível baixar o anexo enviado pelo Discord.');
  const declaredLength = Number(response.headers.get('content-length') || attachment.size || 0);
  if (declaredLength > maxBytes) throw new RangeError('O anexo ultrapassa o limite de ' + Math.round(maxBytes / 1024 / 1024) + ' MB.');
  const buffer = await readBoundedResponse(response, maxBytes);
  if (buffer.length > maxBytes) throw new RangeError('O anexo ultrapassa o limite de ' + Math.round(maxBytes / 1024 / 1024) + ' MB.');
  return { buffer, filename: attachment.name || 'discord-image.' + (attachment.contentType === 'image/jpeg' ? 'jpg' : 'png') };
}

async function download(objectId) {
  const started = metrics.performance.now();
  const cached = downloadCache.get(String(objectId));
  if (cached && cached.expiresAt > Date.now()) {
    downloadCache.delete(String(objectId)); downloadCache.set(String(objectId), cached);
    metrics.record('blob.cache', 'hit', 0); return { buffer: cached.buffer, contentType: cached.contentType, cached: true };
  }
  if (cached) { cacheBytes -= cached.buffer.length; downloadCache.delete(String(objectId)); }
  metrics.record('blob.cache', 'miss', 0);
  try {
    const link = await getClient().downloadUrl(String(objectId), { expires: 600 });
    const response = await fetch(link.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('Não foi possível baixar o objeto do Blob.');
    const buffer = await readBoundedResponse(response, MAX_OBJECT_BYTES);
    cacheSet(String(objectId), buffer, link.content_type);
    return { buffer, contentType: link.content_type, cached: false };
  } finally { metrics.record('blob', 'download', metrics.performance.now() - started); }
}

async function info(objectId) {
  const started = metrics.performance.now();
  try { return await getClient().info(String(objectId)); }
  finally { metrics.record('blob', 'info', metrics.performance.now() - started); }
}

async function listPage({ guildId, category, page = 0, limit = 25 } = {}) {
  const started = metrics.performance.now();
  try {
    const query = { guildId: String(guildId), deletedAt: null, ...(category && category !== 'all' ? { category } : {}) };
    const [objects, total] = await Promise.all([
      BlobObject.find(query).sort({ createdAt: -1 }).skip(Math.max(0, page) * limit).limit(limit + 1).lean(),
      BlobObject.countDocuments(query),
    ]);
    return { objects: objects.slice(0, limit), total, hasNext: objects.length > limit, page, pages: Math.max(1, Math.ceil(total / limit)) };
  } finally { metrics.record('blob', 'list', metrics.performance.now() - started); }
}

async function stats(guildId) {
  const started = metrics.performance.now();
  try {
    const [account, local] = await Promise.all([
      getClient().stats(),
      BlobObject.aggregate([{ $match: { guildId: String(guildId), deletedAt: null } }, { $group: { _id: null, objects: { $sum: 1 }, storage: { $sum: '$size' }, references: { $sum: { $size: '$references' } } } }]),
    ]);
    return { account: account.usage, guild: local[0] || { objects: 0, storage: 0, references: 0 }, cache: { entries: downloadCache.size, bytes: cacheBytes } };
  } finally { metrics.record('blob', 'stats', metrics.performance.now() - started); }
}

async function addReference(objectId, guildId, system, key) {
  const reference = { system: String(system).slice(0, 40), key: String(key).slice(0, 160) };
  const doc = await BlobObject.findOneAndUpdate({ _id: String(objectId), guildId: String(guildId), deletedAt: null,
    references: { $not: { $elemMatch: { system: reference.system, key: reference.key } } } }, { $push: { references: reference } }, { new: true }).lean();
  if (!doc) {
    const existing = await BlobObject.findOne({ _id: String(objectId), guildId: String(guildId), deletedAt: null, 'references.system': reference.system, 'references.key': reference.key }).lean();
    if (!existing) throw new Error('O objeto não existe neste servidor.');
    return existing;
  }
  return doc;
}

async function removeReference(objectId, guildId, system, key) {
  return BlobObject.findOneAndUpdate({ _id: String(objectId), guildId: String(guildId) }, { $pull: { references: { system: String(system), key: String(key) } } }, { new: true }).lean();
}

async function updateReference({ guildId, system, key, oldObjectId, newObjectId }) {
  if (newObjectId) await addReference(newObjectId, guildId, system, key);
  if (oldObjectId && oldObjectId !== newObjectId) await removeReference(oldObjectId, guildId, system, key);
}

async function deleteObject(objectId, guildId, { force = false } = {}) {
  const started = metrics.performance.now();
  try {
    const doc = await BlobObject.findOne({ _id: String(objectId), guildId: String(guildId), deletedAt: null });
    if (!doc) return { deleted: false, reason: 'not_found' };
    if (!force && doc.references.length) return { deleted: false, reason: 'referenced', references: doc.references };
    await getClient().delete(String(objectId));
    cacheDelete(objectId);
    doc.deletedAt = new Date();
    await doc.save();
    return { deleted: true };
  } finally { metrics.record('blob', 'delete', metrics.performance.now() - started); }
}

async function renameObject(objectId, guildId, name) {
  const started = metrics.performance.now();
  try {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 100) throw new RangeError('O nome deve ter de 1 a 100 caracteres.');
  return BlobObject.findOneAndUpdate({ _id: String(objectId), guildId: String(guildId), deletedAt: null }, { $set: { name: trimmed } }, { new: true }).lean();
  } finally { metrics.record('blob', 'rename', metrics.performance.now() - started); }
}

async function replaceObjectInternal(oldObjectId, newObjectId, guildId) {
  const oldObject = await BlobObject.findOne({ _id: String(oldObjectId), guildId: String(guildId), deletedAt: null });
  const newObject = await BlobObject.findOne({ _id: String(newObjectId), guildId: String(guildId), deletedAt: null });
  if (!oldObject || !newObject) throw new RangeError('Objeto para substituição não encontrado.');
  const refs = [...oldObject.references];
  const supported = new Set(['profile', 'product', 'template', 'message', 'trigger', 'badge', 'frame', 'cosmetic', 'design-system', 'casino']);
  const unsupported = refs.filter((ref) => !supported.has(ref.system));
  if (unsupported.length) throw new RangeError('Há referências que não podem ser atualizadas automaticamente: ' + unsupported.map((ref) => ref.system).join(', ') + '.');
  const { MemberProfile, EconomyItem, GuildConfig, BadgeDefinition, ManagedMessage } = require('../database');
  for (const ref of refs) {
    if (ref.system === 'profile') {
      const result = await MemberProfile.updateOne({ guildId: String(guildId), userId: ref.key, backgroundBlobId: oldObject._id }, { $set: { backgroundBlobId: newObject._id, backgroundImageUrl: newObject.url || '' } });
      if (!result.modifiedCount) throw new Error('A referência de perfil não corresponde mais ao objeto antigo.');
    } else if (ref.system === 'product') {
      const result = await EconomyItem.updateOne({ guildId: String(guildId), sku: ref.key, thumbnailBlobId: oldObject._id }, { $set: { thumbnailBlobId: newObject._id, thumbnailUrl: newObject.url || '' } });
      if (!result.modifiedCount) throw new Error('A referência do produto não corresponde mais ao objeto antigo.');
    } else if (ref.system === 'template') {
      const guild = await GuildConfig.findById(String(guildId));
      const template = guild?.messageTemplates?.find((item) => item.name === ref.key && item.payload?.imageObjectId === oldObject._id);
      if (!template) throw new Error('A referência do template não corresponde mais ao objeto antigo.');
      template.payload.imageObjectId = newObject._id;
      template.payload.imageUrl = newObject.url || '';
      await guild.save();
    } else if (ref.system === 'trigger') {
      const guild = await GuildConfig.findById(String(guildId));
      const trigger = guild?.triggers?.id(ref.key);
      const asset = trigger?.assets?.find((item) => item.objectId === oldObject._id);
      if (!trigger || !asset) throw new Error('A referência do gatilho não corresponde mais ao objeto antigo.');
      asset.objectId = newObject._id; asset.url = newObject.url || ''; asset.filename = newObject.filename;
      await guild.save();
    } else if (ref.system === 'badge') {
      const badge = await BadgeDefinition.findOne({ guildId: String(guildId), _id: ref.key });
      if (!badge || badge.assetBlobId !== oldObject._id) throw new Error('A referência da badge não corresponde mais ao objeto antigo.');
      badge.assetBlobId = newObject._id; badge.assetUrl = newObject.url || ''; await badge.save();
    } else if (ref.system === 'message') {
      const result = await ManagedMessage.updateOne({ guildId: String(guildId), messageId: ref.key, imageObjectId: oldObject._id }, {
        $set: { imageObjectId: newObject._id, 'payload.imageObjectId': newObject._id, 'payload.imageUrl': newObject.url || '' },
      });
      if (!result.modifiedCount) throw new Error('A referência da mensagem não corresponde mais ao objeto antigo.');
    }
    await addReference(newObject._id, guildId, ref.system, ref.key);
    await removeReference(oldObject._id, guildId, ref.system, ref.key);
  }
  if (!refs.length) {
    await getClient().delete(oldObject._id);
    cacheDelete(oldObject._id);
    oldObject.deletedAt = new Date(); await oldObject.save();
    return { oldObject, newObject, deleted: true };
  }
  const remaining = await BlobObject.findById(oldObject._id).lean();
  if (!remaining?.references?.length) {
    await getClient().delete(oldObject._id);
    cacheDelete(oldObject._id);
    oldObject.deletedAt = new Date(); await oldObject.save();
    return { oldObject, newObject, deleted: true };
  }
  return { oldObject, newObject, deleted: false };
}

async function replaceObject(oldObjectId, newObjectId, guildId) {
  const started = metrics.performance.now();
  try { return await replaceObjectInternal(oldObjectId, newObjectId, guildId); }
  finally { metrics.record('blob', 'replace', metrics.performance.now() - started); }
}

function blobErrorMessage(error) {
  const code = String(error?.code || error?.name || '');
  const messages = {
    MISSING_SCOPE: 'A chave Square Cloud precisa do escopo blob:write e blob:read.',
    RESOURCE_NOT_ALLOWED: 'A chave Square Cloud não tem acesso a este recurso.',
    PERMISSION_DENIED: 'O plano atual da Square Cloud não habilita esta operação.',
    UPGRADE_REQUIRED: 'O plano atual da Square Cloud não inclui este recurso.',
    STORAGE_QUOTA_EXCEEDED: 'O espaço contratado no Square Cloud Blob está esgotado.',
    RATE_LIMITED: 'O limite de chamadas do Square Cloud Blob foi atingido. Tente novamente em instantes.',
    STORAGE_UNAVAILABLE: 'O Square Cloud Blob está temporariamente indisponível.',
    FILE_TOO_SMALL: 'O arquivo precisa ter pelo menos 512 bytes.',
    FILE_TOO_LARGE: 'O arquivo excede o limite aceito pelo Square Cloud Blob.',
    BLOCKED_FILE_TYPE: 'O tipo de arquivo não é permitido pelo Square Cloud Blob.',
    CHECKSUM_MISMATCH: 'A verificação de integridade do arquivo falhou.',
    BLOB_NOT_CONFIGURED: 'O armazenamento Square Cloud não está configurado neste processo.',
  };
  return messages[code] || 'A operação no armazenamento falhou (' + code.slice(0, 60) + ').';
}

module.exports = { getClient, validateImage, fetchDiscordAttachment, upload, download, info, listPage, stats, addReference, removeReference, updateReference, deleteObject, renameObject, replaceObject, blobErrorMessage, DEFAULT_MAX_FILE_BYTES, MAX_OBJECT_BYTES };
