const { randomInt } = require('node:crypto');
const { GuildConfig, UserXp } = require('../database');
const rules = require('./xp');

const queues = new Map();

function serialize(key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(key, current);
  return current.finally(() => {
    if (queues.get(key) === current) queues.delete(key);
  });
}

async function getGuildConfig(guildId) {
  let document = await GuildConfig.findById(guildId);
  if (document) return document;
  try {
    document = await GuildConfig.create({ _id: guildId });
    return document;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return GuildConfig.findById(guildId);
  }
}

async function getOrCreateProfile(guildId, userId) {
  let profile = await UserXp.findOne({ guildId, userId });
  if (!profile) {
    try {
      profile = await UserXp.create({ guildId, userId, level: 0, xp: 0 });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      profile = await UserXp.findOne({ guildId, userId });
    }
  }
  return profile;
}

function getMultiplier(member, guildConfig) {
  if (!member?.roles?.cache || guildConfig.buffs.length === 0) return 1;
  const roleIds = new Set(member.roles.cache.keys());
  const multipliers = guildConfig.buffs
    .filter((buff) => roleIds.has(buff.roleId))
    .map((buff) => Number(buff.multiplier))
    .filter((value) => Number.isFinite(value) && value >= 1);
  if (multipliers.length === 0) return 1;
  return guildConfig.stackBuffs
    ? Math.min(1000, multipliers.reduce((total, value) => total * value, 1))
    : Math.max(...multipliers);
}

async function getProfile(guildId, userId) {
  const profile = await getOrCreateProfile(guildId, userId);
  return { level: profile.level, xp: profile.xp };
}

async function updateProfile(guildId, userId, operation) {
  return serialize(guildId + ':' + userId, async () => {
    const profile = await getOrCreateProfile(guildId, userId);
    const result = operation({ level: profile.level, xp: profile.xp });
    profile.level = result.level;
    profile.xp = result.xp;
    await profile.save();
    return { ...result, level: profile.level, xp: profile.xp };
  });
}

async function grantXp(guildId, userId, amount, member = null, { applyBuff = true } = {}) {
  const guildConfig = applyBuff ? await getGuildConfig(guildId) : null;
  const multiplier = guildConfig ? getMultiplier(member, guildConfig) : 1;
  const baseXp = Math.max(0, Math.floor(Number(amount) || 0));
  const xpAdded = Math.floor(baseXp * multiplier);
  const result = await updateProfile(guildId, userId, (profile) => rules.addXp(profile, xpAdded));
  return { ...result, baseXp, multiplier };
}

async function subtractXp(guildId, userId, amount) {
  return updateProfile(guildId, userId, (profile) => rules.removeXp(profile, amount));
}

async function grantLevels(guildId, userId, count) {
  return updateProfile(guildId, userId, (profile) => rules.addLevels(profile, count));
}

async function subtractLevels(guildId, userId, count) {
  return updateProfile(guildId, userId, (profile) => rules.removeLevels(profile, count));
}

async function awardMessageXp(guildId, userId, member, channelId, cooldowns, now = Date.now()) {
  const guildConfig = await getGuildConfig(guildId);
  const settings = guildConfig.messageXp;
  if (settings.excludedChannelIds.includes(channelId)) return null;
  if (!cooldowns.canAward(guildId + ':' + userId, settings.cooldownMs, now)) return null;
  const amount = randomInt(settings.min, settings.max + 1);
  return grantXp(guildId, userId, amount, member);
}

async function awardVoiceXp(guildId, userId, member) {
  const guildConfig = await getGuildConfig(guildId);
  const amount = randomInt(guildConfig.voiceXp.min, guildConfig.voiceXp.max + 1);
  return grantXp(guildId, userId, amount, member);
}

module.exports = {
  getGuildConfig,
  getMultiplier,
  getProfile,
  grantXp,
  subtractXp,
  grantLevels,
  subtractLevels,
  awardMessageXp,
  awardVoiceXp,
};
