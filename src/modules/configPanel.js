const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { getGuildConfig } = require('./xpService');
const { getSettings } = require('./economyService');
const { configureWork, configureDaily, configureOrbConversion, configureCasino } = require('./economyAdminService');
const { EconomyItem } = require('../database');
const { EconomyCollectRule } = require('../database');
const { createCatalogItem, editCatalogItem, createCollectRule, editCollectRule, removeCollectRule } = require('./economyAdminService');
const { deleteCatalogItem } = require('./economyService');
const { normalizeTriggerText } = require('./triggers');
const { createContainer, replyV2, followUpV2 } = require('./components');
const { ORBS, ORB_TYPES } = require('./economyUtils');
const { PALETTES, applyPalette } = require('./appearance');

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(components);
}

function updatePanel(interaction, data) {
  return interaction.deferred ? interaction.editReply(data) : interaction.update(data);
}

function navRow() {
  return row(new StringSelectMenuBuilder()
    .setCustomId('config:nav')
    .setPlaceholder('Abrir seção do painel')
    .addOptions(
      { label: 'Experiência e níveis', value: 'xp', description: 'XP, canais e buffs por cargos' },
      { label: 'Permissões', value: 'permissions', description: 'Cargos autorizados a administrar o bot' },
      { label: 'Daily e trabalho', value: 'rewards', description: 'Recompensas e intervalo de trabalho' },
      { label: 'Lojas e itens', value: 'stores', description: 'Catálogo, preços, estoque e disponibilidade' },
      { label: 'Recompensas por cargo', value: 'rules', description: 'Regras periódicas de coleta por cargo' },
      { label: 'Gatilhos', value: 'triggers', description: 'Respostas automáticas configuráveis' },
      { label: 'Cassino', value: 'casino', description: 'Ativar jogos, apostas e pagamentos' },
      { label: 'Aparência', value: 'appearance', description: 'Paleta visual do servidor' },
    ));
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
  const payload = { components: [container(content, [navRow()])], allowedMentions: { parse: [] } };
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
    (cfg.levelUp?.enabled === false ? 'Desativado.' : 'Ativado.') + (cfg.levelUp?.message ? '\nModelo personalizado configurado.' : '\nUsa uma fala contextual da Kiryu.') + ' Variáveis: `{member}`, `{level}` e `{xp}`.',
  ].join('\n\n');
  const rows = [
    navRow(),
    row(
      button('config:xp:message', 'XP por mensagem', ButtonStyle.Primary),
      button('config:xp:voice', 'XP por voz', ButtonStyle.Primary),
      button('config:xp:stack', cfg.stackBuffs ? 'Usar maior buff' : 'Acumular buffs', ButtonStyle.Secondary),
      button('config:xp:levelup', 'Editar anúncio de nível', ButtonStyle.Primary),
      button('config:xp:levelup:toggle', cfg.levelUp?.enabled === false ? 'Ativar anúncio' : 'Desativar anúncio'),
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
    ? cfg.triggers.slice(0, 25).map((trigger) => '• ' + (trigger.enabled ? '✅' : '⏸️') + ' **' + trigger.text + '** · ' + trigger.responses.length + ' resposta(s)').join('\n')
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
  const content = [
    '# Recompensas · Fragmentos e Orbes',
    'Daily reinicia à meia-noite de São Paulo. O cooldown antigo não controla mais a coleta.',
    '**Daily** · Fragmentos ' + range(daily.fragments) + ' · Orbes: Verde ' + range(daily.orbs.green) + ', Azul ' + range(daily.orbs.blue) + ', Laranja ' + range(daily.orbs.orange) + ', Vermelha ' + range(daily.orbs.red) + ', Preta ' + range(daily.orbs.black) + ', Dourada ' + range(daily.orbs.gold),
    '**Trabalho** · ' + settings.work.min + '–' + settings.work.max + ' Fragmentos · intervalo ' + Math.round(settings.work.cooldownMs / 60000) + ' min',
    '**Conversão de Orbes** · ' + (settings.orbs?.conversionRate || 10) + ':1 para a categoria seguinte',
  ].join('\n\n');
  const rows = [navRow(), row(
    button('config:rewards:work', 'Editar trabalho', ButtonStyle.Primary),
    button('config:rewards:daily:base', 'Daily · Fragmentos e Verde', ButtonStyle.Success),
    button('config:rewards:daily:blue', 'Daily · Azul e Laranja', ButtonStyle.Success),
    button('config:rewards:daily:red', 'Daily · Vermelha', ButtonStyle.Success),
    button('config:rewards:daily:rare', 'Daily · Preta e Dourada', ButtonStyle.Success),
  ), row(button('config:rewards:conversion', 'Editar taxa de conversão', ButtonStyle.Primary))];
  const payload = { components: [container(content, rows)], allowedMentions: { parse: [] } };
  return update ? updatePanel(interaction, payload) : interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 });
}

async function showCasino(interaction, update = true) {
  const settings = await getSettings(interaction.guildId);
  const casino = settings.casino || {};
  const games = ['flip', 'dice', 'slots'];
  const names = { flip: 'Cara ou coroa', dice: 'Dados', slots: 'Caça-níquel' };
  const defaults = { flip: 2, dice: 2, slots: 5 };
  const summary = games.map((game) => '• **' + names[game] + ':** ' + (casino[game]?.enabled === false ? 'desativado' : 'ativo') + ' · pagamento total ' + (casino[game]?.multiplier || defaults[game]) + '×').join('\n');
  const rows = [navRow(), row(...games.map((game) => button(
    'config:casino:toggle:' + game,
    (casino[game]?.enabled === false ? 'Ativar ' : 'Desativar ') + names[game],
    casino[game]?.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary,
  ))), row(button('config:casino:edit', 'Editar apostas e pagamentos', ButtonStyle.Primary))];
  const content = '# Cassino · regras de jogo\nApostas virtuais em Fragmentos. O multiplicador representa o total pago, incluindo a aposta quando há vitória.\n\n**Aposta máxima:** ' + (casino.maxBet || 1000000000).toLocaleString('pt-BR') + '\n' + summary;
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
  if (options.value != null) input.setValue(String(options.value).slice(0, options.maxLength || 4000));
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
    'config:xp:message', 'config:xp:voice', 'config:xp:levelup', 'config:rewards:conversion', 'config:casino:edit', 'config:trigger:create',
  ].includes(customId) || (interaction.isButton() && (
    customId === 'config:rewards:work' || customId.startsWith('config:rewards:daily:') || customId.startsWith('config:rules:edit:') ||
    customId.startsWith('config:trigger:text:') || customId.startsWith('config:trigger:response:add:') ||
    customId.startsWith('config:trigger:response:edit:') || customId.startsWith('config:store:create:') || customId.startsWith('config:store:art:')
  )) || (interaction.isRoleSelectMenu() && (customId === 'config:xp:buff:add' || customId.startsWith('config:rule:create:role:')));
  const scheduleModal = interaction.isStringSelectMenu() && (
    (customId.startsWith('config:rules:schedule:frequency:') && interaction.values?.[0] === 'interval') ||
    (customId.startsWith('config:rules:schedule:unit:') && interaction.values?.[0] === 'month') ||
    customId === 'config:store:create:orbtype'
  );
  if (!opensModal && !interaction.deferred && !interaction.replied && (
    interaction.isButton?.() || interaction.isAnySelectMenu?.()
  ) && !scheduleModal && typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
  if (interaction.user.id !== config.ownerId || interaction.guildId !== config.guildId) {
    if (interaction.deferred || interaction.replied) {
      await followUpV2(interaction, 'Acesso negado.');
    } else {
      await replyV2(interaction, 'Acesso negado.', { ephemeral: true });
    }
    return true;
  }
  if (interaction.isModalSubmit() && customId.startsWith('config:modal:') && !interaction.deferred && !interaction.replied && typeof interaction.deferUpdate === 'function') {
    await interaction.deferUpdate();
  }

  try {
    if (interaction.isStringSelectMenu()) {
      const value = interaction.values[0];
      if (customId === 'config:nav') {
        if (value === 'xp') await showXp(interaction);
        else if (value === 'permissions') await showPermissions(interaction);
        else if (value === 'rewards') await showRewards(interaction);
        else if (value === 'stores') await showStores(interaction);
        else if (value === 'rules') await showRules(interaction);
        else if (value === 'triggers') await showTriggers(interaction);
        else if (value === 'casino') await showCasino(interaction);
        else if (value === 'appearance') await showAppearance(interaction);
        else await showHome(interaction, true);
        return true;
      }
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
      if (parts[2] === 'toggle') {
        const game = parts[3];
        if (!['flip', 'dice', 'slots'].includes(game)) throw new RangeError('Jogo inválido.');
        const settings = await getSettings(interaction.guildId);
        await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          [game]: { enabled: settings.casino?.[game]?.enabled === false },
        } });
        return showCasino(interaction);
      }
      if (parts[2] === 'edit') {
        const settings = await getSettings(interaction.guildId);
        const casino = settings.casino || {};
        await interaction.showModal(modal('config:modal:casino', 'Apostas e pagamentos', [
          shortInput('maxBet', 'Aposta máxima em Fragmentos', { value: casino.maxBet || 1000000000, maxLength: 14 }),
          shortInput('flip', 'Pagamento total · Cara ou coroa (2 a 100)', { value: casino.flip?.multiplier || 2, maxLength: 3 }),
          shortInput('dice', 'Pagamento total · Dados (2 a 100)', { value: casino.dice?.multiplier || 2, maxLength: 3 }),
          shortInput('slots', 'Pagamento total · Caça-níquel (2 a 100)', { value: casino.slots?.multiplier || 5, maxLength: 3 }),
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
      if (customId === 'config:modal:casino') {
        await configureCasino({ guildId: interaction.guildId, actorId: interaction.user.id, changes: {
          maxBet: parseNumber(interaction.fields.getTextInputValue('maxBet'), { min: 1, max: 1000000000, label: 'Aposta máxima' }),
          flip: { multiplier: parseNumber(interaction.fields.getTextInputValue('flip'), { min: 2, max: 100, label: 'Pagamento total de cara ou coroa' }) },
          dice: { multiplier: parseNumber(interaction.fields.getTextInputValue('dice'), { min: 2, max: 100, label: 'Pagamento total dos dados' }) },
          slots: { multiplier: parseNumber(interaction.fields.getTextInputValue('slots'), { min: 2, max: 100, label: 'Pagamento total do caça-níquel' }) },
        } });
        await showCasino(interaction, false);
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
        const item = await editCatalogItem({ guildId: interaction.guildId, actorId: interaction.user.id, sku, changes: { thumbnailUrl } });
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
        await showXp(interaction, false);
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
      if (customId === 'config:xp:levelup') {
        const cfg = await getGuildConfig(interaction.guildId);
        await interaction.showModal(modal('config:modal:levelup', 'Anúncio de subida de nível', [
          shortInput('message', 'Texto · use {member}, {level} e {xp}', { paragraph: true, required: false, maxLength: 1800, value: cfg.levelUp?.message || '' }),
        ]));
        return true;
      }
      if (customId === 'config:xp:levelup:toggle') {
        const cfg = await getGuildConfig(interaction.guildId);
        cfg.levelUp.enabled = cfg.levelUp.enabled === false;
        await cfg.save();
        await showXp(interaction);
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
  if (interaction.user.id !== config.ownerId || interaction.guildId !== config.guildId) {
    await replyV2(interaction, 'Este painel é exclusivo do proprietário do bot.', { ephemeral: true });
    return;
  }
  await getGuildConfig(interaction.guildId);
  await showHome(interaction);
}

module.exports = { executeConfigCommand, handleConfigInteraction, showHome, showXp, showPermissions, showRewards, showStores, showTriggers, showTriggerDetail };
