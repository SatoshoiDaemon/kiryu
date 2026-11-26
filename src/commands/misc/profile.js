const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, ModalBuilder,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { SlashCommandBuilder } = require('discord.js');
const { getProfile } = require('../../modules/xpService');
const { getMemberProfile, renderMemberCard, getRank, customizationDefaults, updateCustomization, parseColorInput } = require('../../modules/memberProfiles');
const { BADGE_CATEGORIES, BADGES, PROFILE_DEFAULTS, withProfileDefaults } = require('../../modules/profileCatalog');
const { BadgeDefinition } = require('../../database');
const { decorateContainer, headerSection, replyV2 } = require('../../modules/components');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('profile').setDescription('Veja seu cartão ou o perfil de outra pessoa.')
  .addUserOption((option) => option.setName('member').setDescription('Perfil para visitar').setRequired(false));

const EDIT_SECTIONS = [
  ['colors', 'Cores'], ['background', 'Fundo'], ['layout', 'Layout'], ['frame', 'Moldura'],
  ['avatar', 'Avatar'], ['xp', 'Barra de XP'], ['details', 'Título e biografia'],
  ['badges', 'Badges'], ['visibility', 'Visibilidade'],
];
const COLOR_FIELDS = [
  ['primary', 'Primária'], ['secondary', 'Secundária'], ['highlight', 'Destaque'], ['text', 'Textos'],
  ['xpBar', 'Barra de XP'], ['frame', 'Moldura'], ['background', 'Fundo'],
];
const COLOR_PRESETS = [
  ['rose', 'Rosa Kiryu', { primary: '#F9A8D4', secondary: '#831843', highlight: '#FCE7F3', text: '#FFFFFF', xpBar: '#F9A8D4', frame: '#F9A8D4', background: '#11121C' }],
  ['violet', 'Violeta', { primary: '#C4B5FD', secondary: '#4C1D95', highlight: '#EDE9FE', text: '#FFFFFF', xpBar: '#A78BFA', frame: '#C4B5FD', background: '#17112C' }],
  ['gold', 'Dourado', { primary: '#FCD34D', secondary: '#78350F', highlight: '#FEF3C7', text: '#FFFDF2', xpBar: '#FBBF24', frame: '#FCD34D', background: '#20170C' }],
  ['emerald', 'Esmeralda', { primary: '#6EE7B7', secondary: '#064E3B', highlight: '#D1FAE5', text: '#F0FFF8', xpBar: '#34D399', frame: '#6EE7B7', background: '#091D19' }],
  ['ice', 'Gelo', { primary: '#7DD3FC', secondary: '#0C4A6E', highlight: '#E0F2FE', text: '#F4FBFF', xpBar: '#38BDF8', frame: '#7DD3FC', background: '#091923' }],
];
const EDIT_SESSIONS = new Map();

async function fetchSpecialBadges(profile, guildId) {
  const ids = profile?.specialBadges || [];
  if (!ids.length || !BadgeDefinition?.find) return [];
  try { return await BadgeDefinition.find({ guildId, _id: { $in: ids } }).lean(); }
  catch { return []; }
}

async function makePayload(user, guildId, ownerId, editable = false, section = 'colors', customizationOverride = null, renderContext = {}) {
  const [xp, storedProfile] = renderContext.xp && renderContext.profile
    ? [renderContext.xp, renderContext.profile]
    : await Promise.all([getProfile(guildId, user.id), getMemberProfile(guildId, user.id)]);
  const customization = withProfileDefaults(customizationOverride || customizationDefaults(storedProfile));
  const rank = customization.visibility?.rank === false ? null : (renderContext.rank ?? await getRank(guildId, xp));
  const specialBadges = renderContext.specialBadges || await fetchSpecialBadges(storedProfile, guildId);
  const cardCustomization = { ...customization };
  delete cardCustomization.badgeCategory; delete cardCustomization.selectedBadge; delete cardCustomization.selectedColor;
  const image = await renderMemberCard(user, xp, cardCustomization, rank, { specialBadges });
  const files = [new AttachmentBuilder(image, { name: 'perfil-kiryu.png' })];
  const card = new ContainerBuilder().setAccentColor(config.visual.profile)
    .addSectionComponents(headerSection((user.globalName || user.username) + ' · Perfil', 'Uma pequena vitrine da sua presença no Eternity.', 'profile'))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://perfil-kiryu.png').setDescription('Cartão personalizado de ' + user.username)));
  if (editable) {
    card.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# PRÉ-VISUALIZAÇÃO · as escolhas ficam em rascunho até você aplicar'));
    for (const row of editorRows(section, customization, renderContext.sessionToken || ownerId)) card.addActionRowComponents(row);
  }
  decorateContainer(card);
  return { components: [card], files, attachments: [], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function select(customId, placeholder, options, { min = 1, max = 1 } = {}) {
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options);
  if (min !== 1 || max !== 1) menu.setMinValues(min).setMaxValues(max);
  return new ActionRowBuilder().addComponents(menu);
}

function button(customId, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style).setDisabled(disabled);
}

function row(...components) { return new ActionRowBuilder().addComponents(components); }

function sectionMenu(token, section) {
  return select(editorId(token, 'section'), 'Categoria de personalização', EDIT_SECTIONS.map(([value, label]) => ({ label, value, default: value === section })));
}

function editorId(token, action) { return 'profile-edit:' + token + ':' + action; }

function editorRows(section, customization, token) {
  const rows = [sectionMenu(token, section)];
  if (section === 'colors') {
    rows.push(select(editorId(token, 'color-field'), 'Escolher parte do cartão', COLOR_FIELDS.map(([value, label]) => ({ label, value, description: customization.colors[value], default: value === (customization.selectedColor || 'primary') }))));
    rows.push(select(editorId(token, 'color-preset'), 'Preset opcional · escolha livre continua disponível', COLOR_PRESETS.map(([value, label]) => ({ label, value }))));
    rows.push(row(button(editorId(token, 'color-edit'), 'Editar HEX ou RGB', ButtonStyle.Primary), button(editorId(token, 'gradient-toggle'), customization.gradient === false ? 'Ativar gradiente' : 'Desativar gradiente'), button(editorId(token, 'opacity-edit'), 'Transparência')));
  } else if (section === 'background') {
    rows.push(select(editorId(token, 'background-preset'), 'Fundo predefinido', [
      { label: 'Crepúsculo', value: 'dusk', default: customization.background === 'dusk' },
      { label: 'Carmesim', value: 'crimson', default: customization.background === 'crimson' },
      { label: 'Aurora', value: 'aurora', default: customization.background === 'aurora' },
      { label: 'Pergaminho', value: 'parchment', default: customization.background === 'parchment' },
    ]));
    rows.push(row(button(editorId(token, 'background-url'), customization.backgroundImageUrl ? 'Trocar imagem de fundo' : 'Adicionar imagem de fundo', ButtonStyle.Primary), button(editorId(token, 'background-clear'), 'Remover imagem'), button(editorId(token, 'gradient-toggle'), customization.gradient === false ? 'Ativar gradiente' : 'Desativar gradiente')));
    rows.push(row(button(editorId(token, 'opacity-edit'), 'Transparência dos elementos')));
  } else if (section === 'layout') {
    rows.push(select(editorId(token, 'layout'), 'Escolher layout do cartão', [
      ['classic', 'Clássico · horizontal'], ['wide', 'Panorâmico'], ['portrait', 'Retrato · vertical'], ['folio', 'Fólio · painel'], ['orbital', 'Órbita'],
    ].map(([value, label]) => ({ label, value, default: customization.layout === value }))));
  } else if (section === 'frame') {
    rows.push(select(editorId(token, 'frame'), 'Estilo da moldura', [
      ['classic', 'Clássica'], ['royal', 'Real'], ['neon', 'Neon'], ['rune', 'Rúnica'], ['ornate', 'Ornamentada'], ['minimal', 'Minimalista'], ['gilded', 'Dourada'], ['thorn', 'Espinhos'],
    ].map(([value, label]) => ({ label, value, default: customization.frame === value }))));
  } else if (section === 'avatar') {
    rows.push(select(editorId(token, 'avatar'), 'Formato do avatar', [
      ['circle', 'Circular'], ['rounded', 'Quadrado arredondado'], ['square', 'Quadrado'], ['diamond', 'Diamante'], ['hex', 'Hexagonal'],
    ].map(([value, label]) => ({ label, value, default: customization.avatarStyle === value }))));
  } else if (section === 'xp') {
    rows.push(select(editorId(token, 'xp-style'), 'Estilo da barra de experiência', [
      ['rounded', 'Arredondada'], ['segmented', 'Segmentada'], ['orb', 'Orbe arcano'], ['minimal', 'Minimalista'], ['square', 'Reta'],
    ].map(([value, label]) => ({ label, value, default: customization.xpBarStyle === value }))));
  } else if (section === 'details') {
    rows.push(row(button(editorId(token, 'title-edit'), 'Editar título', ButtonStyle.Primary), button(editorId(token, 'bio-edit'), 'Editar biografia', ButtonStyle.Primary)));
    rows.push(select(editorId(token, 'visibility'), 'Elementos visíveis no cartão', Object.entries({ level: 'Nível', xp: 'XP', rank: 'Ranking', title: 'Título', bio: 'Biografia', badges: 'Badges' }).map(([value, label]) => ({ label, value, default: customization.visibility[value] !== false })), { min: 0, max: 6 }));
  } else if (section === 'badges') {
    const category = customization.badgeCategory || 'elements';
    const definitions = BADGES.filter((badge) => badge.category === category);
    rows.push(select(editorId(token, 'badge-category'), 'Categoria de badges cosméticas', BADGE_CATEGORIES.filter((item) => item.value !== 'special').map((item) => ({ label: item.label, value: item.value, default: item.value === category }))));
    rows.push(select(editorId(token, 'badges'), 'Escolha até 6 · badges especiais são atribuídas pela staff', definitions.map((badge) => ({ label: badge.name, value: badge.id, description: badge.symbol, default: customization.badges.includes(badge.id) })), { min: 0, max: Math.min(6, definitions.length) }));
    rows.push(row(button(editorId(token, 'badge-up'), 'Mover para cima', ButtonStyle.Secondary, !customization.selectedBadge), button(editorId(token, 'badge-down'), 'Mover para baixo', ButtonStyle.Secondary, !customization.selectedBadge), button(editorId(token, 'badge-remove'), 'Remover selecionada', ButtonStyle.Danger, !customization.selectedBadge)));
  } else if (section === 'visibility') {
    rows.push(select(editorId(token, 'visibility'), 'Elementos visíveis no cartão', Object.entries({ level: 'Nível', xp: 'XP', rank: 'Ranking', title: 'Título', bio: 'Biografia', badges: 'Badges' }).map(([value, label]) => ({ label, value, default: customization.visibility[value] !== false })), { min: 0, max: 6 }));
  }
  rows.push(row(button(editorId(token, 'apply'), 'Aplicar alterações', ButtonStyle.Success), button(editorId(token, 'cancel'), 'Cancelar'), button(editorId(token, 'reset'), 'Restaurar padrão', ButtonStyle.Danger)));
  return rows;
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const target = interaction.options.getUser('member') || interaction.user;
  await interaction.editReply(await makePayload(target, interaction.guildId, null, false));
}

function textModal(token, field, title, label, value, maxLength, paragraph = false) {
  const input = new TextInputBuilder().setCustomId(field).setLabel(label).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(maxLength).setRequired(false);
  if (value != null && String(value).length) input.setValue(String(value).slice(0, maxLength));
  return new ModalBuilder().setCustomId(editorId(token, 'modal:' + field)).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
}

async function executeEdit(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const user = interaction.user;
  const stored = await getMemberProfile(interaction.guildId, user.id);
  const xp = await getProfile(interaction.guildId, user.id);
  const customization = customizationDefaults(stored);
  const specialBadges = await fetchSpecialBadges(stored, interaction.guildId);
  const rank = customization.visibility?.rank === false ? null : await getRank(interaction.guildId, xp);
  const token = require('node:crypto').randomBytes(5).toString('hex');
  const session = { user, guildId: interaction.guildId, userId: user.id, profile: stored, draft: customization, section: 'colors', xp, rank, specialBadges, selectedColor: 'primary', selectedBadge: null };
  EDIT_SESSIONS.set(token, session);
  while (EDIT_SESSIONS.size > 100) EDIT_SESSIONS.delete(EDIT_SESSIONS.keys().next().value);
  await interaction.editReply(await makePayload(user, interaction.guildId, user.id, true, session.section, session.draft, { rank, specialBadges, sessionToken: token, xp, profile: stored }));
}

async function refreshEditor(interaction, token, session) {
  await interaction.editReply(await makePayload(session.user, session.guildId, session.userId, true, session.section, session.draft, { rank: session.rank, specialBadges: session.specialBadges, sessionToken: token, xp: session.xp, profile: session.profile }));
}

async function openFreeInput(interaction, session, token, action) {
  if (action === 'title-edit') await interaction.showModal(textModal(token, 'title', 'Título do perfil', 'Como quer aparecer no Eternity?', session.draft.title, 40));
  else if (action === 'bio-edit') await interaction.showModal(textModal(token, 'bio', 'Biografia do perfil', 'Uma linha sobre você', session.draft.bio, 160, true));
  else if (action === 'color-edit') await interaction.showModal(textModal(token, 'color', 'Cor do cartão', 'HEX (#C0265A) ou RGB (192, 38, 90)', session.draft.colors[session.selectedColor], 40));
  else if (action === 'opacity-edit') await interaction.showModal(textModal(token, 'opacity', 'Transparência', 'Percentual entre 0 e 100', session.draft.elementOpacity, 3));
  else if (action === 'background-url') await interaction.showModal(textModal(token, 'backgroundUrl', 'Imagem de fundo', 'URL HTTPS pública · deixe vazio para remover', session.draft.backgroundImageUrl, 500));
}

async function handleEditInteraction(interaction, token, action) {
  const session = EDIT_SESSIONS.get(token);
  if (!session || session.userId !== interaction.user.id || session.guildId !== interaction.guildId) {
    await replyV2(interaction, 'Esta sessão de personalização expirou. Use `/profile-edit` para abrir outra.', { ephemeral: true });
    return true;
  }
  const opensModal = interaction.isButton() && ['color-edit', 'opacity-edit', 'background-url', 'title-edit', 'bio-edit'].includes(action);
  if (opensModal) { await openFreeInput(interaction, session, token, action); return true; }
  await interaction.deferUpdate();
  if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0];
    if (action === 'section') { if (EDIT_SECTIONS.some(([key]) => key === value)) session.section = value; }
    else if (action === 'color-field') { session.selectedColor = COLOR_FIELDS.some(([key]) => key === value) ? value : 'primary'; session.draft.selectedColor = session.selectedColor; }
    else if (action === 'color-preset') {
      const preset = COLOR_PRESETS.find(([key]) => key === value);
      if (preset) { session.draft.colors = { ...session.draft.colors, ...preset[2] }; session.draft.accent = value; delete session.draft.backgroundStops; }
    } else if (action === 'background-preset') {
      if (['dusk', 'crimson', 'aurora', 'parchment'].includes(value)) { session.draft.background = value; session.draft.colors.background = ({ dusk: '#11121C', crimson: '#170D18', aurora: '#091923', parchment: '#201820' })[value]; delete session.draft.backgroundStops; }
    } else if (action === 'layout') session.draft.layout = value;
    else if (action === 'frame') session.draft.frame = value;
    else if (action === 'avatar') session.draft.avatarStyle = value;
    else if (action === 'xp-style') session.draft.xpBarStyle = value;
    else if (action === 'badge-category') session.draft.badgeCategory = value;
    else if (action === 'badges') {
      const categoryIds = new Set(BADGES.filter((badge) => badge.category === session.draft.badgeCategory).map((badge) => badge.id));
      const outside = session.draft.badges.filter((id) => !categoryIds.has(id));
      const next = interaction.values;
      if (outside.length + next.length > 6) throw new RangeError('Você pode exibir até seis badges cosméticas. Remova uma antes de selecionar outra.');
      session.draft.badges = [...outside, ...next];
      session.draft.selectedBadge = next.at(-1) || null;
    } else if (action === 'visibility') {
      const visible = new Set(interaction.values);
      for (const field of ['level', 'xp', 'rank', 'title', 'bio', 'badges']) session.draft.visibility[field] = visible.has(field);
    }
  }
  if (interaction.isButton()) {
    if (action.endsWith('-edit') || action === 'opacity-edit' || action === 'background-url') return false;
    if (action === 'gradient-toggle') session.draft.gradient = session.draft.gradient === false;
    else if (action === 'background-clear') session.draft.backgroundImageUrl = '';
    else if (action === 'badge-remove' && session.draft.selectedBadge) session.draft.badges = session.draft.badges.filter((id) => id !== session.draft.selectedBadge);
    else if (action === 'badge-up' || action === 'badge-down') {
      const index = session.draft.badges.indexOf(session.draft.selectedBadge);
      const nextIndex = action === 'badge-up' ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < session.draft.badges.length) {
        [session.draft.badges[index], session.draft.badges[nextIndex]] = [session.draft.badges[nextIndex], session.draft.badges[index]];
      }
    } else if (action === 'reset') {
      session.draft = withProfileDefaults({ ...PROFILE_DEFAULTS, colors: { ...PROFILE_DEFAULTS.colors }, visibility: { ...PROFILE_DEFAULTS.visibility }, badges: [], specialBadges: session.draft.specialBadges });
      session.selectedBadge = null; session.selectedColor = 'primary';
    } else if (action === 'apply') {
      const toSave = { ...session.draft }; delete toSave.badgeCategory; delete toSave.selectedBadge; delete toSave.backgroundStops; delete toSave.specialBadges;
      await updateCustomization(session.guildId, session.userId, toSave);
      EDIT_SESSIONS.delete(token);
      await interaction.editReply(await makePayload(session.user, session.guildId, null, false));
      return true;
    } else if (action === 'cancel') {
      EDIT_SESSIONS.delete(token);
      await interaction.editReply(await makePayload(session.user, session.guildId, null, false));
      return true;
    }
  }
  await refreshEditor(interaction, token, session);
  return true;
}

async function handleProfileInteraction(interaction) {
  const id = interaction.customId || '';
  if (id.startsWith('profile-edit:')) {
    const [, token, ...actionParts] = id.split(':');
    const action = actionParts.join(':');
    if (interaction.isModalSubmit()) {
      const session = EDIT_SESSIONS.get(token);
      if (!session || session.userId !== interaction.user.id || session.guildId !== interaction.guildId) {
        await replyV2(interaction, 'Esta sessão de personalização expirou. Use `/profile-edit` para abrir outra.', { ephemeral: true }); return true;
      }
      await interaction.deferUpdate();
      if (action === 'modal:color') session.draft.colors[session.selectedColor] = parseColorInput(interaction.fields.getTextInputValue('color'));
      if (action === 'modal:opacity') {
        const opacity = Number(interaction.fields.getTextInputValue('opacity'));
        if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) throw new RangeError('A transparência deve estar entre 0 e 100.');
        session.draft.elementOpacity = opacity;
      }
      if (action === 'modal:backgroundUrl') session.draft.backgroundImageUrl = interaction.fields.getTextInputValue('backgroundUrl').trim();
      if (action === 'modal:title') session.draft.title = interaction.fields.getTextInputValue('title').trim();
      if (action === 'modal:bio') session.draft.bio = interaction.fields.getTextInputValue('bio').trim();
      await refreshEditor(interaction, token, session);
      return true;
    }
    return handleEditInteraction(interaction, token, action);
  }
  if (!id.startsWith('profile:')) return false;
  return false;
}

module.exports = { data, execute, executeEdit, handleProfileInteraction, makePayload, EDIT_SESSIONS, EDIT_SECTIONS, COLOR_FIELDS, COLOR_PRESETS };
