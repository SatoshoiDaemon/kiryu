const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  ChannelType, ContainerBuilder, EmbedBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  ModalBuilder, PermissionFlagsBits, SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder,
  TextDisplayBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, MessageFlags,
  ThumbnailBuilder,
} = require('discord.js');
const { randomBytes } = require('node:crypto');
const { Reminder, Giveaway, AdminAudit, GuildConfig, ManagedMessage } = require('../database');
const { replyV2, createContainer } = require('./components');
const { isAuthorized } = require('./permissions');
const { parseDuration, createEmbed, sendEmbed } = require('./communityCommands');
const { closeGiveaway, giveawayComponents } = require('./persistentTasks');
const config = require('../config');

const commandData = {};
const commandInfo = {};
const EDIT_SESSIONS = new Map();

function define(name, description, permission, configure) {
  let data = new SlashCommandBuilder().setName(name).setDescription(description);
  if (permission) data.setDefaultMemberPermissions(permission);
  if (configure) data = configure(data) || data;
  commandData[name] = data;
  commandInfo[name] = { category: 'Administração', permission };
  return data;
}

define('purge', 'Remove mensagens com filtros de conteúdo.', PermissionFlagsBits.ManageMessages, (data) => data
  .addIntegerOption((option) => option.setName('count').setDescription('Quantidade máxima a buscar').setRequired(true).setMinValue(1).setMaxValue(100))
  .addUserOption((option) => option.setName('member').setDescription('Filtrar por autor').setRequired(false))
  .addStringOption((option) => option.setName('contains').setDescription('Filtrar por texto').setRequired(false).setMaxLength(100))
  .addBooleanOption((option) => option.setName('bots_only').setDescription('Manter somente mensagens de bots').setRequired(false))
  .addBooleanOption((option) => option.setName('attachments_only').setDescription('Manter somente mensagens com arquivos').setRequired(false)));
define('announce', 'Publica um anúncio ou reutiliza um template.', PermissionFlagsBits.ManageMessages, (data) => data
  .addChannelOption((option) => option.setName('channel').setDescription('Canal de destino; padrão é o canal atual').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
  .addStringOption((option) => option.setName('message').setDescription('Texto do anúncio').setRequired(false).setMaxLength(1800))
  .addStringOption((option) => option.setName('template_name').setDescription('Nome do template salvo em /embed').setRequired(false).setMaxLength(50))
  .addStringOption((option) => option.setName('title').setDescription('Título opcional').setRequired(false).setMaxLength(256)));
define('slowmode', 'Configura o modo lento de um canal.', PermissionFlagsBits.ManageChannels, (data) => data
  .addIntegerOption((option) => option.setName('seconds').setDescription('Intervalo entre mensagens · 0 desativa').setRequired(true).setMinValue(0).setMaxValue(21600))
  .addChannelOption((option) => option.setName('channel').setDescription('Canal; padrão é o atual').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildNews)));
define('lock', 'Bloqueia o envio de mensagens em um canal.', PermissionFlagsBits.ManageChannels, (data) => data
  .addChannelOption((option) => option.setName('channel').setDescription('Canal; padrão é o atual').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildNews))
  .addStringOption((option) => option.setName('reason').setDescription('Motivo registrado').setRequired(false).setMaxLength(500)));
define('unlock', 'Libera o envio de mensagens em um canal.', PermissionFlagsBits.ManageChannels, (data) => data.addChannelOption((option) => option.setName('channel').setDescription('Canal; padrão é o atual').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildNews)));
define('kick', 'Expulsa um membro do servidor.', PermissionFlagsBits.KickMembers, (data) => data.addUserOption((option) => option.setName('member').setDescription('Membro para expulsar').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(false).setMaxLength(500)));
define('ban', 'Bane um membro do servidor.', PermissionFlagsBits.BanMembers, (data) => data.addUserOption((option) => option.setName('member').setDescription('Membro para banir').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(false).setMaxLength(500)).addIntegerOption((option) => option.setName('delete_days').setDescription('Apagar mensagens anteriores · 0 a 7 dias').setRequired(false).setMinValue(0).setMaxValue(7)));
define('unban', 'Remove o banimento de um usuário.', PermissionFlagsBits.BanMembers, (data) => data.addStringOption((option) => option.setName('user_id').setDescription('ID do usuário').setRequired(true).setMaxLength(30)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(false).setMaxLength(500)));
define('timeout', 'Aplica ou remove o silenciamento temporário de um membro.', PermissionFlagsBits.ModerateMembers, (data) => data
  .addSubcommand((sub) => sub.setName('apply').setDescription('Aplicar timeout').addUserOption((option) => option.setName('member').setDescription('Membro').setRequired(true)).addStringOption((option) => option.setName('duration').setDescription('Duração: 10m, 2h, 3d').setRequired(true).setMaxLength(24)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(false).setMaxLength(500)))
  .addSubcommand((sub) => sub.setName('remove').setDescription('Remover timeout').addUserOption((option) => option.setName('member').setDescription('Membro').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(false).setMaxLength(500))));
define('warn', 'Registra uma advertência para um membro.', PermissionFlagsBits.ModerateMembers, (data) => data.addUserOption((option) => option.setName('member').setDescription('Membro advertido').setRequired(true)).addStringOption((option) => option.setName('reason').setDescription('Motivo').setRequired(true).setMaxLength(1000)));
define('warnings', 'Consulta ou limpa advertências de um membro.', PermissionFlagsBits.ModerateMembers, (data) => data.addUserOption((option) => option.setName('member').setDescription('Membro; padrão é você').setRequired(false)).addStringOption((option) => option.setName('action').setDescription('Operação').setRequired(false).addChoices({ name: 'Consultar', value: 'view' }, { name: 'Limpar advertências', value: 'clear' })));

const embedData = new SlashCommandBuilder().setName('embed').setDescription('Cria mensagens, Componentes V2 e templates reutilizáveis.')
  .addSubcommand((sub) => sub.setName('create').setDescription('Abrir o editor interativo').addChannelOption((option) => option.setName('channel').setDescription('Canal de publicação').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)).addAttachmentOption((option) => option.setName('image').setDescription('Imagem para armazenar no Blob').setRequired(false)))
  .addSubcommand((sub) => sub.setName('edit').setDescription('Editar uma mensagem publicada pelo editor').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem gerenciada').setRequired(true).setMaxLength(30)).addChannelOption((option) => option.setName('channel').setDescription('Canal da mensagem; padrão é o atual').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommandGroup((group) => group.setName('template').setDescription('Gerenciar templates persistentes')
    .addSubcommand((sub) => sub.setName('list').setDescription('Listar templates salvos'))
    .addSubcommand((sub) => sub.setName('delete').setDescription('Excluir um template').addStringOption((option) => option.setName('name').setDescription('Nome do template').setRequired(true).setMaxLength(50)))
    .addSubcommand((sub) => sub.setName('export').setDescription('Exportar um template JSON').addStringOption((option) => option.setName('name').setDescription('Nome do template').setRequired(true).setMaxLength(50)))
    .addSubcommand((sub) => sub.setName('import').setDescription('Importar um template JSON').addStringOption((option) => option.setName('name').setDescription('Nome do template').setRequired(true).setMaxLength(50)).addAttachmentOption((option) => option.setName('file').setDescription('Arquivo JSON de template · máximo 32 KB').setRequired(true)))
    .addSubcommand((sub) => sub.setName('apply').setDescription('Publicar um template em um canal').addStringOption((option) => option.setName('name').setDescription('Nome do template').setRequired(true).setMaxLength(50)).addChannelOption((option) => option.setName('channel').setDescription('Canal de publicação').setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))));
commandData.embed = embedData;
commandInfo.embed = { category: 'Administração', permission: PermissionFlagsBits.ManageMessages };

const giveawayData = new SlashCommandBuilder().setName('giveaway').setDescription('Cria e gerencia sorteios persistentes.')
  .addSubcommand((sub) => sub.setName('start').setDescription('Criar um sorteio').addStringOption((option) => option.setName('prize').setDescription('Prêmio').setRequired(true).setMaxLength(180)).addStringOption((option) => option.setName('duration').setDescription('Duração: 1h, 2d').setRequired(true).setMaxLength(24)).addIntegerOption((option) => option.setName('winners').setDescription('Quantidade de vencedores').setRequired(false).setMinValue(1).setMaxValue(25)).addRoleOption((option) => option.setName('required_role').setDescription('Cargo necessário para participar').setRequired(false)))
  .addSubcommand((sub) => sub.setName('end').setDescription('Encerrar antes do prazo').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true).setMaxLength(30)))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancelar um sorteio').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true).setMaxLength(30)))
  .addSubcommand((sub) => sub.setName('reroll').setDescription('Sortear novos vencedores').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true).setMaxLength(30)))
  .addSubcommand((sub) => sub.setName('entrants').setDescription('Consultar participantes').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem do sorteio').setRequired(true).setMaxLength(30)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consultar sorteios recentes'));
commandData.giveaway = giveawayData;
commandInfo.giveaway = { category: 'Administração', permission: PermissionFlagsBits.ManageGuild };

function textInput(customId, label, value = '', { paragraph = false, maxLength = 1000, required = false } = {}) {
  const input = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setMaxLength(maxLength).setRequired(required);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return input;
}
function isTemporaryDiscordAttachment(url) {
  try {
    const parsed = new URL(String(url));
    return ['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith('/attachments/');
  } catch { return false; }
}
function editorButton(token, action, label, style = ButtonStyle.Secondary) { return new ButtonBuilder().setCustomId('embed:' + token + ':' + action).setLabel(label).setStyle(style); }
function editorSelect(token, suffix, placeholder, options) { return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('embed:' + token + ':' + suffix).setPlaceholder(placeholder).addOptions(options)); }
function editorRows(session, token) {
  const rows = [
    new ActionRowBuilder().addComponents(editorButton(token, 'title', 'Editar título'), editorButton(token, 'body', 'Editar texto'), editorButton(token, 'color', 'Editar cor'), editorButton(token, 'mode', session.mode === 'v2' ? 'Componentes V2' : 'Embed tradicional', ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(editorButton(token, 'add:text', 'Text Display'), editorButton(token, 'add:section', 'Section'), editorButton(token, 'add:separator', 'Separador'), editorButton(token, 'add:gallery', 'Galeria'), editorButton(token, 'save', 'Salvar template', ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(editorButton(token, 'add:link', 'Botão de link'), editorButton(token, 'add:thumbnail', 'Thumbnail'), editorButton(token, 'preview', 'Pré-visualizar', ButtonStyle.Primary), editorButton(token, 'publish', session.messageId ? 'Salvar edição' : 'Publicar', ButtonStyle.Success)),
  ];
  if (session.elements.length) {
    rows.push(editorSelect(token, 'element', 'Selecionar componente para organizar', session.elements.map((item, index) => ({ label: (index + 1) + ' · ' + item.type, value: String(index), default: index === session.selectedIndex }))));
    rows.push(new ActionRowBuilder().addComponents(editorButton(token, 'move:up', 'Mover para cima'), editorButton(token, 'move:down', 'Mover para baixo'), editorButton(token, 'duplicate', 'Duplicar'), editorButton(token, 'remove', 'Remover', ButtonStyle.Danger)));
  }
  return rows;
}

function editorPreview(session) {
  const title = session.title || 'Mensagem da Kiryu';
  const elements = session.elements.slice(0, 20);
  if (session.mode === 'embed') {
    const embed = new EmbedBuilder().setColor(Number.parseInt(session.color.slice(1), 16)).setTitle(title).setDescription(session.body || null).setFooter({ text: 'Kiryu · Developer by Krieg.js' }).setTimestamp(new Date());
    if (session.imageUrl) embed.setImage(session.imageUrl);
    const links = elements.filter((item) => item.type === 'link').slice(0, 5).map((item) => new ButtonBuilder().setLabel(item.label.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(item.url));
    return { embeds: [embed], components: links.length ? [new ActionRowBuilder().addComponents(links)] : [], allowedMentions: { parse: [] } };
  }
  const container = new ContainerBuilder().setAccentColor(Number.parseInt(session.color.slice(1), 16));
  if (title) {
    const header = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('# ' + title));
    if (session.imageUrl && /^https:\/\//i.test(session.imageUrl)) header.setThumbnailAccessory(new ThumbnailBuilder().setURL(session.imageUrl).setDescription('Imagem da mensagem'));
    container.addSectionComponents(header);
  }
  if (session.body) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(session.body.slice(0, 4000)));
  const linkButtons = [];
  for (const element of elements) {
    if (element.type === 'text') container.addTextDisplayComponents(new TextDisplayBuilder().setContent(element.content));
    else if (element.type === 'section') {
      const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(element.content));
      if (element.thumbnailUrl && /^https:\/\//i.test(element.thumbnailUrl)) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(element.thumbnailUrl).setDescription('Imagem da seção'));
      container.addSectionComponents(section);
    }
    else if (element.type === 'separator') container.addSeparatorComponents(new SeparatorBuilder());
    else if (element.type === 'gallery' && element.url) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(element.url).setDescription(element.description || title)));
    else if (element.type === 'link') linkButtons.push(new ButtonBuilder().setLabel(element.label.slice(0, 80)).setStyle(ButtonStyle.Link).setURL(element.url));
  }
  if (linkButtons.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButtons.slice(0, 5)));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function updateEditor(interaction, token, session) {
  const text = '# Editor da Kiryu\nModo: **' + (session.mode === 'v2' ? 'Discord Components V2' : 'Embed tradicional') + '** · Canal: ' + (session.channelId ? '<#' + session.channelId + '>' : '<#' + interaction.channelId + '>') + '\n\n**Título:** ' + (session.title || 'vazio') + '\n**Texto:** ' + (session.body || 'vazio').slice(0, 240) + '\n**Elementos:** ' + session.elements.map((item, index) => (index + 1) + '. ' + item.type).join(' · ') + (session.imageUrl ? '\n**Imagem:** armazenada ou HTTPS' : '');
  return interaction.editReply({ components: [createContainer(text, editorRows(session, token), config.visual.admin)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
}

function editorSessionPayload(session) {
  return {
    mode: session.mode,
    title: String(session.title || '').slice(0, 256),
    body: String(session.body || '').slice(0, 4000),
    color: session.color,
    imageUrl: session.imageUrl || '',
    imageObjectId: session.imageObjectId || '',
    elements: session.elements.slice(0, 20),
  };
}

async function persistManagedMessage({ guildId, channelId, messageId, actorId, payload }) {
  const previous = await ManagedMessage.findOne({ guildId: String(guildId), messageId: String(messageId) }).lean();
  const imageObjectId = String(payload.imageObjectId || '');
  const managed = await ManagedMessage.findOneAndUpdate({ guildId: String(guildId), messageId: String(messageId) }, {
    $set: { channelId: String(channelId), updatedBy: String(actorId), payload, imageObjectId },
    $setOnInsert: { guildId: String(guildId), messageId: String(messageId), createdBy: String(actorId) },
  }, { upsert: true, new: true, runValidators: true }).lean();
  await require('./blobStorage').updateReference({ guildId, system: 'message', key: String(messageId), oldObjectId: previous?.imageObjectId || '', newObjectId: imageObjectId });
  return managed;
}

async function openEditor(interaction, managed = null) {
  const token = randomBytes(5).toString('hex');
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const session = {
    guildId: interaction.guildId, ownerId: interaction.user.id, channelId: managed?.channelId || channel.id,
    messageId: managed?.messageId || '', mode: managed?.payload?.mode || 'v2', title: managed?.payload?.title || '',
    body: managed?.payload?.body || '', color: managed?.payload?.color || '#9D174D',
    imageUrl: managed?.payload?.imageUrl || '', imageObjectId: managed?.payload?.imageObjectId || '',
    elements: Array.isArray(managed?.payload?.elements) ? managed.payload.elements.slice(0, 20) : [], selectedIndex: 0,
  };
  const attachment = interaction.options.getAttachment?.('image');
  if (attachment) {
    const storage = require('./blobStorage');
    const file = await storage.fetchDiscordAttachment(attachment);
    const asset = await storage.upload({ guildId: interaction.guildId, category: 'banner', name: 'editor-image', filename: file.filename, buffer: file.buffer, createdBy: interaction.user.id });
    session.imageObjectId = asset._id; session.imageUrl = asset.url;
  }
  EDIT_SESSIONS.set(token, session);
  while (EDIT_SESSIONS.size > 100) EDIT_SESSIONS.delete(EDIT_SESSIONS.keys().next().value);
  await updateEditor(interaction, token, session);
}

async function loadTemplate(guildId, name) {
  const cfg = await GuildConfig.findById(guildId).lean();
  return (cfg?.messageTemplates || []).find((item) => item.name.toLowerCase() === String(name).toLowerCase()) || null;
}

async function saveTemplate(guildId, name, payload, createdBy) {
  const cfg = await GuildConfig.findById(guildId);
  if (!cfg) throw new Error('A configuração do servidor não está disponível.');
  if (isTemporaryDiscordAttachment(payload?.imageUrl) || (payload?.elements || []).some((element) => ['gallery', 'section'].includes(element.type) && isTemporaryDiscordAttachment(element.url || element.thumbnailUrl))) {
    throw new RangeError('Anexos temporários do Discord não podem ser usados como imagem persistente; envie o arquivo ao Blob.');
  }
  if (payload?.imageObjectId) {
    const asset = await require('../database').BlobObject.findOne({ _id: String(payload.imageObjectId), guildId: String(guildId), deletedAt: null }).lean();
    if (!asset) throw new RangeError('A imagem armazenada deste template não existe neste servidor.');
    payload.imageUrl = asset.url || payload.imageUrl || '';
  }
  if (!Array.isArray(cfg.messageTemplates)) cfg.messageTemplates = [];
  const existing = cfg.messageTemplates.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const oldImageObjectId = existing?.payload?.imageObjectId || '';
  if (existing) { existing.payload = payload; existing.createdBy = createdBy; }
  else {
    if (cfg.messageTemplates.length >= 25) throw new RangeError('O servidor já possui 25 templates. Exclua um antes de salvar outro.');
    cfg.messageTemplates.push({ name, payload, createdBy });
  }
  await cfg.save();
  if (payload?.imageObjectId) await require('./blobStorage').addReference(payload.imageObjectId, guildId, 'template', name);
  if (oldImageObjectId && oldImageObjectId !== payload?.imageObjectId) await require('./blobStorage').removeReference(oldImageObjectId, guildId, 'template', existing.name);
  return cfg.messageTemplates.find((item) => item.name.toLowerCase() === name.toLowerCase());
}

async function publishPayload(channel, payload) {
  if (!channel?.isTextBased?.()) throw new RangeError('Escolha um canal de texto válido.');
  return channel.send({ ...payload, allowedMentions: { parse: [] } });
}

async function executeEmbed(interaction) {
  const action = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);
  if (!group && action === 'create') return openEditor(interaction);
  if (!group && action === 'edit') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const messageId = interaction.options.getString('message_id', true);
    const managed = await ManagedMessage.findOne({ guildId: String(interaction.guildId), channelId: String(channel.id), messageId }).lean();
    if (!managed) throw new RangeError('Não encontrei uma mensagem criada ou administrada pelo editor neste canal.');
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) throw new RangeError('A mensagem não está mais disponível no Discord.');
    return openEditor(interaction, managed);
  }
  if (group !== 'template') return;
  const subcommand = interaction.options.getSubcommand();
  const cfg = await GuildConfig.findById(interaction.guildId);
  cfg.messageTemplates ||= [];
  if (subcommand === 'list') return replyV2(interaction, '# Templates de mensagens\n' + (cfg.messageTemplates.length ? cfg.messageTemplates.map((item) => '• **' + item.name + '** · ' + (item.payload?.mode || 'v2')).join('\n') : 'Nenhum template salvo.'), { ephemeral: true });
  if (subcommand === 'delete') {
    const name = interaction.options.getString('name', true);
    const item = cfg.messageTemplates.find((template) => template.name.toLowerCase() === name.toLowerCase());
    if (!item) throw new RangeError('Template não encontrado.');
    cfg.messageTemplates = cfg.messageTemplates.filter((template) => template._id?.toString() !== item._id?.toString());
    await cfg.save();
    if (item.payload?.imageObjectId) await require('./blobStorage').removeReference(item.payload.imageObjectId, interaction.guildId, 'template', item.name).catch(() => {});
    return replyV2(interaction, 'Template **' + name + '** removido.', { ephemeral: true });
  }
  if (subcommand === 'export') {
    const item = await loadTemplate(interaction.guildId, interaction.options.getString('name', true));
    if (!item) throw new RangeError('Template não encontrado.');
    const json = JSON.stringify({ version: 1, name: item.name, payload: item.payload }, null, 2);
    return interaction.editReply({ content: 'Exportação pronta para compartilhar ou importar depois.', files: [new AttachmentBuilder(Buffer.from(json), { name: item.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') + '.kiryu.json' })], allowedMentions: { parse: [] } });
  }
  if (subcommand === 'import') {
    const name = interaction.options.getString('name', true).trim();
    const attachment = interaction.options.getAttachment('file', true);
    if (!/^[\p{L}\p{N} _-]{1,50}$/u.test(name) || attachment.size > 32 * 1024) throw new RangeError('Nome ou arquivo de template inválido; o JSON deve ter até 32 KB.');
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Não foi possível baixar o JSON anexado.');
    const data = JSON.parse(await response.text());
    const payload = data?.payload || data;
    if (!["embed", "v2"].includes(payload?.mode) || typeof payload?.title !== 'string' || typeof payload?.body !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload?.color || '') || !Array.isArray(payload?.elements) || payload.elements.length > 20) throw new RangeError('O arquivo não contém um template Kiryu compatível.');
    if (payload.title.length > 256 || payload.body.length > 4000) throw new RangeError('O título ou texto do template ultrapassa o limite aceito.');
    if (payload.imageUrl && (!/^https:\/\//i.test(payload.imageUrl) || isTemporaryDiscordAttachment(payload.imageUrl))) throw new RangeError('A imagem do template precisa usar HTTPS permanente; anexos do Discord devem ser enviados ao Blob.');
    const allowedElements = new Set(['text', 'section', 'separator', 'gallery', 'link']);
    for (const element of payload.elements) {
      if (!element || !allowedElements.has(element.type)) throw new RangeError('O template contém um tipo de componente desconhecido.');
      if (['text', 'section'].includes(element.type) && (typeof element.content !== 'string' || element.content.length > 1000)) throw new RangeError('Um texto do template é inválido ou longo demais.');
      if (element.type === 'link' && (typeof element.label !== 'string' || !element.label.trim() || element.label.length > 80 || !/^https:\/\//i.test(element.url || ''))) throw new RangeError('O template contém um botão de link inválido.');
      if (element.type === 'gallery' && (!/^https:\/\//i.test(element.url || '') || isTemporaryDiscordAttachment(element.url))) throw new RangeError('O template contém uma imagem inválida ou temporária do Discord.');
      if (element.thumbnailUrl && (!/^https:\/\//i.test(element.thumbnailUrl) || isTemporaryDiscordAttachment(element.thumbnailUrl))) throw new RangeError('O template contém uma miniatura inválida ou temporária do Discord.');
    }
    await saveTemplate(interaction.guildId, name, payload, interaction.user.id);
    return replyV2(interaction, 'Template **' + name + '** importado.', { ephemeral: true });
  }
  if (subcommand === 'apply') {
    const item = await loadTemplate(interaction.guildId, interaction.options.getString('name', true));
    if (!item) throw new RangeError('Template não encontrado.');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const payload = renderTemplatePayload(item.payload);
    const message = await publishPayload(channel, payload);
    await persistManagedMessage({ guildId: interaction.guildId, channelId: channel.id, messageId: message.id, actorId: interaction.user.id, payload: item.payload });
    await audit(interaction, 'template_publish', '', item.name, { messageId: message.id, channelId: channel.id });
    return replyV2(interaction, 'Template publicado em <#' + channel.id + '>.', { ephemeral: true });
  }
}

function renderTemplatePayload(payload) {
  const session = { ...payload, elements: payload.elements || [] };
  return editorPreview(session);
}

async function audit(interaction, operation, targetId = '', reason = '', details = {}) {
  await AdminAudit.create({ guildId: interaction.guildId, actorId: interaction.user.id, targetId, operation, reason: String(reason || '').slice(0, 1000), channelId: interaction.channelId, details });
  const cfg = await GuildConfig.findById(interaction.guildId).select('moderation.logChannelId giveaways.logChannelId').lean();
  const logChannelId = operation.startsWith('giveaway_') ? cfg?.giveaways?.logChannelId : cfg?.moderation?.logChannelId;
  if (!logChannelId) return;
  try {
    const channel = await interaction.guild.channels.fetch(logChannelId);
    const detailsText = Object.keys(details).length ? '\nDetalhes: ' + JSON.stringify(details).slice(0, 800) : '';
    const thresholdText = details.thresholdReached ? '\n\n⚠️ Este membro alcançou o limite configurado de advertências (' + details.warningCount + '/' + details.warningThreshold + ').' : '';
    if (channel?.isTextBased()) await channel.send({ embeds: [createEmbed('Registro administrativo · ' + operation, 'Responsável: <@' + interaction.user.id + '>\nAlvo: ' + (targetId ? '<@' + targetId + '>' : '—') + '\nMotivo: ' + (reason || 'não informado') + detailsText + thresholdText).addFields({ name: 'Operação', value: operation, inline: true }, { name: 'Canal', value: '<#' + interaction.channelId + '>', inline: true })], allowedMentions: { parse: [] } });
  } catch { /* The persistent MongoDB record remains the canonical log. */ }
}

function assertPermission(interaction, permission, label) {
  if (!interaction.memberPermissions?.has(permission)) throw new RangeError('Você precisa da permissão **' + label + '** para usar este comando.');
}
async function fetchTargetMember(interaction, user) {
  const guild = interaction.guild;
  const [target, actor, bot] = await Promise.all([
    guild.members.fetch(user.id).catch(() => null),
    guild.members.fetch(interaction.user.id).catch(() => null),
    guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe().catch(() => null),
  ]);
  if (!target) throw new RangeError('O membro não está neste servidor.');
  if (target.id === guild.ownerId) throw new RangeError('O proprietário do servidor não pode ser moderado.');
  if (!actor || !bot) throw new RangeError('Não foi possível confirmar a hierarquia de cargos. Tente novamente.');
  if (interaction.user.id !== guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) throw new RangeError('O cargo do alvo é igual ou superior ao seu.');
  if (bot.roles.highest.comparePositionTo(target.roles.highest) <= 0) throw new RangeError('O cargo mais alto do bot precisa estar acima do cargo do alvo.');
  return target;
}

async function executeModeration(interaction, name) {
  const permission = { purge: PermissionFlagsBits.ManageMessages, announce: PermissionFlagsBits.ManageMessages, slowmode: PermissionFlagsBits.ManageChannels, lock: PermissionFlagsBits.ManageChannels, unlock: PermissionFlagsBits.ManageChannels, kick: PermissionFlagsBits.KickMembers, ban: PermissionFlagsBits.BanMembers, unban: PermissionFlagsBits.BanMembers, timeout: PermissionFlagsBits.ModerateMembers, warn: PermissionFlagsBits.ModerateMembers, warnings: PermissionFlagsBits.ModerateMembers }[name];
  const label = { purge: 'Gerenciar mensagens', announce: 'Gerenciar mensagens', slowmode: 'Gerenciar canais', lock: 'Gerenciar canais', unlock: 'Gerenciar canais', kick: 'Expulsar membros', ban: 'Banir membros', unban: 'Banir membros', timeout: 'Moderar membros', warn: 'Moderar membros', warnings: 'Moderar membros' }[name];
  assertPermission(interaction, permission, label);
  const cfg = await GuildConfig.findById(interaction.guildId);
  if (cfg?.moderation?.enabled === false && !['announce', 'purge'].includes(name)) throw new RangeError('As ferramentas de moderação estão desativadas neste servidor.');
  if (name === 'purge') {
    const count = interaction.options.getInteger('count', true);
    const author = interaction.options.getUser('member');
    const contains = interaction.options.getString('contains')?.toLowerCase();
    const botsOnly = interaction.options.getBoolean('bots_only');
    const attachmentsOnly = interaction.options.getBoolean('attachments_only');
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const selected = messages.filter((message) => (!author || message.author.id === author.id) && (!contains || message.content.toLowerCase().includes(contains)) && (botsOnly !== true || message.author.bot) && (attachmentsOnly !== true || message.attachments.size > 0)).first(count);
    if (!selected.length) throw new RangeError('Nenhuma mensagem corresponde aos filtros nos últimos 100 envios.');
    const deleted = await interaction.channel.bulkDelete(selected, true);
    await audit(interaction, 'purge', '', '', { requested: count, removed: deleted.size, memberId: author?.id || '', contains: contains || '' });
    return replyV2(interaction, 'Removi **' + deleted.size + '** mensagem(ns) correspondentes aos filtros. Mensagens antigas demais para exclusão em lote foram mantidas.', { ephemeral: true });
  }
  if (name === 'announce') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const templateName = interaction.options.getString('template_name');
    const text = interaction.options.getString('message') || '';
    const title = interaction.options.getString('title');
    if (templateName) {
      const item = await loadTemplate(interaction.guildId, templateName);
      if (!item) throw new RangeError('Template não encontrado.');
      const payload = renderTemplatePayload(item.payload);
      if (text) { if (payload.embeds?.[0]) payload.embeds[0].setDescription(text); else if (payload.components?.[0]) payload.components[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(text)); }
      const message = await publishPayload(channel, payload);
      const managedPayload = text ? { ...item.payload, body: text } : item.payload;
      await persistManagedMessage({ guildId: interaction.guildId, channelId: channel.id, messageId: message.id, actorId: interaction.user.id, payload: managedPayload });
      await audit(interaction, 'announce_template', '', text, { messageId: message.id, channelId: channel.id, templateName });
      return replyV2(interaction, 'Anúncio publicado em <#' + channel.id + '>.', { ephemeral: true });
    }
    if (!text.trim()) throw new RangeError('Escreva a mensagem ou informe `template_name`.');
    const embed = createEmbed(title || 'Anúncio da comunidade', text);
    const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await audit(interaction, 'announce', '', text, { messageId: message.id, channelId: channel.id });
    return replyV2(interaction, 'Anúncio publicado em <#' + channel.id + '>.', { ephemeral: true });
  }
  if (name === 'slowmode') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const seconds = interaction.options.getInteger('seconds', true);
    await channel.setRateLimitPerUser(seconds, 'Configurado por ' + interaction.user.tag);
    await audit(interaction, 'slowmode', '', '', { channelId: channel.id, seconds });
    return replyV2(interaction, 'Modo lento de <#' + channel.id + '> definido para **' + seconds + ' s**.');
  }
  if (name === 'lock' || name === 'unlock') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || '';
    const everyone = interaction.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyone, { SendMessages: name === 'unlock' ? null : false }, { reason: reason || name + ' por ' + interaction.user.tag });
    await audit(interaction, name, '', reason, { channelId: channel.id });
    return replyV2(interaction, name === 'lock' ? 'Canal <#' + channel.id + '> bloqueado.' : 'Canal <#' + channel.id + '> liberado.');
  }
  if (name === 'kick' || name === 'ban') {
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason') || '';
    const target = await fetchTargetMember(interaction, user);
    if (name === 'kick') await target.kick(reason || 'Expulsão por ' + interaction.user.tag);
    else await target.ban({ reason: reason || 'Banimento por ' + interaction.user.tag, deleteMessageSeconds: (interaction.options.getInteger('delete_days') || 0) * 86400 });
    await audit(interaction, name, user.id, reason);
    return replyV2(interaction, name === 'kick' ? 'Membro **' + user.username + '** expulso.' : 'Membro **' + user.username + '** banido.');
  }
  if (name === 'unban') {
    const userId = interaction.options.getString('user_id', true);
    if (!/^\d{17,20}$/.test(userId)) throw new RangeError('Informe um ID de usuário Discord válido.');
    const reason = interaction.options.getString('reason') || '';
    await interaction.guild.members.unban(userId, reason || 'Desbanimento por ' + interaction.user.tag);
    await audit(interaction, 'unban', userId, reason);
    return replyV2(interaction, 'Banimento removido para <@' + userId + '>.');
  }
  if (name === 'timeout') {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('member', true);
    const target = await fetchTargetMember(interaction, user);
    const reason = interaction.options.getString('reason') || '';
    if (subcommand === 'apply') {
      const duration = parseDuration(interaction.options.getString('duration', true), { maxDays: 28 });
      if (duration > 28 * 86400_000) throw new RangeError('O timeout máximo aceito pelo Discord é de 28 dias.');
      await target.timeout(duration, reason || 'Timeout por ' + interaction.user.tag);
      await audit(interaction, 'timeout_apply', user.id, reason, { durationMs: duration });
      return replyV2(interaction, 'Timeout aplicado a **' + user.username + '** até ' + new Date(Date.now() + duration).toLocaleString('pt-BR', { timeZone: config.timezone }) + '.');
    }
    await target.timeout(null, reason || 'Timeout removido por ' + interaction.user.tag);
    await audit(interaction, 'timeout_remove', user.id, reason);
    return replyV2(interaction, 'Timeout removido de **' + user.username + '**.');
  }
  if (name === 'warn') {
    const user = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true);
    const warningCount = await AdminAudit.countDocuments({ guildId: interaction.guildId, targetId: user.id, operation: 'warn' }) + 1;
    const warningThreshold = Number(cfg?.moderation?.warnThreshold || 0);
    const thresholdReached = warningThreshold > 0 && warningCount >= warningThreshold;
    await audit(interaction, 'warn', user.id, reason, { warningCount, warningThreshold, thresholdReached });
    return replyV2(interaction, 'Advertência registrada para <@' + user.id + '>.' + (thresholdReached ? '\n\n⚠️ A equipe será informada no canal de logs configurado.' : ''));
  }
  if (name === 'warnings') {
    const user = interaction.options.getUser('member') || interaction.user;
    const action = interaction.options.getString('action') || 'view';
    const query = { guildId: interaction.guildId, targetId: user.id, operation: 'warn' };
    if (action === 'clear') {
      const result = await AdminAudit.deleteMany(query);
      await audit(interaction, 'warnings_clear', user.id, '', { removed: result.deletedCount });
      return replyV2(interaction, 'Removi **' + result.deletedCount + '** advertência(s) de <@' + user.id + '>.', { ephemeral: true });
    }
    const warnings = await AdminAudit.find(query).sort({ createdAt: -1 }).limit(20).lean();
    return replyV2(interaction, '# Advertências · ' + user.username + '\n' + (warnings.length ? warnings.map((item) => '• ' + timestamp(item.createdAt) + ' · por <@' + item.actorId + '> · ' + (item.reason || 'sem motivo')).join('\n') : 'Nenhuma advertência.'), { ephemeral: true });
  }
}

function timestamp(date) { return '<t:' + Math.floor(new Date(date).getTime() / 1000) + ':F>'; }

function giveawayEmbed(giveaway, status = 'aberto') {
  const entrants = giveaway.entrants?.length || 0;
  return createEmbed('🎉 Sorteio · ' + giveaway.prize, 'Clique em **Participar** para concorrer.\n\n**Prêmio:** ' + giveaway.prize + '\n**Vencedores:** ' + giveaway.winnerCount + '\n**Participantes:** ' + entrants + '\n**Encerra:** ' + timestamp(giveaway.endsAt) + (giveaway.requiredRoleId ? '\n**Requisito:** <@&' + giveaway.requiredRoleId + '>' : '') + '\n**Status:** ' + status).setColor(config.visual.orbs);
}

async function runGiveaway(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const cfg = await GuildConfig.findById(interaction.guildId).lean();
  if (cfg?.giveaways?.enabled === false) throw new RangeError('Os sorteios estão desativados neste servidor.');
  if (subcommand === 'start') {
    assertPermission(interaction, PermissionFlagsBits.ManageGuild, 'Gerenciar servidor');
    const maxDays = cfg?.giveaways?.maxDurationDays || 365;
    const duration = parseDuration(interaction.options.getString('duration', true), { maxDays });
    const endsAt = new Date(Date.now() + duration);
    const role = interaction.options.getRole('required_role');
    const winnerCount = interaction.options.getInteger('winners') || 1;
    const prize = interaction.options.getString('prize', true).trim();
    const placeholder = await interaction.channel.send({ embeds: [createEmbed('🎉 Sorteio · ' + prize, 'Preparando participação...')], allowedMentions: { parse: [] } });
    const giveaway = await Giveaway.create({ guildId: interaction.guildId, channelId: interaction.channelId, messageId: placeholder.id, hostId: interaction.user.id, prize, winnerCount, endsAt, requiredRoleId: role?.id || '' });
    await placeholder.edit({ embeds: [giveawayEmbed(giveaway)], components: giveawayComponents(giveaway), allowedMentions: { parse: [] } });
    await audit(interaction, 'giveaway_start', '', prize, { messageId: giveaway.messageId, winnerCount, endsAt });
    return replyV2(interaction, 'Sorteio criado. ID da mensagem: `' + giveaway.messageId + '`.', { ephemeral: true });
  }
  const messageId = subcommand === 'history' ? '' : interaction.options.getString('message_id', true);
  if (subcommand === 'history') {
    assertPermission(interaction, PermissionFlagsBits.ManageGuild, 'Gerenciar servidor');
    const entries = await Giveaway.find({ guildId: interaction.guildId, status: { $in: ['ended', 'cancelled'] } }).sort({ endedAt: -1, createdAt: -1 }).limit(15).lean();
    return replyV2(interaction, '# Histórico de sorteios\n' + (entries.length ? entries.map((item) => '• **' + item.prize + '** · ' + item.status + ' · <#' + item.channelId + '> · ' + timestamp(item.endedAt || item.endsAt)).join('\n') : 'Nenhum sorteio encerrado.'));
  }
  const giveaway = await Giveaway.findOne({ guildId: interaction.guildId, messageId }).lean();
  if (!giveaway) throw new RangeError('Sorteio não encontrado neste servidor.');
  if (interaction.user.id !== interaction.guild.ownerId && interaction.user.id !== giveaway.hostId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new RangeError('Somente quem criou o sorteio ou a administração pode gerenciá-lo.');
  if (subcommand === 'entrants') return replyV2(interaction, '# Participantes · ' + giveaway.prize + '\n' + (giveaway.entrants.length ? giveaway.entrants.map((id) => '• <@' + id + '>').join('\n') : 'Ninguém participou.'), { ephemeral: true });
  if (subcommand === 'cancel') {
    const result = await Giveaway.findOneAndUpdate({ _id: giveaway._id, status: 'active' }, { $set: { status: 'cancelled', endedAt: new Date() } }, { new: true }).lean();
    if (!result) throw new RangeError('O sorteio não está ativo.');
    await editGiveawayMessage(interaction.client, result, 'cancelado');
    await audit(interaction, 'giveaway_cancel', '', giveaway.prize, { messageId });
    return replyV2(interaction, 'Sorteio cancelado.', { ephemeral: true });
  }
  if (subcommand === 'end') {
    if (giveaway.status !== 'active') throw new RangeError('O sorteio não está ativo.');
    await closeGiveaway(interaction.client, giveaway);
    await audit(interaction, 'giveaway_end', '', giveaway.prize, { messageId });
    return replyV2(interaction, 'Sorteio encerrado.', { ephemeral: true });
  }
  if (subcommand === 'reroll') {
    if (!['ended'].includes(giveaway.status)) throw new RangeError('Encerre o sorteio antes de sortear novos vencedores.');
    await closeGiveaway(interaction.client, giveaway, { reroll: true });
    await audit(interaction, 'giveaway_reroll', '', giveaway.prize, { messageId });
    return replyV2(interaction, 'Novo sorteio realizado.', { ephemeral: true });
  }
}

async function editGiveawayMessage(client, giveaway, status) {
  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(giveaway.messageId);
    await message.edit({ embeds: [giveawayEmbed(giveaway, status)], components: giveawayComponents(giveaway, true), allowedMentions: { parse: [] } });
  } catch { /* History and status remain persisted in MongoDB. */ }
}

async function joinGiveaway(interaction) {
  const messageId = interaction.customId.split(':').at(-1);
  const giveaway = await Giveaway.findOne({ guildId: interaction.guildId, messageId, status: 'active', endsAt: { $gt: new Date() } }).lean();
  if (!giveaway) { await interaction.reply({ content: 'Este sorteio foi encerrado.', ephemeral: true }); return true; }
  if (giveaway.requiredRoleId && !interaction.member.roles.cache.has(giveaway.requiredRoleId)) { await interaction.reply({ content: 'Você precisa do cargo <@&' + giveaway.requiredRoleId + '> para participar.', ephemeral: true, allowedMentions: { parse: [] } }); return true; }
  const result = await Giveaway.updateOne({ _id: giveaway._id, status: 'active', entrants: { $ne: interaction.user.id } }, { $addToSet: { entrants: interaction.user.id } });
  if (result.modifiedCount) {
    const latest = await Giveaway.findById(giveaway._id).lean();
    try { await interaction.message.edit({ embeds: [giveawayEmbed(latest)], allowedMentions: { parse: [] } }); } catch { /* Entry is already stored. */ }
  }
  await interaction.reply({ content: result.modifiedCount ? 'Sua participação foi registrada.' : 'Você já está participando deste sorteio.', ephemeral: true });
  return true;
}

async function handleAdminInteraction(interaction) {
  const id = interaction.customId || '';
  if (id.startsWith('giveaway:join:')) return joinGiveaway(interaction);
  if (!id.startsWith('embed:')) return false;
  const [, token, ...parts] = id.split(':');
  const action = parts.join(':');
  const session = EDIT_SESSIONS.get(token);
  if (!session || session.guildId !== interaction.guildId || session.ownerId !== interaction.user.id) {
    await interaction.reply({ content: 'Esta sessão do editor expirou ou pertence a outra pessoa.', ephemeral: true }); return true;
  }
  if (interaction.isButton() && ['title', 'body', 'color', 'save', 'add:text', 'add:section', 'add:thumbnail', 'add:link'].includes(action)) {
    const fields = action === 'title' ? [textInput('value', 'Título', session.title, { maxLength: 256 })]
      : action === 'body' ? [textInput('value', 'Texto da mensagem', session.body, { paragraph: true, maxLength: 1800 })]
        : action === 'color' ? [textInput('value', 'Cor HEX · ex. #9D174D', session.color, { maxLength: 7 })]
          : action === 'save' ? [textInput('name', 'Nome do template', '', { maxLength: 50, required: true })]
            : action === 'add:link' ? [textInput('label', 'Texto do botão', '', { maxLength: 80, required: true }), textInput('url', 'Destino HTTPS', '', { maxLength: 500, required: true })]
              : action === 'add:thumbnail' ? [textInput('url', 'Thumbnail HTTPS', session.imageUrl, { maxLength: 500, required: true })]
                : [textInput('value', action === 'add:section' ? 'Texto da Section' : 'Texto do componente', '', { paragraph: true, maxLength: 1000, required: true })];
    const modal = new ModalBuilder().setCustomId('embed:' + token + ':modal:' + action.replace(':', '-')).setTitle(action === 'save' ? 'Salvar template' : action.startsWith('add:') ? 'Adicionar elemento' : 'Editar mensagem').addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
    await interaction.showModal(modal); return true;
  }
  if (interaction.isModalSubmit()) {
    await interaction.deferUpdate();
    const value = action === 'modal:save' || action === 'modal:add-link' ? '' : interaction.fields.getTextInputValue('value');
    if (action === 'modal:title') session.title = value;
    else if (action === 'modal:body') session.body = value;
    else if (action === 'modal:color') { if (!/^#[\da-f]{6}$/i.test(value)) throw new RangeError('Use uma cor HEX com seis dígitos.'); session.color = value.toUpperCase(); }
    else if (action === 'modal:add-text') session.elements.push({ type: 'text', content: value });
    else if (action === 'modal:add-section') session.elements.push({ type: 'section', content: value, thumbnailUrl: session.imageUrl || '' });
    else if (action === 'modal:add-thumbnail') {
      if (!/^https:\/\//i.test(value)) throw new RangeError('A imagem precisa usar HTTPS.');
      if (isTemporaryDiscordAttachment(value)) throw new RangeError('Anexos temporários do Discord devem ser enviados ao Blob antes de serem usados.');
      session.imageUrl = value; session.imageObjectId = '';
    }
    else if (action === 'modal:add-link') {
      const label = interaction.fields.getTextInputValue('label').trim(); const url = interaction.fields.getTextInputValue('url').trim();
      if (!/^https:\/\//i.test(url)) throw new RangeError('O botão precisa apontar para uma URL HTTPS.');
      if (session.elements.filter((item) => item.type === 'link').length >= 5) throw new RangeError('O Discord permite até cinco botões de link nesta mensagem.');
      session.elements.push({ type: 'link', label, url });
    } else if (action === 'modal:save') {
      const name = interaction.fields.getTextInputValue('name').trim();
      if (!name || name.length > 50) throw new RangeError('O nome precisa ter de 1 a 50 caracteres.');
      await saveTemplate(session.guildId, name, { mode: session.mode, title: session.title, body: session.body, color: session.color, imageUrl: session.imageUrl, imageObjectId: session.imageObjectId, elements: session.elements }, interaction.user.id);
    }
    await updateEditor(interaction, token, session); return true;
  }
  if (interaction.isAnySelectMenu()) {
    await interaction.deferUpdate();
    if (action === 'element') session.selectedIndex = Math.min(session.elements.length - 1, Number(interaction.values[0]) || 0);
    await updateEditor(interaction, token, session); return true;
  }
  if (!interaction.isButton()) return true;
  await interaction.deferUpdate();
  if (action === 'mode') session.mode = session.mode === 'v2' ? 'embed' : 'v2';
  else if (action === 'add:separator') session.elements.push({ type: 'separator' });
  else if (action === 'add:gallery') { if (!session.imageUrl) throw new RangeError('Envie uma imagem ao abrir o editor ou adicione um thumbnail HTTPS.'); session.elements.push({ type: 'gallery', url: session.imageUrl, description: session.title || 'Imagem da Kiryu' }); }
  else if (action === 'move:up' || action === 'move:down') {
    const current = session.selectedIndex; const target = action.endsWith('up') ? current - 1 : current + 1;
    if (target >= 0 && target < session.elements.length) [session.elements[current], session.elements[target]] = [session.elements[target], session.elements[current]];
    session.selectedIndex = Math.max(0, Math.min(target, session.elements.length - 1));
  } else if (action === 'duplicate' && session.elements[session.selectedIndex]) session.elements.splice(session.selectedIndex + 1, 0, { ...session.elements[session.selectedIndex] });
  else if (action === 'remove' && session.elements[session.selectedIndex]) session.elements.splice(session.selectedIndex, 1);
  else if (action === 'preview') {
    const payload = editorPreview(session);
    await interaction.followUp({ ...payload, flags: (payload.flags || 0) | MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } else if (action === 'publish') {
    const channel = await interaction.guild.channels.fetch(session.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new RangeError('O canal escolhido não está disponível.');
    let message;
    if (session.messageId) {
      message = await channel.messages.fetch(session.messageId).catch(() => null);
      if (!message) throw new RangeError('A mensagem gerenciada não está mais disponível.');
      await message.edit({ ...editorPreview(session), allowedMentions: { parse: [] } });
    } else message = await publishPayload(channel, editorPreview(session));
    await persistManagedMessage({ guildId: session.guildId, channelId: channel.id, messageId: message.id, actorId: interaction.user.id, payload: editorSessionPayload(session) });
    await audit(interaction, session.messageId ? 'embed_edit' : 'embed_publish', '', session.title, { messageId: message.id, channelId: channel.id, mode: session.mode });
    EDIT_SESSIONS.delete(token);
    await interaction.editReply({ components: [createContainer('## ' + (session.messageId ? 'Mensagem atualizada' : 'Mensagem publicada') + '\nCanal: <#' + channel.id + '> · ID: `' + message.id + '`', [], config.visual.success)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    return true;
  }
  await updateEditor(interaction, token, session);
  return true;
}

async function runCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'embed') { assertPermission(interaction, PermissionFlagsBits.ManageMessages, 'Gerenciar mensagens'); return executeEmbed(interaction); }
  if (name === 'giveaway') return runGiveaway(interaction);
  return executeModeration(interaction, name);
}

function makeCommand(name) { return { data: commandData[name], execute: runCommand, deferEphemeral: true }; }
Object.assign(require('./communityCommands').commandInfo, commandInfo);
module.exports = { commandData, commandInfo, makeCommand, runCommand, handleAdminInteraction, EDIT_SESSIONS, audit, fetchTargetMember, giveawayEmbed, joinGiveaway, editorPreview };
