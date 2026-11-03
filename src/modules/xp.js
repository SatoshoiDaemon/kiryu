function requiredXP(level) {
  if (!Number.isInteger(level) || level < 0) throw new RangeError('O nível deve ser um inteiro não negativo.');
  return 100 + (100 * level);
}

function normalizeProfile(profile) {
  return {
    level: Math.max(0, Math.floor(Number(profile?.level) || 0)),
    xp: Math.max(0, Math.floor(Number(profile?.xp) || 0)),
  };
}

function addXp(profile, amount) {
  const state = normalizeProfile(profile);
  const remaining = Math.max(0, Math.floor(Number(amount) || 0));
  let xp = state.xp + remaining;
  let level = state.level;
  let levelsGained = 0;
  while (xp >= requiredXP(level)) {
    xp -= requiredXP(level);
    level += 1;
    levelsGained += 1;
  }
  return { level, xp, levelsGained, xpAdded: remaining };
}

function removeXp(profile, amount) {
  const state = normalizeProfile(profile);
  const remaining = Math.max(0, Math.floor(Number(amount) || 0));
  let level = state.level;
  let xp = state.xp - remaining;
  let levelsLost = 0;
  while (xp < 0 && level > 0) {
    level -= 1;
    levelsLost += 1;
    xp += requiredXP(level);
  }
  if (level === 0 && xp < 0) xp = 0;
  const totalXpBefore = state.xp + (50 * state.level * (state.level + 1));
  return { level, xp, levelsLost, xpRemoved: Math.min(remaining, totalXpBefore) };
}

function addLevels(profile, count) {
  const state = normalizeProfile(profile);
  const levels = Math.max(0, Math.floor(Number(count) || 0));
  const level = state.level + levels;
  return { level, xp: Math.min(state.xp, requiredXP(level) - 1), levelsGained: levels };
}

function removeLevels(profile, count) {
  const state = normalizeProfile(profile);
  const levels = Math.min(state.level, Math.max(0, Math.floor(Number(count) || 0)));
  const level = state.level - levels;
  return { level, xp: Math.min(state.xp, requiredXP(level) - 1), levelsLost: levels };
}

function progressBar(xp, level, width = 16) {
  const required = requiredXP(level);
  const progress = Math.min(1, Math.max(0, xp / required));
  const filled = Math.floor(progress * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

module.exports = { requiredXP, normalizeProfile, addXp, removeXp, addLevels, removeLevels, progressBar };
