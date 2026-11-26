const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder,
  StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { randomInt } = require('node:crypto');
const QRCode = require('qrcode');
const { Reminder, CommunityPoll, AfkStatus, GuildConfig } = require('../database');
const { getGuildConfig } = require('./xpService');
const { replyV2 } = require('./components');
const { parseDiceExpression } = require('./dice');
const { calculate } = require('./mathExpression');
const { complete } = require('./aiGateway');
const config = require('../config');
const metrics = require('./performanceMetrics');

const commandData = {};
const commandInfo = {};
function register(name, description, builder, category = 'Ferramentas gerais', permission = null) {
  let data = new SlashCommandBuilder().setName(name).setDescription(description);
  if (permission) data.setDefaultMemberPermissions(permission);
  if (builder) data = builder(data) || data;
  commandData[name] = data;
  commandInfo[name] = { category, permission };
  return data;
}
const userOption = (option, required = false) => option.setName('member').setDescription('Membro do servidor').setRequired(required);
const codeBlock = (value) => String(value || '').replace(/`/g, 'ˋ');
function timestamp(date) { return '<t:' + Math.floor(date.getTime() / 1000) + ':F>'; }
function createEmbed(title, description = '') {
  return new EmbedBuilder().setColor(config.visual.brand).setTitle(title).setDescription(description || null)
    .setFooter({ text: 'Kiryu · Developer by Krieg.js' }).setTimestamp(new Date());
}
async function sendEmbed(interaction, embed, { ephemeral = false, rows = [] } = {}) {
  const payload = { embeds: [embed], components: rows, allowedMentions: { parse: [] }, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply(payload);
}

register('avatar', 'Visualiza o avatar global ou do servidor.', (data) => data
  .addUserOption((option) => option.setName('member').setDescription('Membro para visualizar').setRequired(false))
  .addBooleanOption((option) => option.setName('server').setDescription('Priorizar o avatar personalizado do servidor').setRequired(false)), 'Informações');
register('banner', 'Visualiza o banner de um usuário.', (data) => data.addUserOption((option) => option.setName('member').setDescription('Usuário para visualizar').setRequired(false)), 'Informações');
register('userinfo', 'Exibe informações detalhadas de um membro.', (data) => data.addUserOption((option) => userOption(option, false)), 'Informações');
register('serverinfo', 'Exibe informações e datas importantes do servidor.', null, 'Informações');
register('roleinfo', 'Exibe detalhes de um cargo.', (data) => data.addRoleOption((option) => option.setName('role').setDescription('Cargo para consultar').setRequired(true)), 'Informações');
register('channelinfo', 'Exibe detalhes de um canal.', (data) => data.addChannelOption((option) => option.setName('channel').setDescription('Canal para consultar').setRequired(false)), 'Informações');
register('emojiinfo', 'Exibe informações e uma prévia de emoji.', (data) => data.addStringOption((option) => option.setName('emoji').setDescription('Emoji ou ID do emoji').setRequired(true).setMaxLength(100)), 'Informações');
register('stickerinfo', 'Exibe informações de uma figurinha do servidor.', (data) => data.addStringOption((option) => option.setName('sticker_id').setDescription('ID da figurinha').setRequired(true).setMaxLength(30)), 'Informações');
register('botinfo', 'Exibe informações da Kiryu.', null, 'Informações');
register('ping', 'Mede a latência da Kiryu e a disponibilidade dos serviços.', null, 'Informações');
register('uptime', 'Exibe o tempo de atividade da Kiryu.', null, 'Informações');
register('membercount', 'Exibe a quantidade de membros do servidor.', null, 'Informações');
register('help', 'Abre a central navegável de comandos.', null, 'Informações');

register('remind', 'Cria e gerencia seus lembretes.', (data) => data
  .addSubcommand((sub) => sub.setName('create').setDescription('Criar um lembrete').addStringOption((option) => option.setName('in').setDescription('Quando lembrar: 10m, 2h, 3d').setRequired(true).setMaxLength(24)).addStringOption((option) => option.setName('text').setDescription('O que devo lembrar?').setRequired(true).setMaxLength(1000)))
  .addSubcommand((sub) => sub.setName('list').setDescription('Consultar seus lembretes pendentes'))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancelar um lembrete').addStringOption((option) => option.setName('id').setDescription('ID mostrado em /remind list').setRequired(true).setMaxLength(24))), 'Ferramentas gerais');
register('timestamp', 'Gera timestamps nativos do Discord.', (data) => data
  .addStringOption((option) => option.setName('date').setDescription('Data ISO 8601; em branco usa agora').setRequired(false).setMaxLength(40))
  .addStringOption((option) => option.setName('style').setDescription('Formato de exibição').setRequired(false).addChoices({ name: 'Data e hora completas', value: 'F' }, { name: 'Data curta', value: 'd' }, { name: 'Hora curta', value: 't' }, { name: 'Relativo', value: 'R' })), 'Ferramentas gerais');
register('poll', 'Cria ou encerra uma enquete interativa.', (data) => data
  .addSubcommand((sub) => sub.setName('create').setDescription('Criar uma enquete').addStringOption((option) => option.setName('question').setDescription('Pergunta').setRequired(true).setMaxLength(240)).addStringOption((option) => option.setName('options').setDescription('Opções separadas por vírgula · até 5').setRequired(true).setMaxLength(400)).addStringOption((option) => option.setName('duration').setDescription('Duração opcional: 10m, 2h, 1d').setRequired(false).setMaxLength(24)).addBooleanOption((option) => option.setName('anonymous').setDescription('Ocultar publicamente quem votou').setRequired(false)))
  .addSubcommand((sub) => sub.setName('close').setDescription('Encerrar uma enquete criada por você').addStringOption((option) => option.setName('message_id').setDescription('ID da mensagem da enquete').setRequired(true).setMaxLength(30))), 'Ferramentas gerais');
register('random', 'Gera um número aleatório entre dois limites.', (data) => data.addIntegerOption((option) => option.setName('min').setDescription('Menor número').setRequired(true).setMinValue(-1000000000).setMaxValue(1000000000)).addIntegerOption((option) => option.setName('max').setDescription('Maior número').setRequired(true).setMinValue(-1000000000).setMaxValue(1000000000)), 'Ferramentas gerais');
register('calculate', 'Resolve uma expressão matemática simples.', (data) => data.addStringOption((option) => option.setName('expression').setDescription('Ex.: (12 + 3) * 4 / 2').setRequired(true).setMaxLength(80)), 'Ferramentas gerais');
register('translate', 'Traduz um texto usando o Gateway de IA da Square Cloud.', (data) => data.addStringOption((option) => option.setName('text').setDescription('Texto para traduzir').setRequired(true).setMaxLength(1800)).addStringOption((option) => option.setName('to').setDescription('Idioma de destino').setRequired(true).setMaxLength(60)).addStringOption((option) => option.setName('from').setDescription('Idioma de origem ou auto').setRequired(false).setMaxLength(60)), 'Ferramentas gerais');
register('color', 'Visualiza e converte uma cor HEX ou RGB.', (data) => data.addStringOption((option) => option.setName('value').setDescription('Ex.: #C0265A ou rgb(192, 38, 90)').setRequired(true).setMaxLength(40)).addStringOption((option) => option.setName('format').setDescription('Formato para mostrar').setRequired(false).addChoices({ name: 'HEX', value: 'hex' }, { name: 'RGB', value: 'rgb' }, { name: 'HSL', value: 'hsl' })), 'Ferramentas gerais');
register('qr', 'Gera um QR Code para um texto ou endereço.', (data) => data.addStringOption((option) => option.setName('content').setDescription('Texto ou URL (até 500 caracteres)').setRequired(true).setMaxLength(500)), 'Ferramentas gerais');
register('afk', 'Define ou remove seu estado de ausência temporária.', (data) => data.addStringOption((option) => option.setName('message').setDescription('Motivo exibido ao ser mencionado; vazio remove').setRequired(false).setMaxLength(240)), 'Ferramentas gerais');
Object.assign(commandInfo, {
  choose: { category: 'Ferramentas gerais', permission: null },
  coinflip: { category: 'Ferramentas gerais', permission: null },
  dice: { category: 'Ferramentas gerais', permission: null },
  casino: { category: 'Economia', permission: null },
  config: { category: 'Administração', permission: PermissionFlagsBits.ManageGuild },
  xp: { category: 'Economia', permission: null }, money: { category: 'Economia', permission: null },
  orbs: { category: 'Economia', permission: null }, shop: { category: 'Economia', permission: null },
  inventory: { category: 'Economia', permission: null }, daily: { category: 'Economia', permission: null },
  work: { category: 'Economia', permission: null }, rewards: { category: 'Economia', permission: null },
  ranking: { category: 'Informações', permission: null }, profile: { category: 'Informações', permission: null },
  'profile-edit': { category: 'Ferramentas gerais', permission: null }, badges: { category: 'Administração', permission: PermissionFlagsBits.ManageGuild },
});

function parseDuration(value, { maxDays = 365, allowZero = false } = {}) {
  const match = String(value || '').trim().match(/^(\d{1,7})(s|m|h|d)$/i);
  if (!match) throw new RangeError('Use uma duração como 10m, 2h ou 3d.');
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  const milliseconds = amount * multiplier;
  if ((!allowZero && milliseconds <= 0) || milliseconds > maxDays * 86_400_000) throw new RangeError('A duração precisa estar entre 1 unidade e ' + maxDays + ' dias.');
  return milliseconds;
}

function parseColor(value) {
  const input = String(value || '').trim();
  let rgb;
  if (/^#?[0-9a-f]{6}$/i.test(input)) { const raw = input.replace('#', ''); rgb = [0, 2, 4].map((index) => Number.parseInt(raw.slice(index, index + 2), 16)); }
  else { const match = input.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i); if (match) rgb = match.slice(1).map(Number); }
  if (!rgb || rgb.some((channel) => channel < 0 || channel > 255)) throw new RangeError('Informe uma cor HEX de 6 dígitos ou rgb(r, g, b).');
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h = (Math.round(h * 60) + 360) % 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  const hex = '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
  return { rgb: rgb.map((channel) => Math.round(channel * 255)), hex, hsl: 'hsl(' + h + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)', integer: Number.parseInt(hex.slice(1), 16) };
}

async function helpPage(interaction, category = 'Informações', client = interaction.client) {
  const permitted = (info) => !info.permission || interaction.memberPermissions?.has(info.permission);
  const groups = ['Informações', 'Ferramentas gerais', 'Administração', 'Economia'];
  const options = groups.filter((group) => Object.entries(commandInfo).some(([name, info]) => info.category === group && permitted(info)))
    .map((group) => ({ label: group, value: group, default: group === category }));
  const visible = [...client.commands.values()].filter((command) => commandInfo[command.data.name]?.category === category && permitted(commandInfo[command.data.name]));
  const listing = visible.length ? visible.map((command) => '• **/' + command.data.name + '** — ' + command.data.description).join('\n') : 'Nenhum comando disponível nesta categoria.';
  const menu = new StringSelectMenuBuilder().setCustomId('help:category:' + interaction.user.id).setPlaceholder('Escolher categoria').addOptions(options);
  return replyV2(interaction, '# Central de comandos\nA lista acompanha os comandos disponíveis para suas permissões.\n\n' + listing, { ephemeral: true, rows: [new ActionRowBuilder().addComponents(menu)] });
}

async function createPoll(interaction) {
  const guildConfig = await getGuildConfig(interaction.guildId);
  if (guildConfig.utilities?.pollsEnabled === false) throw new RangeError('As enquetes estão desativadas neste servidor.');
  const question = interaction.options.getString('question', true).trim();
  const options = interaction.options.getString('options', true).split(',').map((value) => value.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 5 || options.some((value) => value.length > 80) || new Set(options.map((value) => value.toLocaleLowerCase())).size !== options.length) throw new RangeError('Informe de 2 a 5 opções distintas, com até 80 caracteres cada.');
  const durationText = interaction.options.getString('duration');
  const closesAt = durationText ? new Date(Date.now() + parseDuration(durationText, { maxDays: 30 })) : null;
  const anonymous = interaction.options.getBoolean('anonymous') || false;
  const embed = createEmbed('📊 ' + question, options.map((label, index) => (index + 1) + '. **' + label + '** · 0 votos').join('\n') + (closesAt ? '\n\nEncerra ' + timestamp(closesAt) : '')).setColor(config.visual.orbs);
  const message = await interaction.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  await CommunityPoll.create({ guildId: interaction.guildId, channelId: interaction.channelId, messageId: message.id, creatorId: interaction.user.id, question, options, anonymous, closesAt });
  const buttons = options.map((label, index) => new ButtonBuilder().setCustomId('poll:vote:' + message.id + ':' + index).setLabel(label.slice(0, 80)).setStyle(index === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary));
  await message.edit({ components: [new ActionRowBuilder().addComponents(buttons)] });
  return replyV2(interaction, 'Enquete publicada em <#' + interaction.channelId + '>.', { ephemeral: true });
}

async function closePoll(interaction) {
  const messageId = interaction.options.getString('message_id', true);
  const poll = await CommunityPoll.findOneAndUpdate({ guildId: interaction.guildId, messageId, creatorId: interaction.user.id, status: 'open' }, { $set: { status: 'closed' } }, { new: true }).lean();
  if (!poll) throw new RangeError('Enquete aberta não encontrada ou você não a criou.');
  const { pollSummary } = require('./persistentTasks');
  const channel = await interaction.guild.channels.fetch(poll.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(messageId).catch(() => null);
  if (message) await message.edit({ content: pollSummary(poll), embeds: [], components: [], allowedMentions: { parse: [] } });
  await CommunityPoll.updateOne({ _id: poll._id, status: 'closed', resultPostedAt: null }, { $set: { resultPostedAt: new Date() } });
  return replyV2(interaction, 'Enquete encerrada.', { ephemeral: true });
}

async function runCommand(interaction, client) {
  const name = interaction.commandName;
  const started = metrics.performance.now();
  try {
    if (name === 'avatar') {
      const user = interaction.options.getUser('member') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const server = interaction.options.getBoolean('server');
      const url = (server ? member?.displayAvatarURL({ extension: 'png', size: 1024 }) : null) || user.displayAvatarURL({ extension: 'png', size: 1024 });
      return sendEmbed(interaction, createEmbed((user.globalName || user.username) + ' · Avatar', '[Abrir avatar global](' + user.displayAvatarURL({ extension: 'png', size: 1024 }) + ')' + (member?.displayAvatarURL() ? ' · [Abrir avatar do servidor](' + member.displayAvatarURL({ extension: 'png', size: 1024 }) + ')' : '')).setImage(url));
    }
    if (name === 'banner') {
      const user = interaction.options.getUser('member') || interaction.user;
      const fetched = await user.fetch().catch(() => user);
      if (!fetched.banner) throw new RangeError('Esse usuário ainda não definiu um banner.');
      return sendEmbed(interaction, createEmbed((fetched.globalName || fetched.username) + ' · Banner', '[Abrir banner](' + fetched.bannerURL({ extension: 'png', size: 1024 }) + ')').setImage(fetched.bannerURL({ extension: 'png', size: 1024 })));
    }
    if (name === 'userinfo') {
      const user = interaction.options.getUser('member') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const created = user.createdAt; const joined = member?.joinedAt;
      const roles = member ? member.roles.cache.filter((role) => role.id !== interaction.guild.id).sort((a, b) => b.position - a.position).map((role) => '<@&' + role.id + '>').slice(0, 12).join(', ') || 'Nenhum cargo' : 'Membro não está no servidor';
      const embed = createEmbed((user.globalName || user.username) + ' · Informações').setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }))
        .addFields({ name: 'Usuário', value: '<@' + user.id + '> · `' + user.username + '`', inline: true }, { name: 'ID', value: '`' + user.id + '`', inline: true }, { name: 'Conta criada', value: timestamp(created) + '\n<t:' + Math.floor(created.getTime() / 1000) + ':R>', inline: true });
      if (member) embed.addFields({ name: 'Entrou no servidor', value: timestamp(joined), inline: true }, { name: 'Cargo mais alto', value: member.roles.highest.name, inline: true }, { name: 'Cargos', value: roles.slice(0, 1024) });
      return sendEmbed(interaction, embed);
    }
    if (name === 'serverinfo') {
      const guild = interaction.guild;
      const owner = await guild.fetchOwner().catch(() => null);
      const created = guild.createdAt;
      const embed = createEmbed(guild.name + ' · Informações', guild.description || 'Comunidade do Eternity Realms.').setThumbnail(guild.iconURL({ extension: 'png', size: 512 }))
        .addFields({ name: 'ID', value: '`' + guild.id + '`', inline: true }, { name: 'Proprietário', value: owner ? '<@' + owner.id + '>' : 'Indisponível', inline: true }, { name: 'Criado', value: timestamp(created) + '\n<t:' + Math.floor(created.getTime() / 1000) + ':R>', inline: true }, { name: 'Membros', value: (guild.memberCount || 0).toLocaleString('pt-BR'), inline: true }, { name: 'Canais', value: guild.channels.cache.size.toLocaleString('pt-BR'), inline: true }, { name: 'Cargos', value: guild.roles.cache.size.toLocaleString('pt-BR'), inline: true }, { name: 'Boosts', value: (guild.premiumSubscriptionCount || 0).toLocaleString('pt-BR') + ' · nível ' + guild.premiumTier, inline: true });
      return sendEmbed(interaction, embed);
    }
    if (name === 'roleinfo') {
      const role = interaction.options.getRole('role', true);
      const embed = createEmbed(role.name + ' · Cargo').addFields({ name: 'ID', value: '`' + role.id + '`', inline: true }, { name: 'Cor', value: role.hexColor.toUpperCase(), inline: true }, { name: 'Membros', value: role.members.size.toLocaleString('pt-BR'), inline: true }, { name: 'Criado', value: timestamp(role.createdAt), inline: true }, { name: 'Posição', value: String(role.position), inline: true }, { name: 'Menção', value: '<@&' + role.id + '>', inline: true }, { name: 'Permissões principais', value: ['Administrator', 'ManageGuild', 'ManageMessages', 'KickMembers', 'BanMembers', 'ModerateMembers'].filter((key) => role.permissions.has(PermissionFlagsBits[key])).join(', ') || 'Nenhuma privilegiada' });
      return sendEmbed(interaction, embed);
    }
    if (name === 'channelinfo') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const embed = createEmbed(channel.name + ' · Canal').addFields({ name: 'ID', value: '`' + channel.id + '`', inline: true }, { name: 'Tipo', value: String(channel.type), inline: true }, { name: 'Criado', value: timestamp(channel.createdAt || new Date()), inline: true });
      if (channel.parent) embed.addFields({ name: 'Categoria', value: channel.parent.name, inline: true });
      if ('topic' in channel && channel.topic) embed.addFields({ name: 'Tópico', value: channel.topic.slice(0, 1024) });
      if ('rateLimitPerUser' in channel) embed.addFields({ name: 'Modo lento', value: channel.rateLimitPerUser + ' s', inline: true });
      return sendEmbed(interaction, embed);
    }
    if (name === 'emojiinfo') {
      const raw = interaction.options.getString('emoji', true).trim();
      const id = raw.match(/(?:<a?:\w+:(\d+)>|(\d{17,20}))/)?.slice(1).find(Boolean);
      const emoji = id ? interaction.guild.emojis.cache.get(id) || await interaction.guild.emojis.fetch(id).catch(() => null) : interaction.guild.emojis.cache.find((item) => item.name?.toLowerCase() === raw.replace(/^:|:$/g, '').toLowerCase());
      if (!emoji) throw new RangeError('Emoji não encontrado neste servidor.');
      const url = emoji.imageURL({ extension: 'png', size: 256 });
      return sendEmbed(interaction, createEmbed(':' + emoji.name + ': · Emoji', '<' + (emoji.animated ? 'a' : '') + ':' + emoji.name + ':' + emoji.id + '> · [Abrir imagem](' + url + ')').setImage(url).addFields({ name: 'ID', value: '`' + emoji.id + '`', inline: true }, { name: 'Criado', value: timestamp(emoji.createdAt), inline: true }, { name: 'Gerenciado', value: emoji.managed ? 'Sim' : 'Não', inline: true }));
    }
    if (name === 'stickerinfo') {
      const id = interaction.options.getString('sticker_id', true);
      const sticker = interaction.guild.stickers.cache.get(id) || await interaction.guild.stickers.fetch(id).catch(() => null);
      if (!sticker) throw new RangeError('Figurinha não encontrada neste servidor.');
      return sendEmbed(interaction, createEmbed(sticker.name + ' · Figurinha', sticker.description || 'Sem descrição.').setThumbnail(sticker.url).addFields({ name: 'ID', value: '`' + sticker.id + '`', inline: true }, { name: 'Formato', value: String(sticker.format), inline: true }, { name: 'Criado', value: timestamp(sticker.createdAt), inline: true }));
    }
    if (name === 'botinfo') {
      const dbState = require('mongoose').connection.readyState === 1 ? 'Conectado' : 'Desconectado';
      return sendEmbed(interaction, createEmbed('Kiryu · Bot comunitário', 'Uma guia para as jornadas de Eternity Realms.')
        .setThumbnail(client.user.displayAvatarURL({ extension: 'png', size: 256 }))
        .addFields({ name: 'Versão', value: require('../../package.json').version, inline: true }, { name: 'Comandos', value: client.commands.size.toLocaleString('pt-BR'), inline: true }, { name: 'Discord.js', value: require('discord.js').version, inline: true }, { name: 'MongoDB', value: dbState, inline: true }, { name: 'Armazenamento Blob', value: process.env.SQUARECLOUD_API_KEY ? 'Configurado' : 'Indisponível', inline: true }));
    }
    if (name === 'ping') {
      const dbState = require('mongoose').connection.readyState === 1 ? 'Conectado' : 'Desconectado';
      const observed = metrics.snapshot();
      const average = (prefix) => {
        const entries = Object.entries(observed).filter(([key]) => key.startsWith(prefix));
        if (!entries.length) return 'sem amostra recente';
        const count = entries.reduce((sum, [, value]) => sum + value.count, 0);
        const total = entries.reduce((sum, [, value]) => sum + value.total, 0);
        return Math.round(total / Math.max(1, count)) + ' ms média';
      };
      const embed = createEmbed('Sinal da Kiryu', 'Discord Gateway: **' + Math.max(0, Math.round(client.ws.ping)) + ' ms**\nMongoDB: **' + dbState + '** · ' + average('mongo:') + '\nSquare Cloud Blob: **' + (process.env.SQUARECLOUD_API_KEY ? average('blob:') : 'não configurado') + '**\nGateway de IA: **' + average('ai.request:') + '**');
      return sendEmbed(interaction, embed);
    }
    if (name === 'uptime') {
      const ms = Number(client.uptime || process.uptime() * 1000);
      const parts = []; let remaining = Math.floor(ms / 1000);
      for (const [label, seconds] of [['d', 86400], ['h', 3600], ['min', 60], ['s', 1]]) { const value = Math.floor(remaining / seconds); if (value) parts.push(value + label); remaining %= seconds; }
      return replyV2(interaction, '# Kiryu em atividade\nOnline há **' + (parts.join(' ') || 'menos de 1s') + '** · <t:' + Math.floor((Date.now() - ms) / 1000) + ':R>.');
    }
    if (name === 'membercount') {
      const guild = interaction.guild;
      return sendEmbed(interaction, createEmbed(guild.name + ' · Membros', 'Total: **' + guild.memberCount.toLocaleString('pt-BR') + '**\nEm cache: **' + guild.members.cache.size.toLocaleString('pt-BR') + '**\nBots em cache: **' + guild.members.cache.filter((member) => member.user.bot).size.toLocaleString('pt-BR') + '**'));
    }
    if (name === 'help') return helpPage(interaction, 'Informações', client);
    if (name === 'remind') {
      const subcommand = interaction.options.getSubcommand();
      const guildConfig = await getGuildConfig(interaction.guildId);
      if (guildConfig.utilities?.remindersEnabled === false) throw new RangeError('Os lembretes estão desativados neste servidor.');
      if (subcommand === 'create') {
        const duration = parseDuration(interaction.options.getString('in', true), { maxDays: guildConfig.utilities?.maxReminderDays || 365 });
        const count = await Reminder.countDocuments({ guildId: interaction.guildId, userId: interaction.user.id, status: { $in: ['queued', 'sending'] } });
        if (count >= (guildConfig.utilities?.maxRemindersPerMember || 20)) throw new RangeError('Você já atingiu seu limite de lembretes pendentes.');
        const reminder = await Reminder.create({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, text: interaction.options.getString('text', true), dueAt: new Date(Date.now() + duration) });
        return replyV2(interaction, 'Lembrete **' + reminder._id.toString().slice(-8) + '** criado para ' + timestamp(reminder.dueAt) + '.', { ephemeral: true });
      }
      if (subcommand === 'list') {
        const reminders = await Reminder.find({ guildId: interaction.guildId, userId: interaction.user.id, status: { $in: ['queued', 'sending'] } }).sort({ dueAt: 1 }).limit(20).lean();
        return replyV2(interaction, '# Seus lembretes\n' + (reminders.length ? reminders.map((item) => '• `' + String(item._id).slice(-8) + '` · ' + timestamp(item.dueAt) + ' · ' + item.text).join('\n') : 'Nenhum lembrete pendente.'), { ephemeral: true });
      }
      const id = interaction.options.getString('id', true);
      const pending = await Reminder.find({ guildId: interaction.guildId, userId: interaction.user.id, status: { $in: ['queued', 'sending'] } }).sort({ dueAt: 1 }).limit(100).lean();
      const reminder = pending.find((item) => String(item._id).endsWith(id));
      if (!reminder) throw new RangeError('Lembrete pendente não encontrado.');
      await Reminder.updateOne({ _id: reminder._id, status: { $in: ['queued', 'sending'] } }, { $set: { status: 'cancelled', leaseUntil: null } });
      return replyV2(interaction, 'Lembrete cancelado.', { ephemeral: true });
    }
    if (name === 'timestamp') {
      const input = interaction.options.getString('date');
      const date = input ? new Date(input) : new Date();
      if (Number.isNaN(date.getTime())) throw new RangeError('Informe uma data ISO 8601 válida, como 2026-11-25T18:30:00-03:00.');
      const epoch = Math.floor(date.getTime() / 1000);
      const style = interaction.options.getString('style') || 'F';
      return replyV2(interaction, '# Timestamps do Discord\nData: ' + timestamp(date) + '\nRelativo: <t:' + epoch + ':R>\n\n`<t:' + epoch + ':' + style + '> · <t:' + epoch + ':F> · <t:' + epoch + ':f> · <t:' + epoch + ':D> · <t:' + epoch + ':d> · <t:' + epoch + ':T> · <t:' + epoch + ':t> · <t:' + epoch + ':R>`', { ephemeral: true });
    }
    if (name === 'poll') {
      if (interaction.options.getSubcommand() === 'create') return createPoll(interaction);
      return closePoll(interaction);
    }
    if (name === 'random') {
      const min = interaction.options.getInteger('min', true), max = interaction.options.getInteger('max', true);
      if (min > max) throw new RangeError('O mínimo não pode ser maior que o máximo.');
      return replyV2(interaction, '🎲 Sorteado: **' + randomInt(min, max + 1).toLocaleString('pt-BR') + '**');
    }
    if (name === 'calculate') {
      const expression = interaction.options.getString('expression', true);
      return replyV2(interaction, '# Calculadora\n`' + codeBlock(expression) + '` = **' + calculate(expression).toLocaleString('pt-BR', { maximumFractionDigits: 8 }) + '**');
    }
    if (name === 'translate') {
      const guildConfig = await getGuildConfig(interaction.guildId);
      const ai = guildConfig.ai || {};
      const result = await complete({ guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, kind: 'translate', messages: [
        { role: 'system', content: 'Traduza o conteúdo do usuário para o idioma indicado. Preserve sentido, nomes próprios, emojis e formatação. Responda somente com a tradução.' },
        { role: 'user', content: 'Idioma de origem: ' + (interaction.options.getString('from') || 'detectar automaticamente') + '\nIdioma de destino: ' + interaction.options.getString('to', true) + '\n\n' + interaction.options.getString('text', true) },
      ], settings: { ...ai, maxCompletionTokens: Math.min(Number(ai.maxCompletionTokens || 800), 1200), timeoutMs: ai.timeoutMs || 30000 } });
      if (!result.ok) throw new RangeError(result.status === 'limited' ? 'O limite de uso da IA foi atingido. Tente novamente amanhã.' : 'O Gateway de IA está indisponível no momento.');
      return replyV2(interaction, '# Tradução\n' + result.content.slice(0, 1900), { ephemeral: true });
    }
    if (name === 'color') {
      const color = parseColor(interaction.options.getString('value', true));
      const format = interaction.options.getString('format') || 'hex';
      const value = format === 'rgb' ? 'rgb(' + color.rgb.join(', ') + ')' : format === 'hsl' ? color.hsl : color.hex;
      return sendEmbed(interaction, createEmbed('Amostra da cor', '**' + color.hex + '**\nRGB: ' + color.rgb.join(', ') + '\nHSL: ' + color.hsl).setColor(color.integer).addFields({ name: 'Formato escolhido', value }));
    }
    if (name === 'qr') {
      const content = interaction.options.getString('content', true);
      const buffer = await QRCode.toBuffer(content, { type: 'png', width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#21121E', light: '#FFFFFF' } });
      return interaction.editReply({ content: 'QR Code gerado. Aponte a câmera para acessar o conteúdo.', files: [new AttachmentBuilder(buffer, { name: 'kiryu-qr.png' })], allowedMentions: { parse: [] } });
    }
    if (name === 'afk') {
      const guildConfig = await getGuildConfig(interaction.guildId);
      if (guildConfig.utilities?.afkEnabled === false) throw new RangeError('O estado de ausência está desativado neste servidor.');
      const message = interaction.options.getString('message') || '';
      if (!message) {
        const deleted = await AfkStatus.deleteOne({ guildId: interaction.guildId, userId: interaction.user.id });
        return replyV2(interaction, deleted.deletedCount ? 'Seu estado de ausência foi removido.' : 'Você não tinha um estado de ausência ativo.', { ephemeral: true });
      }
      await AfkStatus.findOneAndUpdate({ guildId: interaction.guildId, userId: interaction.user.id }, { $set: { message, since: new Date() } }, { upsert: true, new: true });
      return replyV2(interaction, 'Estado de ausência registrado. Quando alguém mencionar você, eu aviso.', { ephemeral: true });
    }
  } finally { metrics.record('command', name, metrics.performance.now() - started); }
  throw new Error('Comando comunitário sem implementação: ' + name);
}

async function handleAfkMessage(message) {
  if (!message.guild || message.author.bot) return;
  const own = await AfkStatus.findOne({ guildId: message.guildId, userId: message.author.id }).lean();
  if (own) {
    await AfkStatus.deleteOne({ guildId: message.guildId, userId: message.author.id });
    await message.reply({ content: 'Bem-vindo de volta! Seu estado de ausência foi removido.', allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
  const mentionedIds = [...message.mentions.users.keys()].filter((id) => id !== message.author.id).slice(0, 10);
  if (!mentionedIds.length) return;
  const statuses = await AfkStatus.find({ guildId: message.guildId, userId: { $in: mentionedIds } }).lean();
  for (const status of statuses) {
    const ago = Math.max(1, Math.floor((Date.now() - new Date(status.since).getTime()) / 60000));
    await message.reply({ content: '<@' + status.userId + '> está ausente há ' + ago + ' min' + (status.message ? ': ' + status.message : '.') , allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
}

async function handleCommunityInteraction(interaction, client) {
  const customId = interaction.customId || '';
  if (customId.startsWith('help:category:')) {
    const ownerId = customId.split(':')[2];
    if (interaction.user.id !== ownerId) { await interaction.reply({ content: 'Abra seu próprio `/help` para navegar.', ephemeral: true }); return true; }
    const category = interaction.values?.[0];
    await interaction.deferUpdate();
    await helpPage(interaction, category, client);
    return true;
  }
  if (customId.startsWith('poll:vote:')) {
    const [, , messageId, rawOption] = customId.split(':');
    const option = Number(rawOption);
    const poll = await CommunityPoll.findOne({ messageId, guildId: interaction.guildId, status: 'open' }).lean();
    if (!poll || !Number.isInteger(option) || option < 0 || option >= poll.options.length || (poll.closesAt && poll.closesAt <= new Date())) {
      await interaction.reply({ content: 'Esta enquete está encerrada ou indisponível.', ephemeral: true }); return true;
    }
    await CommunityPoll.updateOne({ _id: poll._id, status: 'open' }, [{ $set: { votes: { $concatArrays: [{ $filter: { input: '$votes', as: 'vote', cond: { $ne: ['$$vote.userId', interaction.user.id] } } }, [{ userId: interaction.user.id, option }]] } } }]);
    const updated = await CommunityPoll.findById(poll._id).lean();
    if (updated) {
      const counts = updated.options.map((label, index) => ({ label, count: updated.votes.filter((vote) => vote.option === index).length }));
      const embed = createEmbed('📊 ' + updated.question, counts.map((item, index) => (index + 1) + '. **' + item.label + '** · ' + item.count + ' voto(s)').join('\n') + (updated.closesAt ? '\n\nEncerra ' + timestamp(new Date(updated.closesAt)) : '')).setColor(config.visual.orbs);
      if (!updated.anonymous && updated.votes.length) embed.setFooter({ text: 'Kiryu · ' + updated.votes.length + ' voto(s) · Developer by Krieg.js' });
      await interaction.message.edit({ embeds: [embed] }).catch(() => {});
    }
    await interaction.reply({ content: 'Seu voto em **' + poll.options[option] + '** foi registrado.', ephemeral: true });
    return true;
  }
  return false;
}

function makeCommand(name) { return { data: commandData[name], execute: runCommand, deferEphemeral: ['remind', 'translate', 'qr', 'afk', 'poll', 'help'].includes(name) }; }
module.exports = { commandData, commandInfo, makeCommand, runCommand, handleAfkMessage, handleCommunityInteraction, parseDuration, parseColor, helpPage, createEmbed, sendEmbed };
