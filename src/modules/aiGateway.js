const { AIQuotaCounter, AIUsage } = require('../database');
const logger = require('../logger');
const metrics = require('./performanceMetrics');

const API_URL = 'https://api.squarecloud.app/v2/ai/chat/completions';
const MODEL_CATALOG = Object.freeze([{ id: 'cubic', label: 'Cubic · Square Cloud', kind: 'chat' }]);
const RETRYABLE_CODES = new Set(['rate_limit_exceeded', 'concurrent_limit_reached']);
const MAX_RETRIES = 2;
const MIN_REQUEST_SPACING_MS = 1000;
const activeRequests = new Map();
const activeControllers = new Set();
let activeCount = 0;
let nextRequestAt = 0;
let pacingChain = Promise.resolve();

function normalizeSettings(input = {}) {
  const model = input.model || 'cubic';
  if (model !== 'cubic') throw new RangeError('O Gateway da Square Cloud só oferece `cubic` para conversas.');
  return {
    model,
    systemPrompt: String(input.systemPrompt || '').slice(0, 32000),
    temperature: clamp(Number(input.temperature ?? 0.7), 0, 2, 0.7),
    maxCompletionTokens: Math.round(clamp(Number(input.maxCompletionTokens ?? 800), 16, 6144, 800)),
    reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high'].includes(input.reasoningEffort) ? input.reasoningEffort : 'none',
    contextMessages: Math.round(clamp(Number(input.contextMessages ?? 24), 1, 100, 24)),
    contextTokenBudget: Math.round(clamp(Number(input.contextTokenBudget ?? 6000), 512, 32000, 6000)),
    timeoutMs: Math.round(clamp(Number(input.timeoutMs ?? 30000), 5000, 90000, 30000)),
    maxConcurrent: Math.round(clamp(Number(input.maxConcurrent ?? 2), 1, 16, 2)),
    memberCooldownSeconds: Math.round(clamp(Number(input.memberCooldownSeconds ?? 30), 0, 86400, 30)),
    maxRequestsPerMemberPerDay: Math.round(clamp(Number(input.maxRequestsPerMemberPerDay ?? 20), 1, 1000, 20)),
    maxTokensPerMemberPerDay: Math.round(clamp(Number(input.maxTokensPerMemberPerDay ?? 20000), 1000, 1000000, 20000)),
    maxRequestsPerDay: Math.round(clamp(Number(input.maxRequestsPerDay ?? 500), 1, 10000, 500)),
    maxTokensPerDay: Math.round(clamp(Number(input.maxTokensPerDay ?? 200000), 1000, 20000000, 200000)),
  };
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function estimateTokens(messages) {
  return Math.ceil(messages.reduce((total, message) => total + String(message.content || '').length, 0) / 2)
    + (messages.length * 5);
}

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function expiryForDay(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 3, 0, 0, 0));
}

async function reserveCounter(id, maxRequests, maxTokens, reservedTokens, expiresAt) {
  if (maxRequests < 1 || reservedTokens > maxTokens) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await AIQuotaCounter.findById(id).lean();
    if (!existing) {
      try {
        await AIQuotaCounter.create({ _id: id, requests: 1, tokens: reservedTokens, expiresAt });
        return true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        continue;
      }
    }
    const reserved = await AIQuotaCounter.findOneAndUpdate({
      _id: id,
      requests: { $lt: maxRequests },
      tokens: { $lte: maxTokens - reservedTokens },
    }, { $inc: { requests: 1, tokens: reservedTokens } }, { returnDocument: 'after' }).lean();
    return Boolean(reserved);
  }
  return false;
}

async function reserveBudget(guildId, userId, settings, tokens) {
  const day = utcDay();
  const expiresAt = expiryForDay(day);
  const memberId = 'member:' + guildId + ':' + userId + ':' + day;
  const globalId = 'guild:' + guildId + ':' + day;
  const memberReserved = await reserveCounter(memberId, settings.maxRequestsPerMemberPerDay, settings.maxTokensPerMemberPerDay, tokens, expiresAt);
  if (!memberReserved) return null;
  const globalReserved = await reserveCounter(globalId, settings.maxRequestsPerDay, settings.maxTokensPerDay, tokens, expiresAt);
  if (!globalReserved) {
    await AIQuotaCounter.updateOne({ _id: memberId }, { $inc: { requests: -1, tokens: -tokens } });
    return null;
  }
  return { memberId, globalId, tokens };
}

async function settleBudget(reservation, actualTokens) {
  if (!reservation || !Number.isFinite(actualTokens)) return;
  const correction = Math.max(-reservation.tokens, Math.round(actualTokens) - reservation.tokens);
  if (!correction) return;
  await Promise.all([reservation.memberId, reservation.globalId].map((id) =>
    AIQuotaCounter.updateOne({ _id: id }, { $inc: { tokens: correction } })));
}

async function safeSettleBudget(reservation, actualTokens) {
  try { await settleBudget(reservation, actualTokens); }
  catch (error) { logger.warn('Não foi possível reconciliar a reserva de tokens da IA (' + (error?.code || error?.name || 'erro') + ').'); }
}

function parseUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const inputTokens = Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : Number.isFinite(usage.input_tokens) ? usage.input_tokens : undefined;
  const outputTokens = Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : Number.isFinite(usage.output_tokens) ? usage.output_tokens : undefined;
  const totalTokens = Number.isFinite(usage.total_tokens) ? usage.total_tokens : (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : undefined);
  const reasoningTokens = Number.isFinite(usage.completion_tokens_details?.reasoning_tokens) ? usage.completion_tokens_details.reasoning_tokens : undefined;
  return { inputTokens, outputTokens, totalTokens, reasoningTokens };
}

async function recordAttempt({ guildId, userId, channelId, kind, model, status, usage, latencyMs, errorCode }) {
  try {
    await AIUsage.create({ guildId, userId, channelId: channelId || '', kind, model, status, ...usage, latencyMs: Math.max(0, Math.round(latencyMs)), ...(errorCode ? { errorCode: String(errorCode).slice(0, 80) } : {}) });
  } catch (error) {
    logger.warn('Não foi possível persistir uma métrica de utilização da IA (' + (error?.code || error?.name || 'erro') + ').');
  }
}

function makeGatewayError(status, code) {
  const error = new Error('Square Cloud AI Gateway request failed.');
  error.status = status;
  error.code = String(code || 'gateway_error').toLowerCase().slice(0, 80);
  error.retryable = status >= 500 || (status === 429 && RETRYABLE_CODES.has(error.code));
  return error;
}

async function errorFromResponse(response) {
  let data = {};
  try { data = await response.json(); } catch { /* Preserve the HTTP status as the safe error. */ }
  return makeGatewayError(response.status, data?.error?.code || 'http_' + response.status);
}

function abortError(signal) {
  const error = new Error(signal?.reason?.message || 'Request aborted.');
  error.name = signal?.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError';
  error.code = error.name === 'TimeoutError' ? 'timeout' : 'cancelled';
  return error;
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', cancel); resolve(); }
    function cancel() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError(signal)); }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function paceRequest(signal) {
  let unlock;
  const previous = pacingChain;
  pacingChain = new Promise((resolve) => { unlock = resolve; });
  await previous.catch(() => {});
  try {
    await wait(nextRequestAt - Date.now(), signal);
    nextRequestAt = Date.now() + MIN_REQUEST_SPACING_MS;
  } finally { unlock(); }
}

async function consumeStream(response, onChunk, signal) {
  if (!response.body) throw makeGatewayError(response.status, 'missing_stream_body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;
  let finished = false;

  function handleEvent(eventText) {
    const dataText = eventText.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!dataText || dataText === '[DONE]') { if (dataText === '[DONE]') finished = true; return; }
    let data;
    try { data = JSON.parse(dataText); } catch { return; }
    if (data.error) throw makeGatewayError(response.status, data.error.code || 'stream_error');
    const next = data.choices?.[0]?.delta?.content;
    if (typeof next === 'string' && next) { content += next; onChunk?.(next, content); }
    const parsed = parseUsage(data.usage);
    if (parsed) usage = parsed;
  }

  try {
    while (!finished) {
      if (signal?.aborted) throw abortError(signal);
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleEvent(event);
        if (finished) break;
      }
      if (done) {
        if (buffer.trim()) handleEvent(buffer);
        break;
      }
    }
  } finally { try { reader.releaseLock(); } catch { /* The stream may already be closed. */ } }
  return { content, usage };
}

function acquireSlot(maxConcurrent) {
  if (activeCount >= maxConcurrent) return null;
  activeCount += 1;
  let released = false;
  return () => { if (!released) { released = true; activeCount = Math.max(0, activeCount - 1); } };
}

function resultError(status, code, extra = {}) { return { ok: false, status, errorCode: code, ...extra }; }

async function complete({ guildId, userId, channelId = '', messages, settings: rawSettings, kind = 'chat', stream = false, onChunk, signal: externalSignal, sourceMessageId } = {}) {
  const startedAt = metrics.performance.now();
  let metricStatus = 'failed';
  const settings = normalizeSettings(rawSettings);
  const apiKey = process.env.SQUARECLOUD_API_KEY;
  if (!apiKey) return resultError('unavailable', 'missing_api_key');
  if (!Array.isArray(messages) || !messages.length || messages.length > 500 || messages.some((message) => !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
    return resultError('invalid', 'invalid_messages');
  }
  const releaseSlot = acquireSlot(settings.maxConcurrent);
  if (!releaseSlot) return resultError('busy', 'concurrency_limit');
  if (sourceMessageId && activeRequests.has(sourceMessageId)) { releaseSlot(); return resultError('duplicate', 'duplicate_message'); }

  const controller = new AbortController();
  activeControllers.add(controller);
  let signal = controller.signal;
  if (externalSignal) signal = AbortSignal.any([controller.signal, externalSignal]);
  let activeEntry;
  if (sourceMessageId) {
    activeEntry = { controller };
    activeRequests.set(sourceMessageId, activeEntry);
  }
  const timeout = setTimeout(() => controller.abort(Object.assign(new Error('Gateway request timed out.'), { name: 'TimeoutError' })), settings.timeoutMs);
  const reservedTokens = Math.ceil(estimateTokens(messages) * 1.5) + settings.maxCompletionTokens;
  const dayStatus = () => signal.aborted ? resultError(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled', signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled') : null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const stopped = dayStatus();
      if (stopped) return stopped;
      await paceRequest(signal);
      const reservation = await reserveBudget(guildId, userId, settings, reservedTokens);
      if (!reservation) { metricStatus = 'limited'; return resultError('limited', 'local_daily_limit'); }
      const attemptStarted = metrics.performance.now();
      let usage = null;
      let response;
      try {
        response = await fetch(API_URL, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' },
          body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: settings.temperature,
            max_completion_tokens: settings.maxCompletionTokens,
            reasoning_effort: settings.reasoningEffort,
            stream,
            ...(stream ? { stream_options: { include_usage: true } } : {}),
          }),
          signal,
        });
        if (!response.ok) throw await errorFromResponse(response);
        let content;
        if (stream) {
          const streamed = await consumeStream(response, onChunk, signal);
          content = streamed.content; usage = streamed.usage;
        } else {
          const data = await response.json();
          content = data?.choices?.[0]?.message?.content;
          usage = parseUsage(data?.usage);
        }
        if (typeof content !== 'string' || !content.trim()) throw makeGatewayError(response.status, 'empty_response');
        const latencyMs = metrics.performance.now() - attemptStarted;
        await recordAttempt({ guildId, userId, channelId, kind, model: settings.model, status: 'succeeded', usage: usage || {}, latencyMs });
        await safeSettleBudget(reservation, usage?.totalTokens);
        metricStatus = 'succeeded';
        return { ok: true, content: content.trim(), model: settings.model, usage, latencyMs: Math.round(latencyMs) };
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || signal.reason?.name === 'TimeoutError';
        const cancelled = signal.aborted && !timedOut;
        const code = timedOut ? 'timeout' : cancelled ? 'cancelled' : (error?.code || 'gateway_error');
        const status = cancelled ? 'cancelled' : error?.status === 429 ? 'rate-limited' : 'failed';
        const latencyMs = metrics.performance.now() - attemptStarted;
        await recordAttempt({ guildId, userId, channelId, kind, model: settings.model, status, usage: usage || {}, latencyMs, errorCode: code });
        await safeSettleBudget(reservation, usage?.totalTokens);
        const retryableNetwork = error?.name === 'TypeError' || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code);
        const shouldRetry = !signal.aborted && (error?.retryable || retryableNetwork) && attempt < MAX_RETRIES;
        if (shouldRetry) {
          const delay = error.status === 429 ? Math.max(MIN_REQUEST_SPACING_MS, Number(response?.headers?.get('retry-after')) * 1000 || 0) : 400 * (attempt + 1);
          await wait(Math.min(delay, 5000), signal);
          continue;
        }
        metricStatus = cancelled ? 'cancelled' : timedOut ? 'timeout' : status === 'rate-limited' ? 'rate-limited' : 'failed';
        return resultError(metricStatus, code, { statusCode: error?.status || null });
      }
    }
    return resultError('failed', 'retry_exhausted');
  } catch (error) {
    if (error?.name === 'TimeoutError' || signal.reason?.name === 'TimeoutError') { metricStatus = 'timeout'; return resultError('timeout', 'timeout'); }
    if (signal.aborted) { metricStatus = 'cancelled'; return resultError('cancelled', 'cancelled'); }
    logger.warn('Falha de rede no Gateway de IA da Square Cloud (' + (error?.code || error?.name || 'erro') + ').');
    metricStatus = 'failed';
    return resultError('failed', error?.code || 'network_error');
  } finally {
    clearTimeout(timeout);
    activeControllers.delete(controller);
    if (sourceMessageId && activeRequests.get(sourceMessageId) === activeEntry) activeRequests.delete(sourceMessageId);
    releaseSlot();
    const durationMs = metrics.performance.now() - startedAt;
    metrics.record('ai.request', kind + ':' + metricStatus, durationMs);
  }
}

function cancelRequest(sourceMessageId) {
  const entry = activeRequests.get(String(sourceMessageId));
  if (!entry) return false;
  entry.controller.abort(new Error('Source Discord message was deleted.'));
  return true;
}

function cancelAllRequests() {
  for (const controller of activeControllers) controller.abort(new Error('Kiryu is shutting down.'));
  activeRequests.clear();
}

async function waitForRequests(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (activeCount && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 40));
}

async function getUsageStats(guildId, { period = 'day', now = new Date() } = {}) {
  const starts = {
    day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    week: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7))),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
  const start = starts[period] || starts.day;
  const match = { guildId, createdAt: { $gte: start } };
  const [summaryRows, byModel, byMember, total] = await Promise.all([
    AIUsage.aggregate([{ $match: match }, { $group: { _id: null,
      requests: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] } },
      errors: { $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 0, 1] } },
      inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' }, totalTokens: { $sum: '$totalTokens' },
      averageLatency: { $avg: '$latencyMs' }, usageCount: { $sum: { $cond: [{ $ifNull: ['$totalTokens', false] }, 1, 0] } },
    } }]),
    AIUsage.aggregate([{ $match: match }, { $group: { _id: '$model', requests: { $sum: 1 }, totalTokens: { $sum: '$totalTokens' } } }, { $sort: { totalTokens: -1 } }]),
    AIUsage.aggregate([{ $match: match }, { $group: { _id: '$userId', requests: { $sum: 1 }, totalTokens: { $sum: '$totalTokens' } } }, { $sort: { totalTokens: -1 } }, { $limit: 10 }]),
    AIUsage.countDocuments(match),
  ]);
  const summary = summaryRows[0] || { requests: 0, success: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, averageLatency: 0, usageCount: 0 };
  const p95Offset = Math.max(0, Math.ceil(total * 0.95) - 1);
  const p95Rows = total ? await AIUsage.find(match).sort({ latencyMs: 1 }).skip(p95Offset).limit(1).select('latencyMs').lean() : [];
  return {
    period, start, requests: summary.requests, success: summary.success, errors: summary.errors,
    inputTokens: summary.inputTokens || 0, outputTokens: summary.outputTokens || 0, totalTokens: summary.totalTokens || 0,
    usageAvailable: summary.usageCount || 0, averageLatencyMs: Math.round(summary.averageLatency || 0),
    p95LatencyMs: Math.round(p95Rows[0]?.latencyMs || 0), byModel, byMember,
    costsAvailable: false,
  };
}

module.exports = {
  API_URL, MODEL_CATALOG, normalizeSettings, estimateTokens, complete, cancelRequest, cancelAllRequests, waitForRequests,
  getUsageStats, parseUsage, _reserveBudget: reserveBudget, _consumeStream: consumeStream,
};
