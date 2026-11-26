const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { createContainer } = require('./components');
const logger = require('../logger');
const config = require('../config');

function levelUpText(result, user) {
  const { say } = require('./personality');
  const message = String(result.levelUp?.message || say('levelUp'))
    .replaceAll('{member}', user.toString())
    .replaceAll('{level}', result.level.toLocaleString('pt-BR'))
    .replaceAll('{xp}', result.xp.toLocaleString('pt-BR'));
  return '# Um novo nível no Eternity\n' + message + '\n\n**Nível:** ' + result.level.toLocaleString('pt-BR') + '\n**XP neste nível:** ' + result.xp.toLocaleString('pt-BR');
}

async function notifyLevelUp(guild, user, result) {
  if (!result || result.levelsGained <= 0 || result.levelUp?.enabled === false) return { status: 'disabled' };
  const channelId = result.levelUp?.channelId;
  if (!channelId) return { status: 'unconfigured' };
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try { channel = await guild.channels.fetch(channelId); }
    catch { channel = null; }
  }
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
    logger.warn('Canal de anúncio de nível removido ou indisponível; nenhuma notificação foi enviada.');
    return { status: 'missing' };
  }
  const botMember = guild.members?.me;
  let permissions;
  try { permissions = botMember && channel.permissionsFor?.(botMember); } catch { permissions = null; }
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
    logger.warn('Permissões insuficientes no canal de anúncio de nível; nenhuma notificação foi enviada.');
    return { status: 'forbidden' };
  }
  try {
    await channel.send({
      components: [createContainer(levelUpText(result, user), [], config.visual.xp)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], users: [user.id], roles: [] },
    });
    return { status: 'sent' };
  } catch (error) {
    logger.warn('Não foi possível publicar a notificação de nível no canal configurado (' + (error?.code || error?.name || 'erro') + ').');
    return { status: 'failed' };
  }
}

module.exports = { notifyLevelUp, levelUpText };
