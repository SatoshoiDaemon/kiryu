const { AIQuotaCounter, AIUsage } = require('../src/database');
const aiGateway = require('../src/modules/aiGateway');

let counters;
let usageRows;
const originalFetch = global.fetch;
const originalApiKey = process.env.SQUARECLOUD_API_KEY;

function successfulResponse({ content = 'Resposta cubic', input = 12, output = 5 } = {}) {
  return new Response(JSON.stringify({
    model: 'cubic', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: input, completion_tokens: output, total_tokens: input + output },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function quotaSettings(overrides = {}) {
  return { model: 'cubic', temperature: 0.3, maxCompletionTokens: 64, reasoningEffort: 'none',
    maxConcurrent: 3, maxRequestsPerMemberPerDay: 20, maxTokensPerMemberPerDay: 20000,
    maxRequestsPerDay: 500, maxTokensPerDay: 200000, timeoutMs: 10000, ...overrides };
}

describe('cliente central do Square Cloud AI Gateway', () => {
  beforeEach(() => {
    counters = new Map();
    usageRows = [];
    process.env.SQUARECLOUD_API_KEY = 'test-key-never-logged';
    jest.spyOn(AIQuotaCounter, 'findById').mockImplementation((id) => ({ lean: async () => counters.get(id) || null }));
    jest.spyOn(AIQuotaCounter, 'create').mockImplementation(async (value) => { counters.set(value._id, { ...value }); return value; });
    jest.spyOn(AIQuotaCounter, 'findOneAndUpdate').mockImplementation((filter, update) => ({
      lean: async () => {
        const row = counters.get(filter._id);
        if (!row || row.requests >= filter.requests.$lt || row.tokens > filter.tokens.$lte) return null;
        row.requests += update.$inc.requests;
        row.tokens += update.$inc.tokens;
        return row;
      },
    }));
    jest.spyOn(AIQuotaCounter, 'updateOne').mockImplementation(async (filter, update) => {
      const row = counters.get(filter._id);
      if (row) { row.requests += update.$inc?.requests || 0; row.tokens += update.$inc?.tokens || 0; }
      return { acknowledged: true };
    });
    jest.spyOn(AIUsage, 'create').mockImplementation(async (row) => { usageRows.push(row); return row; });
    global.fetch = jest.fn().mockResolvedValue(successfulResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.SQUARECLOUD_API_KEY;
    else process.env.SQUARECLOUD_API_KEY = originalApiKey;
  });

  test('usa exclusivamente cubic e parâmetros suportados e contabiliza tokens retornados', async () => {
    const result = await aiGateway.complete({
      guildId: 'guild', userId: 'member', channelId: 'channel', kind: 'chat',
      messages: [{ role: 'system', content: 'Aja conforme configuração.' }, { role: 'user', content: 'Olá' }],
      settings: quotaSettings(),
    });
    expect(result).toMatchObject({ ok: true, content: 'Resposta cubic', model: 'cubic', usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(aiGateway.API_URL);
    expect(options.headers.Authorization).toBe('Bearer test-key-never-logged');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ model: 'cubic', temperature: 0.3, max_completion_tokens: 64, reasoning_effort: 'none', stream: false });
    expect(body).not.toHaveProperty('top_p');
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]).toMatchObject({ status: 'succeeded', totalTokens: 17, kind: 'chat' });
  });

  test('consome stream SSE e extrai usage do evento final', async () => {
    const events = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Fluxo ' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'de teste.' } }] }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } }) + '\n\n',
      'data: [DONE]\n\n',
    ].join('');
    global.fetch.mockResolvedValue(new Response(events, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const chunks = [];
    const result = await aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'diga algo' }], settings: quotaSettings(), stream: true, onChunk: (chunk) => chunks.push(chunk) });
    expect(result).toMatchObject({ ok: true, content: 'Fluxo de teste.', usage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 } });
    expect(chunks).toEqual(['Fluxo ', 'de teste.']);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
  });

  test('não chama o Gateway sem chave e aplica o limite local antes da rede', async () => {
    delete process.env.SQUARECLOUD_API_KEY;
    await expect(aiGateway.complete({ messages: [{ role: 'user', content: 'oi' }], settings: quotaSettings() })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'missing_api_key' });
    process.env.SQUARECLOUD_API_KEY = 'test-key-never-logged';
    const limited = await aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'x'.repeat(3000) }], settings: quotaSettings({ maxTokensPerMemberPerDay: 1000 }) });
    expect(limited).toMatchObject({ status: 'limited', errorCode: 'local_daily_limit' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejeita papéis de ferramenta que não fazem parte do chat sem ferramentas da Kiryu', async () => {
    const result = await aiGateway.complete({
      guildId: 'guild', userId: 'member', messages: [{ role: 'tool', content: 'executed action' }], settings: quotaSettings(),
    });
    expect(result).toMatchObject({ status: 'invalid', errorCode: 'invalid_messages' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('mapeia erro HTTP sem propagar conteúdo arbitrário retornado pelo provedor', async () => {
    global.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'access_denied', message: 'private detail' } }), { status: 401 }));
    const result = await aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'oi' }], settings: quotaSettings() });
    expect(result).toMatchObject({ ok: false, status: 'failed', errorCode: 'access_denied', statusCode: 401 });
    expect(JSON.stringify(result)).not.toContain('private detail');
    expect(usageRows[0]).toMatchObject({ status: 'failed', errorCode: 'access_denied' });
  });

  test('retenta um rate limit transitório e registra as tentativas e o êxito', async () => {
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(successfulResponse());
    const result = await aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'oi' }], settings: quotaSettings() });
    expect(result).toMatchObject({ ok: true, content: 'Resposta cubic' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(usageRows.map((row) => row.status)).toEqual(['rate-limited', 'succeeded']);
  });

  test('cancela uma chamada antes de acessar a rede quando a origem é removida', async () => {
    const controller = new AbortController();
    controller.abort(new Error('message deleted'));
    const result = await aiGateway.complete({
      guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'oi' }],
      settings: quotaSettings(), sourceMessageId: 'deleted-message', signal: controller.signal,
    });
    expect(result).toMatchObject({ status: 'cancelled', errorCode: 'cancelled' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('agrega períodos, modelos, membros e latência p95 sem reportar custo indisponível', async () => {
    jest.spyOn(AIUsage, 'aggregate').mockImplementation(async (pipeline) => {
      const groupId = pipeline[1].$group._id;
      if (groupId === null) return [{ requests: 3, success: 2, errors: 1, inputTokens: 30, outputTokens: 12, totalTokens: 42, averageLatency: 250, usageCount: 2 }];
      if (groupId === '$model') return [{ _id: 'cubic', requests: 3, totalTokens: 42 }];
      return [{ _id: 'member', requests: 3, totalTokens: 42 }];
    });
    jest.spyOn(AIUsage, 'countDocuments').mockResolvedValue(3);
    const p95Query = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ latencyMs: 420 }]) };
    jest.spyOn(AIUsage, 'find').mockReturnValue(p95Query);
    const stats = await aiGateway.getUsageStats('guild', { period: 'month', now: new Date('2026-11-25T12:00:00Z') });
    expect(stats).toMatchObject({ period: 'month', requests: 3, success: 2, errors: 1, inputTokens: 30, outputTokens: 12, totalTokens: 42, usageAvailable: 2, averageLatencyMs: 250, p95LatencyMs: 420, costsAvailable: false, byModel: [{ _id: 'cubic' }], byMember: [{ _id: 'member' }] });
    expect(p95Query.skip).toHaveBeenCalledWith(2);
  });

  test('protege uma mensagem de origem contra duas gerações simultâneas', async () => {
    let notifyStarted;
    let resolveFetch;
    const started = new Promise((resolve) => { notifyStarted = resolve; });
    global.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; notifyStarted(); }));
    const firstRequest = aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'oi' }], settings: quotaSettings(), sourceMessageId: 'same-message' });
    await started;
    const duplicate = await aiGateway.complete({ guildId: 'guild', userId: 'member', messages: [{ role: 'user', content: 'oi' }], settings: quotaSettings(), sourceMessageId: 'same-message' });
    expect(duplicate).toMatchObject({ status: 'duplicate', errorCode: 'duplicate_message' });
    resolveFetch(successfulResponse());
    await expect(firstRequest).resolves.toMatchObject({ ok: true });
  });
});
