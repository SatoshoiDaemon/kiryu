const { createCooldownTracker } = require('../modules/cooldown');
const { awardMessageXp, getGuildConfig } = require('../modules/xpService');
const { findTrigger, chooseResponse } = require('../modules/triggers');
const { notifyLevelUp } = require('../modules/levelUpNotifications');
const { handleAIMessage } = require('../modules/aiConversation');
const { replyMessageV2 } = require('../modules/components');
const { handlePrefixMessage } = require('../handlers/commandHandler');
const logger = require('../logger');

const cooldowns = createCooldownTracker();

async function execute(message, client) {
  if (!message.guild || message.guildId !== client.config.guildId || message.author.bot) return;

  let guildConfig;
  try {
    guildConfig = await getGuildConfig(message.guildId);
    const result = await awardMessageXp(message.guildId, message.author.id, message.member, message.channelId, cooldowns, Date.now(), { guildConfig });
    if (result?.levelsGained > 0) await notifyLevelUp(message.guild, message.author, result);
  } catch {
    logger.warn('Falha ao conceder XP por mensagem; a mensagem foi processada normalmente.');
  }

  await handlePrefixMessage(message, client);

  let cfg = guildConfig;
  let response = null;
  try {
    cfg ||= await getGuildConfig(message.guildId);
    response = chooseResponse(findTrigger(cfg.triggers, message.content));
    if (response) await replyMessageV2(message, response);
  } catch {
    logger.warn('Falha ao verificar gatilhos personalizados.');
  }

  try {
    await handleAIMessage(message, client, { guildConfig: cfg, hasDeterministicResponse: Boolean(response) });
  } catch {
    logger.warn('Falha ao processar a interação de IA.');
  }
}

module.exports = { name: 'messageCreate', execute };
