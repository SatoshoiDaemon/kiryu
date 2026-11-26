const { normalizeSettings, estimateTokens } = require('./aiGateway');

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === 'function') return [...collection.values()];
  return Array.isArray(collection) ? collection : [];
}

function hasMention(collection, id) {
  return Boolean(id && (collection?.has?.(id) || collection?.cache?.has?.(id)));
}

async function referencedMessage(message) {
  if (!message?.reference?.messageId) return null;
  try {
    if (typeof message.fetchReference === 'function') return await message.fetchReference();
    if (message.channel?.messages?.fetch) return await message.channel.messages.fetch(message.reference.messageId);
  } catch { /* A removed or inaccessible reply target is omitted. */ }
  return null;
}

function isCandidate(message, botId) {
  if (!message?.guildId || !message.author || message.author.bot || message.webhookId || message.author.id === botId) return false;
  if (message.mentions?.everyone || (message.mentions?.roles?.size || 0) > 0) return false;
  return hasMention(message.mentions?.users, botId) || Boolean(message.reference?.messageId);
}

function shouldRespond(message, botId, replyTarget) {
  if (!isCandidate(message, botId)) return false;
  const direct = hasMention(message.mentions?.users, botId);
  const replyToKiryu = replyTarget?.author?.id === botId;
  return direct || replyToKiryu;
}

function isAllowed(message, aiConfig = {}) {
  const channelId = message.channelId;
  const parentId = message.channel?.parentId;
  const allowedChannels = aiConfig.allowedChannelIds || [];
  const blockedChannels = aiConfig.blockedChannelIds || [];
  const blockedChannel = blockedChannels.includes(channelId) || (parentId && blockedChannels.includes(parentId));
  if (blockedChannel) return false;
  if (allowedChannels.length && !allowedChannels.includes(channelId) && !(parentId && allowedChannels.includes(parentId))) return false;

  const roles = message.member?.roles?.cache;
  const roleIds = roles?.keys ? [...roles.keys()] : Array.isArray(message.member?.roles) ? message.member.roles : [];
  if ((aiConfig.blockedRoleIds || []).some((roleId) => roleIds.includes(roleId))) return false;
  if (aiConfig.allowedRoleIds?.length && !aiConfig.allowedRoleIds.some((roleId) => roleIds.includes(roleId))) return false;
  return true;
}

function displayAuthor(message, botId) {
  if (message.author?.id === botId) return 'Kiryu';
  return String(message.member?.displayName || message.author?.globalName || message.author?.username || 'Membro')
    .replace(/[\r\n\[\]]/g, ' ').trim().slice(0, 64) || 'Membro';
}

function replaceMentions(content, guild, botId) {
  return String(content || '')
    .replace(/<@!?(\d+)>/g, (_match, id) => id === botId ? '@Kiryu' : '@' + (guild?.members?.cache?.get(id)?.displayName || 'membro'))
    .replace(/<@&(\d+)>/g, (_match, id) => '@' + (guild?.roles?.cache?.get(id)?.name || 'cargo'))
    .replace(/<#(\d+)>/g, (_match, id) => '#' + (guild?.channels?.cache?.get(id)?.name || 'canal'))
    .replace(/@(everyone|here)/gi, '@ $1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function contentFor(message, guild, botId, isCurrent = false) {
  let rawContent = String(message.content || '');
  if (isCurrent) rawContent = rawContent.replace(new RegExp('<@!?'+ botId + '>', 'g'), '');
  let content = replaceMentions(rawContent, guild, botId).trim();
  if (!content && message.attachments?.size) content = '[anexo não enviado ao Gateway, que aceita apenas texto]';
  if (!content && isCurrent) content = '[A pessoa mencionou a Kiryu sem adicionar texto.]';
  return content.slice(0, 2400);
}

function makeConversationMessage(message, guild, botId, isCurrent = false, isReplyTarget = false) {
  const content = contentFor(message, guild, botId, isCurrent);
  if (!content) return null;
  const author = displayAuthor(message, botId);
  return {
    role: message.author?.id === botId ? 'assistant' : 'user',
    content: '[' + author + (isReplyTarget ? ' · mensagem respondida' : '') + ']: ' + content,
    _timestamp: Number(message.createdTimestamp || 0),
    _id: message.id,
    _current: isCurrent,
  };
}

async function buildConversation({ message, botId, aiConfig, replyTarget = null }) {
  const settings = normalizeSettings(aiConfig);
  const previousLimit = Math.max(0, Math.min(99, settings.contextMessages - 1));
  let previous = [];
  if (previousLimit && message.channel?.messages?.fetch) {
    try {
      const fetched = await message.channel.messages.fetch({ limit: previousLimit, before: message.id });
      previous = collectionValues(fetched);
    } catch { /* Continue with the current message when channel history is unavailable. */ }
  }

  if (replyTarget && !previous.some((item) => item.id === replyTarget.id)) previous.push(replyTarget);
  const candidates = [...previous, message]
    .filter((item, index, list) => item?.id && list.findIndex((other) => other?.id === item.id) === index)
    .filter((item) => !item.webhookId && (!item.author?.bot || item.author.id === botId))
    .sort((left, right) => Number(left.createdTimestamp || 0) - Number(right.createdTimestamp || 0));

  const current = makeConversationMessage(message, message.guild, botId, true);
  const contextMessages = candidates.filter((item) => item.id !== message.id)
    .map((item) => makeConversationMessage(item, message.guild, botId, false, item.id === replyTarget?.id)).filter(Boolean);
  if (replyTarget && !contextMessages.some((item) => item._id === replyTarget.id)) {
    const ref = makeConversationMessage(replyTarget, message.guild, botId, false, true);
    if (ref) contextMessages.push(ref);
  }
  contextMessages.sort((left, right) => left._timestamp - right._timestamp);
  const olderCount = Math.max(0, settings.contextMessages - 1);
  let selected = [...(olderCount ? contextMessages.slice(-olderCount) : []), current].filter(Boolean);
  if (replyTarget && !selected.some((item) => item._id === replyTarget.id)) {
    const reference = contextMessages.find((item) => item._id === replyTarget.id);
    if (reference) {
      const recentLimit = Math.max(0, settings.contextMessages - 2);
      selected = [...(recentLimit ? contextMessages.filter((item) => item._id !== reference._id).slice(-recentLimit) : []), reference, current].filter(Boolean);
      selected.sort((left, right) => left._timestamp - right._timestamp);
    }
  }

  const messageBudget = settings.contextTokenBudget;
  while (selected.length > 1 && estimateTokens(selected) > messageBudget) {
    const removable = selected.findIndex((item) => item._current !== true && item._id !== replyTarget?.id);
    if (removable < 0) break;
    selected.splice(removable, 1);
  }
  if (selected.length && estimateTokens(selected) > messageBudget) {
    const last = selected.at(-1);
    const maxChars = Math.max(200, messageBudget * 2);
    last.content = last.content.slice(0, maxChars);
  }
  const clean = selected.map(({ role, content }) => ({ role, content }));
  return [
    ...(settings.systemPrompt ? [{ role: 'system', content: settings.systemPrompt }] : []),
    ...clean,
  ];
}

module.exports = { isCandidate, shouldRespond, isAllowed, referencedMessage, buildConversation, replaceMentions };
