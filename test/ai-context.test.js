const { isCandidate, shouldRespond, isAllowed, buildConversation } = require('../src/modules/aiContext');

function message(overrides = {}) {
  return {
    id: 'current', guildId: 'guild', channelId: 'channel', createdTimestamp: 3000,
    content: 'Oi <@bot>', author: { id: 'member', username: 'Membro', bot: false },
    member: { displayName: 'Membro', roles: { cache: new Map() } },
    mentions: { users: new Map([['bot', {}]]), roles: new Map(), everyone: false },
    channel: { parentId: null }, guild: { members: { cache: new Map() }, roles: { cache: new Map() }, channels: { cache: new Map() } },
    ...overrides,
  };
}

describe('filtro e construção do contexto de IA', () => {
  test('dispara apenas para menção direta ou resposta à Kiryu', () => {
    expect(isCandidate(message(), 'bot')).toBe(true);
    expect(shouldRespond(message(), 'bot', null)).toBe(true);

    const reply = message({ mentions: { users: new Map(), roles: new Map(), everyone: false }, reference: { messageId: 'kiryu-msg' } });
    expect(isCandidate(reply, 'bot')).toBe(true);
    expect(shouldRespond(reply, 'bot', { author: { id: 'bot' } })).toBe(true);
    expect(shouldRespond(reply, 'bot', { author: { id: 'someone-else' } })).toBe(false);
  });

  test('ignora coletivo, cargos, bots e webhooks como gatilhos', () => {
    expect(isCandidate(message({ mentions: { users: new Map([['bot', {}]]), roles: new Map(), everyone: true } }), 'bot')).toBe(false);
    expect(isCandidate(message({ mentions: { users: new Map([['bot', {}]]), roles: new Map([['role', {}]]), everyone: false } }), 'bot')).toBe(false);
    expect(isCandidate(message({ author: { id: 'other-bot', bot: true } }), 'bot')).toBe(false);
    expect(isCandidate(message({ webhookId: 'webhook' }), 'bot')).toBe(false);
    expect(isCandidate(message({ author: { id: 'bot', bot: true } }), 'bot')).toBe(false);
  });

  test('aplica listas de canais e cargos com bloqueios prevalecendo', () => {
    const input = message({ member: { roles: { cache: new Map([['member-role', {}], ['blocked-role', {}]]) } } });
    expect(isAllowed(input, { allowedChannelIds: ['channel'], allowedRoleIds: ['member-role'] })).toBe(true);
    expect(isAllowed(input, { allowedChannelIds: ['other'] })).toBe(false);
    expect(isAllowed(input, { blockedRoleIds: ['blocked-role'] })).toBe(false);
    expect(isAllowed(input, { blockedChannelIds: ['channel'] })).toBe(false);
  });

  test('preserva ordem, múltiplos autores e falas anteriores da Kiryu em roles separados', async () => {
    const earlier = { id: 'earlier', createdTimestamp: 1000, content: 'O evento começa hoje', author: { id: 'alice', username: 'Alice', bot: false }, member: { displayName: 'Alice' } };
    const botReply = { id: 'bot-reply', createdTimestamp: 2000, content: 'Começa às oito', author: { id: 'bot', username: 'Kiryu', bot: true } };
    const current = message({
      content: 'Pode repetir, <@bot>?',
      channel: { parentId: null, messages: { fetch: jest.fn().mockResolvedValue(new Map([[botReply.id, botReply], [earlier.id, earlier]])) } },
      mentions: { users: new Map([['bot', {}]]), roles: new Map(), everyone: false },
    });
    const result = await buildConversation({ message: current, botId: 'bot', aiConfig: { systemPrompt: 'PROMPT-ONLY-SYSTEM', contextMessages: 8, contextTokenBudget: 1000 } });
    expect(result[0]).toEqual({ role: 'system', content: 'PROMPT-ONLY-SYSTEM' });
    expect(result.slice(1).map((item) => item.role)).toEqual(['user', 'assistant', 'user']);
    expect(result[1].content).toContain('Alice');
    expect(result[2].content).toContain('Começa às oito');
    expect(result[3].content).toContain('Pode repetir, ?');
    expect(result.slice(1).every((item) => item.role !== 'system')).toBe(true);
  });
});
