const { createCooldownTracker } = require('../modules/cooldown');
const { awardMessageXp, getGuildConfig } = require('../modules/xpService');
const { findTrigger, chooseResponse } = require('../modules/triggers');
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
    if (result?.levelsGained > 0 && result.levelUp?.enabled !== false) {
      const { say } = require('../modules/personality');
      const levelUpMessage = String(result.levelUp?.message || say('levelUp'))
        .replaceAll('{member}', message.author.toString())
        .replaceAll('{level}', result.level.toLocaleString('pt-BR'))
        .replaceAll('{xp}', result.xp.toLocaleString('pt-BR'));
      await replyMessageV2(message, '# Um novo nível no Eternity\n' + levelUpMessage + '\n\n**Nível:** ' + result.level.toLocaleString('pt-BR') + '\n**XP neste nível:** ' + result.xp.toLocaleString('pt-BR'));
    }
  } catch {
    logger.warn('Falha ao conceder XP por mensagem; a mensagem foi processada normalmente.');
  }

  await handlePrefixMessage(message, client);

  try {
    const cfg = guildConfig || await getGuildConfig(message.guildId);
    const trigger = findTrigger(cfg.triggers, message.content);
    const response = chooseResponse(trigger);
    if (response) await replyMessageV2(message, response);
  } catch {
    logger.warn('Falha ao verificar gatilhos personalizados.');
  }
}

module.exports = { name: 'messageCreate', execute };
