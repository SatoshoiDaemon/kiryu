const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  renderMemberCard, parseColorInput, validateBackgroundUrl, customizationDefaults, renderedCards, sourceImages, updateCustomization, resetCustomization,
} = require('../src/modules/memberProfiles');
const { BADGES, PROFILE_DEFAULTS } = require('../src/modules/profileCatalog');
const { MemberProfile } = require('../src/database');

describe('renderização e personalização de perfis', () => {
  afterEach(() => jest.restoreAllMocks());
  const avatarCanvas = createCanvas(96, 96);
  const avatarContext = avatarCanvas.getContext('2d');
  avatarContext.fillStyle = '#7c3aed'; avatarContext.fillRect(0, 0, 96, 96);
  const avatarUrl = 'data:image/png;base64,' + avatarCanvas.toBuffer('image/png').toString('base64');
  const user = { id: 'preview-member', username: 'Aventureira', globalName: 'Aventureira', displayAvatarURL: () => avatarUrl };

  test.each([
    ['#C0265A', '#C0265A'], ['C0265A', '#C0265A'], ['rgb(192, 38, 90)', '#C0265A'], ['192, 38, 90', '#C0265A'],
  ])('normaliza cor %s', (input, expected) => expect(parseColorInput(input)).toBe(expected));

  test('rejeita cores inválidas e URLs não públicas ou sem HTTPS', () => {
    expect(() => parseColorInput('rgb(256,0,0)')).toThrow(/entre 0 e 255/);
    expect(() => parseColorInput('red')).toThrow(/HEX/);
    expect(() => validateBackgroundUrl('http://example.com/picture.png')).toThrow(/HTTPS/);
    expect(() => validateBackgroundUrl('https://127.0.0.1/private.png')).toThrow(/público/);
    expect(validateBackgroundUrl('')).toBe('');
  });

  test('preserva paletas legadas e oferece um catálogo cosmético variado', () => {
    const oldProfile = customizationDefaults({ accent: 'gold', background: 'aurora', frame: 'royal', badges: ['star', 'moon'] });
    expect(oldProfile.colors.primary).toBe('#fcd34d');
    expect(oldProfile.backgroundStops).toEqual(['#091923', '#123b3d', '#17233d']);
    expect(oldProfile.badges).toEqual(['star', 'moon']);
    expect(BADGES.length).toBeGreaterThanOrEqual(60);
    expect(PROFILE_DEFAULTS.layout).toBe('classic');
  });

  test('persiste cores livres, fundo HTTPS e preferências sem sobrescrever outras cores', async () => {
    const update = jest.spyOn(MemberProfile, 'findOneAndUpdate').mockResolvedValue({});
    await updateCustomization('guild', 'member', {
      colors: { primary: 'C0265A' }, layout: 'portrait', avatarStyle: 'hex', xpBarStyle: 'segmented',
      backgroundImageUrl: 'https://images.example/profile.webp', elementOpacity: 71,
      visibility: { bio: false }, badges: ['dragon', 'sword'],
    });
    expect(update).toHaveBeenCalledWith({ guildId: 'guild', userId: 'member' }, { $set: expect.objectContaining({
      'colors.primary': '#C0265A', 'visibility.bio': false, layout: 'portrait', avatarStyle: 'hex',
      xpBarStyle: 'segmented', backgroundImageUrl: 'https://images.example/profile.webp', elementOpacity: 71,
      badges: ['dragon', 'sword'],
    }) }, { upsert: true, returnDocument: 'after', runValidators: true });
  });

  test('não persiste endereços locais como fundo personalizado', async () => {
    const update = jest.spyOn(MemberProfile, 'findOneAndUpdate').mockResolvedValue({});
    await expect(updateCustomization('guild', 'member', { backgroundImageUrl: 'https://localhost/card.png' })).rejects.toThrow(/HTTPS/);
    expect(update).not.toHaveBeenCalled();
  });

  test('restaura o perfil sem remover badges especiais atribuídas pela staff', async () => {
    const update = jest.spyOn(MemberProfile, 'findOneAndUpdate').mockResolvedValue({ specialBadges: ['founder-medal'] });
    await resetCustomization('guild', 'member');
    expect(update.mock.calls[0][1].$set).not.toHaveProperty('specialBadges');
    expect(update.mock.calls[0][1].$set.badges).toEqual([]);
  });

  test.each([
    ['classic', [1000, 360], { badges: ['star', 'sword'] }],
    ['wide', [1200, 420], { layout: 'wide', colors: { primary: '#10B981', secondary: '#064E3B', highlight: '#A7F3D0', text: '#FFFFFF', xpBar: '#34D399', frame: '#6EE7B7', background: '#071E19' }, avatarStyle: 'square', xpBarStyle: 'segmented', badges: ['dragon', 'shield'] }],
    ['portrait', [800, 900], { layout: 'portrait', frame: 'ornate', avatarStyle: 'hex', xpBarStyle: 'orb', badges: ['moon', 'phoenix'] }],
    ['folio', [1000, 470], { layout: 'folio', frame: 'gilded', elementOpacity: 55, badges: ['spellbook', 'rune'] }],
    ['orbital', [1000, 430], { layout: 'orbital', frame: 'neon', avatarStyle: 'diamond', xpBarStyle: 'minimal', badges: ['comet', 'abyss'] }],
  ])('renderiza o layout %s em PNG', async (_name, dimensions, customization) => {
    const image = await renderMemberCard(user, { level: 42, xp: 734 }, {
      ...PROFILE_DEFAULTS, ...customization, colors: { ...PROFILE_DEFAULTS.colors, ...(customization.colors || {}) },
      visibility: { ...PROFILE_DEFAULTS.visibility }, title: 'Cronista', bio: 'Uma história diferente em cada perfil.',
    }, 7);
    expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const decoded = await loadImage(image);
    expect([decoded.width, decoded.height]).toEqual(dimensions);
  });

  test('usa cache para reutilizar a mesma prévia sem renderização redundante', async () => {
    const profile = { ...PROFILE_DEFAULTS, badges: ['star'], colors: { ...PROFILE_DEFAULTS.colors } };
    renderedCards.clear(); sourceImages.clear();
    const first = await renderMemberCard(user, { level: 1, xp: 5 }, profile, 1);
    const size = renderedCards.size;
    const imageCount = sourceImages.size;
    const second = await renderMemberCard(user, { level: 1, xp: 5 }, profile, 1);
    expect(second).toBe(first);
    expect(renderedCards.size).toBe(size);
    const alternate = await renderMemberCard(user, { level: 1, xp: 5 }, { ...profile, layout: 'wide' }, 1);
    expect(alternate).not.toBe(first);
    expect(sourceImages.size).toBe(imageCount);
  });
});
