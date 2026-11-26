const { validateImage, blobErrorMessage } = require('../src/modules/blobStorage');

function imageBuffer(signature, bytes = 512) {
  const buffer = Buffer.alloc(bytes);
  Buffer.from(signature).copy(buffer);
  return buffer;
}

describe('validação do Square Cloud Blob', () => {
  test.each([
    ['profile.png', [137, 80, 78, 71, 13, 10, 26, 10], 'image/png'],
    ['profile.jpg', [255, 216, 255], 'image/jpeg'],
    ['profile.gif', 'GIF89a', 'image/gif'],
    ['profile.webp', 'RIFF0000WEBP', 'image/webp'],
  ])('reconhece assinatura válida de %s', (filename, signature, mimeType) => {
    expect(validateImage(imageBuffer(signature), filename)).toMatchObject({ mimeType });
  });

  test('recusa arquivo pequeno, tipo de conteúdo divergente e arquivo acima do limite', () => {
    expect(() => validateImage(Buffer.alloc(80), 'tiny.png')).toThrow(/512 bytes/);
    expect(() => validateImage(imageBuffer('GIF89a'), 'fake.png')).toThrow(/PNG, JPEG, GIF ou WebP/);
    expect(() => validateImage(imageBuffer([137, 80, 78, 71, 13, 10, 26, 10], 1024), 'large.png', { maxBytes: 512 })).toThrow(/ultrapassa o limite/);
  });

  test('traduz erros do provedor sem expor detalhes privados', () => {
    expect(blobErrorMessage({ code: 'MISSING_SCOPE' })).toContain('blob:write');
    expect(blobErrorMessage({ code: 'STORAGE_UNAVAILABLE', message: 'segredo interno' })).not.toContain('segredo interno');
  });
});
