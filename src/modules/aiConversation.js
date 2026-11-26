const config = require('../config');
const logger = require('../logger');
const { getGuildConfig } = require('./xpService');
const aiGateway = require('./aiGateway');
const { isCandidate, shouldRespond, isAllowed, referencedMessage, buildConversation } = require('./aiContext');

const handledMessages = new Map();
const lastMemberResponse = new Map();
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_LIMIT = 2000;
const MEMBER_COOLDOWN_TTL_MS = 24 * 60 * 60_000;
const MEMBER_COOLDOWN_LIMIT = 10000;
const TEMPORARY_FAILURE_TEXT = 'Não consigo responder agora. Tente novamente em instantes.';

function pruneDedupe(now = Date.now()) {
  for (const [id, timestamp] of handledMessages) if (now - timestamp > DEDUPE_TTL_MS) handledMessages.delete(id);
  while (handledMessages.size > DEDUPE_LIMIT) handledMessages.delete(handledMessages.keys().next().value);
  for (const [id, timestamp] of lastMemberResponse) if (now - timestamp > MEMBER_COOLDOWN_TTL_MS) lastMemberResponse.delete(id);
  while (lastMemberResponse.size > MEMBER_COOLDOWN_LIMIT) lastMemberResponse.delete(lastMemberResponse.keys().next().value);
}

function splitDiscordResponse(value, maxLength = 1850) {
  let remaining = String(value || '').trim();
  const chunks = [];
  let openFence = null;
  while (remaining.length > maxLength) {
    const limit = Math.max(100, maxLength - (openFence ? 8 : 0));
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.55) cut = remaining.lastIndexOf(' ', limit);
    if (cut < 1) cut = limit;
    const raw = remaining.slice(0, cut).trimEnd();
    for (const line of raw.split('\n')) {
      const fence = line.match(/^\s*```([^`]*)$/);
      if (!fence) continue;
      openFence = openFence == null ? fence[1] : null;
    }
    chunks.push(openFence == null ? raw : raw + '\n```');
    remaining = remaining.slice(cut).trimStart();
    if (openFence != null) remaining = '```' + openFence + '\n' + remaining;
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendReply(message, content) {
  const chunks = splitDiscordResponse(content);
  for (const chunk of chunks) {
    await message.reply({
      content: chunk,
      allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
      failIfNotExists: false,
    });
  }
}

async function handleAIMessage(message, client, { guildConfig = null, hasDeterministicResponse = false } = {}) {
  if (hasDeterministicResponse || !client?.user?.id || message.guildId !== config.guildId) return { status: 'ignored' };
  if (client.config?.prefix && String(message.content || '').startsWith(client.config.prefix)) return { status: 'ignored' };
  if (!isCandidate(message, client.user.id)) return { status: 'ignored' };

  const replyTarget = await referencedMessage(message);
  if (!shouldRespond(message, client.user.id, replyTarget)) return { status: 'ignored' };
  pruneDedupe();
  if (handledMessages.has(message.id)) return { status: 'duplicate' };
  handledMessages.set(message.id, Date.now());

  try {
    const currentConfig = guildConfig || await getGuildConfig(message.guildId);
    const aiConfig = currentConfig?.ai || {};
    if (!aiConfig.enabled) return { status: 'disabled' };
    if (!isAllowed(message, aiConfig)) return { status: 'blocked' };

    const cooldownSeconds = Math.max(0, Number(aiConfig.memberCooldownSeconds ?? 30));
    const memberKey = message.guildId + ':' + message.author.id;
    const now = Date.now();
    const previous = lastMemberResponse.get(memberKey) || 0;
    if (cooldownSeconds && now - previous < cooldownSeconds * 1000) return { status: 'cooldown' };
    lastMemberResponse.set(memberKey, now);

    const sendTyping = async () => {
      try { await message.channel.sendTyping(); } catch { /* Permission or channel state may change. */ }
    };
    await sendTyping();
    const typingTimer = setInterval(sendTyping, 8000);
    typingTimer.unref?.();
    try {
      const messages = await buildConversation({ message, botId: client.user.id, aiConfig, replyTarget });
      const result = await aiGateway.complete({
        guildId: message.guildId,
        userId: message.author.id,
        channelId: message.channelId,
        messages,
        settings: aiConfig,
        stream: true,
        sourceMessageId: message.id,
      });
      if (result.ok) {
        await sendReply(message, result.content);
        return { status: 'replied', usage: result.usage };
      }
      if (['failed', 'timeout', 'rate-limited', 'busy', 'limited', 'unavailable'].includes(result.status)) {
        await sendReply(message, TEMPORARY_FAILURE_TEXT).catch(() => {});
        logger.warn('A resposta conversacional da Kiryu não foi concluída (' + result.errorCode + ').');
      }
      return result;
    } finally {
      clearInterval(typingTimer);
    }
  } catch (error) {
    logger.warn('Falha ao processar uma conversa da Kiryu (' + (error?.code || error?.name || 'erro') + ').');
    return { status: 'failed' };
  }
}

function clearConversationState() {
  handledMessages.clear();
  lastMemberResponse.clear();
}

module.exports = { handleAIMessage, splitDiscordResponse, clearConversationState, handledMessages, lastMemberResponse };
