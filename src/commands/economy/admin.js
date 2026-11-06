const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EconomyItem } = require('../../database');
const { isAuthorized } = require('../../modules/permissions');
const { replyV2 } = require('../../modules/components');
const {
  adjustFragments, adjustOrbs, deliverItem, removeInventoryItems, listTransactions,
  deleteCatalogItem,
} = require('../../modules/economyService');
const {
  configureWork, configureDaily, createCollectRule, editCollectRule, removeCollectRule,
  createCatalogItem, editCatalogItem, setCatalogStock, parseSku,
} = require('../../modules/economyAdminService');
const { ORBS, ORB_TYPES, FRAGMENT_EMOJI, formatFragments } = require('../../modules/economyUtils');

const data = new SlashCommandBuilder()
  .setName('economia')
  .setDescription('Administre saldos, itens, recompensas e registros da economia.')
  .addSubcommand((s) => s.setName('fragmentos-adicionar').setDescription('Adiciona Fragmentos à carteira')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => fragmentAccountOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade inteira').setRequired(true).setMinValue(1).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('fragmentos-remover').setDescription('Remove Fragmentos da carteira')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => fragmentAccountOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade inteira').setRequired(true).setMinValue(1).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('fragmentos-definir').setDescription('Define o saldo da carteira em Fragmentos')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => fragmentAccountOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Novo saldo inteiro').setRequired(true).setMinValue(0).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('orbes-adicionar').setDescription('Adiciona Orbes ao saldo de um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => orbTypeOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade inteira').setRequired(true).setMinValue(1).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('orbes-remover').setDescription('Remove Orbes do saldo de um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => orbTypeOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade inteira').setRequired(true).setMinValue(1).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('orbes-definir').setDescription('Define o saldo de uma categoria de Orbe')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => orbTypeOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Novo saldo inteiro').setRequired(true).setMinValue(0).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('item-entregar').setDescription('Entrega um item do catálogo ao inventário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário que receberá o item').setRequired(true))
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade para entregar').setRequired(true).setMinValue(1).setMaxValue(1000000)))
  .addSubcommand((s) => s.setName('item-remover').setDescription('Remove itens do inventário de um usuário')
    .addUserOption((o) => o.setName('usuario').setDescription('Usuário afetado').setRequired(true))
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Quantidade para remover').setRequired(true).setMinValue(1).setMaxValue(1000000)))
  .addSubcommand((s) => s.setName('trabalho-config').setDescription('Configura recompensa e cooldown de /trabalhar')
    .addIntegerOption((o) => o.setName('minimo').setDescription('Recompensa mínima em Fragmentos').setRequired(true).setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('maximo').setDescription('Recompensa máxima em Fragmentos').setRequired(true).setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('cooldown_minutos').setDescription('Cooldown em minutos').setRequired(true).setMinValue(1).setMaxValue(525600)))
  .addSubcommand((s) => s.setName('daily-config').setDescription('Configura a recompensa e o cooldown diário')
    .addIntegerOption((o) => o.setName('fragmentos').setDescription('Fragmentos entregues').setRequired(true).setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('cooldown_horas').setDescription('Cooldown em horas').setRequired(true).setMinValue(1).setMaxValue(8760))
    .addIntegerOption((o) => o.setName('verde').setDescription('Orbes verdes').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('azul').setDescription('Orbes azuis').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('laranja').setDescription('Orbes laranjas').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('vermelha').setDescription('Orbes vermelhas').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('preta').setDescription('Orbes pretas').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('dourada').setDescription('Orbes douradas').setMinValue(0).setMaxValue(1000000000000)))
  .addSubcommand((s) => addRuleOptions(s.setName('regra-criar').setDescription('Cria uma recompensa periódica vinculada a cargo'), true))
  .addSubcommand((s) => addRuleOptions(s.setName('regra-editar').setDescription('Edita uma recompensa periódica existente'), false))
  .addSubcommand((s) => s.setName('regra-excluir').setDescription('Desativa uma regra de coleta')
    .addStringOption((o) => o.setName('id').setDescription('Identificador da regra exibido na resposta de criação').setRequired(true).setMaxLength(24)))
  .addSubcommand((s) => addCreateItemOptions(s.setName('item-criar').setDescription('Cria um item na loja de Fragmentos ou Orbes')))
  .addSubcommand((s) => addEditItemOptions(s.setName('item-editar').setDescription('Edita os campos de um item do catálogo')))
  .addSubcommand((s) => s.setName('item-excluir').setDescription('Remove um item da loja após confirmação')
    .addStringOption((o) => skuOption(o).setRequired(true)))
  .addSubcommand((s) => s.setName('item-estoque').setDescription('Define estoque de um item; -1 significa ilimitado')
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade').setDescription('Estoque restante ou -1 para ilimitado').setRequired(true).setMinValue(-1).setMaxValue(1000000000000)))
  .addSubcommand((s) => s.setName('item-ativar').setDescription('Ativa ou desativa um item da loja')
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addBooleanOption((o) => o.setName('ativo').setDescription('Estado do item').setRequired(true)))
  .addSubcommand((s) => s.setName('transacoes').setDescription('Consulta o histórico recente da economia')
    .addUserOption((o) => o.setName('usuario').setDescription('Filtrar por usuário').setRequired(false))
    .addIntegerOption((o) => o.setName('limite').setDescription('Registros por página (máximo 10)').setRequired(false).setMinValue(1).setMaxValue(10))
    .addIntegerOption((o) => o.setName('pagina').setDescription('Página do histórico, começando em 0').setRequired(false).setMinValue(0).setMaxValue(10000)));

function orbTypeOption(option, name = 'categoria', description = 'Categoria da Orbe') {
  return option.setName(name).setDescription(description).addChoices(...ORB_TYPES.map((type) => ({ name: ORBS[type].label, value: type })));
}

function fragmentAccountOption(option) {
  return option.setName('conta').setDescription('Saldo afetado').addChoices({ name: 'Carteira', value: 'wallet' }, { name: 'Banco', value: 'bank' });
}

function skuOption(option) {
  return option.setName('sku').setDescription('Identificador único do item').setMaxLength(32);
}

function addRuleOptions(command, creating) {
  if (creating) {
    command
      .addRoleOption((o) => o.setName('cargo').setDescription('Cargo elegível').setRequired(true))
      .addStringOption((o) => o.setName('nome').setDescription('Nome da recompensa').setMaxLength(80).setRequired(true))
      .addStringOption((o) => o.setName('frequencia').setDescription('Frequência da coleta').setRequired(true).addChoices(
        { name: 'Diariamente', value: 'daily' }, { name: 'Semanalmente', value: 'weekly' }, { name: 'Mensalmente', value: 'monthly' },
        { name: 'Intervalo personalizado', value: 'interval' }, { name: 'Período de calendário', value: 'calendar' },
      ));
  } else {
    command.addStringOption((o) => o.setName('id').setDescription('Identificador da regra').setRequired(true).setMaxLength(24));
  }
  command
    .addStringOption((o) => o.setName('descricao').setDescription('Descrição').setMaxLength(500))
    .addIntegerOption((o) => o.setName('fragmentos').setDescription('Fragmentos por coleta').setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => orbTypeOption(o, 'categoria_orbe', 'Categoria entregue; deixe vazio para nenhuma'))
    .addIntegerOption((o) => o.setName('quantidade_orbes').setDescription('Quantidade da categoria escolhida').setMinValue(0).setMaxValue(1000000000000))
    .addIntegerOption((o) => o.setName('intervalo_minutos').setDescription('Usado na frequência de intervalo').setMinValue(1).setMaxValue(525600))
    .addStringOption((o) => o.setName('unidade_calendario').setDescription('Usado na frequência calendário').addChoices({ name: 'Dia da semana (UTC)', value: 'week' }, { name: 'Dia do mês (UTC)', value: 'month' }))
    .addIntegerOption((o) => o.setName('dia_calendario').setDescription('Dia do mês 1–31 ou semana 0 domingo a 6 sábado').setMinValue(0).setMaxValue(31))
    .addBooleanOption((o) => o.setName('acumular').setDescription('Pode ser coletada junto a outras regras elegíveis'));
  if (!creating) {
    command
      .addStringOption((o) => o.setName('nome').setDescription('Nome da recompensa').setMaxLength(80))
      .addStringOption((o) => o.setName('frequencia').setDescription('Frequência da coleta').addChoices(
        { name: 'Diariamente', value: 'daily' }, { name: 'Semanalmente', value: 'weekly' }, { name: 'Mensalmente', value: 'monthly' },
        { name: 'Intervalo personalizado', value: 'interval' }, { name: 'Período de calendário', value: 'calendar' },
      ))
      .addRoleOption((o) => o.setName('cargo').setDescription('Novo cargo elegível'));
  }
  return command;
}

function addCreateItemOptions(command) {
  return command
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addStringOption((o) => o.setName('nome').setDescription('Nome do item').setRequired(true).setMaxLength(80))
    .addStringOption((o) => o.setName('descricao').setDescription('Descrição exibida na loja').setRequired(true).setMaxLength(1000))
    .addIntegerOption((o) => o.setName('preco').setDescription('Preço unitário inteiro').setRequired(true).setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => o.setName('moeda').setDescription('Moeda usada para comprar').setRequired(true).addChoices({ name: 'Fragmentos', value: 'fragments' }, { name: 'Orbes', value: 'orbs' }))
    .addBooleanOption((o) => o.setName('ilimitado').setDescription('O estoque é ilimitado').setRequired(true))
    .addBooleanOption((o) => o.setName('no_inventario').setDescription('Aparece no inventário').setRequired(true))
    .addBooleanOption((o) => o.setName('acumulavel').setDescription('Agrupa unidades no inventário').setRequired(true))
    .addBooleanOption((o) => o.setName('utilizavel').setDescription('Pode ser utilizado pelo usuário').setRequired(true))
    .addBooleanOption((o) => o.setName('consumir_uso').setDescription('Consome uma unidade ao utilizar').setRequired(true))
    .addIntegerOption((o) => o.setName('quantidade_compra').setDescription('Unidades entregues por compra').setRequired(true).setMinValue(1).setMaxValue(1000000))
    .addStringOption((o) => o.setName('entrega').setDescription('Forma de entrega').setRequired(true).addChoices({ name: 'Inventário', value: 'inventory' }, { name: 'Imediata', value: 'immediate' }))
    .addStringOption((o) => actionOption(o.setName('acao').setDescription('Ação automática segura')) .setRequired(true))
    .addBooleanOption((o) => o.setName('ativo').setDescription('Item ativo').setRequired(true))
    .addBooleanOption((o) => o.setName('visivel').setDescription('Aparece na loja').setRequired(true))
    .addStringOption((o) => o.setName('emoji').setDescription('Emoji do item').setMaxLength(64))
    .addStringOption((o) => orbTypeOption(o, 'categoria_orbe', 'Categoria exigida se moeda for Orbes'))
    .addIntegerOption((o) => o.setName('estoque').setDescription('Unidades disponíveis, se limitado').setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => o.setName('inicio').setDescription('Início ISO 8601 (ex.: 2026-11-06T18:00:00Z)').setMaxLength(40))
    .addStringOption((o) => o.setName('fim').setDescription('Fim ISO 8601').setMaxLength(40))
    .addIntegerOption((o) => o.setName('duracao_horas').setDescription('Duração da disponibilidade a partir de agora').setMinValue(1).setMaxValue(8760))
    .addStringOption((o) => o.setName('efeito').setDescription('Descrição narrativa do efeito').setMaxLength(1000))
    .addStringOption((o) => o.setName('mensagem_uso').setDescription('Mensagem ao utilizar').setMaxLength(1000))
    .addIntegerOption((o) => o.setName('acao_quantidade').setDescription('Quantidade da ação automática').setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => orbTypeOption(o, 'acao_orbe', 'Categoria se ação for conceder Orbe'));
}

function addEditItemOptions(command) {
  return command
    .addStringOption((o) => skuOption(o).setRequired(true))
    .addStringOption((o) => o.setName('nome').setDescription('Novo nome').setMaxLength(80))
    .addStringOption((o) => o.setName('descricao').setDescription('Nova descrição').setMaxLength(1000))
    .addStringOption((o) => o.setName('emoji').setDescription('Novo emoji').setMaxLength(64))
    .addIntegerOption((o) => o.setName('preco').setDescription('Novo preço unitário').setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => o.setName('moeda').setDescription('Moeda').addChoices({ name: 'Fragmentos', value: 'fragments' }, { name: 'Orbes', value: 'orbs' }))
    .addStringOption((o) => orbTypeOption(o, 'categoria_orbe', 'Categoria do preço'))
    .addIntegerOption((o) => o.setName('estoque').setDescription('Estoque; -1 para ilimitado').setMinValue(-1).setMaxValue(1000000000000))
    .addStringOption((o) => o.setName('inicio').setDescription('Início ISO 8601').setMaxLength(40))
    .addStringOption((o) => o.setName('fim').setDescription('Fim ISO 8601').setMaxLength(40))
    .addIntegerOption((o) => o.setName('duracao_horas').setDescription('Duração da disponibilidade a partir de agora').setMinValue(1).setMaxValue(8760))
    .addBooleanOption((o) => o.setName('no_inventario').setDescription('Aparece no inventário'))
    .addBooleanOption((o) => o.setName('acumulavel').setDescription('Agrupa unidades no inventário'))
    .addBooleanOption((o) => o.setName('utilizavel').setDescription('Pode ser utilizado'))
    .addBooleanOption((o) => o.setName('consumir_uso').setDescription('Consome uma unidade ao utilizar'))
    .addIntegerOption((o) => o.setName('quantidade_compra').setDescription('Unidades entregues por compra').setMinValue(1).setMaxValue(1000000))
    .addStringOption((o) => o.setName('entrega').setDescription('Forma de entrega').addChoices({ name: 'Inventário', value: 'inventory' }, { name: 'Imediata', value: 'immediate' }))
    .addStringOption((o) => o.setName('efeito').setDescription('Descrição narrativa do efeito').setMaxLength(1000))
    .addStringOption((o) => o.setName('mensagem_uso').setDescription('Mensagem ao utilizar').setMaxLength(1000))
    .addStringOption((o) => actionOption(o.setName('acao').setDescription('Ação automática segura')))
    .addIntegerOption((o) => o.setName('acao_quantidade').setDescription('Quantidade da ação').setMinValue(0).setMaxValue(1000000000000))
    .addStringOption((o) => orbTypeOption(o, 'acao_orbe', 'Categoria se ação for conceder Orbe'))
    .addBooleanOption((o) => o.setName('ativo').setDescription('Item ativo'))
    .addBooleanOption((o) => o.setName('visivel').setDescription('Aparece na loja'));
}

function actionOption(option) {
  return option.addChoices(
    { name: 'Nenhuma ação automática', value: 'none' },
    { name: 'Conceder Fragmentos', value: 'grant_fragments' },
    { name: 'Conceder Orbes', value: 'grant_orb' },
  );
}

function textDate(interaction, name) {
  const value = interaction.options.getString(name);
  return value == null ? undefined : value;
}

function optional(interaction, getter, name) {
  const value = interaction.options[getter](name);
  return value == null ? undefined : value;
}

async function requireAdmin(interaction) {
  if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Você não tem permissão para administrar a economia.', { ephemeral: true });
    return false;
  }
  return true;
}

async function execute(interaction) {
  if (!(await requireAdmin(interaction))) return;
  const guildId = interaction.guildId;
  const actorId = interaction.user.id;
  const sub = interaction.options.getSubcommand();

  if (sub.startsWith('fragmentos-')) {
    const user = interaction.options.getUser('usuario');
    const quantity = interaction.options.getInteger('quantidade');
    const mode = sub.endsWith('adicionar') ? 'add' : sub.endsWith('remover') ? 'remove' : 'set';
    const accountType = interaction.options.getString('conta');
    const account = await adjustFragments({ guildId, actorId, userId: user.id, amount: quantity, mode, accountType, operation: 'admin_fragments_' + mode });
    await replyV2(interaction, '# Fragmentos atualizados\n' + user + '\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank), { ephemeral: true, accentColor: 0x008C52 });
    return;
  }

  if (sub.startsWith('orbes-')) {
    const user = interaction.options.getUser('usuario');
    const type = interaction.options.getString('categoria');
    const quantity = interaction.options.getInteger('quantidade');
    const mode = sub.endsWith('adicionar') ? 'add' : sub.endsWith('remover') ? 'remove' : 'set';
    const account = await adjustOrbs({ guildId, actorId, userId: user.id, type, amount: quantity, mode, operation: 'admin_orbs_' + mode });
    await replyV2(interaction, '# Orbes atualizadas\n' + user + '\n**' + ORBS[type].emoji + ' ' + ORBS[type].label + ':** ' + account.orbs[type].toLocaleString('pt-BR'), { ephemeral: true, accentColor: 0x6B4BA1 });
    return;
  }

  if (sub === 'item-entregar' || sub === 'item-remover') {
    const user = interaction.options.getUser('usuario');
    const sku = parseSku(interaction.options.getString('sku'));
    const quantity = interaction.options.getInteger('quantidade');
    if (sub === 'item-entregar') {
      const item = await deliverItem({ guildId, actorId, userId: user.id, sku, quantity });
      await replyV2(interaction, '# Item entregue\n' + item.emoji + ' **' + item.name + '** × ' + quantity.toLocaleString('pt-BR') + ' para ' + user + '.', { ephemeral: true });
    } else {
      const result = await removeInventoryItems({ guildId, actorId, userId: user.id, sku, quantity });
      await replyV2(interaction, '# Inventário atualizado\nRemovidas **' + result.removed + '** unidade(s) de **' + sku + '** de ' + user + '.', { ephemeral: true });
    }
    return;
  }

  if (sub === 'trabalho-config') {
    const min = interaction.options.getInteger('minimo');
    const max = interaction.options.getInteger('maximo');
    const cooldownMinutes = interaction.options.getInteger('cooldown_minutos');
    await configureWork({ guildId, actorId, min, max, cooldownMinutes });
    await replyV2(interaction, '# Trabalho configurado\nRecompensa: **' + min.toLocaleString('pt-BR') + '–' + max.toLocaleString('pt-BR') + ' ' + require('../../modules/economyUtils').FRAGMENT_EMOJI + '**\nCooldown: **' + cooldownMinutes + ' minuto(s)**.', { ephemeral: true, accentColor: 0x008C52 });
    return;
  }

  if (sub === 'daily-config') {
    const orbs = Object.fromEntries(ORB_TYPES.map((type) => [type, interaction.options.getInteger(orbOptionName(type)) || 0]));
    await configureDaily({ guildId, actorId, fragments: interaction.options.getInteger('fragmentos'), cooldownHours: interaction.options.getInteger('cooldown_horas'), orbs });
    const rewards = ORB_TYPES.filter((type) => orbs[type]).map((type) => orbs[type] + ' ' + ORBS[type].emoji).join(' · ') || 'nenhuma';
    await replyV2(interaction, '# Recompensa diária configurada\n**Fragmentos:** ' + formatFragments(interaction.options.getInteger('fragmentos')) + '\n**Orbes:** ' + rewards + '\n**Cooldown:** ' + interaction.options.getInteger('cooldown_horas') + ' hora(s).', { ephemeral: true, accentColor: 0x008C52 });
    return;
  }

  if (sub === 'regra-criar' || sub === 'regra-editar') {
    const creating = sub === 'regra-criar';
    const source = collectRuleOptions(interaction, creating);
    const rule = creating
      ? await createCollectRule({ guildId, actorId, ...source, roleId: interaction.options.getRole('cargo').id })
      : await editCollectRule({ guildId, actorId, ruleId: interaction.options.getString('id'), ...source });
    await replyV2(interaction, '# Regra de coleta ' + (creating ? 'criada' : 'atualizada') + '\n**' + rule.name + '** · <@&' + rule.roleId + '>\nID: `' + rule._id + '`\nRecompensa: ' + formatFragments(rule.fragments) + (rule.orbType && rule.orbAmount ? ' · ' + rule.orbAmount + ' ' + ORBS[rule.orbType].emoji : '') + '\nFrequência: **' + rule.frequency + '** · ' + (rule.stackable ? 'pode acumular' : 'individual'), { ephemeral: true });
    return;
  }

  if (sub === 'regra-excluir') {
    const rule = await removeCollectRule({ guildId, actorId, ruleId: interaction.options.getString('id') });
    await replyV2(interaction, '# Regra desativada\n**' + rule.name + '** não aparecerá mais em /coletar.', { ephemeral: true });
    return;
  }

  if (sub === 'item-criar') {
    const unlimited = interaction.options.getBoolean('ilimitado');
    const stock = interaction.options.getInteger('estoque');
    if (!unlimited && stock == null) throw new RangeError('Informe o estoque ou marque estoque ilimitado.');
    const endDate = textDate(interaction, 'fim');
    const durationHours = optional(interaction, 'getInteger', 'duracao_horas');
    if (endDate && durationHours != null) throw new RangeError('Informe a data final ou a duração em horas, não as duas.');
    const availableUntil = endDate || (durationHours != null ? new Date(Date.now() + durationHours * 3600000) : undefined);
    const item = await createCatalogItem({
      guildId, actorId,
      sku: interaction.options.getString('sku'), name: interaction.options.getString('nome'), description: interaction.options.getString('descricao'),
      emoji: optional(interaction, 'getString', 'emoji') || '📦', price: interaction.options.getInteger('preco'), currency: interaction.options.getString('moeda'),
      orbType: optional(interaction, 'getString', 'categoria_orbe'), stock: unlimited ? null : stock,
      availableFrom: textDate(interaction, 'inicio'), availableUntil,
      inventoryVisible: interaction.options.getBoolean('no_inventario'), stackable: interaction.options.getBoolean('acumulavel'),
      usable: interaction.options.getBoolean('utilizavel'), consumeOnUse: interaction.options.getBoolean('consumir_uso'),
      purchaseQuantity: interaction.options.getInteger('quantidade_compra'), delivery: interaction.options.getString('entrega'),
      effectDescription: optional(interaction, 'getString', 'efeito') || '', useMessage: optional(interaction, 'getString', 'mensagem_uso') || '',
      action: interaction.options.getString('acao'), actionAmount: optional(interaction, 'getInteger', 'acao_quantidade') || 0,
      actionOrbType: optional(interaction, 'getString', 'acao_orbe'), active: interaction.options.getBoolean('ativo'),
      visibleInStore: interaction.options.getBoolean('visivel'),
    });
    const wizard = new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId('econ:admin:itemwizard:' + actorId + ':' + item.sku)
      .setLabel('Configurar por etapas')
      .setStyle(ButtonStyle.Primary));
    await replyV2(interaction, '# Item criado\n' + item.emoji + ' **' + item.name + '** (`' + item.sku + '`)\nPreço: ' + item.price.toLocaleString('pt-BR') + ' ' + (item.currency === 'fragments' ? require('../../modules/economyUtils').FRAGMENT_EMOJI : ORBS[item.orbType].emoji) + '\nEstoque: ' + (item.stock == null ? 'ilimitado' : item.stock.toLocaleString('pt-BR')) + '\n\nUse o painel para ajustar preço e estoque, disponibilidade, inventário e ações em etapas.', { ephemeral: true, rows: [wizard] });
    return;
  }

  if (sub === 'item-editar') {
    const sku = parseSku(interaction.options.getString('sku'));
    const changes = {};
    const setString = (option, field, transform = (value) => value) => {
      const value = interaction.options.getString(option);
      if (value != null) changes[field] = transform(value);
    };
    const setInteger = (option, field, transform = (value) => value) => {
      const value = interaction.options.getInteger(option);
      if (value != null) changes[field] = transform(value);
    };
    const setBoolean = (option, field) => {
      const value = interaction.options.getBoolean(option);
      if (value != null) changes[field] = value;
    };
    setString('nome', 'name'); setString('descricao', 'description'); setString('emoji', 'emoji');
    setInteger('preco', 'price'); setString('moeda', 'currency'); setString('categoria_orbe', 'orbType');
    setInteger('estoque', 'stock', (value) => value === -1 ? null : value);
    setString('inicio', 'availableFrom');
    const endDate = textDate(interaction, 'fim');
    const durationHours = interaction.options.getInteger('duracao_horas');
    if (endDate && durationHours != null) throw new RangeError('Informe a data final ou a duração em horas, não as duas.');
    if (endDate != null) changes.availableUntil = endDate;
    else if (durationHours != null) changes.availableUntil = new Date(Date.now() + durationHours * 3600000);
    setBoolean('no_inventario', 'inventoryVisible'); setBoolean('acumulavel', 'stackable'); setBoolean('utilizavel', 'usable');
    setBoolean('consumir_uso', 'consumeOnUse'); setInteger('quantidade_compra', 'purchaseQuantity'); setString('entrega', 'delivery');
    setString('efeito', 'effectDescription'); setString('mensagem_uso', 'useMessage'); setString('acao', 'action');
    setInteger('acao_quantidade', 'actionAmount'); setString('acao_orbe', 'actionOrbType'); setBoolean('ativo', 'active'); setBoolean('visivel', 'visibleInStore');
    const item = await editCatalogItem({ guildId, actorId, sku, changes });
    await replyV2(interaction, '# Item atualizado\n' + item.emoji + ' **' + item.name + '** (`' + item.sku + '`)\nAlterações aplicadas imediatamente à loja. Os inventários existentes mantêm os dados de aquisição.', { ephemeral: true });
    return;
  }

  if (sub === 'item-estoque') {
    const raw = interaction.options.getInteger('quantidade');
    const item = await setCatalogStock({ guildId, actorId, sku: interaction.options.getString('sku'), stock: raw === -1 ? null : raw });
    await replyV2(interaction, '# Estoque atualizado\n**' + item.name + ':** ' + (item.stock == null ? 'ilimitado' : item.stock.toLocaleString('pt-BR')), { ephemeral: true });
    return;
  }

  if (sub === 'item-ativar') {
    const sku = parseSku(interaction.options.getString('sku'));
    const active = interaction.options.getBoolean('ativo');
    const item = await editCatalogItem({ guildId, actorId, sku, changes: { active } });
    await replyV2(interaction, '# Item ' + (active ? 'ativado' : 'desativado') + '\n**' + item.name + '**.', { ephemeral: true });
    return;
  }

  if (sub === 'item-excluir') {
    const sku = parseSku(interaction.options.getString('sku'));
    const item = await EconomyItem.findOne({ guildId, sku, deletedAt: null }).lean();
    if (!item) throw new Error('Item não encontrado.');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('econ:admin:itemdelete:' + actorId + ':' + sku).setLabel('Confirmar exclusão').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('econ:admin:itemdeletecancel:' + actorId).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    );
    await replyV2(interaction, '# Confirmar remoção da loja\n**' + item.emoji + ' ' + item.name + '** será removido do catálogo. Itens já adquiridos e histórico serão preservados.', { ephemeral: true, rows: [row] });
    return;
  }

  if (sub === 'transacoes') {
    const user = interaction.options.getUser('usuario');
    const limit = interaction.options.getInteger('limite') || 10;
    const page = interaction.options.getInteger('pagina') || 0;
    const transactions = await listTransactions(guildId, user?.id, limit, page);
    const text = transactions.length ? transactions.map((entry) => {
      const date = Math.floor(new Date(entry.createdAt).getTime() / 1000);
      const value = transactionValue(entry);
      return '• <t:' + date + ':R> <@' + entry.actorId + '> → <@' + entry.userId + '> · `' + entry.operation.slice(0, 28) + '` · ' + value;
    }).join('\n') : 'Nenhuma transação encontrada.';
    await replyV2(interaction, '# Histórico da economia · página ' + page + '\n' + text, { ephemeral: true });
    return;
  }
}

function orbOptionName(type) {
  return ({ green: 'verde', blue: 'azul', orange: 'laranja', red: 'vermelha', black: 'preta', gold: 'dourada' })[type];
}

function transactionValue(entry) {
  const values = [];
  const signed = (amount) => (amount > 0 ? '+' : '−') + Math.abs(amount).toLocaleString('pt-BR');
  if (entry.walletDelta) values.push('Carteira ' + signed(entry.walletDelta) + ' ' + FRAGMENT_EMOJI);
  if (entry.bankDelta) values.push('Banco ' + signed(entry.bankDelta) + ' ' + FRAGMENT_EMOJI);
  if (entry.orbDelta && typeof entry.orbDelta === 'object') {
    for (const [type, amount] of Object.entries(entry.orbDelta)) {
      if (typeof amount === 'number' && amount) values.push(signed(amount) + ' ' + (ORBS[type]?.emoji || '🔮'));
    }
  }
  if (entry.itemSku) values.push('`' + entry.itemSku + '`' + (entry.details?.quantity ? ' × ' + entry.details.quantity : ''));
  if (!values.length && entry.amount) values.push('Quantidade: ' + entry.amount.toLocaleString('pt-BR'));
  if (!values.length && entry.details) values.push(JSON.stringify(entry.details).slice(0, 70));
  return values.join(' · ').slice(0, 100);
}

function collectRuleOptions(interaction, creating) {
  const fields = {};
  const assign = (option, field, getter) => {
    const value = interaction.options[getter](option);
    if (value != null) fields[field] = value;
  };
  assign('nome', 'name', 'getString'); assign('descricao', 'description', 'getString');
  assign('fragmentos', 'fragments', 'getInteger'); assign('categoria_orbe', 'orbType', 'getString');
  assign('quantidade_orbes', 'orbAmount', 'getInteger'); assign('frequencia', 'frequency', 'getString');
  assign('acumular', 'stackable', 'getBoolean');
  const intervalMinutes = interaction.options.getInteger('intervalo_minutos');
  if (intervalMinutes != null) fields.intervalMs = intervalMinutes * 60000;
  assign('unidade_calendario', 'calendarUnit', 'getString'); assign('dia_calendario', 'calendarValue', 'getInteger');
  if (!creating && interaction.options.getRole('cargo')) fields.roleId = interaction.options.getRole('cargo').id;
  return fields;
}

module.exports = { data, execute, deferEphemeral: true, addRuleOptions, addCreateItemOptions, addEditItemOptions };
