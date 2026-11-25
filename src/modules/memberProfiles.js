const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { MemberProfile } = require('../database');
const { getProfile } = require('./xpService');
const { requiredXP } = require('./xp');

const renderedCards = new Map();
const CARD_CACHE_TTL_MS = 60_000;
const CARD_CACHE_LIMIT = 80;

const ACCENTS = {
  rose: ['#f9a8d4', '#831843', '#fce7f3'],
  violet: ['#c4b5fd', '#4c1d95', '#ede9fe'],
  gold: ['#fcd34d', '#78350f', '#fef3c7'],
  emerald: ['#6ee7b7', '#064e3b', '#d1fae5'],
  ice: ['#7dd3fc', '#0c4a6e', '#e0f2fe'],
};
const BACKGROUNDS = {
  dusk: ['#11121c', '#28122d', '#3f1831'],
  crimson: ['#170d18', '#51142a', '#241022'],
  aurora: ['#091923', '#123b3d', '#17233d'],
  parchment: ['#201820', '#62452f', '#251626'],
};
const FRAMES = ['classic', 'royal', 'neon', 'rune'];
const BADGES = ['star', 'moon', 'flame', 'comet', 'laurel'];
const BADGE_MARKS = { star: '✦', moon: '☾', flame: '♨', comet: '☄', laurel: '❧' };

async function getMemberProfile(guildId, userId) {
  let profile = await MemberProfile.findOne({ guildId, userId });
  if (profile) return profile;
  try { return await MemberProfile.create({ guildId, userId }); }
  catch (error) {
    if (error?.code !== 11000) throw error;
    return MemberProfile.findOne({ guildId, userId });
  }
}

async function renderMemberCard(user, xpProfile, customization, ranking = null) {
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const cacheKey = JSON.stringify([user.id, user.globalName, user.username, avatarUrl, xpProfile.level, xpProfile.xp, ranking, customization]);
  const cached = renderedCards.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.buffer;
  if (cached) renderedCards.delete(cacheKey);
  const canvas = createCanvas(1000, 360);
  const ctx = canvas.getContext('2d');
  const [accent, deep, pale] = ACCENTS[customization.accent] || ACCENTS.rose;
  const [backgroundStart, backgroundMiddle, backgroundEnd] = BACKGROUNDS[customization.background] || BACKGROUNDS.dusk;
  const gradient = ctx.createLinearGradient(0, 0, 1000, 360);
  gradient.addColorStop(0, backgroundStart);
  gradient.addColorStop(0.62, backgroundMiddle);
  gradient.addColorStop(1, backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.roundRect(0, 0, 1000, 360, 30); ctx.fill();
  const frame = FRAMES.includes(customization.frame) ? customization.frame : 'classic';
  ctx.strokeStyle = frame === 'royal' ? '#f3cc76' : accent; ctx.lineWidth = frame === 'neon' ? 5 : 2;
  ctx.globalAlpha = frame === 'classic' ? 0.62 : 0.95;
  ctx.beginPath(); ctx.roundRect(10, 10, 980, 340, 24); ctx.stroke(); ctx.globalAlpha = 1;
  if (frame === 'royal' || frame === 'rune') {
    ctx.strokeStyle = frame === 'royal' ? '#f3cc76' : accent; ctx.lineWidth = 3;
    for (const [x, y, dx, dy] of [[30, 30, 1, 1], [970, 30, -1, 1], [30, 330, 1, -1], [970, 330, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * 24); ctx.lineTo(x, y); ctx.lineTo(x + dx * 34, y); ctx.stroke();
      if (frame === 'rune') { ctx.beginPath(); ctx.moveTo(x + dx * 9, y + dy * 8); ctx.lineTo(x + dx * 17, y + dy * 16); ctx.lineTo(x + dx * 9, y + dy * 23); ctx.stroke(); }
    }
  } else if (frame === 'neon') {
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(20, 20, 960, 320, 18); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = accent; ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.arc(940, 45, 180, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;

  const avatar = await loadImage(avatarUrl);
  ctx.save(); ctx.beginPath(); ctx.arc(160, 165, 92, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 68, 73, 184, 184); ctx.restore();
  ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(160, 165, 98, 0, Math.PI * 2); ctx.stroke();

  const level = xpProfile.level;
  const needed = requiredXP(level);
  const progress = Math.max(0, Math.min(1, xpProfile.xp / needed));
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 38px Arial'; ctx.fillText(String(user.globalName || user.username).slice(0, 25), 300, 90);
  ctx.fillStyle = accent; ctx.font = 'bold 21px Arial'; ctx.fillText(String(customization.title || 'Membro do Eternity').slice(0, 35), 302, 128);
  ctx.fillStyle = pale; ctx.font = 'bold 26px Arial'; ctx.fillText('NÍVEL ' + level, 302, 183);
  ctx.fillStyle = '#ffffff'; ctx.font = '18px Arial'; ctx.fillText(xpProfile.xp.toLocaleString('pt-BR') + ' / ' + needed.toLocaleString('pt-BR') + ' XP', 302, 220);
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(302, 238, 600, 18, 9); ctx.fill();
  ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(302, 238, Math.max(16, 600 * progress), 18, 9); ctx.fill();
  const badges = Array.isArray(customization.badges) ? customization.badges.filter((badge) => BADGES.includes(badge)).slice(0, 4) : [];
  if (badges.length) {
    ctx.font = 'bold 20px Arial'; ctx.fillStyle = pale;
    badges.forEach((badge, index) => ctx.fillText(BADGE_MARKS[badge], 820 + index * 22, 127));
  }
  ctx.fillStyle = '#d7d2df'; ctx.font = '18px Arial';
  const bio = String(customization.bio || 'Ainda sem biografia. Mude isso em Personalizar perfil.').replace(/[\r\n]+/g, ' ');
  ctx.fillText(bio.slice(0, 68), 302, 295);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.75; ctx.font = '15px Arial';
  if (ranking) ctx.fillText('RANKING  #' + ranking, 302, 326);
  else ctx.fillText('ETERNITY REALMS  ·  PERFIL DE MEMBRO', 302, 326);
  ctx.globalAlpha = 1;
  const buffer = canvas.toBuffer('image/png');
  renderedCards.set(cacheKey, { buffer, expiresAt: Date.now() + CARD_CACHE_TTL_MS });
  while (renderedCards.size > CARD_CACHE_LIMIT) renderedCards.delete(renderedCards.keys().next().value);
  return buffer;
}

async function updateCustomization(guildId, userId, changes) {
  const allowed = {};
  if (changes.accent && Object.hasOwn(ACCENTS, changes.accent)) allowed.accent = changes.accent;
  if (changes.background && Object.hasOwn(BACKGROUNDS, changes.background)) allowed.background = changes.background;
  if (changes.frame && FRAMES.includes(changes.frame)) allowed.frame = changes.frame;
  if (Array.isArray(changes.badges)) allowed.badges = [...new Set(changes.badges.filter((badge) => BADGES.includes(badge)))].slice(0, 4);
  if (typeof changes.title === 'string') allowed.title = changes.title.trim().slice(0, 40);
  if (typeof changes.bio === 'string') allowed.bio = changes.bio.trim().slice(0, 160);
  if (!Object.keys(allowed).length) return getMemberProfile(guildId, userId);
  for (const [key, entry] of renderedCards) {
    if (key.includes('"' + userId + '"')) renderedCards.delete(key);
  }
  return MemberProfile.findOneAndUpdate({ guildId, userId }, { $set: allowed }, { upsert: true, returnDocument: 'after', runValidators: true });
}

async function getRank(guildId, profile) {
  const { UserXp } = require('../database');
  return UserXp.countDocuments({ guildId, $or: [
    { level: { $gt: profile.level } },
    { level: profile.level, xp: { $gt: profile.xp } },
  ] }).then((count) => count + 1);
}

module.exports = { ACCENTS, BACKGROUNDS, FRAMES, BADGES, getMemberProfile, updateCustomization, renderMemberCard, getRank, renderedCards };
