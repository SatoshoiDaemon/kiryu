const { createCooldownTracker } = require('../modules/cooldown');
const { awardMessageXp, getGuildConfig } = require('../modules/xpService');
const { findTrigger, chooseResponse } = require('../modules/triggers');
const { notifyLevelUp } = require('../modules/levelUpNotifications');
const { handleAIMessage } = require('../modules/aiConversation');
const { replyMessageV2 } = require('../modules/components');
const { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, TextDisplayBuilder } = require('discord.js');
const { decorateContainer } = require('../modules/components');
const config = require('../config');
const { handlePrefixMessage } = require('../handlers/commandHandler');
const { handleAfkMessage } = require('../modules/communityCommands');
const logger = require('../logger');

const cooldowns = createCooldownTracker();

async function execute(message, client) {
  if (!message.guild || message.guildId !== client.config.guildId || message.author.bot) return;

  try { await handleAfkMessage(message); }
  catch { logger.warn('Falha ao verificar o estado de ausência dos membros.'); }

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
    const trigger = findTrigger(cfg.triggers, message.content);
    response = chooseResponse(trigger);
    if (response && trigger?.assets?.length) {
      const asset = trigger.assets[Math.floor(Math.random() * trigger.assets.length)];
      if (/^https:\/\//i.test(asset.url || '')) {
        const container = new ContainerBuilder().setAccentColor(config.visual.brand).addTextDisplayComponents(new TextDisplayBuilder().setContent(response.slice(0, 1800)))
          .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(asset.url).setDescription('Resposta automática · ' + (asset.filename || 'imagem'))));
        decorateContainer(container);
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } });
      } else await replyMessageV2(message, response);
    } else if (response) await replyMessageV2(message, response);
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
