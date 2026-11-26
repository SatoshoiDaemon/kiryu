jest.mock('../src/modules/xpService', () => ({ getProfile: jest.fn().mockResolvedValue({ level: 8, xp: 120 }) }));
jest.mock('../src/modules/memberProfiles', () => ({
  getMemberProfile: jest.fn().mockResolvedValue({ accent: 'rose', title: 'Membro do Eternity', bio: 'Vim para fazer história.', frame: 'classic', background: 'dusk', badges: [] }),
  customizationDefaults: jest.fn((value) => ({ ...value, colors: { primary: '#F9A8D4', secondary: '#831843', highlight: '#FCE7F3', text: '#FFFFFF', xpBar: '#F9A8D4', frame: '#F9A8D4', background: '#11121C' }, gradient: true, elementOpacity: 24, visibility: { rank: true } })),
  renderMemberCard: jest.fn().mockResolvedValue(Buffer.from('png')),
  getRank: jest.fn().mockResolvedValue(4),
  updateCustomization: jest.fn(),
  parseColorInput: jest.fn((value) => value),
}));
jest.mock('../src/config', () => ({ guildId: 'guild', visual: { profile: 0xd9467c, dividerUrl: null, assetBaseUrl: 'https://cdn.example/kiryu' } }));

const { makePayload, executeEdit, handleProfileInteraction, EDIT_SESSIONS } = require('../src/commands/misc/profile');
const memberProfiles = require('../src/modules/memberProfiles');

const user = { id: 'member', username: 'Kiryu User', globalName: 'Kiryu User', displayAvatarURL: () => 'https://cdn.example/avatar.png' };

function serializedIds(payload) {
  const ids = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.custom_id) ids.push(value.custom_id);
    Object.values(value).forEach(visit);
  };
  visit(payload.components[0].toJSON());
  return ids;
}

describe('perfil de membro', () => {
  beforeEach(() => { EDIT_SESSIONS.clear(); jest.clearAllMocks(); });

  test('consulta apresenta cartão rápido sem controles de edição', async () => {
    const payload = await makePayload(user, 'guild', null, false);
    expect(payload.files[0].name).toBe('perfil-kiryu.png');
    const card = payload.components[0].toJSON();
    expect(card.type).toBe(17);
    expect(JSON.stringify(card)).toContain('Developer by Krieg.js');
    expect(JSON.stringify(card)).toContain('attachment://perfil-kiryu.png');
    expect(serializedIds(payload)).toEqual([]);
    expect(memberProfiles.getRank).toHaveBeenCalledWith('guild', { level: 8, xp: 120 });
  });

  test('profile-edit mostra prévia e navegação por categorias', async () => {
    const payload = await makePayload(user, 'guild', 'member', true, 'colors', {
      title: 'Membro do Eternity', bio: '', badges: [], colors: { primary: '#F9A8D4' }, visibility: { rank: true },
    });
    const ids = serializedIds(payload);
    expect(ids).toContain('profile-edit:member:section');
    expect(ids).toContain('profile-edit:member:color-field');
    expect(ids).toContain('profile-edit:member:apply');
    expect(ids).toContain('profile-edit:member:cancel');
    expect(ids).toContain('profile-edit:member:reset');
  });

  test('salva o rascunho ao aplicar e mantém as escolhas temporárias sem persistir antes', async () => {
    const command = {
      guildId: 'guild', user, editReply: jest.fn().mockResolvedValue(undefined),
    };
    await executeEdit(command);
    const token = serializedIds(command.editReply.mock.calls[0][0]).find((id) => id.endsWith(':section')).split(':')[1];
    const select = {
      customId: 'profile-edit:' + token + ':layout', guildId: 'guild', user,
      values: ['portrait'], isStringSelectMenu: () => true, isButton: () => false, isModalSubmit: () => false,
      deferUpdate: jest.fn().mockResolvedValue(undefined), editReply: jest.fn().mockResolvedValue(undefined),
    };
    await expect(handleProfileInteraction(select)).resolves.toBe(true);
    expect(EDIT_SESSIONS.get(token).draft.layout).toBe('portrait');
    expect(memberProfiles.updateCustomization).not.toHaveBeenCalled();

    const apply = {
      customId: 'profile-edit:' + token + ':apply', guildId: 'guild', user,
      isStringSelectMenu: () => false, isButton: () => true, isModalSubmit: () => false,
      deferUpdate: jest.fn().mockResolvedValue(undefined), editReply: jest.fn().mockResolvedValue(undefined),
    };
    await expect(handleProfileInteraction(apply)).resolves.toBe(true);
    expect(memberProfiles.updateCustomization).toHaveBeenCalledWith('guild', 'member', expect.objectContaining({ layout: 'portrait' }));
    expect(EDIT_SESSIONS.has(token)).toBe(false);
  });
});
