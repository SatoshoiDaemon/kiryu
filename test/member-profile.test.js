jest.mock('../src/modules/xpService', () => ({ getProfile: jest.fn().mockResolvedValue({ level: 8, xp: 120 }) }));
jest.mock('../src/modules/memberProfiles', () => ({
  getMemberProfile: jest.fn().mockResolvedValue({ accent: 'rose', title: 'Membro do Eternity', bio: 'Vim para fazer história.', frame: 'classic', background: 'dusk', badges: [] }),
  renderMemberCard: jest.fn().mockResolvedValue(Buffer.from('png')),
  getRank: jest.fn().mockResolvedValue(4),
  updateCustomization: jest.fn(),
}));
jest.mock('../src/config', () => ({ guildId: 'guild', visual: { profile: 0xd9467c, dividerUrl: null, assetBaseUrl: 'https://cdn.example/kiryu' } }));

const { makePayload } = require('../src/commands/misc/profile');

describe('perfil de membro', () => {
  test('prepara cartão V2 com imagem anexada, personalização e timestamp padrão', async () => {
    const payload = await makePayload({ id: 'member', username: 'Kiryu User', globalName: 'Kiryu User' }, 'guild', 'member', true);
    expect(payload.files[0].name).toBe('perfil-kiryu.png');
    const card = payload.components[0].toJSON();
    expect(card.type).toBe(17);
    expect(JSON.stringify(card)).toContain('Developer by Krieg.js');
    expect(JSON.stringify(card)).toContain('attachment://perfil-kiryu.png');
    expect(JSON.stringify(card)).toContain('profile:bio:self');
    expect(JSON.stringify(card)).toContain('profile:background:self');
    expect(JSON.stringify(card)).toContain('profile:badges:self');
  });

  test('salva cada seletor uma vez e atualiza o preview no cartão existente', async () => {
    const { handleProfileInteraction } = require('../src/commands/misc/profile');
    const { updateCustomization, getMemberProfile, renderMemberCard, getRank } = require('../src/modules/memberProfiles');
    const event = {
      customId: 'profile:background:self', guildId: 'guild', user: { id: 'member', username: 'Kiryu User', globalName: 'Kiryu User', displayAvatarURL: () => 'https://cdn.example/avatar.png' },
      values: ['aurora'], isStringSelectMenu: () => true, isButton: () => false, isModalSubmit: () => false,
      deferUpdate: jest.fn().mockResolvedValue(undefined), editReply: jest.fn().mockResolvedValue(undefined),
    };
    await expect(handleProfileInteraction(event)).resolves.toBe(true);
    expect(event.deferUpdate).toHaveBeenCalledTimes(1);
    expect(updateCustomization).toHaveBeenCalledWith('guild', 'member', { background: 'aurora' });
    expect(event.editReply).toHaveBeenCalledTimes(1);
    expect(getMemberProfile).toHaveBeenCalled();
    expect(renderMemberCard).toHaveBeenCalled();
    expect(getRank).toHaveBeenCalled();
  });
});
