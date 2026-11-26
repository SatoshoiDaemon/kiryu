jest.mock('../src/modules/xpService', () => ({
  getGuildConfig: jest.fn(),
}));
jest.mock('../src/modules/economyService', () => ({ getSettings: jest.fn() }));

const { getGuildConfig } = require('../src/modules/xpService');
const { getSettings } = require('../src/modules/economyService');
const { BadgeDefinition } = require('../src/database');
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
  beforeEach(() => { getGuildConfig.mockReset(); getSettings.mockReset(); });
  afterEach(() => jest.restoreAllMocks());

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

  test('mostra a política de anúncio dedicada e não pressupõe um canal de conversa', async () => {
    getGuildConfig.mockResolvedValue({
      messageXp: { min: 20, max: 100, cooldownMs: 5000, excludedChannelIds: [] },
      voiceXp: { min: 20, max: 100, intervalMs: 300000, excludedChannelIds: [] },
      buffs: [], stackBuffs: false, levelUp: { enabled: true, channelId: '', message: '' },
    });
    const event = interaction({ customId: 'config:nav', values: ['xp'] });
    await handleConfigInteraction(event);
    const output = event.update.mock.calls[0][0].components[0].toJSON();
    expect(JSON.stringify(output)).toContain('nenhuma notificação será publicada');
    expect(JSON.stringify(output)).toContain('Anúncio e canal');
  });

  test('salva o canal de nível escolhido pelo seletor nativo após validar permissões', async () => {
    const channel = {
      id: 'announcements', type: require('discord.js').ChannelType.GuildText,
      permissionsFor: jest.fn(() => ({ has: () => true })),
    };
    const cfg = { levelUp: { enabled: true, channelId: '', message: '' }, save: jest.fn().mockResolvedValue(undefined) };
    getGuildConfig.mockResolvedValue(cfg);
    const event = interaction({
      customId: 'config:xp:levelup:channel', values: ['announcements'],
      isChannelSelectMenu: () => true, isStringSelectMenu: () => false,
      guild: { roles: { cache: new Map() }, channels: { cache: new Map([['announcements', channel]]) }, members: { me: { id: 'bot' } } },
    });
    await handleConfigInteraction(event);
    expect(cfg.levelUp.channelId).toBe('announcements');
    expect(cfg.save).toHaveBeenCalledTimes(1);
    expect(channel.permissionsFor).toHaveBeenCalled();
    expect(JSON.stringify(event.update.mock.calls[0][0].components[0].toJSON())).toContain('<#announcements>');
  });

  test('recusa salvar um destino sem permissão de envio', async () => {
    const channel = {
      id: 'private', type: require('discord.js').ChannelType.GuildText,
      permissionsFor: () => ({ has: (permission) => permission !== require('discord.js').PermissionFlagsBits.SendMessages }),
    };
    const cfg = { levelUp: { enabled: true, channelId: '', message: '' }, save: jest.fn() };
    getGuildConfig.mockResolvedValue(cfg);
    const event = interaction({
      customId: 'config:xp:levelup:channel', values: ['private'], isChannelSelectMenu: () => true, isStringSelectMenu: () => false,
      guild: { roles: { cache: new Map() }, channels: { cache: new Map([['private', channel]]) }, members: { me: { id: 'bot' } } },
      followUp: jest.fn().mockResolvedValue(undefined),
    });
    const { followUpV2 } = require('../src/modules/components');
    const followSpy = jest.spyOn(event, 'reply');
    await handleConfigInteraction(event);
    expect(cfg.save).not.toHaveBeenCalled();
    expect(followSpy).toHaveBeenCalled();
    expect(JSON.stringify(followSpy.mock.calls[0][0])).toContain('Enviar mensagens');
  });

  test('staff autorizada abre o catálogo especial e a seção de permissões continua exclusiva do proprietário', async () => {
    getGuildConfig.mockResolvedValue({ adminRoleIds: ['staff-role'] });
    jest.spyOn(BadgeDefinition, 'find').mockReturnValue({ sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) });
    jest.spyOn(BadgeDefinition, 'countDocuments').mockResolvedValue(0);
    const staff = { id: 'staff-user' };
    const member = { roles: { cache: new Map([['staff-role', {}]]) } };
    const badgeEvent = interaction({ user: staff, member, values: ['badges'] });
    await handleConfigInteraction(badgeEvent);
    expect(JSON.stringify(badgeEvent.update.mock.calls[0][0].components[0].toJSON())).toContain('Badges especiais da staff');

    const permissionEvent = interaction({ user: staff, member, values: ['permissions'] });
    await handleConfigInteraction(permissionEvent);
    expect(JSON.stringify(permissionEvent.reply.mock.calls[0][0])).toContain('exclusiva do proprietário');
  });

  test('abre o formulário de criação de badge especial pela categoria escolhida', async () => {
    getGuildConfig.mockResolvedValue({ adminRoleIds: ['staff-role'] });
    const event = interaction({
      user: { id: 'staff-user' }, member: { roles: { cache: new Map([['staff-role', {}]]) } },
      customId: 'config:badges:create:category', values: ['events'],
      isStringSelectMenu: () => true, isButton: () => false, showModal: jest.fn(),
    });
    await handleConfigInteraction(event);
    expect(event.showModal).toHaveBeenCalledTimes(1);
    expect(event.showModal.mock.calls[0][0].toJSON().custom_id).toBe('config:modal:badge:create:events');
  });

  test('nega os componentes do painel a outros usuários', async () => {
    const event = interaction({ user: { id: 'other-user' } });
    await expect(handleConfigInteraction(event)).resolves.toBe(true);
    expect(JSON.stringify(event.reply.mock.calls[0][0])).toContain('Acesso negado.');
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
    expect(JSON.stringify(container.toJSON())).toContain('+280 outros');
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
    expect(JSON.stringify(container.toJSON())).toContain('…');
  });

  test('lista recompensas sem expor fragmentos de IDs de cargos', async () => {
    const { EconomyCollectRule } = require('../src/database');
    jest.spyOn(EconomyCollectRule, 'find').mockReturnValue({
      sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'rule-id', roleId: '123456789012345678', name: 'Recompensa', frequency: 'weekly', fragments: 250 }]),
    });
    const event = interaction({ values: ['rules'] });
    await handleConfigInteraction(event);
    const output = event.update.mock.calls[0][0].components[0].toJSON();
    const serialized = JSON.stringify(output);
    const select = output.components.flatMap((component) => component.components || []).find((component) => component.custom_id === 'config:rules:select:0');
    expect(serialized).toContain('Recompensa');
    expect(select.options[0].description).toBe('semanal · 250 Fragmentos');
    expect(select.options[0].description).not.toContain('5678');
  });

  test('expõe recorrências intervalares e de calendário para editar regras existentes', async () => {
    const { EconomyCollectRule } = require('../src/database');
    jest.spyOn(EconomyCollectRule, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'rule-id', roleId: 'role-id', name: 'Recompensa', frequency: 'interval', intervalMs: 3600000, fragments: 250, stackable: false }),
    });
    const event = interaction({ customId: 'config:rules:schedule:rule-id', isButton: () => true });
    await handleConfigInteraction(event);
    const output = event.update.mock.calls[0][0].components[0].toJSON();
    const serialized = JSON.stringify(output);
    expect(serialized).toContain('Intervalo');
    expect(serialized).toContain('Data do calendário');
    expect(serialized).toContain('config:rules:schedule:frequency:rule-id');
  });

  test('mostra a seção do cassino com jogos e pagamentos individuais', async () => {
    getSettings.mockResolvedValue({ casino: {
      maxBet: 2500,
      flip: { enabled: true, multiplier: 2 }, dice: { enabled: false, multiplier: 3 }, slots: { enabled: true, multiplier: 7 },
    } });
    const event = interaction({ values: ['casino'] });
    await handleConfigInteraction(event);
    const rendered = JSON.stringify(event.update.mock.calls[0][0].components[0].toJSON());
    expect(rendered).toContain('2.500');
    expect(rendered).toContain('Cara ou coroa');
    expect(rendered).toContain('desativado');
    expect(rendered).toContain('7×');
  });

  test('abre o modal da faixa diária sem adiar a interação do botão', async () => {
    getSettings.mockResolvedValue({ daily: { rewardRanges: {
      fragments: { min: 400, max: 1000 },
      orbs: { green: { min: 10, max: 100 }, blue: { min: 10, max: 50 }, orange: { min: 5, max: 10 }, red: { min: 0, max: 0 }, black: { min: 0, max: 0 }, gold: { min: 0, max: 0 } },
    } } });
    const event = interaction({ customId: 'config:rewards:daily:rare', isButton: () => true, showModal: jest.fn() });
    await handleConfigInteraction(event);
    expect(event.showModal).toHaveBeenCalledTimes(1);
    expect(event.deferUpdate).toBeUndefined();
    expect(event.showModal.mock.calls[0][0].toJSON().components).toHaveLength(4);
  });

  test('abre o modal da nova regra após a escolha do cargo nativo', async () => {
    const event = interaction({
      customId: 'config:rule:create:role:daily:none',
      isStringSelectMenu: () => false,
      isRoleSelectMenu: () => true,
      values: ['role-id'],
      showModal: jest.fn(),
    });
    await handleConfigInteraction(event);
    expect(event.showModal).toHaveBeenCalledTimes(1);
    expect(event.deferUpdate).toBeUndefined();
  });

  test('oferece paletas persistentes de aparência pelo seletor nativo', async () => {
    const cfg = { appearance: { palette: 'kiryu' }, save: jest.fn().mockResolvedValue(undefined) };
    getGuildConfig.mockResolvedValue(cfg);
    const event = interaction({ values: ['appearance'] });
    await handleConfigInteraction(event);
    const rendered = event.update.mock.calls[0][0].components[0].toJSON();
    const select = rendered.components.flatMap((component) => component.components || []).find((component) => component.custom_id === 'config:appearance:palette');
    expect(select.options.map((option) => option.value)).toEqual(['kiryu', 'eclipse', 'jade', 'ember']);
    expect(rendered.type).toBe(17);
  });

  test('persiste e aplica a paleta selecionada à próxima interface', async () => {
    const cfg = { appearance: { palette: 'kiryu' }, save: jest.fn().mockResolvedValue(undefined) };
    getGuildConfig.mockResolvedValue(cfg);
    const event = interaction({ customId: 'config:appearance:palette', values: ['jade'] });
    await handleConfigInteraction(event);
    expect(cfg.appearance.palette).toBe('jade');
    expect(cfg.save).toHaveBeenCalled();
    expect(require('../src/config').visual.brand).toBe(0x176B57);
    require('../src/modules/appearance').applyPalette('kiryu');
  });
});
