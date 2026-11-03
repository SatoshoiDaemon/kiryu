const { createCooldownTracker } = require('../modules/cooldown');
const { awardMessageXp, getGuildConfig } = require('../modules/xpService');
const { findTrigger, chooseResponse } = require('../modules/triggers');
const { replyMessageV2 } = require('../modules/components');
const { handlePrefixMessage } = require('../handlers/commandHandler');
const logger = require('../logger');

const cooldowns = createCooldownTracker();

async function execute(message, client) {
  if (!message.guild || message.guildId !== client.config.guildId || message.author.bot) return;

  try {
    await awardMessageXp(message.guildId, message.author.id, message.member, message.channelId, cooldowns);
  } catch {
    logger.warn('Falha ao conceder XP por mensagem; a mensagem foi processada normalmente.');
  }

  await handlePrefixMessage(message, client);

  try {
    const cfg = await getGuildConfig(message.guildId);
    const trigger = findTrigger(cfg.triggers, message.content);
    const response = chooseResponse(trigger);
    if (response) await replyMessageV2(message, response);
  } catch {
    logger.warn('Falha ao verificar gatilhos personalizados.');
  }
}

module.exports = { name: 'messageCreate', execute };
