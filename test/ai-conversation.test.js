jest.mock('../src/modules/xpService', () => ({ getGuildConfig: jest.fn() }));
jest.mock('../src/modules/aiGateway', () => ({ ...jest.requireActual('../src/modules/aiGateway'), complete: jest.fn(), cancelRequest: jest.fn() }));
jest.mock('../src/logger', () => ({ warn: jest.fn() }));

const config = require('../src/config');
const { getGuildConfig } = require('../src/modules/xpService');
const aiGateway = require('../src/modules/aiGateway');
const { handleAIMessage, splitDiscordResponse, clearConversationState } = require('../src/modules/aiConversation');

function fixture({ id = 'message-1', direct = true, content = 'Oi <@bot>', reference = null } = {}) {
  const reply = jest.fn().mockResolvedValue(undefined);
  const message = {
    id, guildId: config.guildId, channelId: 'channel', createdTimestamp: Date.now(), content,
    author: { id: 'member', username: 'Membro', bot: false }, member: { displayName: 'Membro', roles: { cache: new Map() } },
    mentions: { users: direct ? new Map([['bot', {}]]) : new Map(), roles: new Map(), everyone: false },
    reference, fetchReference: jest.fn(), reply,
    channel: { sendTyping: jest.fn().mockResolvedValue(undefined), messages: { fetch: jest.fn().mockResolvedValue(new Map()) } },
    guild: { members: { cache: new Map() }, roles: { cache: new Map() }, channels: { cache: new Map() } },
  };
  const client = { user: { id: 'bot' }, config: { guildId: config.guildId, prefix: '!' } };
  return { message, client };
}

describe('conversa natural da Kiryu', () => {
  beforeEach(() => {
    clearConversationState();
    jest.clearAllMocks();
    getGuildConfig.mockResolvedValue({ ai: { enabled: true, systemPrompt: 'Personalidade configurável', contextMessages: 1, contextTokenBudget: 1000 } });
    aiGateway.complete.mockResolvedValue({ ok: true, content: 'Olá!\n\nPosso ajudar.', model: 'cubic', usage: { totalTokens: 20 } });
  });
  afterEach(clearConversationState);

  test('responde à menção com reply direto, Markdown e menções desativadas', async () => {
    const { message, client } = fixture();
    await expect(handleAIMessage(message, client)).resolves.toMatchObject({ status: 'replied' });
    expect(message.channel.sendTyping).toHaveBeenCalledTimes(1);
    expect(aiGateway.complete).toHaveBeenCalledWith(expect.objectContaining({
      guildId: config.guildId, userId: 'member', channelId: 'channel', stream: true, sourceMessageId: 'message-1',
      messages: [{ role: 'system', content: 'Personalidade configurável' }, expect.objectContaining({ role: 'user' })],
    }));
    expect(message.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Olá!\n\nPosso ajudar.', failIfNotExists: false,
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    }));
  });

  test('continua a conversa ao responder a uma mensagem da Kiryu', async () => {
    const { message, client } = fixture({ direct: false, content: 'Pode explicar?', reference: { messageId: 'kiryu-message' } });
    message.fetchReference.mockResolvedValue({ id: 'kiryu-message', author: { id: 'bot', bot: true }, content: 'Minha fala anterior' });
    await expect(handleAIMessage(message, client)).resolves.toMatchObject({ status: 'replied' });
    expect(message.fetchReference).toHaveBeenCalledTimes(1);
    expect(aiGateway.complete).toHaveBeenCalledTimes(1);
  });

  test('evita duplicatas, respeita cooldown e deixa a lógica determinística intocada', async () => {
    const first = fixture();
    await handleAIMessage(first.message, first.client);
    await expect(handleAIMessage(first.message, first.client)).resolves.toEqual({ status: 'duplicate' });
    const second = fixture({ id: 'message-2' });
    await expect(handleAIMessage(second.message, second.client)).resolves.toEqual({ status: 'cooldown' });
    const deterministic = fixture({ id: 'message-3' });
    await expect(handleAIMessage(deterministic.message, deterministic.client, { hasDeterministicResponse: true })).resolves.toEqual({ status: 'ignored' });
    expect(aiGateway.complete).toHaveBeenCalledTimes(1);
  });

  test('divide respostas longas em mensagens dentro do limite do Discord e mantém blocos de código fechados', () => {
    const chunks = splitDiscordResponse('```js\n' + 'const answer = 1;\n'.repeat(500) + '```');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
    expect(chunks[0]).toMatch(/\n```$/);
    expect(chunks[1]).toMatch(/^```js\n/);
  });
});
