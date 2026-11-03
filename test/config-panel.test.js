jest.mock('../src/modules/xpService', () => ({
  getGuildConfig: jest.fn(),
}));

const { getGuildConfig } = require('../src/modules/xpService');
const config = require('../src/config');
const { handleConfigInteraction } = require('../src/modules/configPanel');

function interaction(overrides = {}) {
  return {
    customId: 'config:nav',
    user: { id: config.ownerId },
    guildId: config.guildId,
    guild: { roles: { cache: new Map() } },
    values: ['xp'],
    isStringSelectMenu: () => true,
    isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => false,
    isButton: () => false,
    update: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('painel de configuração', () => {
  beforeEach(() => getGuildConfig.mockReset());

  test('permite navegar às configurações de XP ao proprietário', async () => {
    getGuildConfig.mockResolvedValue({
      messageXp: { min: 20, max: 100, cooldownMs: 5000, excludedChannelIds: [] },
      voiceXp: { min: 20, max: 100, intervalMs: 300000, excludedChannelIds: [] },
      buffs: [],
      stackBuffs: false,
    });
    const event = interaction();
    await expect(handleConfigInteraction(event)).resolves.toBe(true);
    expect(event.update).toHaveBeenCalledTimes(1);
    expect(event.update.mock.calls[0][0].components[0].toJSON().type).toBe(17);
  });

  test('nega os componentes do painel a outros usuários', async () => {
    const event = interaction({ user: { id: 'other-user' } });
    await expect(handleConfigInteraction(event)).resolves.toBe(true);
    expect(event.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Acesso negado.' }));
    expect(getGuildConfig).not.toHaveBeenCalled();
  });
});
