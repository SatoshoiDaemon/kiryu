const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { MemberProfile } = require('../database');
const { requiredXP } = require('./xp');
const { BADGES, BADGE_BY_ID, COSMETIC_BADGE_IDS, PROFILE_DEFAULTS, withProfileDefaults } = require('./profileCatalog');
const { getAssetOverride } = require('./components');

const renderedCards = new Map();
const CARD_CACHE_TTL_MS = 60_000;
const CARD_CACHE_LIMIT = 80;
const SOURCE_IMAGE_CACHE_TTL_MS = 60_000;
const SOURCE_IMAGE_CACHE_LIMIT = 36;
const sourceImages = new Map();
const ACCENTS = {
  rose: ['#f9a8d4', '#831843', '#fce7f3'], violet: ['#c4b5fd', '#4c1d95', '#ede9fe'],
  gold: ['#fcd34d', '#78350f', '#fef3c7'], emerald: ['#6ee7b7', '#064e3b', '#d1fae5'], ice: ['#7dd3fc', '#0c4a6e', '#e0f2fe'],
};
const BACKGROUNDS = {
  dusk: ['#11121c', '#28122d', '#3f1831'], crimson: ['#170d18', '#51142a', '#241022'],
  aurora: ['#091923', '#123b3d', '#17233d'], parchment: ['#201820', '#62452f', '#251626'],
};
const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;
const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

function toPlainProfile(profile) {
  return profile?.toObject ? profile.toObject() : (profile || {});
}

async function getMemberProfile(guildId, userId) {
  let profile = await MemberProfile.findOne({ guildId, userId });
  if (profile) return profile;
  try { return await MemberProfile.create({ guildId, userId }); }
  catch (error) {
    if (error?.code !== 11000) throw error;
    return MemberProfile.findOne({ guildId, userId });
  }
}

async function cachedSourceImage(key, loader) {
  const cached = sourceImages.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) sourceImages.delete(key);
  const entry = { expiresAt: Date.now() + SOURCE_IMAGE_CACHE_TTL_MS, promise: null };
  entry.promise = Promise.resolve().then(loader).then((image) => {
    entry.image = image;
    return image;
  }).catch((error) => {
    if (sourceImages.get(key) === entry) sourceImages.delete(key);
    throw error;
  });
  sourceImages.set(key, entry);
  while (sourceImages.size > SOURCE_IMAGE_CACHE_LIMIT) sourceImages.delete(sourceImages.keys().next().value);
  return entry.promise;
}

function customizationDefaults(profile) {
  const value = toPlainProfile(profile);
  const merged = withProfileDefaults(value);
  if (!value.colors || !Object.values(value.colors).some(Boolean)) {
    const [primary, secondary, highlight] = ACCENTS[value.accent] || ACCENTS.rose;
    const [background, backgroundMiddle, backgroundEnd] = BACKGROUNDS[value.background] || BACKGROUNDS.dusk;
    merged.colors = { primary, secondary, highlight, text: '#ffffff', xpBar: primary, frame: primary, background };
    merged.backgroundStops = [background, backgroundMiddle, backgroundEnd];
  }
  return merged;
}

function normalizeColor(value) {
  const normalized = String(value || '').trim();
  if (!HEX_COLOR.test(normalized)) throw new RangeError('Use uma cor HEX com seis dígitos, como #C0265A.');
  return '#' + normalized.replace(/^#/, '').toUpperCase();
}

function parseColorInput(value) {
  const input = String(value || '').trim();
  if (HEX_COLOR.test(input)) return normalizeColor(input);
  const rgb = input.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1|0(?:\.\d+)?))?\s*\)$/i)
    || input.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (!rgb) throw new RangeError('Use HEX (#C0265A) ou RGB (192, 38, 90).');
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) throw new RangeError('Cada canal RGB deve estar entre 0 e 255.');
  return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function validateBackgroundUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw new RangeError('Informe uma URL HTTPS válida para a imagem de fundo.'); }
  const host = url.hostname.toLowerCase();
  const localName = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal';
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const privateIpv4 = ipv4 && (Number(ipv4[1]) === 10 || Number(ipv4[1]) === 127 || Number(ipv4[1]) === 0
    || (Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254)
    || (Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168)
    || (Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31));
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || localName || privateIpv4 || host === '::1' || host.startsWith('[')) {
    throw new RangeError('A imagem de fundo deve usar HTTPS em um endereço público.');
  }
  return url.toString();
}

function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168))
      || (a === 198 && (b === 18 || b === 19 || b === 51))
      || (a === 203 && b === 0));
  }
  if (!net.isIPv6(address)) return false;
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return false;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return !mapped || isPublicAddress(mapped[1]);
}

async function loadBackgroundImage(value) {
  const url = validateBackgroundUrl(value);
  if (!url) return null;
  try {
    const address = (await dns.lookup(new URL(url).hostname, { all: true, verbatim: true })).find((entry) => isPublicAddress(entry.address));
    if (!address) return null;
    const bytes = await new Promise((resolve, reject) => {
      const request = https.get(url, {
        signal: AbortSignal.timeout(4000),
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      }, (response) => {
        if (response.statusCode !== 200 || !/^image\/(?:png|jpe?g|webp|gif|avif)$/i.test(response.headers['content-type'] || '')) {
          response.resume(); resolve(null); return;
        }
        if (Number(response.headers['content-length'] || 0) > MAX_BACKGROUND_BYTES) { response.destroy(); resolve(null); return; }
        const chunks = []; let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > MAX_BACKGROUND_BYTES) { response.destroy(); resolve(null); return; }
          chunks.push(chunk);
        });
        response.on('end', () => resolve(length ? Buffer.concat(chunks, length) : null));
        response.on('error', reject);
      });
      request.on('error', reject);
    });
    return bytes ? await loadImage(bytes) : null;
  } catch {
    return null;
  }
}

function rgba(hex, alpha = 1) {
  const color = normalizeColor(hex);
  const value = Number.parseInt(color.slice(1), 16);
  return 'rgba(' + (value >> 16) + ',' + ((value >> 8) & 255) + ',' + (value & 255) + ',' + Math.max(0, Math.min(1, alpha)) + ')';
}

function cropImage(ctx, image, x, y, width, height, alpha = 1) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0; let sy = 0; let sw = image.width; let sh = image.height;
  if (sourceRatio > targetRatio) { sw = image.height * targetRatio; sx = (image.width - sw) / 2; }
  else { sh = image.width / targetRatio; sy = (image.height - sh) / 2; }
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height); ctx.restore();
}

function clipAvatar(ctx, x, y, size, style) {
  ctx.beginPath();
  if (style === 'circle') ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  else if (style === 'diamond') { ctx.moveTo(x + size / 2, y); ctx.lineTo(x + size, y + size / 2); ctx.lineTo(x + size / 2, y + size); ctx.lineTo(x, y + size / 2); ctx.closePath(); }
  else if (style === 'hex') {
    const points = [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]];
    points.forEach(([dx, dy], index) => index ? ctx.lineTo(x + size * dx, y + size * dy) : ctx.moveTo(x + size * dx, y + size * dy)); ctx.closePath();
  } else if (style === 'rounded') ctx.roundRect(x, y, size, size, size * .22);
  else ctx.rect(x, y, size, size);
  ctx.clip();
}

function drawAvatar(ctx, avatar, x, y, size, style, color) {
  ctx.save(); clipAvatar(ctx, x, y, size, style); ctx.drawImage(avatar, x, y, size, size); ctx.restore();
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(4, size * .035); ctx.beginPath();
  if (style === 'circle') ctx.arc(x + size / 2, y + size / 2, size / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
  else if (style === 'diamond') { ctx.moveTo(x + size / 2, y + 2); ctx.lineTo(x + size - 2, y + size / 2); ctx.lineTo(x + size / 2, y + size - 2); ctx.lineTo(x + 2, y + size / 2); ctx.closePath(); }
  else if (style === 'hex') { [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]].forEach(([dx, dy], index) => index ? ctx.lineTo(x + size * dx, y + size * dy) : ctx.moveTo(x + size * dx, y + size * dy)); ctx.closePath(); }
  else if (style === 'rounded') ctx.roundRect(x + 2, y + 2, size - 4, size - 4, size * .22);
  else ctx.rect(x + 2, y + 2, size - 4, size - 4);
  ctx.stroke(); ctx.restore();
}

function drawFrame(ctx, width, height, frame, color, highlight) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = frame === 'minimal' ? 2 : frame === 'neon' ? 5 : 3;
  ctx.globalAlpha = frame === 'classic' || frame === 'minimal' ? .68 : 1;
  ctx.beginPath(); ctx.roundRect(12, 12, width - 24, height - 24, frame === 'folio' ? 8 : 26); ctx.stroke();
  if (['royal', 'gilded', 'ornate'].includes(frame)) {
    ctx.strokeStyle = highlight; ctx.lineWidth = frame === 'ornate' ? 2 : 1.5; ctx.globalAlpha = .88;
    ctx.beginPath(); ctx.roundRect(21, 21, width - 42, height - 42, 20); ctx.stroke();
    for (const [x, y] of [[32, 32], [width - 32, 32], [32, height - 32], [width - 32, height - 32]]) {
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = highlight; ctx.fill();
    }
    if (frame === 'royal') {
      ctx.fillStyle = highlight; ctx.globalAlpha = .9; ctx.font = '26px Arial'; ctx.textAlign = 'center'; ctx.fillText('♛', width / 2, 35); ctx.textAlign = 'start';
    }
  } else if (frame === 'rune' || frame === 'thorn') {
    ctx.globalAlpha = .85; ctx.lineWidth = 3;
    for (const [x, y, dx, dy] of [[28, 28, 1, 1], [width - 28, 28, -1, 1], [28, height - 28, 1, -1], [width - 28, height - 28, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * 34); ctx.lineTo(x, y); ctx.lineTo(x + dx * 42, y); ctx.stroke();
      if (frame === 'rune') { ctx.beginPath(); ctx.moveTo(x + dx * 8, y + dy * 8); ctx.lineTo(x + dx * 19, y + dy * 18); ctx.lineTo(x + dx * 8, y + dy * 29); ctx.stroke(); }
      if (frame === 'thorn') { ctx.beginPath(); ctx.moveTo(x + dx * 5, y + dy * 19); ctx.lineTo(x + dx * 16, y + dy * 14); ctx.lineTo(x + dx * 20, y + dy * 25); ctx.stroke(); }
    }
  } else if (frame === 'neon') {
    ctx.globalAlpha = .35; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(23, 23, width - 46, height - 46, 18); ctx.stroke();
  }
  ctx.restore();
}

function drawBadgeShape(ctx, x, y, size, shape) {
  const radius = size / 2 - 3;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, radius, 0, Math.PI * 2);
  else if (shape === 'diamond' || shape === 'gem') { ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y - radius * .25); ctx.lineTo(x + radius * .65, y + radius); ctx.lineTo(x - radius * .65, y + radius); ctx.lineTo(x - radius, y - radius * .25); ctx.closePath(); }
  else if (shape === 'shield' || shape === 'seal' || shape === 'ribbon') { ctx.moveTo(x - radius * .75, y - radius); ctx.lineTo(x + radius * .75, y - radius); ctx.lineTo(x + radius * .72, y + radius * .25); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius * .72, y + radius * .25); ctx.closePath(); }
  else if (shape === 'star') { for (let point = 0; point < 10; point += 1) { const angle = -Math.PI / 2 + point * Math.PI / 5; const r = point % 2 ? radius * .55 : radius; point ? ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r) : ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r); } ctx.closePath(); }
  else if (shape === 'pentagon' || shape === 'crown') { const sides = shape === 'pentagon' ? 5 : 6; for (let point = 0; point < sides; point += 1) { const angle = -Math.PI / 2 + point * Math.PI * 2 / sides; point ? ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius) : ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); } ctx.closePath(); }
  else { for (let point = 0; point < 6; point += 1) { const angle = Math.PI / 3 * point; point ? ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius) : ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius); } ctx.closePath(); }
}

function drawBadges(ctx, badges, specialBadges, x, y, size, primary, highlight, textColor, columns = 7, badgeImages = new Map()) {
  const entries = [
    ...badges.map((id) => ({ ...(BADGE_BY_ID.get(id) || {}), imageKey: id })).filter((badge) => badge.id),
    ...(specialBadges || []).map((badge) => ({ ...badge, shape: 'seal', imageKey: 'special:' + String(badge._id || badge.name) })),
  ].slice(0, 7);
  entries.forEach((badge, index) => {
    const centerX = x + (index % columns) * (size + 10) + size / 2;
    const centerY = y + Math.floor(index / columns) * (size + 10) + size / 2;
    ctx.save(); drawBadgeShape(ctx, centerX, centerY, size, badge.shape || 'seal');
    ctx.fillStyle = rgba(primary, .22); ctx.fill();
    const image = badgeImages.get(badge.imageKey);
    if (image) {
      ctx.save(); drawBadgeShape(ctx, centerX, centerY, size, badge.shape || 'seal'); ctx.clip();
      ctx.drawImage(image, centerX - size / 2, centerY - size / 2, size, size); ctx.restore();
    } else {
      ctx.fillStyle = textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = Math.round(size * .49) + 'px Arial';
      ctx.fillText(String(badge.symbol || '✦').slice(0, 2), centerX, centerY + 1, size * .84);
    }
    drawBadgeShape(ctx, centerX, centerY, size, badge.shape || 'seal'); ctx.lineWidth = 2.5; ctx.strokeStyle = highlight; ctx.stroke();
    ctx.restore();
  });
}

function drawXpBar(ctx, x, y, width, height, progress, style, color, backgroundColor, opacity) {
  ctx.save();
  const fillWidth = Math.max(height * .75, width * progress);
  if (style === 'orb') {
    const radius = height * 2.1;
    ctx.lineWidth = Math.max(8, height * .32); ctx.strokeStyle = rgba(backgroundColor, opacity); ctx.beginPath(); ctx.arc(x + radius, y + height / 2, radius, Math.PI * .75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x + radius, y + height / 2, radius, Math.PI * .75, Math.PI * .75 + Math.PI * 1.5 * progress); ctx.stroke();
    ctx.restore(); return;
  }
  const radius = style === 'square' ? 0 : style === 'rounded' ? height / 2 : Math.min(height * .22, 5);
  ctx.fillStyle = rgba(backgroundColor, opacity); ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  if (style === 'segmented') {
    const segments = 12; const gap = 5; const segmentWidth = (width - (segments - 1) * gap) / segments;
    for (let index = 0; index < segments; index += 1) {
      if (progress <= index / segments) break;
      const amount = Math.min(1, progress * segments - index);
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x + index * (segmentWidth + gap), y, segmentWidth * amount, height, Math.min(radius, segmentWidth / 3)); ctx.fill();
    }
  } else {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, fillWidth, height, radius); ctx.fill();
    if (style === 'minimal') { ctx.strokeStyle = rgba(color, .5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + height + 4); ctx.lineTo(x + width, y + height + 4); ctx.stroke(); }
  }
  ctx.restore();
}

function drawBackground(ctx, image, width, height, colors, gradient, overlayOpacity, legacyStops = null) {
  const fill = gradient ? ctx.createLinearGradient(0, 0, width, height) : null;
  if (fill && legacyStops?.length === 3) { fill.addColorStop(0, legacyStops[0]); fill.addColorStop(.55, legacyStops[1]); fill.addColorStop(1, legacyStops[2]); }
  else if (fill) { fill.addColorStop(0, colors.background); fill.addColorStop(.55, colors.secondary); fill.addColorStop(1, colors.primary); }
  ctx.fillStyle = fill || colors.background;
  ctx.beginPath(); ctx.roundRect(0, 0, width, height, 28); ctx.fill();
  if (image) { ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, width, height, 28); ctx.clip(); cropImage(ctx, image, 0, 0, width, height, .44); ctx.restore(); }
  ctx.save(); ctx.fillStyle = rgba(colors.background, Math.max(.12, Math.min(.58, overlayOpacity))); ctx.beginPath(); ctx.roundRect(0, 0, width, height, 28); ctx.fill(); ctx.restore();
}

function drawCardContents(ctx, user, xpProfile, customization, rank, badges, specialBadges, colors, width, height, badgeImages = new Map()) {
  const level = xpProfile.level;
  const needed = requiredXP(level);
  const progress = Math.max(0, Math.min(1, xpProfile.xp / needed));
  const name = String(user.globalName || user.username || 'Membro').slice(0, 28);
  const title = String(customization.title || 'Membro do Eternity').slice(0, 40);
  const bio = String(customization.bio || 'Ainda sem biografia. Personalize seu perfil para contar um pouco mais sobre você.').replace(/[\r\n]+/g, ' ').slice(0, 96);
  const visibility = customization.visibility || PROFILE_DEFAULTS.visibility;
  const textColor = colors.text;
  const secondaryText = colors.highlight;
  const progressText = xpProfile.xp.toLocaleString('pt-BR') + ' / ' + needed.toLocaleString('pt-BR') + ' XP';
  const rankText = rank ? 'RANKING  #' + rank : 'ETERNITY REALMS';
  const bar = (x, y, w) => drawXpBar(ctx, x, y, w, 20, progress, customization.xpBarStyle || 'rounded', colors.xpBar, colors.text, .13);
  const nameAt = (x, y, size, align = 'left', maxWidth = width * .62) => { ctx.fillStyle = textColor; ctx.font = 'bold ' + size + 'px Arial'; ctx.textAlign = align; ctx.fillText(name, x, y, maxWidth); ctx.textAlign = 'left'; };
  const titleAt = (x, y, align = 'left', maxWidth = width * .56) => { if (visibility.title) { ctx.fillStyle = colors.primary; ctx.font = 'bold 21px Arial'; ctx.textAlign = align; ctx.fillText(title, x, y, maxWidth); ctx.textAlign = 'left'; } };
  const badge = (x, y, size, columns = 7) => { if (visibility.badges) drawBadges(ctx, badges, specialBadges, x, y, size, colors.primary, colors.highlight, textColor, columns, badgeImages); };
  const levelAt = (x, y, size = 27, align = 'left') => { if (visibility.level) { ctx.fillStyle = secondaryText; ctx.font = 'bold ' + size + 'px Arial'; ctx.textAlign = align; ctx.fillText('NÍVEL ' + level.toLocaleString('pt-BR'), x, y); ctx.textAlign = 'left'; } };
  const xpAt = (x, y, align = 'left') => { if (visibility.xp) { ctx.fillStyle = textColor; ctx.font = '18px Arial'; ctx.textAlign = align; ctx.fillText(progressText, x, y); ctx.textAlign = 'left'; } };
  const rankAt = (x, y, align = 'left') => { if (visibility.rank) { ctx.fillStyle = rgba(textColor, .72); ctx.font = '14px Arial'; ctx.textAlign = align; ctx.fillText(rankText, x, y); ctx.textAlign = 'left'; } };
  const bioAt = (x, y, align = 'left') => { if (visibility.bio) { ctx.fillStyle = rgba(textColor, .82); ctx.font = '17px Arial'; ctx.textAlign = align; ctx.fillText(bio, x, y, width * .8); ctx.textAlign = 'left'; } };

  if (customization.layout === 'portrait') {
    const avatarSize = 238; drawAvatar(ctx, user.avatar, (width - avatarSize) / 2, 68, avatarSize, customization.avatarStyle, colors.frame);
    nameAt(width / 2, 365, 34, 'center'); titleAt(width / 2, 402, 'center'); levelAt(width / 2, 466, 30, 'center');
    xpAt(width / 2, 512, 'center'); bar(width * .12, 535, width * .76); bioAt(width / 2, 615, 'center');
    badge(width * .13, 675, 58); rankAt(width / 2, height - 55, 'center');
  } else if (customization.layout === 'wide') {
    const avatarSize = 240; drawAvatar(ctx, user.avatar, 70, (height - avatarSize) / 2, avatarSize, customization.avatarStyle, colors.frame);
    nameAt(360, 112, 36, 'left', 420); titleAt(362, 151, 'left', 420); levelAt(362, 209, 29); xpAt(362, 242); bar(362, 261, width - 470); badge(810, 65, 48, 4); bioAt(362, 320); rankAt(362, height - 38);
  } else if (customization.layout === 'folio') {
    const panelAlpha = Number(customization.elementOpacity ?? 24) / 100;
    ctx.fillStyle = rgba(colors.secondary, Math.max(.14, Math.min(.44, panelAlpha))); ctx.beginPath(); ctx.roundRect(width * .37, 35, width * .58, height - 70, 12); ctx.fill();
    const avatarSize = 230; drawAvatar(ctx, user.avatar, 85, (height - avatarSize) / 2, avatarSize, customization.avatarStyle, colors.frame);
    nameAt(width * .43, 110, 32); titleAt(width * .435, 147); levelAt(width * .435, 210, 26); xpAt(width * .435, 241); bar(width * .435, 259, width * .47); badge(width * .435, 295, 54); bioAt(width * .435, height - 64); rankAt(91, height - 40);
  } else if (customization.layout === 'orbital') {
    const avatarSize = 204; drawAvatar(ctx, user.avatar, 62, (height - avatarSize) / 2, avatarSize, customization.avatarStyle, colors.frame);
    nameAt(310, 100, 36); titleAt(312, 138); levelAt(312, 195, 27); xpAt(312, 226); bar(312, 245, width - 378); badge(312, 279, 54); bioAt(312, 360); rankAt(312, height - 36);
    ctx.save(); ctx.globalAlpha = .38; ctx.strokeStyle = colors.highlight; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(width - 92, height / 2, 51, 152, -.28, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = colors.highlight; ctx.beginPath(); ctx.arc(width - 92, 68, 9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(width - 111, height - 70, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  } else {
    const avatarSize = 184; drawAvatar(ctx, user.avatar, 70, (height - avatarSize) / 2 - 16, avatarSize, customization.avatarStyle, colors.frame);
    nameAt(300, 92, 36, 'left', 440); titleAt(302, 128, 'left', 430); levelAt(302, 185); xpAt(302, 220); bar(302, 239, Math.min(600, width - 355)); badge(width - 226, 66, 42, 4); bioAt(302, 304); rankAt(302, height - 34);
  }
}

async function renderMemberCard(user, xpProfile, profile, ranking = null, options = {}) {
  const customization = customizationDefaults(profile);
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
  const layout = ['classic', 'wide', 'portrait', 'folio', 'orbital'].includes(customization.layout) ? customization.layout : 'classic';
  const dimensions = { classic: [1000, 360], wide: [1200, 420], portrait: [800, 900], folio: [1000, 470], orbital: [1000, 430] }[layout];
  const [width, height] = dimensions;
  const specialBadges = Array.isArray(options.specialBadges) ? options.specialBadges : [];
  const selectedBadges = customization.badges.filter((id) => COSMETIC_BADGE_IDS.includes(id)).slice(0, 6);
  const badgeImageUrls = [
    ...selectedBadges.map((id) => [id, getAssetOverride('cosmetic-' + id)]),
    ...specialBadges.map((badge) => ['special:' + String(badge._id || badge.name), badge.assetUrl || '']),
  ].filter(([, url]) => /^https:\/\//i.test(url || ''));
  const frameImageUrl = getAssetOverride('frame-' + customization.frame);
  let backgroundFingerprint = '';
  if (options.backgroundImage) backgroundFingerprint = crypto.createHash('sha1').update(Buffer.isBuffer(options.backgroundImage) ? options.backgroundImage : String(options.backgroundImage)).digest('hex');
  const cacheKey = JSON.stringify([user.id, user.globalName, user.username, avatarUrl, xpProfile.level, xpProfile.xp, ranking, customization, specialBadges, badgeImageUrls.map(([, url]) => url), frameImageUrl, backgroundFingerprint]);
  const cached = renderedCards.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.buffer;
  if (cached) renderedCards.delete(cacheKey);
  const [accent, deep, pale] = ACCENTS[customization.accent] || ACCENTS.rose;
  const [backgroundStart, backgroundMiddle, backgroundEnd] = customization.backgroundStops || BACKGROUNDS[customization.background] || BACKGROUNDS.dusk;
  const colors = { ...PROFILE_DEFAULTS.colors, primary: accent, secondary: deep, highlight: pale, xpBar: accent, frame: accent, background: backgroundStart, ...(customization.colors || {}) };
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const background = options.backgroundImage
    ? await loadImage(options.backgroundImage)
    : customization.backgroundImageUrl
      ? await cachedSourceImage('background:' + customization.backgroundImageUrl, () => loadBackgroundImage(customization.backgroundImageUrl))
      : null;
  drawBackground(ctx, background, width, height, colors, customization.gradient !== false, Number(customization.elementOpacity ?? 24) / 100 * .46, customization.backgroundStops);
  drawFrame(ctx, width, height, customization.frame, colors.frame, colors.highlight);
  ctx.fillStyle = rgba(colors.primary, .12); ctx.beginPath(); ctx.arc(width - 54, 38, Math.min(width, height) * .32, 0, Math.PI * 2); ctx.fill();
  const avatar = await cachedSourceImage('avatar:' + avatarUrl, () => loadImage(avatarUrl));
  const badgeImages = new Map();
  await Promise.all(badgeImageUrls.map(async ([key, url]) => {
    try { badgeImages.set(key, await cachedSourceImage('badge:' + url, () => loadImage(url))); }
    catch { /* Missing custom art falls back to the existing badge symbol. */ }
  }));
  drawCardContents(ctx, { ...user, avatar }, xpProfile, customization, ranking, selectedBadges, specialBadges, colors, width, height, badgeImages);
  if (frameImageUrl) {
    try {
      const frameImage = await cachedSourceImage('frame:' + frameImageUrl, () => loadImage(frameImageUrl));
      ctx.drawImage(frameImage, 0, 0, width, height);
    } catch { /* Procedural frame styling remains available if Blob is unavailable. */ }
  }
  const buffer = canvas.toBuffer('image/png');
  renderedCards.set(cacheKey, { buffer, expiresAt: Date.now() + CARD_CACHE_TTL_MS });
  while (renderedCards.size > CARD_CACHE_LIMIT) renderedCards.delete(renderedCards.keys().next().value);
  return buffer;
}

function clearRenderedCardsForUser(userId) {
  for (const key of renderedCards.keys()) {
    try { if (JSON.parse(key)[0] === userId) renderedCards.delete(key); } catch { renderedCards.delete(key); }
  }
}

async function updateCustomization(guildId, userId, changes) {
  const allowed = {};
  const plain = toPlainProfile(changes);
  if (plain.accent && Object.hasOwn(ACCENTS, plain.accent)) allowed.accent = plain.accent;
  if (plain.background && Object.hasOwn(BACKGROUNDS, plain.background)) allowed.background = plain.background;
  if (plain.frame && ['classic', 'royal', 'neon', 'rune', 'ornate', 'minimal', 'gilded', 'thorn'].includes(plain.frame)) allowed.frame = plain.frame;
  if (Array.isArray(plain.badges)) allowed.badges = [...new Set(plain.badges.filter((badge) => COSMETIC_BADGE_IDS.includes(badge)))].slice(0, 6);
  if (typeof plain.title === 'string') allowed.title = plain.title.trim().slice(0, 40);
  if (typeof plain.bio === 'string') allowed.bio = plain.bio.trim().slice(0, 160);
  if (plain.colors && typeof plain.colors === 'object') {
    for (const key of ['primary', 'secondary', 'highlight', 'text', 'xpBar', 'frame', 'background']) if (plain.colors[key] != null) allowed['colors.' + key] = normalizeColor(plain.colors[key]);
  }
  if (typeof plain.gradient === 'boolean') allowed.gradient = plain.gradient;
  if (Number.isFinite(plain.elementOpacity)) allowed.elementOpacity = Math.max(0, Math.min(100, Math.round(plain.elementOpacity)));
  if (typeof plain.backgroundImageUrl === 'string') allowed.backgroundImageUrl = validateBackgroundUrl(plain.backgroundImageUrl).slice(0, 500);
  if (typeof plain.backgroundBlobId === 'string') allowed.backgroundBlobId = plain.backgroundBlobId.slice(0, 300);
  if (['classic', 'wide', 'portrait', 'folio', 'orbital'].includes(plain.layout)) allowed.layout = plain.layout;
  if (['rounded', 'segmented', 'orb', 'minimal', 'square'].includes(plain.xpBarStyle)) allowed.xpBarStyle = plain.xpBarStyle;
  if (['circle', 'rounded', 'square', 'diamond', 'hex'].includes(plain.avatarStyle)) allowed.avatarStyle = plain.avatarStyle;
  if (plain.visibility && typeof plain.visibility === 'object') {
    for (const key of ['level', 'xp', 'rank', 'title', 'bio', 'badges']) if (typeof plain.visibility[key] === 'boolean') allowed['visibility.' + key] = plain.visibility[key];
  }
  if (!Object.keys(allowed).length) return getMemberProfile(guildId, userId);
  clearRenderedCardsForUser(userId);
  return MemberProfile.findOneAndUpdate({ guildId, userId }, { $set: allowed }, { upsert: true, returnDocument: 'after', runValidators: true });
}

async function getRank(guildId, profile) {
  const { UserXp } = require('../database');
  return UserXp.countDocuments({ guildId, $or: [
    { level: { $gt: profile.level } },
    { level: profile.level, xp: { $gt: profile.xp } },
  ] }).then((count) => count + 1);
}

async function resetCustomization(guildId, userId) {
  clearRenderedCardsForUser(userId);
  const defaults = { ...PROFILE_DEFAULTS, colors: { ...PROFILE_DEFAULTS.colors }, visibility: { ...PROFILE_DEFAULTS.visibility }, badges: [] };
  delete defaults.specialBadges;
  const profile = await MemberProfile.findOneAndUpdate({ guildId, userId }, { $set: defaults }, { upsert: true, returnDocument: 'after', runValidators: true });
  return profile;
}

module.exports = {
  ACCENTS, BACKGROUNDS, BADGES, BADGE_BY_ID, COSMETIC_BADGE_IDS, PROFILE_DEFAULTS,
  getMemberProfile, customizationDefaults, normalizeColor, parseColorInput, validateBackgroundUrl,
  updateCustomization, resetCustomization, renderMemberCard, getRank, renderedCards, sourceImages, clearRenderedCardsForUser,
};
