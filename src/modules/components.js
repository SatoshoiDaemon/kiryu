const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const config = require('../config');
const assetOverrides = new Map();

const SYSTEM_ASSET_NAMES = new Set(['crest', 'xp', 'fragments', 'orbs', 'store', 'casino', 'profile', 'admin', 'orb-red', 'orb-orange', 'orb-green', 'orb-gold', 'orb-blue', 'orb-black', 'divider']);

function setAssetOverrides(objects = []) {
  assetOverrides.clear();
  for (const object of objects) {
    if (object.deletedAt || !object.url) continue;
    const name = String(object.name || '').trim().toLowerCase();
    if ((object.category === 'design-system' && SYSTEM_ASSET_NAMES.has(name))
      || (name === 'casino' && object.category === 'casino') || (name === 'profile' && object.category === 'profile')
      || (object.category === 'frame' && /^frame-(classic|royal|neon|rune|ornate|minimal|gilded|thorn)$/.test(name))
      || (object.category === 'cosmetic' && /^cosmetic-[a-z0-9-]{1,40}$/.test(name))) assetOverrides.set(name, object.url);
  }
}

const SYSTEMS = {
  brand: { key: 'crest', eyebrow: 'ETERNITY REALMS · KIRYU' },
  xp: { key: 'xp', eyebrow: 'ETERNITY REALMS · PROGRESSÃO' },
  fragments: { key: 'fragments', eyebrow: 'COFRE DA COMUNIDADE · FRAGMENTOS' },
  orbs: { key: 'orbs', eyebrow: 'RELIQUIÁRIO · ORBES' },
  store: { key: 'store', eyebrow: 'BAZAR DO ETERNITY' },
  casino: { key: 'casino', eyebrow: 'SALÃO DA FORTUNA · JOGOS' },
  profile: { key: 'profile', eyebrow: 'CRÔNICAS DE MEMBRO' },
  admin: { key: 'admin', eyebrow: 'BASTIDORES · ADMINISTRAÇÃO' },
};

function systemForColor(color) {
  return Object.entries(SYSTEMS).find(([name]) => config.visual[name] === color)?.[0] || 'brand';
}

function systemAsset(name) {
  const system = SYSTEMS[name] || SYSTEMS.brand;
  const key = name.startsWith('orb-') ? name : system.key;
  if (assetOverrides.has(key)) return assetOverrides.get(key);
  const baseUrl = config.visual.assetBaseUrl || 'https://raw.githubusercontent.com/SatoshoiDaemon/kiryu/main/assets';
  return baseUrl + '/systems/' + key + '.png';
}

function getAssetOverride(name) { return assetOverrides.get(String(name || '').toLowerCase()) || null; }

function headerSection(title, subtitle = '', system = 'brand') {
  const systemName = typeof system === 'string' ? system : (Object.keys(SYSTEMS).find((key) => SYSTEMS[key] === system) || 'brand');
  const meta = SYSTEMS[systemName] || SYSTEMS.brand;
  const text = ['-# ' + meta.eyebrow, '# ' + title, subtitle].filter(Boolean).join('\n');
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(systemAsset(systemName)).setDescription('Selo Kiryu · ' + title));
}

function resourceSection(label, amount, symbol, system = 'fragments', note = '') {
  const content = ['## ' + symbol + ' ' + label, '**' + amount + '**', note].filter(Boolean).join('\n');
  return new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(systemAsset(system)).setDescription(label));
}

function splitHeader(content) {
  const lines = String(content || '').split('\n');
  const headingIndex = lines.findIndex((line) => /^#{1,3}\s+/.test(line));
  if (headingIndex < 0) return { body: String(content || '') };
  const title = lines[headingIndex].replace(/^#{1,3}\s+/, '');
  const bodyLines = lines.slice(headingIndex + 1);
  const subtitleIndex = bodyLines.findIndex((line) => line.trim());
  let subtitle = '';
  if (subtitleIndex >= 0 && !/^#{1,3}\s+/.test(bodyLines[subtitleIndex]) && !/^[-•*]\s/.test(bodyLines[subtitleIndex])) {
    subtitle = bodyLines[subtitleIndex].slice(0, 220);
    bodyLines.splice(subtitleIndex, 1);
  }
  const body = bodyLines.join('\n').trim();
  return { title, subtitle, body };
}

function footerText(now = Date.now()) {
  return '-# <t:' + Math.floor(now / 1000) + ':R> · **Developer by Krieg.js**';
}

function decorateContainer(container, { divider = true, now = Date.now() } = {}) {
  const dividerUrl = assetOverrides.get('divider') || config.visual.dividerUrl;
  if (divider && dividerUrl) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(dividerUrl).setDescription('Divisória da Kiryu'),
    ));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText(now)));
  return container;
}

function createContainer(content, rows = [], accentColor = config.visual.brand, options = {}) {
  const container = new ContainerBuilder().setAccentColor(accentColor);
  const split = options.header === false ? { body: content } : splitHeader(content);
  if (split.title) container.addSectionComponents(headerSection(split.title, split.subtitle, systemForColor(accentColor)));
  if (split.body) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(split.body));
  if (options.sections) for (const section of options.sections) container.addSectionComponents(section);
  for (const row of rows) container.addActionRowComponents(row);
  return decorateContainer(container, { divider: options.divider !== false, now: options.now });
}

async function replyV2(interaction, content, options = {}) {
  const container = createContainer(content, options.rows || [], options.accentColor, { sections: options.sections });
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }
  return interaction.reply({
    components: [container],
    flags: options.ephemeral === true ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral : MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

async function replyMessageV2(message, content) {
  return message.reply({
    components: [createContainer(content)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false, parse: [] },
  });
}

async function followUpV2(interaction, content, options = {}) {
  return interaction.followUp({
    components: [createContainer(content, options.rows || [], options.accentColor || config.visual.error)],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [], ...(options.allowedMentions || {}) },
  });
}

module.exports = { SYSTEMS, systemAsset, getAssetOverride, systemForColor, headerSection, resourceSection, createContainer, decorateContainer, footerText, replyV2, replyMessageV2, followUpV2, setAssetOverrides };
