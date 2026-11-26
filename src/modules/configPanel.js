const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  PermissionFlagsBits,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('./xpService');
const { getSettings } = require('./economyService');
const { configureWork, configureDaily, configureOrbConversion, configureCasino, configureIncome, configureEconomy } = require('./economyAdminService');
const { EconomyItem, EconomyCollectRule, MemberProfile, BadgeDefinition, BlobObject } = require('../database');
const { createCatalogItem, editCatalogItem, createCollectRule, editCollectRule, removeCollectRule } = require('./economyAdminService');
const { deleteCatalogItem } = require('./economyService');
const { normalizeTriggerText } = require('./triggers');
const { createContainer, replyV2, followUpV2 } = require('./components');
const { ORBS, ORB_TYPES } = require('./economyUtils');
const { PALETTES, applyPalette } = require('./appearance');
const { isAuthorized } = require('./permissions');
const { BADGE_CATEGORIES, BADGE_BY_ID } = require('./profileCatalog');
const { handleAIConfigInteraction, showAIHome, showAIPersonality, importPromptAttachment } = require('./aiConfigPanel');
const blobStorage = require('./blobStorage');

const STORAGE_CATEGORIES = ['all', 'profile', 'badge', 'frame', 'cosmetic', 'product', 'casino', 'banner', 'divider', 'design-system', 'trigger', 'other'];
const DESIGN_SYSTEM_NAMES = ['crest', 'xp', 'fragments', 'orbs', 'store', 'casino', 'profile', 'admin', 'orb-red', 'orb-orange', 'orb-green', 'orb-gold', 'orb-blue', 'orb-black', 'divider'];

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(components);
}

function updatePanel(interaction, data) {
  return interaction.deferred ? interaction.editReply(data) : interaction.update(data);
}

function navRow(interaction = null) {
  const sections = [
    { label: 'Experiência e níveis', value: 'xp', description: 'XP, canais e buffs por cargos' },
    { label: 'Permissões', value: 'permissions', description: 'Cargos autorizados a administrar o bot' },
    { label: 'Daily e trabalho', value: 'rewards', description: 'Recompensas e intervalo de trabalho' },
    { label: 'Economia e comércio', value: 'economy', description: 'Limites, mercado, trocas e leilões' },
    { label: 'Lojas e itens', value: 'stores', description: 'Catálogo, preços, estoque e disponibilidade' },
    { label: 'Recompensas por cargo', value: 'rules', description: 'Regras periódicas de coleta por cargo' },
    { label: 'Gatilhos', value: 'triggers', description: 'Respostas automáticas configuráveis' },
    { label: 'Cassino', value: 'casino', description: 'Ativar jogos, apostas e pagamentos' },
    { label: 'Aparência', value: 'appearance', description: 'Paleta visual do servidor' },
    { label: 'Kiryu Intelligence', value: 'ai', description: 'Gateway de IA, personalidade, acesso e utilização' },
    { label: 'Badges especiais', value: 'badges', description: 'Criar, editar e atribuir badges da staff' },
    { label: 'Armazenamento', value: 'storage', description: 'Objetos Blob, referências e consumo' },
    { label: 'Ferramentas utilitárias', value: 'utilities', description: 'Lembretes, enquetes, AFK e limites' },
    { label: 'Moderação e registros', value: 'moderation', description: 'Permissões e canal de logs' },
    { label: 'Sorteios', value: 'giveaways', description: 'Limites, ativação e registros' },
    { label: 'Templates de mensagens', value: 'templates', description: 'Mensagens reutilizáveis salvas no servidor' },
  ];
  const visibleSections = interaction && interaction.user.id !== config.ownerId
    ? sections.filter((section) => ['badges', 'storage', 'utilities', 'moderation', 'giveaways', 'templates'].includes(section.value))
    : sections;
  return row(new StringSelectMenuBuilder()
    .setCustomId('config:nav')
    .setPlaceholder('Abrir seção do painel')
    .addOptions(...visibleSections));
}

function container(text, rows = []) {
  return createContainer(text, rows, config.visual.admin);
}

function channelList(ids) {
  const visible = ids.slice(0, 20).map((id) => '<#' + id + '>');
  if (ids.length > visible.length) visible.push('+' + (ids.length - visible.length) + ' outros');
  return visible.join(', ') || 'nenhum';
}

function frequencyLabel(frequency) {
  return ({ daily: 'diária', weekly: 'semanal', monthly: 'mensal', interval: 'por intervalo', calendar: 'por calendário' })[frequency] || 'indefinida';
}

async function showHome(interaction, update = false) {
  const content = [
    '# Kiryu · Configuração',
    'Painel administrativo do servidor Eternity Realms.',
    'Escolha uma seção para editar os dados persistidos no MongoDB.',
  ].join('\n');
  const payload = { components: [container(content, [navRow(interaction)])], allowedMentions: { parse: [] } };
  if (update) return updatePanel(interaction, payload);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
  }
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function showXp(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const visibleBuffs = cfg.buffs.slice(0, 25);
  const buffs = visibleBuffs.length
    ? visibleBuffs.map((buff) => '• <@&' + buff.roleId + '>: **' + buff.multiplier + 'x**').join('\n')
      + (cfg.buffs.length > visibleBuffs.length ? '\n• +' + (cfg.buffs.length - visibleBuffs.length) + ' outros cargos' : '')
    : 'Nenhum cargo cadastrado.';
  const content = [
    '# Experiência e níveis',
    '## Mensagens',
    '• XP: ' + cfg.messageXp.min + '–' + cfg.messageXp.max + ' por mensagem\n• Cooldown: ' + (cfg.messageXp.cooldownMs / 1000) + ' s',
    '## Voz',
    '• XP: ' + cfg.voiceXp.min + '–' + cfg.voiceXp.max + ' a cada ' + (cfg.voiceXp.intervalMs / 60000) + ' min',
    '## Canais excluídos',
    '• Mensagens: ' + channelList(cfg.messageXp.excludedChannelIds),
    '• Voz: ' + channelList(cfg.voiceXp.excludedChannelIds),
    '## Buffs por cargo',
    buffs,
    'Com vários cargos: **' + (cfg.stackBuffs ? 'multiplicadores acumulados' : 'maior multiplicador') + '**.',
    '## Anúncio de nível',
    (cfg.levelUp?.enabled === false ? 'Desativado.' : 'Ativado.') + (cfg.levelUp?.message ? '\nModelo personalizado configurado.' : '\nUsa uma fala contextual da Kiryu.')
      + (cfg.levelUp?.channelId ? '\nCanal: <#' + cfg.levelUp.channelId + '>.' : '\nSem canal de destino: nenhuma notificação será publicada.')
      + ' Variáveis: `{member}`, `{level}` e `{xp}`.',
  ].join('\n\n');
  const rows = [
    navRow(),
    row(
      button('config:xp:message', 'XP por mensagem', ButtonStyle.Primary),
      button('config:xp:voice', 'XP por voz', ButtonStyle.Primary),
      button('config:xp:stack', cfg.stackBuffs ? 'Usar maior buff' : 'Acumular buffs', ButtonStyle.Secondary),
      button('config:xp:levelup', 'Anúncio e canal', ButtonStyle.Primary),
    ),
    row(new ChannelSelectMenuBuilder().setCustomId('config:xp:exclude').setPlaceholder('Alternar exclusões de canais').setChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice).setMinValues(1).setMaxValues(10)),
    row(new RoleSelectMenuBuilder().setCustomId('config:xp:buff:add').setPlaceholder('Selecionar cargo para cadastrar buff').setMinValues(1).setMaxValues(1)),
  ];
  if (cfg.buffs.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:xp:buff:remove')
      .setPlaceholder('Selecionar um buff para remover')
      .addOptions(cfg.buffs.slice(0, 25).map((buff) => ({
        label: String(interaction.guild.roles.cache.get(buff.roleId)?.name || buff.roleId).slice(0, 100),
        value: buff.roleId,
        description: buff.multiplier + 'x',
      })))));
  }
  return updatePanel(interaction, { components: [container(content, rows)], allowedMentions: { parse: [] } });
}

async function showLevelUp(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const channelId = cfg.levelUp?.channelId || '';
  const selectedChannel = channelId && interaction.guild?.channels?.cache?.get(channelId);
  const destination = !channelId ? 'Nenhum canal configurado. As notificações ficarão desativadas até escolher um destino.'
    : selectedChannel ? 'Destino: <#' + channelId + '>.' : 'O canal <#' + channelId + '> não está no cache do servidor. Reescolha um canal ou limpe a configuração.';
  const content = [
    '# Anúncio de subida de nível',
    destination,
    'Notificações de mensagem e voz são publicadas somente aqui. Sem canal configurado, a Kiryu não envia nada aos canais de conversa.',
    (cfg.levelUp?.enabled === false ? '**Notificações desativadas.**' : '**Notificações ativadas.**')
      + (cfg.levelUp?.message ? ' Modelo personalizado configurado.' : ' Usa uma fala contextual da Kiryu.'),
    'Variáveis do modelo: `{member}`, `{level}` e `{xp}`.',
  ].join('\n\n');
  const channelSelect = new ChannelSelectMenuBuilder().setCustomId('config:xp:levelup:channel')
    .setPlaceholder('Selecionar canal dedicado para XP e níveis')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1).setMaxValues(1);
  const rows = [navRow(), row(channelSelect), row(
    button('config:xp:levelup:message', 'Editar mensagem', ButtonStyle.Primary),
    button('config:xp:levelup:toggle', cfg.levelUp?.enabled === false ? 'Ativar notificações' : 'Desativar notificações', cfg.levelUp?.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
    button('config:xp:levelup:clear', 'Limpar canal', ButtonStyle.Danger),
  )];
  const payload = { components: [container(content, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showBadges(interaction, update = true, page = 0) {
  const [fetched, count] = await Promise.all([
    BadgeDefinition.find({ guildId: interaction.guildId }).sort({ category: 1, name: 1 }).skip(page * 25).limit(26).lean(),
    BadgeDefinition.countDocuments({ guildId: interaction.guildId }),
  ]);
  const badges = fetched.slice(0, 25);
  const summary = badges.length
    ? badges.map((badge) => '• ' + badge.symbol + ' **' + badge.name + '** · `' + badge._id + '` · ' + (BADGE_CATEGORIES.find((category) => category.value === badge.category)?.label || badge.category) + (badge.assetBlobId ? ' · imagem' : '')).join('\n')
    : 'Nenhuma badge especial criada.';
  const categorySelect = new StringSelectMenuBuilder().setCustomId('config:badges:create:category')
    .setPlaceholder('Criar badge especial · escolher categoria')
    .addOptions(BADGE_CATEGORIES.map((category) => ({ label: category.label, value: category.value })));
  const rows = [navRow(interaction), row(categorySelect)];
  if (badges.length) rows.push(row(new StringSelectMenuBuilder().setCustomId('config:badges:select:' + page).setPlaceholder('Editar, atribuir ou remover uma badge')
    .addOptions(badges.map((badge) => ({ label: badge.name, value: String(badge._id), description: (badge.symbol + ' · ' + badge.category).slice(0, 100) })))));
  if (page > 0 || fetched.length > 25) rows.push(row(
    ...(page > 0 ? [button('config:badges:page:' + (page - 1), 'Página anterior')] : []),
    ...(fetched.length > 25 ? [button('config:badges:page:' + (page + 1), 'Próxima página')] : []),
  ));
  const text = '# Badges especiais da staff\nCrie selos comemorativos ou de reconhecimento. Eles só aparecem nos perfis que a equipe selecionar e não são vinculados a raças, classes ou conquistas narrativas.\n\n**Badges:** ' + count + ' · **Página:** ' + (page + 1) + '\n\n' + summary;
  return updatePanel(interaction, { components: [container(text, rows)], allowedMentions: { parse: [] } });
}

async function showBadgeDetail(interaction, badgeId, update = true) {
  const badge = await BadgeDefinition.findOne({ guildId: interaction.guildId, _id: badgeId }).lean();
  if (!badge) return showBadges(interaction, update);
  const category = BADGE_CATEGORIES.find((item) => item.value === badge.category)?.label || badge.category;
  const rows = [navRow(interaction), row(
    button('config:badges:edit:' + badgeId, 'Editar badge', ButtonStyle.Primary),
    button('config:badges:delete:' + badgeId, 'Remover badge', ButtonStyle.Danger),
  ), row(new UserSelectMenuBuilder().setCustomId('config:badges:assign:' + badgeId).setPlaceholder('Atribuir a membros').setMinValues(1).setMaxValues(25)),
  row(new UserSelectMenuBuilder().setCustomId('config:badges:remove:' + badgeId).setPlaceholder('Remover de membros').setMinValues(1).setMaxValues(25))];
  return updatePanel(interaction, { components: [container('# ' + badge.symbol + ' ' + badge.name + '\n' + badge.description + '\n\n**ID:** `' + badge._id + '`\n**Categoria:** ' + category + '\n**Arte:** ' + (badge.assetBlobId ? 'armazenada no Blob' : 'símbolo vetorial') + '\n**Tipo:** especial, atribuída pela staff.', rows)], allowedMentions: { parse: [] } });
}

async function showPermissions(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const visibleRoles = cfg.adminRoleIds.slice(0, 25);
  const roles = visibleRoles.length
    ? visibleRoles.map((id) => '• <@&' + id + '>').join('\n')
      + (cfg.adminRoleIds.length > visibleRoles.length ? '\n• +' + (cfg.adminRoleIds.length - visibleRoles.length) + ' outros cargos' : '')
    : 'Nenhum cargo autorizado. O proprietário sempre tem acesso.';
  return updatePanel(interaction, {
    components: [container('# Permissões administrativas\nCargos autorizados a usar os comandos de gerenciamento:\n\n' + roles, [
      navRow(),
      row(new RoleSelectMenuBuilder().setCustomId('config:permissions:add').setPlaceholder('Adicionar cargos autorizados').setMinValues(1).setMaxValues(10)),
      ...(cfg.adminRoleIds.length ? [row(new StringSelectMenuBuilder()
        .setCustomId('config:permissions:remove')
        .setPlaceholder('Selecionar cargos para remover')
        .addOptions(cfg.adminRoleIds.slice(0, 25).map((id) => ({
          label: String(interaction.guild.roles.cache.get(id)?.name || id).slice(0, 100),
          value: id,
        }))))] : []),
    ])],
    allowedMentions: { parse: [] },
  });
}

async function showTriggers(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const list = cfg.triggers.length
    ? cfg.triggers.slice(0, 25).map((trigger) => '• ' + (trigger.enabled ? '✅' : '⏸️') + ' **' + trigger.text + '** · `' + trigger._id + '` · ' + trigger.responses.length + ' resposta(s) · ' + (trigger.assets?.length || 0) + ' imagem(ns)').join('\n')
    : 'Nenhum gatilho cadastrado.';
  const rows = [navRow(), row(button('config:trigger:create', 'Criar gatilho', ButtonStyle.Success))];
  if (cfg.triggers.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:trigger:select')
      .setPlaceholder('Editar ou consultar um gatilho')
      .addOptions(cfg.triggers.slice(0, 25).map((trigger) => ({
        label: String(trigger.text).slice(0, 100),
        value: trigger._id.toString(),
        description: (trigger.enabled ? 'Ativo' : 'Desativado') + ' · ' + trigger.responses.length + ' resposta(s)',
      })))));
  }
  return updatePanel(interaction, { components: [container('# Gatilhos personalizados\nReconhecimento exato, sem diferenciar maiúsculas e minúsculas; espaços repetidos são normalizados.\n\n' + list, rows)], allowedMentions: { parse: [] } });
}

async function showRewards(interaction, update = true) {
  const settings = await getSettings(interaction.guildId);
  const daily = settings.daily.rewardRanges;
  const range = (value) => value.min === value.max ? String(value.min) : value.min + '–' + value.max;
  const adventure = settings.adventure || {};
  const crime = settings.crime || {};
  const passive = settings.passiveIncome || {};
  const content = [
    '# Recompensas · Fragmentos e Orbes',
    'Daily reinicia à meia-noite de São Paulo. O cooldown antigo não controla mais a coleta.',
    '**Daily** · ' + (settings.daily.enabled === false ? 'pausado' : 'ativo') + ' · Fragmentos ' + range(daily.fragments) + ' · Orbes: Verde ' + range(daily.orbs.green) + ', Azul ' + range(daily.orbs.blue) + ', Laranja ' + range(daily.orbs.orange) + ', Vermelha ' + range(daily.orbs.red) + ', Preta ' + range(daily.orbs.black) + ', Dourada ' + range(daily.orbs.gold),
    '**Trabalho** · ' + (settings.work.enabled === false ? 'pausado' : 'ativo') + ' · ' + settings.work.min + '–' + settings.work.max + ' Fragmentos · intervalo ' + Math.round(settings.work.cooldownMs / 60000) + ' min',
    '**Expedição** · ' + (adventure.enabled === false ? 'pausada' : range({ min: adventure.min ?? 80, max: adventure.max ?? 800 }) + ' Fragmentos') + ' · intervalo ' + Math.round((adventure.cooldownMs ?? 7200000) / 60000) + ' min',
    '**Golpe fictício** · ' + (crime.enabled === false ? 'pausado' : range({ min: crime.min ?? 100, max: crime.max ?? 1200 }) + ' Fragmentos · falha ' + (crime.failChancePercent ?? 35) + '% · multa ' + range({ min: crime.fineMin ?? 50, max: crime.fineMax ?? 400 })) + ' · intervalo ' + Math.round((crime.cooldownMs ?? 10800000) / 60000) + ' min',
    '**Renda passiva** · ' + (passive.enabled ? (passive.amount || 0) + ' Fragmentos a cada ' + Math.round((passive.intervalMs || 86400000) / 3600000) + ' h' : 'desativada'),
    '**Conversão de Orbes** · ' + (settings.orbs?.conversionRate || 10) + ':1 para a categoria seguinte',
  ].join('\n\n');
  const rows = [navRow(), row(
    button('config:rewards:work', 'Editar trabalho', ButtonStyle.Primary),
    button('config:rewards:daily:base', 'Daily · Fragmentos e Verde', ButtonStyle.Success),
    button('config:rewards:daily:blue', 'Daily · Azul e Laranja', ButtonStyle.Success),
    button('config:rewards:daily:red', 'Daily · Vermelha', ButtonStyle.Success),
    button('config:rewards:daily:rare', 'Daily · Preta e Dourada', ButtonStyle.Success),
  ), row(
    button('config:rewards:toggle-work', settings.work.enabled === false ? 'Ativar trabalho' : 'Pausar trabalho', settings.work.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
    button('config:rewards:toggle-daily', settings.daily.enabled === false ? 'Ativar daily' : 'Pausar daily', settings.daily.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
  ), row(
    button('config:rewards:adventure', 'Editar expedição', ButtonStyle.Primary),
    button('config:rewards:crime', 'Editar golpe fictício', ButtonStyle.Primary),
    button('config:rewards:passive:toggle', passive.enabled ? 'Desativar renda passiva' : 'Ativar renda passiva', passive.enabled ? ButtonStyle.Secondary : ButtonStyle.Success),
    button('config:rewards:passive:edit', 'Editar renda passiva', ButtonStyle.Primary),
  ), row(
    button('config:rewards:adventure:toggle', adventure.enabled === false ? 'Ativar expedições' : 'Pausar expedições', adventure.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
    button('config:rewards:crime:toggle', crime.enabled === false ? 'Ativar golpes fictícios' : 'Pausar golpes fictícios', crime.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
    button('config:rewards:conversion', 'Editar taxa de conversão', ButtonStyle.Primary),
  )];
  const payload = { components: [container(content, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showEconomy(interaction, update = true) {
  const settings = await getSettings(interaction.guildId);
  const economy = settings.economy || {};
  const format = (value) => Number(value || 0).toLocaleString('pt-BR');
  const content = [
    '# Economia · limites e comércio',
    'O saldo inicial vale apenas para contas criadas depois de salvar; registros existentes permanecem intactos. Limites e taxas passam a valer nas próximas operações.',
    '**Inicial** · carteira ' + format(economy.initialWallet) + ' · banco ' + format(economy.initialBank),
    '**Limites** · carteira ' + format(economy.walletLimit) + ' · banco ' + format(economy.bankLimit),
    '**Mercado** · taxa ' + (economy.marketFeePercent ?? 5) + '% · anúncio por ' + (economy.marketListingDays || 7) + ' dias · até ' + (economy.maxListingsPerMember || 10) + ' ativos por pessoa',
    '**Leilões e trocas** · taxa de leilão ' + (economy.auctionFeePercent ?? 5) + '% · lance mínimo adicional ' + format(economy.auctionMinIncrement || 10) + ' · convite expira em ' + (economy.tradeExpiryHours || 24) + ' h',
    '**Loteria** · taxa do prêmio ' + (economy.lotteryFeePercent ?? 0) + '%',
    'Operações e ajustes administrativos ficam em `/money history`; criações e liquidações comerciais têm registro próprio.',
  ].join('\n\n');
  const rows = [navRow(), row(
    button('config:economy:wallet', 'Editar saldo inicial e limites', ButtonStyle.Primary),
    button('config:economy:market', 'Editar mercado e leilões', ButtonStyle.Primary),
  ), row(button('config:economy:trade', 'Editar trocas e taxa da loteria', ButtonStyle.Secondary))];
  const payload = { components: [container(content, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showCasino(interaction, update = true) {
  const settings = await getSettings(interaction.guildId);
  const casino = settings.casino || {};
  const names = { flip: 'Cara ou coroa', dice: 'Dados', slots: 'Caça-níquel', blackjack: 'Blackjack', roulette: 'Roleta', mines: 'Minas', highlow: 'Maior ou menor', wheel: 'Roda da fortuna', keno: 'Keno', treasure: 'Baús', racing: 'Corridas', lottery: 'Loteria', poker: 'Poker recreativo' };
  const games = Object.keys(names);
  const enabled = (game) => ['flip', 'dice', 'slots'].includes(game) ? casino[game]?.enabled !== false : casino.games?.[game]?.enabled !== false;
  const select = new StringSelectMenuBuilder().setCustomId('config:casino:toggle-game').setPlaceholder('Selecionar um jogo para ativar ou pausar')
    .addOptions(games.map((game) => ({ label: names[game], value: game, description: enabled(game) ? 'Ativo · selecionar para pausar' : 'Pausado · selecionar para ativar' })));
  const defaults = { flip: 2, dice: 2, slots: 5 };
  const summary = games.map((game) => '• **' + names[game] + ':** ' + (enabled(game) ? 'ativo' : 'desativado')
    + (Object.hasOwn(defaults, game) ? ' · pagamento total ' + (casino[game]?.multiplier || defaults[game]) + '×' : '')).join('\n');
  const allowedChannels = casino.allowedChannelIds || [];
  const channelSelect = new ChannelSelectMenuBuilder().setCustomId('config:casino:channels').setPlaceholder('Restringir a canais de texto')
    .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]).setMinValues(1).setMaxValues(5);
  const rows = [navRow(), row(select), row(channelSelect), row(
    button('config:casino:edit', 'Editar limites e sessões', ButtonStyle.Primary),
    button('config:casino:payouts', 'Editar pagamentos clássicos', ButtonStyle.Secondary),
  ), row(button('config:casino:channels:any', 'Permitir qualquer canal de texto', ButtonStyle.Secondary))];
  const content = '# Cassino · jogos e limites\nApenas Fragmentos virtuais, sem depósitos, resgates ou conversão monetária. As regras usam probabilidades fixas e públicas; os resultados não dependem de saldo ou histórico individual.\n\n**Aposta máxima:** ' + (casino.maxBet || 1000000000).toLocaleString('pt-BR') + ' · **cooldown:** ' + Math.round((casino.cooldownMs || 0) / 60000) + ' min · **limite diário de perdas:** ' + (casino.dailyLossLimit ? casino.dailyLossLimit.toLocaleString('pt-BR') : 'sem limite adicional') + '\n**Sessão:** ' + (casino.sessionMinutes || 15) + ' min · **prazo por turno:** ' + (casino.turnTimeoutMinutes || 2) + ' min · **bilhete da loteria:** ' + (casino.lotteryTicketPrice || 100).toLocaleString('pt-BR') + ' Fragmentos · **máximo:** ' + (casino.maxLotteryTicketsPerMember || 100) + ' por pessoa\n**Canais:** ' + (allowedChannels.length ? allowedChannels.map((id) => '<#' + id + '>').join(', ') : 'qualquer canal de texto') + '\n\n' + summary;
  const payload = { components: [container(content, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showAppearance(interaction, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const palette = cfg.appearance?.palette || 'kiryu';
  const labels = { kiryu: 'Rosa Kiryu', eclipse: 'Eclipse', jade: 'Jade', ember: 'Brasa' };
  const select = new StringSelectMenuBuilder().setCustomId('config:appearance:palette').setPlaceholder('Escolher paleta visual')
    .addOptions(Object.keys(PALETTES).map((value) => ({ label: labels[value], value, default: value === palette })));
  const payload = { components: [container('# Aparência · paleta do servidor\nPaleta atual: **' + labels[palette] + '**. A escolha é persistida e aplicada às interfaces do bot após salvar.', [navRow(), row(select)])], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

function bytes(value) {
  const amount = Number(value || 0);
  if (amount < 1024) return amount + ' B';
  if (amount < 1024 ** 2) return (amount / 1024).toFixed(1) + ' KB';
  if (amount < 1024 ** 3) return (amount / 1024 ** 2).toFixed(1) + ' MB';
  return (amount / 1024 ** 3).toFixed(2) + ' GB';
}

async function refreshBlobAssetOverrides(guildId) {
  const { setAssetOverrides } = require('./components');
  const objects = await BlobObject.find({ guildId: String(guildId), deletedAt: null }).select('category name url deletedAt').lean();
  setAssetOverrides(objects);
}

function categoryFilter(category) {
  return row(new StringSelectMenuBuilder().setCustomId('config:storage:category').setPlaceholder('Filtrar por categoria').addOptions(STORAGE_CATEGORIES.map((value) => ({
    label: value === 'all' ? 'Todas as categorias' : value,
    value,
    default: value === category,
  }))));
}

async function showStorage(interaction, update = true, { page = 0, category = 'all' } = {}) {
  const cfg = await getGuildConfig(interaction.guildId);
  const [listed, localUsage] = await Promise.all([
    blobStorage.listPage({ guildId: interaction.guildId, page, category }),
    BlobObject.aggregate([{ $match: { guildId: String(interaction.guildId), deletedAt: null } }, { $group: { _id: null, bytes: { $sum: '$size' }, objects: { $sum: 1 }, refs: { $sum: { $size: '$references' } }, orphaned: { $sum: { $cond: [{ $eq: [{ $size: '$references' }, 0] }, 1, 0] } } } }]),
  ]);
  const usage = localUsage[0] || { bytes: 0, objects: 0, refs: 0, orphaned: 0 };
  const limit = cfg.storage?.maxBytes || 0;
  const list = listed.objects.length ? listed.objects.map((object) => '• **' + object.name + '** · `' + object._id + '` · ' + bytes(object.size) + ' · ' + object.references.length + ' referência(s)' + (object.references.length ? '' : ' · órfão')).join('\n') : 'Nenhum objeto encontrado para este filtro.';
  let cloud = 'Conta Square Cloud: indisponível nesta consulta.';
  try {
    const stats = await blobStorage.getClient().stats();
    cloud = 'Conta Square Cloud: **' + stats.usage.objects.toLocaleString('pt-BR') + '** objeto(s) · **' + bytes(stats.usage.storage) + '**.';
  } catch { /* Local metadata remains available when the provider is down. */ }
  const rows = [navRow(interaction), categoryFilter(category), row(
    button('config:storage:limit', 'Limite de armazenamento', ButtonStyle.Primary),
    button('config:storage:toggle', cfg.storage?.uploadsEnabled === false ? 'Ativar uploads' : 'Pausar uploads', cfg.storage?.uploadsEnabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
    button('config:storage:refresh:' + page + ':' + category, 'Atualizar'),
  )];
  if (listed.objects.length) rows.push(row(new StringSelectMenuBuilder().setCustomId('config:storage:object:' + page + ':' + category).setPlaceholder('Abrir objeto para visualizar ou gerenciar')
    .addOptions(listed.objects.map((object) => ({ label: String(object.name).slice(0, 100), value: object._id.slice(0, 100), description: bytes(object.size) + ' · ' + object.references.length + ' referência(s)' })))));
  if (listed.pages > 1) rows.push(row(
    ...(page > 0 ? [button('config:storage:page:' + (page - 1) + ':' + category, 'Página anterior')] : []),
    ...(listed.hasNext ? [button('config:storage:page:' + (page + 1) + ':' + category, 'Próxima página')] : []),
  ));
  const text = '# Armazenamento · Square Cloud Blob\nUploads: **' + (cfg.storage?.uploadsEnabled === false ? 'pausados' : 'ativos') + '** · Limite local: **' + (limit ? bytes(limit) : 'sem limite adicional') + '** · arquivo máximo: **' + bytes(cfg.storage?.maxFileBytes || 8 * 1024 * 1024) + '**\n\n**Metadados deste servidor:** ' + usage.objects.toLocaleString('pt-BR') + ' objetos · ' + bytes(usage.bytes) + ' · ' + usage.refs + ' referências · ' + usage.orphaned + ' órfãos.\n' + cloud + '\n\n' + list + '\n\nEnvie uma imagem pelo comando `/config asset_file` e escolha a categoria. Objetos com referências não podem ser excluídos até que os sistemas sejam atualizados.';
  return updatePanel(interaction, { components: [container(text, rows)], allowedMentions: { parse: [] } });
}

async function showStorageObject(interaction, objectId, page = 0, category = 'all') {
  const object = await BlobObject.findOne({ _id: objectId, guildId: String(interaction.guildId), deletedAt: null }).lean();
  if (!object) return showStorage(interaction, true, { page, category });
  const refs = object.references.length ? object.references.map((ref) => '• `' + ref.system + '` · `' + ref.key + '`').join('\n') : 'Nenhuma referência · objeto órfão.';
  const rows = [navRow(interaction), row(
    button('config:storage:rename:' + objectId + ':' + page + ':' + category, 'Renomear asset', ButtonStyle.Primary),
    button('config:storage:delete:' + objectId + ':' + page + ':' + category, 'Excluir objeto', ButtonStyle.Danger),
    button('config:storage:back:' + page + ':' + category, 'Voltar'),
  )];
  const info = '# ' + object.name + '\nCategoria: **' + object.category + '** · arquivo `' + object.filename + '` · ' + bytes(object.size) + '\nMIME: `' + object.mimeType + '` · ID: `' + object._id + '`\nAdicionado por <@' + object.createdBy + '> em ' + new Date(object.createdAt).toLocaleString('pt-BR', { timeZone: config.timezone }) + '\n\n**Referências (' + object.references.length + ')**\n' + refs + (object.url ? '\n\nPrévia: ' + object.url : '\n\nObjeto privado; a prévia exige autorização para gerar um link temporário.');
  const view = new ContainerBuilder().setAccentColor(config.visual.admin)
    .addSectionComponents(require('./components').headerSection(object.name, 'Asset · ' + object.category, 'admin'))
    .addTextDisplayComponents(new (require('discord.js').TextDisplayBuilder)().setContent(info.replace('# ' + object.name + '\n', '')));
  if (object.url) view.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(object.url).setDescription(object.name)));
  for (const componentRow of rows) view.addActionRowComponents(componentRow);
  require('./components').decorateContainer(view);
  return interaction.editReply({ components: [view], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
}

async function showUtilitySettings(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const utility = cfg.utilities || {};
  return updatePanel(interaction, { components: [container('# Ferramentas utilitárias\nConfigurações permanentes de lembretes, enquetes e ausência.\n\nLembretes: ' + (utility.remindersEnabled === false ? 'desativados' : 'ativos') + ' · máximo de ' + (utility.maxRemindersPerMember || 20) + ' por membro · prazo até ' + (utility.maxReminderDays || 365) + ' dias.\nEnquetes: ' + (utility.pollsEnabled === false ? 'desativadas' : 'ativas') + '.\nAFK: ' + (utility.afkEnabled === false ? 'desativado' : 'ativo') + '.', [navRow(interaction), row(button('config:utilities:reminders', utility.remindersEnabled === false ? 'Ativar lembretes' : 'Desativar lembretes'), button('config:utilities:polls', utility.pollsEnabled === false ? 'Ativar enquetes' : 'Desativar enquetes'), button('config:utilities:afk', utility.afkEnabled === false ? 'Ativar AFK' : 'Desativar AFK')), row(button('config:utilities:limits', 'Editar limites', ButtonStyle.Primary))])], allowedMentions: { parse: [] } });
}

async function showModerationSettings(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  return updatePanel(interaction, { components: [container('# Moderação e registros administrativos\nModeração: **' + (cfg.moderation?.enabled === false ? 'desativada' : 'ativa') + '**\nCanal de logs: ' + (cfg.moderation?.logChannelId ? '<#' + cfg.moderation.logChannelId + '>' : 'não configurado; registros permanecem no MongoDB') + '\nLimite de advertências: ' + (cfg.moderation?.warnThreshold || 'sem limite automático') + '.', [navRow(interaction), row(new ChannelSelectMenuBuilder().setCustomId('config:moderation:logs').setPlaceholder('Selecionar canal de logs').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1)), row(button('config:moderation:toggle', cfg.moderation?.enabled === false ? 'Ativar moderação' : 'Desativar moderação'), button('config:moderation:limits', 'Editar limite de advertências', ButtonStyle.Primary), button('config:moderation:clearlogs', 'Limpar canal de logs'))])], allowedMentions: { parse: [] } });
}

async function showGiveawaySettings(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  return updatePanel(interaction, { components: [container('# Sorteios\nSorteios ativos: **' + (cfg.giveaways?.enabled === false ? 'desativados' : 'ativos') + '** · duração máxima: **' + (cfg.giveaways?.maxDurationDays || 365) + ' dias** · canal de logs: ' + (cfg.giveaways?.logChannelId ? '<#' + cfg.giveaways.logChannelId + '>' : 'não configurado') + '.', [navRow(interaction), row(button('config:giveaways:toggle', cfg.giveaways?.enabled === false ? 'Ativar sorteios' : 'Desativar novos sorteios'), button('config:giveaways:limits', 'Editar duração máxima', ButtonStyle.Primary)), row(new ChannelSelectMenuBuilder().setCustomId('config:giveaways:logs').setPlaceholder('Selecionar canal de logs').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(1).setMaxValues(1))])], allowedMentions: { parse: [] } });
}

async function showTemplateSettings(interaction) {
  const cfg = await getGuildConfig(interaction.guildId);
  const templates = cfg.messageTemplates || [];
  return updatePanel(interaction, { components: [container('# Templates de mensagens\nArmazenados com a configuração do servidor e reutilizáveis em `/embed` e `/announce`.\n\n' + (templates.length ? templates.map((item) => '• **' + item.name + '** · ' + (item.payload?.mode || 'v2')).join('\n') : 'Nenhum template salvo.') + '\n\nUse `/embed template import|export|list|delete|apply` para gerenciar os modelos.', [navRow(interaction)])], allowedMentions: { parse: [] } });
}

async function showStores(interaction, update = true, page = 0) {
  const fetched = await EconomyItem.find({ guildId: interaction.guildId, deletedAt: null }).sort({ currency: 1, name: 1 }).skip(page * 25).limit(26).lean();
  const items = fetched.slice(0, 25);
  const text = items.length
    ? items.map((item) => '• ' + (item.emoji || '📦') + ' **' + item.name + '** · ' + (item.currency === 'fragments' ? 'Fragmentos' : 'Orbes ' + item.orbType) + ' · ' + item.price.toLocaleString('pt-BR') + ' · ' + (item.stock == null ? 'ilimitado' : 'estoque ' + item.stock)).join('\n')
    : 'O catálogo ainda está vazio.';
  const rows = [navRow(), row(
    button('config:store:create:fragments', 'Novo item · Fragmentos', ButtonStyle.Success),
    button('config:store:create:orbs', 'Novo item · Orbes', ButtonStyle.Primary),
  )];
  if (items.length) {
    const select = new StringSelectMenuBuilder().setCustomId('config:store:select:' + page).setPlaceholder('Abrir item para editar ou remover')
      .addOptions(items.map((item) => ({
        label: String(item.name).slice(0, 100), value: item.sku,
        description: item.currency === 'fragments' ? 'Fragmentos · ' + item.price.toLocaleString('pt-BR') : 'Orbes · ' + item.price.toLocaleString('pt-BR'),
      })));
    rows.push(row(select));
  }
  if (page > 0 || fetched.length > 25) rows.push(row(
    ...(page > 0 ? [button('config:stores:page:' + (page - 1), 'Página anterior')] : []),
    ...(fetched.length > 25 ? [button('config:stores:page:' + (page + 1), 'Próxima página')] : []),
  ));
  const payload = { components: [container('# Lojas · Catálogo do Eternity\nItens existentes não são substituídos ao reiniciar o bot.\n\n' + text, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showStoreDetail(interaction, sku, page = 0) {
  const item = await EconomyItem.findOne({ guildId: interaction.guildId, sku, deletedAt: null }).lean();
  if (!item) return showStores(interaction, true, page);
  const text = '# ' + item.emoji + ' ' + item.name + '\n' + item.description + '\n\n**Preço:** ' + item.price.toLocaleString('pt-BR') + ' · **Estoque:** ' + (item.stock == null ? 'ilimitado' : item.stock.toLocaleString('pt-BR')) + '\n**Moeda:** ' + (item.currency === 'fragments' ? 'Fragmentos' : 'Orbes ' + item.orbType) + ' · **Ativo:** ' + (item.active ? 'sim' : 'não') + ' · **Na vitrine:** ' + (item.visibleInStore ? 'sim' : 'não') + '\n**Por compra:** ' + item.purchaseQuantity + ' unidade(s) · **Variantes:** ' + (item.purchaseChoices?.length || 0);
  return updatePanel(interaction, { components: [container(text, [navRow(), row(
    button('config:store:art:' + sku, item.thumbnailUrl ? 'Trocar arte' : 'Adicionar arte', ButtonStyle.Primary),
    button('econ:admin:itemwizard:' + interaction.user.id + ':' + sku, 'Editar em etapas', ButtonStyle.Primary),
  ), row(
    button('config:store:toggle:active:' + sku, item.active ? 'Desativar' : 'Ativar', item.active ? ButtonStyle.Secondary : ButtonStyle.Success),
    button('config:store:toggle:visible:' + sku, item.visibleInStore ? 'Ocultar da vitrine' : 'Mostrar na vitrine'),
    button('config:store:delete:' + sku, 'Remover', ButtonStyle.Danger),
  ), row(
    button('config:stores:page:' + page, 'Voltar ao catálogo'),
  )])], allowedMentions: { parse: [] } });
}

async function showRules(interaction, update = true, page = 0) {
  const fetched = await EconomyCollectRule.find({ guildId: interaction.guildId, active: true }).sort({ createdAt: -1 }).skip(page * 25).limit(26).lean();
  const rules = fetched.slice(0, 25);
  const text = rules.length ? rules.map((rule) => '• <@&' + rule.roleId + '> · **' + rule.name + '** · recorrência ' + frequencyLabel(rule.frequency) + (rule.stackable ? ' · acumulável' : '')).join('\n') : 'Nenhuma recompensa por cargo cadastrada.';
  const rows = [navRow(), row(button('config:rules:create', 'Criar recompensa', ButtonStyle.Success))];
  if (rules.length) {
    const options = rules.map((rule) => ({
      label: String(rule.name).slice(0, 100),
      value: String(rule._id),
      description: frequencyLabel(rule.frequency) + ' · ' + Number(rule.fragments || 0).toLocaleString('pt-BR') + ' Fragmentos',
    }));
    rows.push(row(new StringSelectMenuBuilder().setCustomId('config:rules:select:' + page).setPlaceholder('Abrir uma recompensa').addOptions(options)));
  }
  if (page > 0 || fetched.length > 25) rows.push(row(
    ...(page > 0 ? [button('config:rules:page:' + (page - 1), 'Página anterior')] : []),
    ...(fetched.length > 25 ? [button('config:rules:page:' + (page + 1), 'Próxima página')] : []),
  ));
  const payload = { components: [container('# Recompensas da comunidade\nConfigure coletas periódicas ligadas a cargos. Regras que já existem continuam ativas.\n\n' + text, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showRuleDetail(interaction, ruleId, page = 0) {
  const rule = await EconomyCollectRule.findOne({ guildId: interaction.guildId, _id: ruleId, active: true }).lean();
  if (!rule) return showRules(interaction);
  const orb = rule.orbType && rule.orbAmount ? '\n**Orbes:** ' + rule.orbAmount.toLocaleString('pt-BR') + ' ' + rule.orbType : '';
  const cadence = rule.frequency === 'interval' ? 'a cada ' + Math.round(rule.intervalMs / 60000) + ' min'
    : rule.frequency === 'calendar' ? (rule.calendarUnit === 'week' ? 'dia da semana ' + ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][rule.calendarValue] : 'dia ' + rule.calendarValue + ' do mês') + ' (UTC)'
      : ({ daily: 'diária', weekly: 'semanal', monthly: 'mensal' }[rule.frequency] || rule.frequency);
  const content = '# ' + rule.name + '\n' + (rule.description || 'Sem descrição.') + '\n\n**Cargo:** <@&' + rule.roleId + '> · **Recorrência:** ' + cadence + '\n**Fragmentos:** ' + rule.fragments.toLocaleString('pt-BR') + orb + '\n**Acúmulo:** ' + (rule.stackable ? 'sim' : 'não');
  return updatePanel(interaction, { components: [container(content, [navRow(), row(
    button('config:rules:edit:' + ruleId, 'Editar valores', ButtonStyle.Primary),
    button('config:rules:schedule:' + ruleId, 'Editar recorrência', ButtonStyle.Primary),
  ), row(new RoleSelectMenuBuilder().setCustomId('config:rules:role:' + ruleId).setPlaceholder('Trocar cargo elegível').setMinValues(1).setMaxValues(1)), row(
    button('config:rules:stack:' + ruleId, rule.stackable ? 'Desativar acúmulo' : 'Ativar acúmulo'),
    button('config:rules:delete:' + ruleId, 'Remover', ButtonStyle.Danger),
  ), row(
    button('config:rules:page:' + page, 'Voltar à lista'),
  )])], allowedMentions: { parse: [] } });
}

async function showRuleSchedule(interaction, ruleId) {
  const rule = await EconomyCollectRule.findOne({ guildId: interaction.guildId, _id: ruleId, active: true }).lean();
  if (!rule) return showRules(interaction);
  const frequency = new StringSelectMenuBuilder().setCustomId('config:rules:schedule:frequency:' + ruleId).setPlaceholder('Escolher recorrência')
    .addOptions([
      { label: 'Diária', value: 'daily' }, { label: 'Semanal', value: 'weekly' }, { label: 'Mensal', value: 'monthly' },
      { label: 'Intervalo', value: 'interval' }, { label: 'Data do calendário', value: 'calendar' },
    ].map((option) => ({ ...option, default: option.value === rule.frequency })));
  return updatePanel(interaction, { components: [container('# Recorrência · ' + rule.name + '\nSelecione a frequência de coleta. Intervalos usam minutos; calendário usa dia da semana (UTC) ou dia do mês.', [
    navRow(), row(frequency), row(button('config:rules:detail:' + ruleId, 'Voltar à recompensa')),
  ])], allowedMentions: { parse: [] } });
}

function ruleCreationStep(frequency, orbType) {
  return container('# Nova recompensa · Cargo\nFrequência: **' + frequency + '** · Recompensa em Orbes: **' + (orbType || 'nenhuma') + '**\n\nSelecione o cargo que poderá coletar a regra.', [
    navRow(), row(new RoleSelectMenuBuilder().setCustomId('config:rule:create:role:' + frequency + ':' + (orbType || 'none')).setPlaceholder('Selecionar cargo').setMinValues(1).setMaxValues(1)),
    row(button('config:rules:back', 'Cancelar')),
  ]);
}

async function showTriggerDetail(interaction, triggerId, update = true) {
  const cfg = await getGuildConfig(interaction.guildId);
  const trigger = cfg.triggers.id(triggerId);
  if (!trigger) return showTriggers(interaction, update);
  const visibleResponses = trigger.responses.slice(0, 25);
  const responseList = visibleResponses.length ? visibleResponses.map((response, index) => {
    const preview = String(response).replace(/\s+/g, ' ');
    return (index + 1) + '. ' + preview.slice(0, 90) + (preview.length > 90 ? '…' : '');
  }).join('\n') + (trigger.responses.length > visibleResponses.length ? '\n… +' + (trigger.responses.length - visibleResponses.length) + ' respostas' : '') : 'Sem respostas.';
  const rows = [
    navRow(),
    row(button('config:trigger:text:' + triggerId, 'Editar texto'), button('config:trigger:response:add:' + triggerId, 'Adicionar resposta', ButtonStyle.Success), button('config:trigger:toggle:' + triggerId, trigger.enabled ? 'Desativar' : 'Ativar')),
  ];
  if (trigger.responses.length) {
    rows.push(row(new StringSelectMenuBuilder()
      .setCustomId('config:trigger:response:select:' + triggerId)
      .setPlaceholder('Selecionar uma resposta para editar ou remover')
      .addOptions(trigger.responses.slice(0, 25).map((response, index) => ({
        label: (index + 1) + '. ' + String(response).slice(0, 90),
        value: String(index),
      })))));
  }
  rows.push(row(button('config:trigger:delete:' + triggerId, 'Excluir gatilho', ButtonStyle.Danger), button('config:triggers', 'Voltar à lista')));
  return updatePanel(interaction, { components: [container('## Gatilho: ' + trigger.text + '\n**Status:** ' + (trigger.enabled ? 'ativo' : 'desativado') + '\n**Respostas:**\n' + responseList, rows)], allowedMentions: { parse: [] } });
}

function shortInput(customId, label, options = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(options.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(options.required !== false);
  if (options.placeholder) input.setPlaceholder(options.placeholder);
  if (options.value != null && String(options.value).length) input.setValue(String(options.value).slice(0, options.maxLength || 4000));
  if (options.minLength) input.setMinLength(options.minLength);
  if (options.maxLength) input.setMaxLength(options.maxLength);
  return input;
}

function modal(customId, title, fields) {
  const builder = new ModalBuilder().setCustomId(customId).setTitle(title);
  builder.addComponents(...fields.map((field) => new ActionRowBuilder().addComponents(field)));
  return builder;
}

function parseNumber(value, { min, max, label }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new RangeError(label + ' deve estar entre ' + min + ' e ' + max + '.');
  return number;
}

async function handleConfigInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('config:')) return false;
  const opensModal = interaction.isButton() && [
    'config:xp:message', 'config:xp:voice', 'config:xp:levelup:message', 'config:rewards:conversion', 'config:casino:edit', 'config:casino:payouts',
    'config:economy:wallet', 'config:economy:market', 'config:economy:trade', 'config:trigger:create',
    'config:storage:limit', 'config:utilities:limits', 'config:moderation:limits', 'config:giveaways:limits',
  ].includes(customId) || (interaction.isButton() && [
    'config:ai:prompt:edit', 'config:ai:generation:basic', 'config:ai:generation:member-limits', 'config:ai:generation:global-limits',
  ].includes(customId)) || (interaction.isButton() && (
    customId === 'config:rewards:work' || customId.startsWith('config:rewards:daily:') || customId === 'config:rewards:adventure' || customId === 'config:rewards:crime' || customId === 'config:rewards:passive:edit' || customId.startsWith('config:rules:edit:') ||
    customId.startsWith('config:trigger:text:') || customId.startsWith('config:trigger:response:add:') ||
    customId.startsWith('config:trigger:response:edit:') || customId.startsWith('config:store:create:') || customId.startsWith('config:store:art:') || customId.startsWith('config:badges:edit:')
    || customId.startsWith('config:storage:rename:')
  )) || (interaction.isRoleSelectMenu() && (customId === 'config:xp:buff:add' || customId.startsWith('config:rule:create:role:')));
  const scheduleModal = interaction.isStringSelectMenu() && (
    (customId.startsWith('config:rules:schedule:frequency:') && interaction.values?.[0] === 'interval') ||
    (customId.startsWith('config:rules:schedule:unit:') && interaction.values?.[0] === 'month') ||
    customId === 'config:store:create:orbtype' || customId === 'config:badges:create:category'
  );
  if (!opensModal && !interaction.deferred && !interaction.replied && (
    interaction.isButton?.() || interaction.isAnySelectMenu?.()
  ) && !scheduleModal && typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
  const authorized = interaction.guildId === config.guildId && (interaction.user.id === config.ownerId || await isAuthorized(interaction.member, interaction.user.id, interaction.guildId));
  if (!authorized) {
    if (interaction.deferred || interaction.replied) {
      await followUpV2(interaction, 'Acesso negado.');
    } else {
      await replyV2(interaction, 'Acesso negado.', { ephemeral: true });
    }
    return true;
  }
  const staffConfigAction = customId === 'config:home'
    || (customId === 'config:nav' && interaction.values?.[0] === 'badges')
    || ['storage', 'utilities', 'moderation', 'giveaways', 'templates'].some((section) => customId.startsWith('config:' + section + ':') || (customId === 'config:nav' && interaction.values?.[0] === section))
    || customId.startsWith('config:badges:')
    || customId.startsWith('config:modal:badge:');
  if (interaction.user.id !== config.ownerId && !staffConfigAction) {
    if (interaction.deferred || interaction.replied) await followUpV2(interaction, 'Essa área do painel é exclusiva do proprietário.');
    else await replyV2(interaction, 'Essa área do painel é exclusiva do proprietário.', { ephemeral: true });
    return true;
  }
  const ownerOnly = customId.startsWith('config:permissions:') || customId.startsWith('config:ai:') || customId === 'config:modal:ai:prompt'
    || (customId === 'config:nav' && ['permissions', 'ai'].includes(interaction.values?.[0]));
  if (ownerOnly && interaction.user.id !== config.ownerId) {
    if (interaction.deferred || interaction.replied) await followUpV2(interaction, 'A seção de permissões é exclusiva do proprietário.');
    else await replyV2(interaction, 'A seção de permissões é exclusiva do proprietário.', { ephemeral: true });
    return true;
  }
  if (interaction.isModalSubmit() && customId.startsWith('config:modal:') && !interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
  }

  try {
    if (customId.startsWith('config:ai:') || customId.startsWith('config:modal:ai:')) {
      return await handleAIConfigInteraction(interaction);
    }
    if (interaction.isStringSelectMenu()) {
      const value = interaction.values[0];
      if (customId === 'config:nav') {
        if (value === 'xp') await showXp(interaction);
        else if (value === 'permissions') await showPermissions(interaction);
        else if (value === 'rewards') await showRewards(interaction);
        else if (value === 'economy') await showEconomy(interaction);
        else if (value === 'stores') await showStores(interaction);
        else if (value === 'rules') await showRules(interaction);
        else if (value === 'triggers') await showTriggers(interaction);
        else if (value === 'casino') await showCasino(interaction);
        else if (value === 'appearance') await showAppearance(interaction);
        else if (value === 'ai') await showAIHome(interaction);
        else if (value === 'badges') await showBadges(interaction);
        else if (value === 'storage') await showStorage(interaction);
        else if (value === 'utilities') await showUtilitySettings(interaction);
        else if (value === 'moderation') await showModerationSettings(interaction);
        else if (value === 'giveaways') await showGiveawaySettings(interaction);
        else if (value === 'templates') await showTemplateSettings(interaction);
        else await showHome(interaction, true);
        return true;
      }
      if (customId === 'config:casino:toggle-game') {
        const game = interaction.values[0];
        const extended = ['blackjack', 'roulette', 'mines', 'highlow', 'wheel', 'keno', 'treasure', 'racing', 'lottery', 'poker'];
        const settings = await getSettings(interaction.guildId);
        if (['flip', 'dice', 'slots'].includes(game)) {
          await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { [game]: { enabled: settings.casino?.[game]?.enabled === false } } });
        } else if (extended.includes(game)) {
          await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { games: { [game]: { enabled: settings.casino?.games?.[game]?.enabled === false } } } });
        } else throw new RangeError('Jogo inválido.');
        return showCasino(interaction);
      }
      if (customId === 'config:storage:category') return showStorage(interaction, true, { page: 0, category: STORAGE_CATEGORIES.includes(value) ? value : 'all' });
      if (customId.startsWith('config:storage:object:')) return showStorageObject(interaction, value, Number(customId.split(':')[3]) || 0, customId.split(':')[4] || 'all');
      if (customId === 'config:moderation:logs') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.moderation.logChannelId = value; await cfg.save();
        return showModerationSettings(interaction);
      }
      if (customId === 'config:giveaways:logs') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.giveaways.logChannelId = value; await cfg.save();
        return showGiveawaySettings(interaction);
      }
      if (customId === 'config:badges:create:category') {
        if (!BADGE_CATEGORIES.some((category) => category.value === value)) throw new RangeError('Escolha uma categoria de badge válida.');
        await interaction.showModal(modal('config:modal:badge:create:' + value, 'Criar badge especial', [
          shortInput('name', 'Nome exibido', { maxLength: 40, minLength: 1 }),
          shortInput('symbol', 'Símbolo ou emoji · até 8 caracteres', { maxLength: 8, minLength: 1 }),
          shortInput('description', 'Descrição curta', { paragraph: true, required: false, maxLength: 120 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:badges:select:')) return showBadgeDetail(interaction, value);
      if (customId === 'config:appearance:palette') {
        if (!Object.hasOwn(PALETTES, value)) throw new RangeError('Escolha uma paleta disponível.');
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.appearance.palette = value;
        await cfg.save();
        applyPalette(value);
        return showAppearance(interaction);
      }
      if (customId === 'config:store:create:orbtype') {
        const orbType = value;
        if (!ORB_TYPES.includes(orbType)) throw new RangeError('Escolha uma categoria de Orbe válida.');
        await interaction.showModal(modal('config:modal:store:create:orbs:' + orbType, 'Novo item · Orbes', [
          shortInput('sku', 'Identificador do catálogo', { maxLength: 32 }),
          shortInput('name', 'Nome exibido na loja', { maxLength: 80 }),
          shortInput('description', 'Descrição do item', { paragraph: true, maxLength: 1000 }),
          shortInput('price', 'Preço inteiro em Orbes', { maxLength: 14 }),
        ]));
        return true;
      }
      if (customId === 'config:trigger:select') {
        await showTriggerDetail(interaction, value);
        return true;
      }
      if (customId.startsWith('config:store:select:')) {
        await showStoreDetail(interaction, value, Number(customId.split(':').at(-1)) || 0);
        return true;
      }
      if (customId.startsWith('config:rules:select:')) {
        await showRuleDetail(interaction, value, Number(customId.split(':').at(-1)) || 0);
        return true;
      }
      if (customId.startsWith('config:rules:schedule:frequency:')) {
        const ruleId = customId.split(':').at(-1);
        const frequency = value;
        if (frequency === 'interval') {
          await interaction.showModal(modal('config:modal:rules:schedule:interval:' + ruleId, 'Intervalo de coleta', [
            shortInput('minutes', 'Intervalo em minutos (1 a 525.600)', { placeholder: 'Ex.: 60', maxLength: 6 }),
          ]));
          return true;
        }
        if (frequency === 'calendar') {
          return updatePanel(interaction, { components: [container('# Data do calendário', [navRow(), row(new StringSelectMenuBuilder()
            .setCustomId('config:rules:schedule:unit:' + ruleId).setPlaceholder('Semana ou mês')
            .addOptions({ label: 'Dia da semana', value: 'week' }, { label: 'Dia do mês', value: 'month' })),
          row(button('config:rules:detail:' + ruleId, 'Cancelar'))])], allowedMentions: { parse: [] } });
        }
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: { frequency } });
        return showRuleDetail(interaction, ruleId);
      }
      if (customId.startsWith('config:rules:schedule:unit:')) {
        const ruleId = customId.split(':').at(-1);
        const unit = value;
        if (unit === 'month') {
          await interaction.showModal(modal('config:modal:rules:schedule:calendar:' + ruleId + ':month', 'Dia do mês', [
            shortInput('day', 'Dia do mês (1 a 31)', { placeholder: 'Ex.: 15', maxLength: 2 }),
          ]));
          return true;
        }
        const dayNames = unit === 'week'
          ? ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
          : [];
        return updatePanel(interaction, { components: [container('# Dia da recorrência', [navRow(), row(new StringSelectMenuBuilder()
          .setCustomId('config:rules:schedule:day:' + customId.split(':').at(-1) + ':' + unit).setPlaceholder('Escolher dia')
          .addOptions(dayNames.map((name, index) => ({ label: name, value: String(index) })))),
        row(button('config:rules:detail:' + ruleId, 'Cancelar'))])], allowedMentions: { parse: [] } });
      }
      if (customId.startsWith('config:rules:schedule:day:')) {
        const parts = customId.split(':');
        const ruleId = parts[4];
        const unit = parts[5];
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: {
          frequency: 'calendar', calendarUnit: unit, calendarValue: Number(value),
        } });
        return showRuleDetail(interaction, ruleId);
      }
      if (customId === 'config:rule:create:frequency') {
        const frequency = value;
        return updatePanel(interaction, { components: [container('# Nova recompensa · Categoria', [
          navRow(), row(new StringSelectMenuBuilder().setCustomId('config:rule:create:orb:' + frequency).setPlaceholder('Recompensa adicional em Orbes (opcional)')
            .addOptions([{ label: 'Sem Orbes', value: 'none' }, ...['green', 'blue', 'orange', 'red', 'black', 'gold'].map((type) => ({ label: ORBS[type].label, value: type }))])),
          row(button('config:rules:back', 'Cancelar')),
        ])], allowedMentions: { parse: [] } });
      }
      if (customId.startsWith('config:rule:create:orb:')) {
        const frequency = customId.split(':').at(-1);
        return updatePanel(interaction, { components: [ruleCreationStep(frequency, value === 'none' ? null : value)], allowedMentions: { parse: [] } });
      }
      if (customId === 'config:xp:buff:remove') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.buffs = cfg.buffs.filter((buff) => !interaction.values.includes(buff.roleId));
        await cfg.save();
        await showXp(interaction);
        return true;
      }
      if (customId === 'config:permissions:remove') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.adminRoleIds = cfg.adminRoleIds.filter((id) => !interaction.values.includes(id));
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId.startsWith('config:trigger:response:select:')) {
        const triggerId = customId.split(':').at(-1);
        const index = Number(value);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        const response = trigger?.responses[index];
        if (response == null) throw new Error('Resposta não encontrada.');
        await updatePanel(interaction, { components: [container('## Resposta ' + (index + 1) + '\n' + response, [
          navRow(),
          row(button('config:trigger:response:edit:' + triggerId + ':' + index, 'Editar resposta', ButtonStyle.Primary), button('config:trigger:response:remove:' + triggerId + ':' + index, 'Remover resposta', ButtonStyle.Danger)),
          row(button('config:trigger:detail:' + triggerId, 'Voltar ao gatilho')),
        ])], allowedMentions: { parse: [] } });
        return true;
      }
    }

    if (interaction.isRoleSelectMenu()) {
      if (customId.startsWith('config:rules:role:')) {
        const ruleId = customId.split(':').at(-1);
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: { roleId: interaction.values[0] } });
        return showRuleDetail(interaction, ruleId);
      }
      if (customId.startsWith('config:rule:create:role:')) {
        const [, , , , frequency, orbType] = customId.split(':');
        const category = orbType === 'none' ? '' : orbType;
        const modalId = 'config:modal:rule:create:' + interaction.values[0] + ':' + frequency + ':' + (category || 'none');
        await interaction.showModal(modal(modalId, 'Recompensa por cargo', [
          shortInput('name', 'Nome da recompensa', { maxLength: 80 }),
          shortInput('description', 'Descrição opcional', { paragraph: true, required: false, maxLength: 500 }),
          shortInput('fragments', 'Fragmentos (use 0 se só houver Orbes)', { placeholder: 'Ex.: 250', maxLength: 14 }),
          ...(category ? [shortInput('orbAmount', 'Quantidade de Orbes', { placeholder: 'Ex.: 5', maxLength: 14 })] : []),
        ]));
        return true;
      }
      const cfg = await getGuildConfig(interaction.guildId);
      if (customId === 'config:permissions:add') {
        const updatedRoles = [...new Set([...cfg.adminRoleIds, ...interaction.values])];
        if (updatedRoles.length > 25) throw new RangeError('O painel aceita até 25 cargos autorizados.');
        cfg.adminRoleIds = updatedRoles;
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId === 'config:xp:buff:add') {
        if (cfg.buffs.length >= 25 && !cfg.buffs.some((buff) => buff.roleId === interaction.values[0])) throw new RangeError('O painel aceita até 25 buffs por cargo.');
        await interaction.showModal(modal('config:modal:buff:' + interaction.values[0], 'Configurar buff por cargo', [
          shortInput('multiplier', 'Multiplicador (1 a 100)', { placeholder: 'Ex.: 1.5', maxLength: 6 }),
        ]));
        return true;
      }
    }

    if (interaction.isUserSelectMenu?.() && customId.startsWith('config:badges:')) {
      const [, , action, badgeId] = customId.split(':');
      if (!['assign', 'remove'].includes(action)) return true;
      if (!await BadgeDefinition.exists({ guildId: interaction.guildId, _id: badgeId })) throw new Error('Badge especial não encontrada.');
      for (const userId of interaction.values) {
        if (action === 'assign') {
          await MemberProfile.findOneAndUpdate({ guildId: interaction.guildId, userId }, { $addToSet: { specialBadges: badgeId } }, { upsert: true, returnDocument: 'after', runValidators: true });
        } else {
          await MemberProfile.updateOne({ guildId: interaction.guildId, userId }, { $pull: { specialBadges: badgeId } });
        }
      }
      await showBadgeDetail(interaction, badgeId);
      return true;
    }

    if (interaction.isChannelSelectMenu() && customId === 'config:casino:channels') {
      await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { allowedChannelIds: interaction.values } });
      await showCasino(interaction);
      return true;
    }

    if (interaction.isChannelSelectMenu() && customId === 'config:xp:levelup:channel') {
      const channel = interaction.guild?.channels?.cache?.get(interaction.values[0]);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        throw new RangeError('Escolha um canal de texto válido deste servidor.');
      }
      const botMember = interaction.guild.members.me;
      const permissions = botMember && channel.permissionsFor?.(botMember);
      if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
        throw new RangeError('A Kiryu precisa de Ver canal e Enviar mensagens no destino escolhido.');
      }
      const cfg = await getGuildConfig(interaction.guildId);
      cfg.levelUp.channelId = channel.id;
      await cfg.save();
      await showLevelUp(interaction);
      return true;
    }

    if (interaction.isChannelSelectMenu() && customId === 'config:xp:exclude') {
      const cfg = await getGuildConfig(interaction.guildId);
      for (const channelId of interaction.values) {
        const channel = interaction.guild.channels.cache.get(channelId);
        const settings = channel && [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
          ? cfg.voiceXp
          : cfg.messageXp;
        settings.excludedChannelIds = settings.excludedChannelIds.includes(channelId)
          ? settings.excludedChannelIds.filter((id) => id !== channelId)
          : [...settings.excludedChannelIds, channelId];
      }
      await cfg.save();
      await showXp(interaction);
      return true;
    }

    if (interaction.isButton() && customId.startsWith('config:rewards:')) {
      if (customId === 'config:rewards:work') {
        const settings = await getSettings(interaction.guildId);
        await interaction.showModal(modal('config:modal:work', 'Recompensas de trabalho', [
          shortInput('min', 'Fragmentos mínimos', { value: settings.work.min, maxLength: 14 }),
          shortInput('max', 'Fragmentos máximos', { value: settings.work.max, maxLength: 14 }),
          shortInput('cooldown', 'Intervalo em minutos', { value: Math.round(settings.work.cooldownMs / 60000), maxLength: 8 }),
        ]));
        return true;
      }
      if (customId === 'config:rewards:adventure') {
        const settings = await getSettings(interaction.guildId);
        const value = settings.adventure || {};
        await interaction.showModal(modal('config:modal:income:adventure', 'Recompensa de expedição', [
          shortInput('min', 'Fragmentos mínimos', { value: value.min ?? 80, maxLength: 14 }),
          shortInput('max', 'Fragmentos máximos', { value: value.max ?? 800, maxLength: 14 }),
          shortInput('cooldown', 'Cooldown em minutos', { value: Math.round((value.cooldownMs ?? 7200000) / 60000), maxLength: 8 }),
        ]));
        return true;
      }
      if (customId === 'config:rewards:crime') {
        const settings = await getSettings(interaction.guildId);
        const value = settings.crime || {};
        await interaction.showModal(modal('config:modal:income:crime', 'Golpe de ficção', [
          shortInput('min', 'Fragmentos ganhos · mínimo', { value: value.min ?? 100, maxLength: 14 }),
          shortInput('max', 'Fragmentos ganhos · máximo', { value: value.max ?? 1200, maxLength: 14 }),
          shortInput('fine', 'Multa · mínimo,máximo', { value: (value.fineMin ?? 50) + ',' + (value.fineMax ?? 400), maxLength: 30 }),
          shortInput('chance', 'Chance de falha · 0 a 100%', { value: value.failChancePercent ?? 35, maxLength: 3 }),
          shortInput('cooldown', 'Cooldown em minutos', { value: Math.round((value.cooldownMs ?? 10800000) / 60000), maxLength: 8 }),
        ]));
        return true;
      }
      if (customId === 'config:rewards:passive:toggle') {
        const settings = await getSettings(interaction.guildId);
        await configureIncome({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { passiveIncome: { enabled: settings.passiveIncome?.enabled !== true } } });
        return showRewards(interaction);
      }
      if (customId === 'config:rewards:toggle-work' || customId === 'config:rewards:toggle-daily') {
        const settings = await getSettings(interaction.guildId);
        if (customId.endsWith('work')) await configureWork({ guildId: interaction.guildId, actorId: interaction.user.id, enabled: settings.work?.enabled === false });
        else await configureDaily({ guildId: interaction.guildId, actorId: interaction.user.id, enabled: settings.daily?.enabled === false });
        return showRewards(interaction);
      }
      if (customId === 'config:rewards:adventure:toggle' || customId === 'config:rewards:crime:toggle') {
        const source = customId.includes(':adventure:') ? 'adventure' : 'crime';
        const settings = await getSettings(interaction.guildId);
        await configureIncome({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { [source]: { enabled: settings[source]?.enabled === false } } });
        return showRewards(interaction);
      }
      if (customId === 'config:rewards:passive:edit') {
        const settings = await getSettings(interaction.guildId);
        const value = settings.passiveIncome || {};
        await interaction.showModal(modal('config:modal:income:passive', 'Renda passiva', [
          shortInput('amount', 'Fragmentos por coleta', { value: value.amount || 100, maxLength: 14 }),
          shortInput('interval', 'Intervalo em horas', { value: Math.round((value.intervalMs || 86400000) / 3600000), maxLength: 8 }),
        ]));
        return true;
      }
      if (customId === 'config:rewards:conversion') {
        const settings = await getSettings(interaction.guildId);
        await interaction.showModal(modal('config:modal:conversion', 'Conversão de Orbes', [
          shortInput('rate', 'Orbes para uma categoria seguinte', { value: settings.orbs?.conversionRate || 10, maxLength: 7 }),
        ]));
        return true;
      }
      const part = customId.split(':').at(-1);
      const current = (await getSettings(interaction.guildId)).daily.rewardRanges;
      const fields = part === 'base'
        ? [
          shortInput('fragmentos_min', 'Fragmentos mínimos', { value: current.fragments.min, maxLength: 14 }),
          shortInput('fragmentos_max', 'Fragmentos máximos', { value: current.fragments.max, maxLength: 14 }),
          shortInput('green_min', 'Orbes verdes mínimas', { value: current.orbs.green.min, maxLength: 14 }),
          shortInput('green_max', 'Orbes verdes máximas', { value: current.orbs.green.max, maxLength: 14 }),
        ]
        : part === 'blue' ? [
          shortInput('blue_min', 'Orbes azuis mínimas', { value: current.orbs.blue.min, maxLength: 14 }),
          shortInput('blue_max', 'Orbes azuis máximas', { value: current.orbs.blue.max, maxLength: 14 }),
          shortInput('orange_min', 'Orbes laranjas mínimas', { value: current.orbs.orange.min, maxLength: 14 }),
          shortInput('orange_max', 'Orbes laranjas máximas', { value: current.orbs.orange.max, maxLength: 14 }),
        ] : part === 'red' ? [
          shortInput('red_min', 'Orbes vermelhas mínimas', { value: current.orbs.red.min, maxLength: 14 }),
          shortInput('red_max', 'Orbes vermelhas máximas', { value: current.orbs.red.max, maxLength: 14 }),
        ] : [
          shortInput('black_min', 'Orbes pretas mínimas', { value: current.orbs.black.min, maxLength: 14 }),
          shortInput('black_max', 'Orbes pretas máximas', { value: current.orbs.black.max, maxLength: 14 }),
          shortInput('gold_min', 'Orbes douradas mínimas', { value: current.orbs.gold.min, maxLength: 14 }),
          shortInput('gold_max', 'Orbes douradas máximas', { value: current.orbs.gold.max, maxLength: 14 }),
        ];
      await interaction.showModal(modal('config:modal:daily:' + part, 'Recompensas diárias', fields));
      return true;
    }

    if (interaction.isButton() && customId.startsWith('config:casino:')) {
      const parts = customId.split(':');
      if (parts[2] === 'edit') {
        const settings = await getSettings(interaction.guildId);
        const casino = settings.casino || {};
        await interaction.showModal(modal('config:modal:casino:limits', 'Limites e sessões do cassino', [
          shortInput('maxBet', 'Aposta máxima em Fragmentos', { value: casino.maxBet || 1000000000, maxLength: 14 }),
          shortInput('cooldown', 'Cooldown por partida · minutos', { value: Math.round(casino.cooldownMs / 60000), maxLength: 8 }),
          shortInput('lossLimit', 'Perda virtual máxima por dia · 0 desativa', { value: casino.dailyLossLimit || 0, maxLength: 14 }),
          shortInput('session', 'Expiração de sessão · minutos', { value: casino.sessionMinutes || 15, maxLength: 3 }),
          shortInput('turn', 'Prazo máximo por turno · minutos', { value: casino.turnTimeoutMinutes || 2, maxLength: 2 }),
        ]));
        return true;
      }
      if (parts[2] === 'payouts') {
        const settings = await getSettings(interaction.guildId);
        const casino = settings.casino || {};
        await interaction.showModal(modal('config:modal:casino:payouts', 'Pagamentos dos jogos clássicos', [
          shortInput('flip', 'Total pago · Cara ou coroa (2 a 100)', { value: casino.flip?.multiplier || 2, maxLength: 3 }),
          shortInput('dice', 'Total pago · Dados (2 a 100)', { value: casino.dice?.multiplier || 2, maxLength: 3 }),
          shortInput('slots', 'Total pago · Caça-níquel (2 a 100)', { value: casino.slots?.multiplier || 5, maxLength: 3 }),
          shortInput('maxTickets', 'Bilhetes máximos por pessoa', { value: casino.maxLotteryTicketsPerMember || 100, maxLength: 4 }),
          shortInput('ticketPrice', 'Preço do bilhete de loteria', { value: casino.lotteryTicketPrice || 100, maxLength: 14 }),
        ]));
        return true;
      }
      if (customId === 'config:casino:channels:any') {
        await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { allowedChannelIds: [] } });
        return showCasino(interaction);
      }
    }

    if (interaction.isButton() && customId.startsWith('config:economy:')) {
      const settings = await getSettings(interaction.guildId);
      const economy = settings.economy || {};
      if (customId === 'config:economy:wallet') {
        await interaction.showModal(modal('config:modal:economy:wallet', 'Saldos e limites', [
          shortInput('initialWallet', 'Saldo inicial · carteira', { value: economy.initialWallet ?? 0, maxLength: 16 }),
          shortInput('initialBank', 'Saldo inicial · banco', { value: economy.initialBank ?? 0, maxLength: 16 }),
          shortInput('walletLimit', 'Limite da carteira', { value: economy.walletLimit || Number.MAX_SAFE_INTEGER, maxLength: 16 }),
          shortInput('bankLimit', 'Limite do banco', { value: economy.bankLimit || Number.MAX_SAFE_INTEGER, maxLength: 16 }),
        ]));
        return true;
      }
      if (customId === 'config:economy:market') {
        await interaction.showModal(modal('config:modal:economy:market', 'Mercado e leilões', [
          shortInput('marketFee', 'Taxa de venda no mercado · 0 a 50%', { value: economy.marketFeePercent ?? 5, maxLength: 2 }),
          shortInput('listingDays', 'Expiração de anúncio · dias', { value: economy.marketListingDays || 7, maxLength: 2 }),
          shortInput('maxListings', 'Anúncios ativos máximos por pessoa', { value: economy.maxListingsPerMember || 10, maxLength: 3 }),
          shortInput('auctionFee', 'Taxa de leilão · 0 a 50%', { value: economy.auctionFeePercent ?? 5, maxLength: 2 }),
          shortInput('increment', 'Incremento mínimo de lance', { value: economy.auctionMinIncrement || 10, maxLength: 14 }),
        ]));
        return true;
      }
      if (customId === 'config:economy:trade') {
        await interaction.showModal(modal('config:modal:economy:trade', 'Trocas e loteria', [
          shortInput('tradeHours', 'Expiração de troca · horas', { value: economy.tradeExpiryHours || 24, maxLength: 3 }),
          shortInput('lotteryFee', 'Taxa do prêmio da loteria · 0 a 50%', { value: economy.lotteryFeePercent ?? 0, maxLength: 2 }),
        ]));
        return true;
      }
    }

    if (interaction.isButton() && customId.startsWith('config:store:')) {
      const parts = customId.split(':');
      if (parts[2] === 'toggle') {
        const field = parts[3] === 'active' ? 'active' : 'visibleInStore';
        const sku = parts.slice(4).join(':');
        const item = await EconomyItem.findOne({ guildId: interaction.guildId, sku, deletedAt: null }).lean();
        if (!item) return showStores(interaction);
        await editCatalogItem({ guildId: interaction.guildId, actorId: interaction.user.id, sku, changes: { [field]: !item[field] } });
        return showStoreDetail(interaction, sku);
      }
      if (parts[2] === 'create') {
        const currency = parts[3] === 'orbs' ? 'orbs' : 'fragments';
        if (currency === 'orbs') {
          const category = new StringSelectMenuBuilder().setCustomId('config:store:create:orbtype').setPlaceholder('Categoria de Orbe usada no preço')
            .addOptions(ORB_TYPES.map((type) => ({ label: ORBS[type].label, value: type, emoji: ORBS[type].emoji })));
          return updatePanel(interaction, { components: [container('# Novo item · Orbes\nEscolha a categoria de Orbe que será usada como preço.', [navRow(), row(category), row(button('config:stores:page:0', 'Cancelar'))])], allowedMentions: { parse: [] } });
        }
        const fields = [
          shortInput('sku', 'Identificador (ex.: pocao-nova)', { maxLength: 32 }),
          shortInput('name', 'Nome exibido na loja', { maxLength: 80 }),
          shortInput('description', 'Descrição do item', { paragraph: true, maxLength: 1000 }),
          shortInput('price', 'Preço inteiro', { maxLength: 14 }),
        ];
        await interaction.showModal(modal('config:modal:store:create:' + currency, currency === 'orbs' ? 'Novo item · Orbes' : 'Novo item · Fragmentos', fields));
        return true;
      }
      if (parts[2] === 'delete' && parts[3] !== 'confirm') {
        const sku = parts.slice(3).join(':');
        return updatePanel(interaction, { components: [container('# Remover item da loja?\nO item sai do catálogo, mas cópias já adquiridas e registros ficam preservados.', [
          navRow(), row(button('config:store:delete:confirm:' + sku, 'Confirmar remoção', ButtonStyle.Danger), button('config:store:back', 'Cancelar')),
        ])], allowedMentions: { parse: [] } });
      }
      if (parts[2] === 'art') {
        const sku = parts.slice(3).join(':');
        const item = await EconomyItem.findOne({ guildId: interaction.guildId, sku, deletedAt: null }).lean();
        if (!item) return showStores(interaction);
        await interaction.showModal(modal('config:modal:store:art:' + sku, 'Arte da vitrine', [
          shortInput('thumbnailUrl', 'URL HTTPS da imagem (vazio remove)', { value: item.thumbnailUrl || '', required: false, maxLength: 500 }),
        ]));
        return true;
      }
      if (parts[2] === 'delete' && parts[3] === 'confirm') {
        const sku = parts.slice(4).join(':');
        await deleteCatalogItem({ guildId: interaction.guildId, actorId: interaction.user.id, sku });
        await showStores(interaction, false);
        return true;
      }
      if (parts[2] === 'back') {
        await showStores(interaction);
        return true;
      }
    }

    if (interaction.isButton() && customId.startsWith('config:stores:page:')) {
      return showStores(interaction, true, Math.max(0, Number(customId.split(':').at(-1)) || 0));
    }

    if (interaction.isButton() && customId.startsWith('config:rules:')) {
      const parts = customId.split(':');
      if (parts[2] === 'page') return showRules(interaction, true, Math.max(0, Number(parts[3]) || 0));
      if (parts[2] === 'schedule') return showRuleSchedule(interaction, parts.slice(3).join(':'));
      if (parts[2] === 'detail') return showRuleDetail(interaction, parts.slice(3).join(':'));
      if (parts[2] === 'stack') {
        const ruleId = parts.slice(3).join(':');
        const rule = await EconomyCollectRule.findOne({ guildId: interaction.guildId, _id: ruleId, active: true }).lean();
        if (!rule) return showRules(interaction);
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: { stackable: !rule.stackable } });
        return showRuleDetail(interaction, ruleId);
      }
      if (parts[2] === 'create') {
        const frequency = new StringSelectMenuBuilder().setCustomId('config:rule:create:frequency').setPlaceholder('Escolher frequência')
          .addOptions([{ label: 'Diariamente', value: 'daily' }, { label: 'Semanalmente', value: 'weekly' }, { label: 'Mensalmente', value: 'monthly' }]);
        return updatePanel(interaction, { components: [container('# Nova recompensa por cargo\nEscolha quando a coleta volta a ficar disponível.', [navRow(), row(frequency), row(button('config:rules:back', 'Cancelar'))])], allowedMentions: { parse: [] } });
      }
      if (parts[2] === 'edit') {
        const ruleId = parts.slice(3).join(':');
        const rule = await EconomyCollectRule.findOne({ guildId: interaction.guildId, _id: ruleId, active: true }).lean();
        if (!rule) return showRules(interaction);
        const fields = [
          shortInput('name', 'Nome da recompensa', { value: rule.name, maxLength: 80 }),
          shortInput('description', 'Descrição', { value: rule.description || '', required: false, paragraph: true, maxLength: 500 }),
          shortInput('fragments', 'Fragmentos', { value: rule.fragments, maxLength: 14 }),
        ];
        if (rule.orbType) fields.push(shortInput('orbAmount', 'Quantidade de Orbes', { value: rule.orbAmount, maxLength: 14 }));
        await interaction.showModal(modal('config:modal:rule:edit:' + ruleId, 'Editar recompensa', fields));
        return true;
      }
      if (parts[2] === 'delete') {
        const ruleId = parts.slice(3).join(':');
        if (parts[3] === 'confirm') {
          await removeCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId: parts.slice(4).join(':') });
          await showRules(interaction, false);
          return true;
        }
        return updatePanel(interaction, { components: [container('# Remover recompensa?', [
          navRow(), row(button('config:rules:delete:confirm:' + ruleId, 'Confirmar remoção', ButtonStyle.Danger), button('config:rules:detail:' + ruleId, 'Cancelar')),
        ])], allowedMentions: { parse: [] } });
      }
      if (parts[2] === 'detail') return showRuleDetail(interaction, parts.slice(3).join(':'));
      if (parts[2] === 'back') return showRules(interaction);
    }

    if (interaction.isModalSubmit()) {
      if (customId === 'config:modal:storage:limit') {
        const maxMegabytes = parseNumber(interaction.fields.getTextInputValue('maxBytes'), { min: 0, max: 1048576, label: 'Limite total em MB' });
        const fileMegabytes = parseNumber(interaction.fields.getTextInputValue('maxFileMb'), { min: 1, max: 100, label: 'Tamanho do arquivo em MB' });
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.storage.maxBytes = maxMegabytes * 1048576;
        cfg.storage.maxFileBytes = fileMegabytes * 1048576;
        await cfg.save();
        return showStorage(interaction, false);
      }
      if (customId.startsWith('config:modal:storage:rename:')) {
        const objectId = customId.slice('config:modal:storage:rename:'.length);
        const object = await BlobObject.findOne({ _id: objectId, guildId: String(interaction.guildId), deletedAt: null }).lean();
        if (!object) throw new RangeError('Objeto não encontrado.');
        const newName = interaction.fields.getTextInputValue('name');
        if (object.references?.length && object.name !== newName.trim() && ['design-system', 'casino', 'profile', 'frame', 'cosmetic'].includes(object.category)) {
          throw new RangeError('Assets visuais ativos mantêm o nome usado pelo sistema. Você pode renomear objetos sem referência ativa.');
        }
        await blobStorage.renameObject(objectId, interaction.guildId, newName);
        await refreshBlobAssetOverrides(interaction.guildId);
        return showStorageObject(interaction, objectId, 0, 'all');
      }
      if (customId === 'config:modal:utilities:limits') {
        const maxReminders = parseNumber(interaction.fields.getTextInputValue('maxReminders'), { min: 1, max: 100, label: 'Lembretes por membro' });
        const maxDays = parseNumber(interaction.fields.getTextInputValue('maxDays'), { min: 1, max: 3650, label: 'Prazo máximo em dias' });
        const cfg = await getGuildConfig(interaction.guildId); cfg.utilities.maxRemindersPerMember = maxReminders; cfg.utilities.maxReminderDays = maxDays; await cfg.save();
        return showUtilitySettings(interaction);
      }
      if (customId === 'config:modal:moderation:limits') {
        const threshold = parseNumber(interaction.fields.getTextInputValue('threshold'), { min: 0, max: 100, label: 'Limite de advertências' });
        const cfg = await getGuildConfig(interaction.guildId); cfg.moderation.warnThreshold = threshold; await cfg.save();
        return showModerationSettings(interaction);
      }
      if (customId === 'config:modal:giveaways:limits') {
        const maxDays = parseNumber(interaction.fields.getTextInputValue('maxDays'), { min: 1, max: 3650, label: 'Duração máxima em dias' });
        const cfg = await getGuildConfig(interaction.guildId); cfg.giveaways.maxDurationDays = maxDays; await cfg.save();
        return showGiveawaySettings(interaction);
      }
      if (customId.startsWith('config:modal:badge:create:')) {
        const category = customId.split(':').at(-1);
        if (!BADGE_CATEGORIES.some((item) => item.value === category)) throw new RangeError('Categoria de badge inválida.');
        const name = interaction.fields.getTextInputValue('name').trim();
        const symbol = interaction.fields.getTextInputValue('symbol').trim();
        const description = interaction.fields.getTextInputValue('description').trim();
        if (!name || !symbol) throw new RangeError('Nome e símbolo da badge são obrigatórios.');
        await BadgeDefinition.create({ guildId: interaction.guildId, name, symbol, description, category });
        await showBadges(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:badge:edit:')) {
        const badgeId = customId.split(':').at(-1);
        const badge = await BadgeDefinition.findOne({ guildId: interaction.guildId, _id: badgeId });
        if (!badge) throw new Error('Badge especial não encontrada.');
        const name = interaction.fields.getTextInputValue('name').trim();
        const symbol = interaction.fields.getTextInputValue('symbol').trim();
        const description = interaction.fields.getTextInputValue('description').trim();
        if (!name || !symbol) throw new RangeError('Nome e símbolo da badge são obrigatórios.');
        badge.name = name; badge.symbol = symbol; badge.description = description;
        await badge.save();
        await showBadgeDetail(interaction, badgeId, false);
        return true;
      }
      if (customId === 'config:modal:casino:limits') {
        await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          maxBet: parseNumber(interaction.fields.getTextInputValue('maxBet'), { min: 1, max: 1000000000, label: 'Aposta máxima' }),
          cooldownMs: parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 0, max: 1440, label: 'Cooldown em minutos' }) * 60000,
          dailyLossLimit: parseNumber(interaction.fields.getTextInputValue('lossLimit'), { min: 0, max: Number.MAX_SAFE_INTEGER, label: 'Limite diário de perdas' }),
          sessionMinutes: parseNumber(interaction.fields.getTextInputValue('session'), { min: 1, max: 120, label: 'Duração da sessão' }),
          turnTimeoutMinutes: parseNumber(interaction.fields.getTextInputValue('turn'), { min: 1, max: 60, label: 'Prazo por turno' }),
        } });
        await showCasino(interaction, false);
        return true;
      }
      if (customId === 'config:modal:casino:payouts') {
        await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          flip: { multiplier: parseNumber(interaction.fields.getTextInputValue('flip'), { min: 2, max: 100, label: 'Pagamento total de cara ou coroa' }) },
          dice: { multiplier: parseNumber(interaction.fields.getTextInputValue('dice'), { min: 2, max: 100, label: 'Pagamento total dos dados' }) },
          slots: { multiplier: parseNumber(interaction.fields.getTextInputValue('slots'), { min: 2, max: 100, label: 'Pagamento total do caça-níquel' }) },
          maxLotteryTicketsPerMember: parseNumber(interaction.fields.getTextInputValue('maxTickets'), { min: 1, max: 1000, label: 'Bilhetes máximos por pessoa' }),
          lotteryTicketPrice: parseNumber(interaction.fields.getTextInputValue('ticketPrice'), { min: 1, max: Number.MAX_SAFE_INTEGER, label: 'Preço do bilhete' }),
        } });
        await showCasino(interaction, false);
        return true;
      }
      if (customId === 'config:modal:economy:wallet') {
        const changes = {
          initialWallet: parseNumber(interaction.fields.getTextInputValue('initialWallet'), { min: 0, max: Number.MAX_SAFE_INTEGER, label: 'Saldo inicial da carteira' }),
          initialBank: parseNumber(interaction.fields.getTextInputValue('initialBank'), { min: 0, max: Number.MAX_SAFE_INTEGER, label: 'Saldo inicial do banco' }),
          walletLimit: parseNumber(interaction.fields.getTextInputValue('walletLimit'), { min: 1, max: Number.MAX_SAFE_INTEGER, label: 'Limite da carteira' }),
          bankLimit: parseNumber(interaction.fields.getTextInputValue('bankLimit'), { min: 1, max: Number.MAX_SAFE_INTEGER, label: 'Limite do banco' }),
        };
        if (changes.initialWallet > changes.walletLimit || changes.initialBank > changes.bankLimit) throw new RangeError('O saldo inicial não pode superar o respectivo limite.');
        await configureEconomy({ guildId: interaction.guildId, actorId: interaction.user.id, changes });
        await showEconomy(interaction, false);
        return true;
      }
      if (customId === 'config:modal:economy:market') {
        await configureEconomy({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          marketFeePercent: parseNumber(interaction.fields.getTextInputValue('marketFee'), { min: 0, max: 50, label: 'Taxa do mercado' }),
          marketListingDays: parseNumber(interaction.fields.getTextInputValue('listingDays'), { min: 1, max: 30, label: 'Duração do anúncio' }),
          maxListingsPerMember: parseNumber(interaction.fields.getTextInputValue('maxListings'), { min: 1, max: 100, label: 'Limite de anúncios' }),
          auctionFeePercent: parseNumber(interaction.fields.getTextInputValue('auctionFee'), { min: 0, max: 50, label: 'Taxa de leilão' }),
          auctionMinIncrement: parseNumber(interaction.fields.getTextInputValue('increment'), { min: 1, max: Number.MAX_SAFE_INTEGER, label: 'Incremento mínimo de lance' }),
        } });
        await showEconomy(interaction, false);
        return true;
      }
      if (customId === 'config:modal:economy:trade') {
        await configureEconomy({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          tradeExpiryHours: parseNumber(interaction.fields.getTextInputValue('tradeHours'), { min: 1, max: 168, label: 'Expiração de troca' }),
          lotteryFeePercent: parseNumber(interaction.fields.getTextInputValue('lotteryFee'), { min: 0, max: 50, label: 'Taxa da loteria' }),
        } });
        await showEconomy(interaction, false);
        return true;
      }
      if (customId === 'config:modal:income:adventure') {
        await configureIncome({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { adventure: {
          min: parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 1000000000000, label: 'Recompensa mínima' }),
          max: parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 1000000000000, label: 'Recompensa máxima' }),
          cooldownMinutes: parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 1, max: 525600, label: 'Cooldown' }),
        } } });
        await showRewards(interaction, false);
        return true;
      }
      if (customId === 'config:modal:income:crime') {
        const fineParts = interaction.fields.getTextInputValue('fine').split(',').map((part) => part.trim());
        if (fineParts.length !== 2) throw new RangeError('Informe a multa como mínimo,máximo.');
        await configureIncome({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { crime: {
          min: parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 1000000000000, label: 'Recompensa mínima' }),
          max: parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 1000000000000, label: 'Recompensa máxima' }),
          fineMin: parseNumber(fineParts[0], { min: 0, max: 1000000000000, label: 'Multa mínima' }),
          fineMax: parseNumber(fineParts[1], { min: 0, max: 1000000000000, label: 'Multa máxima' }),
          failChancePercent: parseNumber(interaction.fields.getTextInputValue('chance'), { min: 0, max: 100, label: 'Chance de falha' }),
          cooldownMinutes: parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 1, max: 525600, label: 'Cooldown' }),
        } } });
        await showRewards(interaction, false);
        return true;
      }
      if (customId === 'config:modal:income:passive') {
        await configureIncome({ guildId: interaction.guildId, actorId: interaction.user.id, changes: { passiveIncome: {
          amount: parseNumber(interaction.fields.getTextInputValue('amount'), { min: 0, max: 1000000000000, label: 'Renda passiva' }),
          intervalHours: parseNumber(interaction.fields.getTextInputValue('interval'), { min: 1, max: 8760, label: 'Intervalo' }),
        } } });
        await showRewards(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:rules:schedule:calendar:')) {
        const parts = customId.split(':');
        const ruleId = parts[5];
        const calendarValue = parseNumber(interaction.fields.getTextInputValue('day'), { min: 1, max: 31, label: 'Dia do mês' });
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: {
          frequency: 'calendar', calendarUnit: 'month', calendarValue,
        } });
        await showRuleDetail(interaction, ruleId, false);
        return true;
      }
      if (customId.startsWith('config:modal:rules:schedule:interval:')) {
        const ruleId = customId.split(':').at(-1);
        const minutes = parseNumber(interaction.fields.getTextInputValue('minutes'), { min: 1, max: 525600, label: 'Intervalo em minutos' });
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes: { frequency: 'interval', intervalMs: minutes * 60000 } });
        await showRuleDetail(interaction, ruleId, false);
        return true;
      }
      if (customId === 'config:modal:conversion') {
        const conversionRate = parseNumber(interaction.fields.getTextInputValue('rate'), { min: 2, max: 1000000, label: 'Taxa de conversão' });
        await configureOrbConversion({ guildId: interaction.guildId, actorId: interaction.user.id, conversionRate });
        await showRewards(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:rule:create:')) {
        const [, , , , roleId, frequency, orbTypeValue] = customId.split(':');
        const orbType = orbTypeValue === 'none' ? null : orbTypeValue;
        const fragments = parseNumber(interaction.fields.getTextInputValue('fragments'), { min: 0, max: 1000000000000, label: 'Fragmentos' });
        const orbAmount = orbType ? parseNumber(interaction.fields.getTextInputValue('orbAmount'), { min: 0, max: 1000000000000, label: 'Orbes' }) : 0;
        await createCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, roleId,
          frequency, name: interaction.fields.getTextInputValue('name').trim(), description: interaction.fields.getTextInputValue('description').trim(),
          fragments, orbType, orbAmount, stackable: false });
        await showRules(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:rule:edit:')) {
        const ruleId = customId.split(':').at(-1);
        const rule = await EconomyCollectRule.findOne({ guildId: interaction.guildId, _id: ruleId, active: true }).lean();
        if (!rule) throw new Error('Recompensa não encontrada.');
        const changes = {
          name: interaction.fields.getTextInputValue('name').trim(),
          description: interaction.fields.getTextInputValue('description').trim(),
          fragments: parseNumber(interaction.fields.getTextInputValue('fragments'), { min: 0, max: 1000000000000, label: 'Fragmentos' }),
        };
        if (rule.orbType) changes.orbAmount = parseNumber(interaction.fields.getTextInputValue('orbAmount'), { min: 0, max: 1000000000000, label: 'Orbes' });
        await editCollectRule({ guildId: interaction.guildId, actorId: interaction.user.id, ruleId, changes });
        await showRules(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:store:create:')) {
        const modalParts = customId.split(':');
        const currency = modalParts[4] === 'orbs' ? 'orbs' : 'fragments';
        const price = parseNumber(interaction.fields.getTextInputValue('price'), { min: 0, max: 1000000000000, label: 'Preço' });
        const description = interaction.fields.getTextInputValue('description').trim();
        const sku = interaction.fields.getTextInputValue('sku').trim();
        const name = interaction.fields.getTextInputValue('name').trim();
        const orbType = currency === 'orbs' ? modalParts[5] : null;
        await createCatalogItem({ guildId: interaction.guildId, actorId: interaction.user.id, sku, name, description, price, currency, orbType,
          emoji: '📦', active: true, visibleInStore: true, stock: null, inventoryVisible: true, stackable: true, usable: false,
          consumeOnUse: true, purchaseQuantity: 1, delivery: 'inventory', effectDescription: description, useMessage: '',
          action: 'none', actionAmount: 0, actionOrbType: null, purchaseChoices: [] });
        await showStores(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:store:art:')) {
        const sku = customId.slice('config:modal:store:art:'.length);
        const thumbnailUrl = interaction.fields.getTextInputValue('thumbnailUrl').trim();
        const previous = await EconomyItem.findOne({ guildId: interaction.guildId, sku, deletedAt: null }).lean();
        const item = await editCatalogItem({ guildId: interaction.guildId, actorId: interaction.user.id, sku, changes: { thumbnailUrl, thumbnailBlobId: '' } });
        if (previous?.thumbnailBlobId) await blobStorage.removeReference(previous.thumbnailBlobId, interaction.guildId, 'product', sku);
        await showStoreDetail(interaction, item.sku);
        return true;
      }
      if (customId === 'config:modal:work') {
        const min = parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 1000000000000, label: 'Mínimo' });
        const max = parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 1000000000000, label: 'Máximo' });
        const cooldownMinutes = parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 1, max: 525600, label: 'Intervalo em minutos' });
        await configureWork({ guildId: interaction.guildId, actorId: interaction.user.id, min, max, cooldownMinutes });
        await showRewards(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:daily:')) {
        const part = customId.split(':').at(-1);
        const settings = await getSettings(interaction.guildId);
        const dailyRanges = settings.daily.rewardRanges;
        const groups = part === 'base' ? ['fragments', 'green'] : part === 'blue' ? ['blue', 'orange'] : part === 'red' ? ['red'] : ['black', 'gold'];
        for (const type of groups) {
          const prefix = type === 'fragments' ? 'fragmentos' : type;
          const min = parseNumber(interaction.fields.getTextInputValue(prefix + '_min'), { min: 0, max: 1000000000000, label: prefix + ' mínimo' });
          const max = parseNumber(interaction.fields.getTextInputValue(prefix + '_max'), { min: 0, max: 1000000000000, label: prefix + ' máximo' });
          if (min > max) throw new RangeError('O mínimo de ' + prefix + ' não pode superar o máximo.');
          if (type === 'fragments') dailyRanges.fragments = { min, max };
          else dailyRanges.orbs[type] = { min, max };
        }
        await configureDaily({ guildId: interaction.guildId, actorId: interaction.user.id, fragmentRange: dailyRanges.fragments,
          orbRanges: dailyRanges.orbs });
        await showRewards(interaction, false);
        return true;
      }
      if (customId === 'config:modal:message_xp') {
        const min = parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 10000, label: 'XP mínimo' });
        const max = parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 10000, label: 'XP máximo' });
        const seconds = parseNumber(interaction.fields.getTextInputValue('cooldown'), { min: 0, max: 86400, label: 'Cooldown em segundos' });
        if (min > max) throw new RangeError('XP mínimo não pode superar o XP máximo.');
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.messageXp.min = min;
        cfg.messageXp.max = max;
        cfg.messageXp.cooldownMs = seconds * 1000;
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId === 'config:modal:voice_xp') {
        const min = parseNumber(interaction.fields.getTextInputValue('min'), { min: 0, max: 10000, label: 'XP mínimo' });
        const max = parseNumber(interaction.fields.getTextInputValue('max'), { min: 0, max: 10000, label: 'XP máximo' });
        const minutes = parseNumber(interaction.fields.getTextInputValue('interval'), { min: 1, max: 1440, label: 'Intervalo em minutos' });
        if (min > max) throw new RangeError('XP mínimo não pode superar o XP máximo.');
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.voiceXp.min = min;
        cfg.voiceXp.max = max;
        cfg.voiceXp.intervalMs = minutes * 60000;
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId === 'config:modal:levelup') {
        const message = interaction.fields.getTextInputValue('message').trim();
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.levelUp.message = message;
        await cfg.save();
        await showLevelUp(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:buff:')) {
        const roleId = customId.split(':').at(-1);
        const multiplier = Number(interaction.fields.getTextInputValue('multiplier'));
        if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100) throw new RangeError('O multiplicador deve estar entre 1 e 100.');
        const cfg = await getGuildConfig(interaction.guildId);
        const existing = cfg.buffs.find((buff) => buff.roleId === roleId);
        if (existing) existing.multiplier = multiplier;
        else cfg.buffs.push({ roleId, multiplier });
        await cfg.save();
        await showXp(interaction, false);
        return true;
      }
      if (customId === 'config:modal:trigger:create') {
        const text = interaction.fields.getTextInputValue('text').trim().replace(/\s+/g, ' ');
        const response = interaction.fields.getTextInputValue('response').trim();
        if (!text || !response) throw new RangeError('Gatilho e resposta não podem ficar vazios.');
        if (response.length > 1900) throw new RangeError('A resposta pode ter até 1.900 caracteres.');
        const cfg = await getGuildConfig(interaction.guildId);
        if (cfg.triggers.length >= 25) throw new RangeError('O painel aceita até 25 gatilhos.');
        if (cfg.triggers.some((trigger) => normalizeTriggerText(trigger.text) === normalizeTriggerText(text))) throw new RangeError('Já existe um gatilho com esse texto.');
        cfg.triggers.push({ text, responses: [response], enabled: true });
        await cfg.save();
        await showTriggers(interaction, false);
        return true;
      }
      if (customId.startsWith('config:modal:trigger:text:')) {
        const triggerId = customId.split(':').at(-1);
        const text = interaction.fields.getTextInputValue('text').trim().replace(/\s+/g, ' ');
        if (!text) throw new RangeError('O texto do gatilho não pode ficar vazio.');
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (cfg.triggers.some((item) => item.id !== triggerId && normalizeTriggerText(item.text) === normalizeTriggerText(text))) throw new RangeError('Já existe um gatilho com esse texto.');
        trigger.text = text;
        await cfg.save();
        await showTriggerDetail(interaction, triggerId, false);
        return true;
      }
      if (customId.startsWith('config:modal:trigger:response:add:') || customId.startsWith('config:modal:trigger:response:edit:')) {
        const parts = customId.split(':');
        const editing = parts[4] === 'edit';
        const triggerId = parts[parts.length - (editing ? 2 : 1)];
        const index = editing ? Number(parts.at(-1)) : -1;
        const response = interaction.fields.getTextInputValue('response').trim();
        if (!response) throw new RangeError('A resposta não pode ficar vazia.');
        if (response.length > 1900) throw new RangeError('A resposta pode ter até 1.900 caracteres.');
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (editing) {
          if (!trigger.responses[index]) throw new Error('Resposta não encontrada.');
          trigger.responses[index] = response;
        } else {
          if (trigger.responses.length >= 25) throw new RangeError('Cada gatilho pode ter até 25 respostas.');
          trigger.responses.push(response);
        }
        await cfg.save();
        await showTriggerDetail(interaction, triggerId, false);
        return true;
      }
    }

    if (interaction.isButton()) {
      if (customId === 'config:storage:limit') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:storage:limit', 'Limites do Blob', [
          shortInput('maxBytes', 'Limite total em MB · 0 sem limite adicional', { value: cfg.storage?.maxBytes ? Math.round(cfg.storage.maxBytes / 1048576) : 0, maxLength: 8 }),
          shortInput('maxFileMb', 'Tamanho máximo por arquivo em MB · 1 a 100', { value: Math.max(1, Math.round((cfg.storage?.maxFileBytes || 8388608) / 1048576)), maxLength: 3 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:storage:rename:')) {
        const objectId = customId.slice('config:storage:rename:'.length).split(':')[0];
        const object = await BlobObject.findOne({ _id: objectId, guildId: String(interaction.guildId), deletedAt: null }).lean();
        if (!object) throw new RangeError('Objeto não encontrado.');
        await interaction.showModal(modal('config:modal:storage:rename:' + objectId, 'Renomear asset', [shortInput('name', 'Nome exibido', { value: object.name, maxLength: 100 })]));
        return true;
      }
      if (customId.startsWith('config:storage:delete:')) {
        const [, , , objectId, pageText, category] = customId.split(':');
        const result = await blobStorage.deleteObject(objectId, interaction.guildId);
        if (!result.deleted && result.reason === 'referenced') {
          await followUpV2(interaction, 'Este objeto possui ' + result.references.length + ' referência(s) ativa(s). Atualize esses sistemas antes de excluir.');
          return showStorageObject(interaction, objectId, Number(pageText) || 0, category || 'all');
        }
        if (result.deleted) await refreshBlobAssetOverrides(interaction.guildId);
        return showStorage(interaction, true, { page: Number(pageText) || 0, category: category || 'all' });
      }
      if (customId.startsWith('config:storage:page:')) {
        const [, , , pageText, category] = customId.split(':');
        return showStorage(interaction, true, { page: Math.max(0, Number(pageText) || 0), category: category || 'all' });
      }
      if (customId.startsWith('config:storage:refresh:')) {
        const [, , , pageText, category] = customId.split(':');
        return showStorage(interaction, true, { page: Number(pageText) || 0, category: category || 'all' });
      }
      if (customId.startsWith('config:storage:back:')) {
        const [, , , pageText, category] = customId.split(':');
        return showStorage(interaction, true, { page: Number(pageText) || 0, category: category || 'all' });
      }
      if (customId === 'config:storage:toggle') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.storage.uploadsEnabled = cfg.storage.uploadsEnabled === false; await cfg.save();
        return showStorage(interaction, true);
      }
      if (customId === 'config:utilities:reminders' || customId === 'config:utilities:polls' || customId === 'config:utilities:afk') {
        const cfg = await getGuildConfig(interaction.guildId); const field = customId.split(':').at(-1) + 'Enabled';
        cfg.utilities[field] = cfg.utilities[field] === false; await cfg.save(); return showUtilitySettings(interaction);
      }
      if (customId === 'config:utilities:limits') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:utilities:limits', 'Limites dos lembretes', [
          shortInput('maxReminders', 'Lembretes pendentes por membro', { value: cfg.utilities?.maxRemindersPerMember || 20, maxLength: 3 }),
          shortInput('maxDays', 'Prazo máximo em dias', { value: cfg.utilities?.maxReminderDays || 365, maxLength: 4 }),
        ]));
        return true;
      }
      if (customId === 'config:moderation:toggle') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.moderation.enabled = cfg.moderation.enabled === false; await cfg.save();
        return showModerationSettings(interaction);
      }
      if (customId === 'config:moderation:clearlogs') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.moderation.logChannelId = ''; await cfg.save(); return showModerationSettings(interaction);
      }
      if (customId === 'config:moderation:limits') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:moderation:limits', 'Limite de advertências', [shortInput('threshold', 'Avisar a equipe a partir de · 0 desativa', { value: cfg.moderation?.warnThreshold || 0, maxLength: 3 })]));
        return true;
      }
      if (customId === 'config:giveaways:toggle') {
        const cfg = await getGuildConfig(interaction.guildId); cfg.giveaways.enabled = cfg.giveaways.enabled === false; await cfg.save(); return showGiveawaySettings(interaction);
      }
      if (customId === 'config:giveaways:limits') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:giveaways:limits', 'Limite de duração', [shortInput('maxDays', 'Duração máxima em dias', { value: cfg.giveaways?.maxDurationDays || 365, maxLength: 4 })]));
        return true;
      }
      if (customId.startsWith('config:badges:page:')) return showBadges(interaction, true, Number(customId.split(':').at(-1)) || 0);
      if (customId.startsWith('config:badges:edit:')) {
        const badgeId = customId.split(':').at(-1);
        const badge = await BadgeDefinition.findOne({ guildId: interaction.guildId, _id: badgeId }).lean();
        if (!badge) throw new Error('Badge especial não encontrada.');
        await interaction.showModal(modal('config:modal:badge:edit:' + badgeId, 'Editar badge especial', [
          shortInput('name', 'Nome exibido', { value: badge.name, maxLength: 40, minLength: 1 }),
          shortInput('symbol', 'Símbolo ou emoji', { value: badge.symbol, maxLength: 8, minLength: 1 }),
          shortInput('description', 'Descrição curta', { paragraph: true, required: false, value: badge.description, maxLength: 120 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:badges:delete:')) {
        const badgeId = customId.split(':').at(-1);
        await BadgeDefinition.deleteOne({ guildId: interaction.guildId, _id: badgeId });
        await MemberProfile.updateMany({ guildId: interaction.guildId }, { $pull: { specialBadges: badgeId } });
        await showBadges(interaction);
        return true;
      }
      if (customId.startsWith('config:badges:')) return showBadgeDetail(interaction, customId.split(':').at(-1));
      if (customId === 'config:home') return showHome(interaction, true);
      if (customId === 'config:triggers') return showTriggers(interaction);
      if (customId.startsWith('config:trigger:detail:')) return showTriggerDetail(interaction, customId.split(':').at(-1));
      if (customId === 'config:xp:message') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:message_xp', 'XP por mensagem', [
          shortInput('min', 'XP mínimo', { value: cfg.messageXp.min, maxLength: 5 }),
          shortInput('max', 'XP máximo', { value: cfg.messageXp.max, maxLength: 5 }),
          shortInput('cooldown', 'Cooldown em segundos', { value: cfg.messageXp.cooldownMs / 1000, maxLength: 5 }),
        ]));
        return true;
      }
      if (customId === 'config:xp:voice') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:voice_xp', 'XP por voz', [
          shortInput('min', 'XP mínimo', { value: cfg.voiceXp.min, maxLength: 5 }),
          shortInput('max', 'XP máximo', { value: cfg.voiceXp.max, maxLength: 5 }),
          shortInput('interval', 'Intervalo em minutos', { value: cfg.voiceXp.intervalMs / 60000, maxLength: 4 }),
        ]));
        return true;
      }
      if (customId === 'config:xp:levelup') return showLevelUp(interaction);
      if (customId === 'config:xp:levelup:message') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:levelup', 'Anúncio de subida de nível', [
          shortInput('message', 'Texto · use {member}, {level} e {xp}', { paragraph: true, required: false, maxLength: 1800, value: cfg.levelUp?.message || '' }),
        ]));
        return true;
      }
      if (customId === 'config:xp:levelup:clear') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.levelUp.channelId = '';
        await cfg.save();
        await showLevelUp(interaction);
        return true;
      }
      if (customId === 'config:xp:levelup:toggle') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.levelUp.enabled = cfg.levelUp.enabled === false;
        await cfg.save();
        await showLevelUp(interaction);
        return true;
      }
      if (customId === 'config:xp:stack') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.stackBuffs = !cfg.stackBuffs;
        await cfg.save();
        await showXp(interaction);
        return true;
      }
      if (customId.startsWith('config:permissions:remove:')) {
        const roleId = customId.split(':').at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.adminRoleIds = cfg.adminRoleIds.filter((id) => id !== roleId);
        await cfg.save();
        await showPermissions(interaction);
        return true;
      }
      if (customId === 'config:trigger:create') {
        await interaction.showModal(modal('config:modal:trigger:create', 'Criar gatilho', [
          shortInput('text', 'Texto exato do gatilho', { maxLength: 100, minLength: 1 }),
          shortInput('response', 'Primeira resposta', { paragraph: true, maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:text:')) {
        const triggerId = customId.split(':').at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        await interaction.showModal(modal('config:modal:trigger:text:' + triggerId, 'Editar texto do gatilho', [
          shortInput('text', 'Novo texto exato', { value: trigger.text, maxLength: 100, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:response:add:')) {
        const triggerId = customId.split(':').at(-1);
        await interaction.showModal(modal('config:modal:trigger:response:add:' + triggerId, 'Adicionar resposta', [
          shortInput('response', 'Nova resposta', { paragraph: true, maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
      if (customId.startsWith('config:trigger:toggle:') || customId.startsWith('config:trigger:delete:')) {
        const parts = customId.split(':');
        const action = parts[2];
        const triggerId = parts.at(-1);
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger) throw new Error('Gatilho não encontrado.');
        if (action === 'toggle') trigger.enabled = !trigger.enabled;
        else trigger.deleteOne();
        await cfg.save();
        return showTriggers(interaction);
      }
      if (customId.startsWith('config:trigger:response:edit:') || customId.startsWith('config:trigger:response:remove:')) {
        const parts = customId.split(':');
        const action = parts[3];
        const triggerId = parts.at(-2);
        const index = Number(parts.at(-1));
        const cfg = await getGuildConfig(interaction.guildId);
        const trigger = cfg.triggers.id(triggerId);
        if (!trigger || !trigger.responses[index]) throw new Error('Resposta não encontrada.');
        if (action === 'remove') {
          trigger.responses.splice(index, 1);
          await cfg.save();
          return showTriggerDetail(interaction, triggerId);
        }
        await interaction.showModal(modal('config:modal:trigger:response:edit:' + triggerId + ':' + index, 'Editar resposta', [
          shortInput('response', 'Texto da resposta', { paragraph: true, value: trigger.responses[index], maxLength: 1900, minLength: 1 }),
        ]));
        return true;
      }
    }

    return false;
  } catch (error) {
    const message = error instanceof RangeError ? error.message : 'Não foi possível salvar a alteração. Tente novamente.';
    if (interaction.deferred || interaction.replied) {
      await followUpV2(interaction, message).catch(() => {});
    } else {
      await replyV2(interaction, message, { ephemeral: true }).catch(() => {});
    }
    return true;
  }
}

async function executeConfigCommand(interaction) {
  if (interaction.guildId !== config.guildId || (interaction.user.id !== config.ownerId && !await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Este painel exige o proprietário ou um cargo administrativo autorizado.', { ephemeral: true });
    return;
  }
  await getGuildConfig(interaction.guildId);
  const assetFile = interaction.options.getAttachment?.('asset_file');
  const promptFile = interaction.options.getAttachment?.('prompt_file');
  if (assetFile && promptFile) throw new RangeError('Envie um arquivo por vez: asset do Blob ou System Prompt.');
  if (assetFile) {
    const cfg = await getGuildConfig(interaction.guildId);
    if (cfg.storage?.uploadsEnabled === false) throw new RangeError('Os uploads para o Blob estão pausados neste servidor.');
    const replaceId = interaction.options.getString('replace_object_id');
    const targetSku = interaction.options.getString('asset_target_sku');
    const targetTriggerId = interaction.options.getString('asset_trigger_id');
    const targetBadgeId = interaction.options.getString('asset_badge_id');
    const targetCosmeticId = interaction.options.getString('asset_cosmetic_id');
    const targetFrame = interaction.options.getString('asset_frame');
    if ([replaceId, targetSku, targetTriggerId, targetBadgeId, targetCosmeticId, targetFrame].filter(Boolean).length > 1) throw new RangeError('Escolha apenas uma ação de destino para o asset.');
    const oldObject = replaceId ? await BlobObject.findOne({ _id: replaceId, guildId: String(interaction.guildId), deletedAt: null }).lean() : null;
    if (replaceId && !oldObject) throw new RangeError('Objeto Blob para substituição não encontrado.');
    const requestedAssetName = interaction.options.getString('asset_name');
    if (oldObject?.references?.length && requestedAssetName?.trim() && requestedAssetName.trim() !== oldObject.name
      && ['design-system', 'casino', 'profile', 'frame', 'cosmetic'].includes(oldObject.category)) {
      throw new RangeError('A substituição de um asset visual ativo precisa manter seu nome atual.');
    }
    const category = oldObject?.category || (targetSku ? 'product' : targetTriggerId ? 'trigger' : targetBadgeId ? 'badge' : targetCosmeticId ? 'cosmetic' : targetFrame ? 'frame' : (interaction.options.getString('asset_category') || 'other'));
    const product = targetSku ? await EconomyItem.findOne({ guildId: interaction.guildId, sku: targetSku.toLowerCase(), deletedAt: null }) : null;
    if (targetSku && !product) throw new RangeError('SKU de produto não encontrado no catálogo deste servidor.');
    const trigger = targetTriggerId ? cfg.triggers.id(targetTriggerId) : null;
    if (targetTriggerId && !trigger) throw new RangeError('Gatilho não encontrado. Copie o ID do painel de gatilhos.');
    if (trigger && trigger.assets.length >= 5) throw new RangeError('Cada gatilho pode usar até cinco imagens. Substitua um objeto existente ou remova uma referência primeiro.');
    const badge = targetBadgeId ? await BadgeDefinition.findOne({ guildId: interaction.guildId, _id: targetBadgeId }) : null;
    if (targetBadgeId && !badge) throw new RangeError('Badge especial não encontrada.');
    if (targetCosmeticId && !BADGE_BY_ID.has(targetCosmeticId)) throw new RangeError('ID de badge cosmética não encontrado. Consulte o catálogo de badges em `/profile-edit`.');
    const managedName = targetBadgeId ? (interaction.options.getString('asset_name') || badge.name) : targetCosmeticId ? 'cosmetic-' + targetCosmeticId : targetFrame ? 'frame-' + targetFrame : '';
    const maxFileBytes = Math.min(100 * 1024 * 1024, Number(cfg.storage?.maxFileBytes || 8 * 1024 * 1024));
    const file = await blobStorage.fetchDiscordAttachment(assetFile, { maxBytes: maxFileBytes });
    const used = await BlobObject.aggregate([{ $match: { guildId: String(interaction.guildId), deletedAt: null } }, { $group: { _id: null, bytes: { $sum: '$size' } } }]);
    const currentBytes = used[0]?.bytes || 0;
    const currentProductObject = product?.thumbnailBlobId ? await BlobObject.findById(product.thumbnailBlobId).lean() : null;
    const reclaim = oldObject ? oldObject.size : (currentProductObject && currentProductObject.references.length <= 1 ? currentProductObject.size : 0);
    const maxStorageBytes = Number(cfg.storage?.maxBytes || 0);
    if (maxStorageBytes > 0 && currentBytes - reclaim + file.buffer.length > maxStorageBytes) throw new RangeError('O limite local de armazenamento deste servidor seria excedido.');
    const asset = await blobStorage.upload({ guildId: interaction.guildId, category, name: managedName || requestedAssetName || oldObject?.name || (product ? product.name : assetFile.name), filename: file.filename, buffer: file.buffer, createdBy: interaction.user.id, maxFileBytes, replaceObjectId: oldObject?._id || (currentProductObject?.references.length <= 1 ? currentProductObject._id : '') });
    if (product) {
      const oldId = product.thumbnailBlobId || '';
      product.thumbnailBlobId = asset._id;
      product.thumbnailUrl = asset.url || '';
      await product.save();
      await blobStorage.updateReference({ guildId: interaction.guildId, system: 'product', key: product.sku, oldObjectId: oldId, newObjectId: asset._id });
    } else if (trigger) {
      trigger.assets.push({ objectId: asset._id, url: asset.url || '', filename: asset.filename });
      await cfg.save();
      await blobStorage.addReference(asset._id, interaction.guildId, 'trigger', trigger._id.toString());
    } else if (badge) {
      const oldId = badge.assetBlobId || '';
      badge.assetBlobId = asset._id; badge.assetUrl = asset.url || ''; await badge.save();
      await blobStorage.updateReference({ guildId: interaction.guildId, system: 'badge', key: badge._id.toString(), oldObjectId: oldId, newObjectId: asset._id });
    } else if (targetCosmeticId) {
      await blobStorage.addReference(asset._id, interaction.guildId, 'cosmetic', targetCosmeticId);
    } else if (targetFrame) {
      await blobStorage.addReference(asset._id, interaction.guildId, 'frame', targetFrame);
    } else if (oldObject) {
      await blobStorage.replaceObject(oldObject._id, asset._id, interaction.guildId);
      await BlobObject.updateOne({ _id: asset._id }, { $set: { name: interaction.options.getString('asset_name') || oldObject.name } });
    }
    if (category === 'design-system' || category === 'casino' || category === 'profile') {
      const freshAsset = await BlobObject.findById(asset._id).lean();
      if ((category === 'design-system' && DESIGN_SYSTEM_NAMES.includes(freshAsset?.name)) || (category === 'casino' && freshAsset?.name === 'casino') || (category === 'profile' && freshAsset?.name === 'profile')) {
        await blobStorage.addReference(asset._id, interaction.guildId, category, freshAsset.name);
      }
    }
    if (['design-system', 'casino', 'profile', 'frame', 'cosmetic'].includes(category)) {
      await refreshBlobAssetOverrides(interaction.guildId);
    }
    const fresh = await BlobObject.findById(asset._id).lean();
    await showStorageObject(interaction, asset._id, 0, 'all');
    return fresh;
  }
  if (promptFile) {
    if (interaction.user.id !== config.ownerId) {
      await replyV2(interaction, 'A importação do System Prompt é exclusiva do proprietário.');
      return;
    }
    try {
      const length = await importPromptAttachment(interaction.guildId, promptFile);
      await showAIPersonality(interaction, false, 'System Prompt importado (' + length.toLocaleString('pt-BR') + ' caracteres) e aplicado imediatamente.');
    } catch (error) {
      await replyV2(interaction, error instanceof RangeError ? error.message : 'Não foi possível importar o System Prompt.');
    }
    return;
  }
  await showHome(interaction);
}

module.exports = { executeConfigCommand, handleConfigInteraction, showHome, showXp, showLevelUp, showBadges, showBadgeDetail, showPermissions, showRewards, showEconomy, showCasino, showStores, showTriggers, showTriggerDetail, showStorage, showUtilitySettings, showModerationSettings, showGiveawaySettings, showTemplateSettings };
