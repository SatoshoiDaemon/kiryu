jest.mock('../src/modules/xpService', () => ({ getGuildConfig: jest.fn() }));
jest.mock('../src/modules/aiGateway', () => ({
  MODEL_CATALOG: [{ id: 'cubic', label: 'Cubic · Square Cloud', kind: 'chat' }],
  complete: jest.fn(), getUsageStats: jest.fn().mockResolvedValue({ requests: 0, success: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, averageLatencyMs: 0, p95LatencyMs: 0, byMember: [], byModel: [] }),
}));

const config = require('../src/config');
const { getGuildConfig } = require('../src/modules/xpService');
const { handleAIConfigInteraction, showAIPage, importPromptAttachment } = require('../src/modules/aiConfigPanel');
const { handleConfigInteraction } = require('../src/modules/configPanel');

function guildConfig(overrides = {}) {
  const ai = {
    enabled: false, model: 'cubic', systemPrompt: 'A Kiryu configurada pela comunidade.', temperature: 0.7,
    maxCompletionTokens: 800, reasoningEffort: 'none', contextMessages: 24, contextTokenBudget: 6000,
    timeoutMs: 30000, maxConcurrent: 2, memberCooldownSeconds: 30,
    maxRequestsPerMemberPerDay: 20, maxTokensPerMemberPerDay: 20000,
    maxRequestsPerDay: 500, maxTokensPerDay: 200000,
    allowedChannelIds: [], blockedChannelIds: [], allowedRoleIds: [], blockedRoleIds: [],
    ...overrides,
  };
  return { ai, adminRoleIds: [], save: jest.fn().mockResolvedValue(undefined) };
}

function interaction(customId, overrides = {}) {
  return {
    customId, guildId: config.guildId, user: { id: config.ownerId }, values: [],
    isButton: () => true, isStringSelectMenu: () => false, isChannelSelectMenu: () => false,
    isRoleSelectMenu: () => false, isModalSubmit: () => false, isAnySelectMenu: () => false,
    update: jest.fn().mockResolvedValue(undefined), editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined), followUp: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined), guild: { channels: { cache: new Map() }, roles: { cache: new Map() } },
    ...overrides,
  };
}

describe('painel Kiryu Intelligence', () => {
  let cfg;
  beforeEach(() => { jest.clearAllMocks(); cfg = guildConfig(); getGuildConfig.mockResolvedValue(cfg); });

  test('serializa a categoria de IA e oferece seletor nativo de canal e cargo', async () => {
    const channelEvent = interaction('config:nav');
    await showAIPage(channelEvent, 'access', true, { field: 'allowedChannelIds' });
    const roleEvent = interaction('config:nav');
    await showAIPage(roleEvent, 'access', true, { field: 'allowedRoleIds' });
    const componentTypes = [];
    const collect = (value) => {
      if (Array.isArray(value)) return value.forEach(collect);
      if (!value || typeof value !== 'object') return;
      if (typeof value.type === 'number') componentTypes.push(value.type);
      Object.values(value).forEach(collect);
    };
    collect(channelEvent.update.mock.calls[0][0].components[0].toJSON());
    collect(roleEvent.update.mock.calls[0][0].components[0].toJSON());
    expect(componentTypes).toContain(8);
    expect(componentTypes).toContain(6);
    expect(JSON.stringify(channelEvent.update.mock.calls[0][0].components[0].toJSON())).toContain('Canais permitidos');
    expect(JSON.stringify(roleEvent.update.mock.calls[0][0].components[0].toJSON())).toContain('Cargos bloqueados');
  });

  test('salva um System Prompt editado e aplica na próxima resposta sem reiniciar', async () => {
    const submit = interaction('config:modal:ai:prompt', {
      isModalSubmit: () => true,
      fields: { getTextInputValue: () => 'Nova identidade para a comunidade.' },
      deferred: true,
    });
    await handleAIConfigInteraction(submit);
    expect(cfg.ai.systemPrompt).toBe('Nova identidade para a comunidade.');
    expect(cfg.save).toHaveBeenCalledTimes(1);
    expect(submit.editReply).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(submit.editReply.mock.calls[0][0].components[0].toJSON())).toContain('próxima menção já usa a nova versão');
  });

  test('usa o seletor de modelo e recusa valores que não constam no catálogo oficial', async () => {
    const valid = interaction('config:ai:model', { isButton: () => false, isStringSelectMenu: () => true, values: ['cubic'] });
    await handleAIConfigInteraction(valid);
    expect(cfg.ai.model).toBe('cubic');
    expect(cfg.save).toHaveBeenCalledTimes(1);

    const invalid = interaction('config:ai:model', { isButton: () => false, isStringSelectMenu: () => true, values: ['other-model'] });
    await expect(handleAIConfigInteraction(invalid)).rejects.toThrow('somente `cubic`');
  });

  test('persiste listas permitidas selecionadas pelo componente nativo do Discord', async () => {
    const channel = interaction('config:ai:access:channels:allowedChannelIds', {
      isButton: () => false, isChannelSelectMenu: () => true, values: ['channel-a', 'channel-b'],
    });
    await handleAIConfigInteraction(channel);
    expect(cfg.ai.allowedChannelIds).toEqual(['channel-a', 'channel-b']);
    expect(cfg.save).toHaveBeenCalledTimes(1);

    const role = interaction('config:ai:access:roles:blockedRoleIds', {
      isButton: () => false, isRoleSelectMenu: () => true, values: ['role-a'],
    });
    await handleAIConfigInteraction(role);
    expect(cfg.ai.blockedRoleIds).toEqual(['role-a']);
    expect(cfg.save).toHaveBeenCalledTimes(2);
  });

  test('não ativa o serviço sem prompt e credencial', async () => {
    cfg.ai.systemPrompt = '';
    const event = interaction('config:ai:toggle');
    await expect(handleAIConfigInteraction(event)).rejects.toThrow('System Prompt');
    expect(cfg.save).not.toHaveBeenCalled();
  });

  test('importa somente TXT do CDN do Discord e aplica o prompt imediatamente', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(new Response('Nova personalidade importada.', { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
    try {
      await expect(importPromptAttachment(config.guildId, {
        url: 'https://cdn.discordapp.com/attachments/1/2/system-prompt.txt', name: 'system-prompt.txt', size: 28,
      })).resolves.toBe(29);
      expect(cfg.ai.systemPrompt).toBe('Nova personalidade importada.');
      expect(cfg.save).toHaveBeenCalledTimes(1);
      await expect(importPromptAttachment(config.guildId, {
        url: 'https://example.com/prompt.txt', name: 'prompt.txt', size: 10,
      })).rejects.toThrow('hospedados pelo Discord');
      await expect(importPromptAttachment(config.guildId, {
        url: 'https://cdn.discordapp.com/attachments/1/2/large.txt', name: 'large.txt', size: 131073,
      })).rejects.toThrow('128 KiB');
    } finally { global.fetch = originalFetch; }
  });

  test('mantém a categoria de IA exclusiva do proprietário no painel administrativo', async () => {
    cfg.adminRoleIds = ['staff'];
    getGuildConfig.mockResolvedValue(cfg);
    const staff = interaction('config:nav', {
      user: { id: 'staff-member' }, member: { roles: { cache: new Map([['staff', {}]]) } },
      isAnySelectMenu: () => true, values: ['ai'],
    });
    await handleConfigInteraction(staff);
    expect(JSON.stringify(staff.reply.mock.calls[0][0])).toContain('exclusiva do proprietário');
    expect(staff.update).not.toHaveBeenCalled();
  });

  test('a árvore /config oferece importação opcional de .txt', () => {
    const command = require('../src/commands/admin/config').data.toJSON();
    expect(command.options).toEqual([expect.objectContaining({ name: 'prompt_file', type: 11, required: false })]);
  });
});
