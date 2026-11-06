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

function textDisplayLength(container) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.reduce((sum, child) => sum + visit(child), 0);
    if (!value || typeof value !== 'object') return 0;
    return (value.type === 10 ? value.content.length : 0)
      + Object.values(value).reduce((sum, child) => sum + visit(child), 0);
  };
  return visit(container.toJSON());
}

function customIdsAreUnique(container) {
  const ids = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value.custom_id === 'string') ids.push(value.custom_id);
    Object.values(value).forEach(visit);
  };
  visit(container.toJSON());
  return new Set(ids).size === ids.length;
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

  test('resume grandes listas de canais excluídos para respeitar o limite de texto V2', async () => {
    const excludedChannelIds = Array.from({ length: 300 }, (_, index) => 'channel-' + index);
    getGuildConfig.mockResolvedValue({
      messageXp: { min: 20, max: 100, cooldownMs: 5000, excludedChannelIds },
      voiceXp: { min: 20, max: 100, intervalMs: 300000, excludedChannelIds },
      buffs: Array.from({ length: 25 }, (_, index) => ({ roleId: 'role-' + index, multiplier: 2 })),
      stackBuffs: false,
    });
    const event = interaction();

    await handleConfigInteraction(event);

    const container = event.update.mock.calls[0][0].components[0];
    expect(textDisplayLength(container)).toBeLessThanOrEqual(4000);
    expect(customIdsAreUnique(container)).toBe(true);
    expect(container.toJSON().components[0].content).toContain('+280 outros');
  });

  test('mostra prévias curtas das respostas para não exceder o limite de texto V2', async () => {
    const trigger = {
      text: 'gatilho',
      enabled: true,
      responses: Array.from({ length: 25 }, (_, index) => index + ': ' + 'resposta '.repeat(240)),
    };
    getGuildConfig.mockResolvedValue({ triggers: { id: () => trigger } });
    const event = interaction({ customId: 'config:trigger:select', values: ['trigger-id'] });

    await handleConfigInteraction(event);

    const container = event.update.mock.calls[0][0].components[0];
    expect(textDisplayLength(container)).toBeLessThanOrEqual(4000);
    expect(customIdsAreUnique(container)).toBe(true);
    expect(container.toJSON().components[0].content).toContain('…');
  });
});
