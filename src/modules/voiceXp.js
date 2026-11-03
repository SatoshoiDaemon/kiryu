const { awardVoiceXp, getGuildConfig } = require('./xpService');
const logger = require('../logger');
const config = require('../config');

const trackedMembers = new Map();
const SWEEP_INTERVAL_MS = 30000;
let timer;

function memberKey(guildId, userId) {
  return guildId + ':' + userId;
}

function trackVoiceMember(member, channelId = member?.voice?.channelId) {
  if (!member || member.user?.bot || !channelId) return;
  const key = memberKey(member.guild.id, member.id);
  const previous = trackedMembers.get(key);
  if (previous?.channelId !== channelId) {
    const now = Date.now();
    trackedMembers.set(key, { guildId: member.guild.id, userId: member.id, channelId, lastAwardAt: now });
  }
}

function removeVoiceMember(member) {
  if (member) trackedMembers.delete(memberKey(member.guild.id, member.id));
}

function syncCurrentVoiceMembers(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    if (guild.id !== config.guildId) continue;
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!member || member.user?.bot || !state.channelId) continue;
      const key = memberKey(guild.id, member.id);
      if (!trackedMembers.has(key)) {
        trackedMembers.set(key, { guildId: guild.id, userId: member.id, channelId: state.channelId, lastAwardAt: now });
      } else if (trackedMembers.get(key).channelId !== state.channelId) {
        trackedMembers.set(key, { guildId: guild.id, userId: member.id, channelId: state.channelId, lastAwardAt: now });
      }
    }
  }
}

async function sweep(client, now = Date.now()) {
  syncCurrentVoiceMembers(client);
  const current = new Set();
  for (const guild of client.guilds.cache.values()) {
    if (guild.id !== config.guildId) continue;
    let guildConfig;
    try {
      guildConfig = await getGuildConfig(guild.id);
    } catch {
      logger.warn('Não foi possível carregar as configurações de XP por voz nesta verificação.');
      continue;
    }
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!member || member.user?.bot || !state.channelId) continue;
      const key = memberKey(guild.id, member.id);
      current.add(key);
      const tracking = trackedMembers.get(key);
      if (!tracking) continue;
      if (guildConfig.voiceXp.excludedChannelIds.includes(state.channelId)) {
        tracking.lastAwardAt = now;
        continue;
      }
      if (now - tracking.lastAwardAt < guildConfig.voiceXp.intervalMs) continue;
      try {
        await awardVoiceXp(guild.id, member.id, member);
        tracking.lastAwardAt = now;
      } catch {
        logger.warn('Falha ao conceder XP de voz; o próximo ciclo tentará novamente.');
      }
    }
  }
  for (const key of trackedMembers.keys()) if (!current.has(key)) trackedMembers.delete(key);
}

function startVoiceXp(client) {
  if (timer) clearInterval(timer);
  syncCurrentVoiceMembers(client);
  timer = setInterval(() => sweep(client).catch(() => logger.warn('Falha na verificação periódica de XP por voz.')), SWEEP_INTERVAL_MS);
  timer.unref?.();
}

function stopVoiceXp() {
  if (timer) clearInterval(timer);
  timer = undefined;
  trackedMembers.clear();
}

module.exports = { trackVoiceMember, removeVoiceMember, startVoiceXp, stopVoiceXp, sweep, trackedMembers };
