const { SlashCommandBuilder } = require('discord.js');
const { isAuthorized } = require('../../modules/permissions');
const { adjustFragments, adjustRoleFragments, transferFragments, getAccount, listTransactions, getMoneyLeaderboard, getEconomicAudit, replayPendingEconomicOperations, bankTransfer } = require('../../modules/economyService');
const { replyV2 } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { walletContainer, payload, respond } = require('../../modules/economyViews');
const { say } = require('../../modules/personality');
const config = require('../../config');

function accountOption(option, required = false) {
  return option.setName('account').setDescription('Wallet or bank').setRequired(required)
    .addChoices({ name: 'Wallet', value: 'wallet' }, { name: 'Bank', value: 'bank' });
}

function targetAmount(command, min = 1) {
  return command.addUserOption((option) => option.setName('member').setDescription('Membro afetado').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Fragmentos').setMinValue(min).setMaxValue(1000000000000).setRequired(true));
}

function transactionLabel(operation) {
  const labels = {
    member_transfer_out: 'Transferência enviada', member_transfer_in: 'Transferência recebida',
    bank_deposit: 'Depósito no banco', bank_withdraw: 'Saque do banco',
    market_purchase: 'Compra no mercado', market_sale: 'Venda no mercado', market_fee: 'Taxa de mercado',
    auction_bid_reserved: 'Lance reservado', auction_bid_refund: 'Devolução de lance', auction_sale: 'Venda em leilão', auction_fee: 'Taxa de leilão',
    trade_transfer: 'Troca entre membros', lottery_ticket: 'Bilhete de loteria', lottery_prize: 'Prêmio da loteria',
    casino_blackjack_stake: 'Cassino · aposta de blackjack', casino_blackjack_settlement: 'Cassino · liquidação de blackjack',
    casino_mines_stake: 'Cassino · aposta de minas', casino_mines_settlement: 'Cassino · liquidação de minas',
    adventure_reward: 'Recompensa de expedição', crime_reward: 'Golpe fictício concluído', crime_failed: 'Multa de golpe fictício', passive_income: 'Renda passiva',
    casino_coin: 'Cassino · cara ou coroa', casino_dice: 'Cassino · dados', casino_slots: 'Cassino · caça-níquel',
    orb_conversion: 'Conversão de Orbes', work_reward: 'Recompensa de trabalho', daily_reward: 'Recompensa diária',
    item_purchase: 'Compra na loja', item_use: 'Uso de item', admin_item_delivery: 'Entrega de item pela equipe',
    admin_item_removal: 'Remoção de item pela equipe', collect_role_reward: 'Recompensa de cargo',
    bank_deposit: 'Depósito no banco', bank_withdraw: 'Saque do banco',
    admin_work_config: 'Configuração de trabalho', admin_daily_config: 'Configuração do daily',
    admin_orb_conversion_config: 'Configuração da conversão de Orbes', admin_casino_config: 'Configuração do cassino',
    admin_collect_rule_create: 'Criação de recompensa por cargo', admin_collect_rule_edit: 'Edição de recompensa por cargo',
    admin_collect_rule_remove: 'Remoção de recompensa por cargo', admin_item_create: 'Cadastro de item',
    admin_item_edit: 'Edição de item', admin_item_stock: 'Ajuste de estoque', admin_item_delete: 'Remoção de item',
  };
  if (labels[operation]) return labels[operation];
  if (operation.startsWith('admin_fragments_')) return 'Ajuste de Fragmentos pela equipe';
  if (operation.startsWith('admin_orbs_')) return 'Ajuste de Orbes pela equipe';
  return 'Movimentação';
}

const data = new SlashCommandBuilder().setName('money').setDescription('Carteira, banco e circulação de Fragmentos.')
  .addSubcommand((sub) => sub.setName('balance').setDescription('Veja sua carteira, banco e inventário'))
  .addSubcommand((sub) => sub.setName('transfer').setDescription('Envie Fragmentos a alguém')
    .addUserOption((option) => option.setName('member').setDescription('Destinatário').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Fragmentos a enviar').setMinValue(1).setMaxValue(1000000000000).setRequired(true)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consulte seu histórico econômico')
    .addUserOption((option) => option.setName('member').setDescription('Filtro; outra pessoa exige permissão de equipe').setRequired(false))
    .addIntegerOption((option) => option.setName('page').setDescription('Página do histórico').setMinValue(0).setMaxValue(10000).setRequired(false)))
  .addSubcommand((sub) => sub.setName('deposit').setDescription('Mova Fragmentos da carteira para o banco')
    .addIntegerOption((option) => option.setName('amount').setDescription('Quantidade').setMinValue(1).setMaxValue(1000000000000).setRequired(true)))
  .addSubcommand((sub) => sub.setName('withdraw').setDescription('Mova Fragmentos do banco para a carteira')
    .addIntegerOption((option) => option.setName('amount').setDescription('Quantidade').setMinValue(1).setMaxValue(1000000000000).setRequired(true)))
  .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Veja os maiores saldos de Fragmentos')
    .addStringOption((option) => option.setName('category').setDescription('Saldo usado para ordenar').setRequired(false).addChoices(
      { name: 'Patrimônio total', value: 'wealth' }, { name: 'Carteira', value: 'wallet' }, { name: 'Banco', value: 'bank' },
    )))
  .addSubcommand((sub) => sub.setName('audit').setDescription('Revise saldos fora dos limites e operações pendentes'))
  .addSubcommand((sub) => targetAmount(sub.setName('add').setDescription('Adiciona Fragmentos a um membro')).addStringOption(accountOption))
  .addSubcommand((sub) => targetAmount(sub.setName('remove').setDescription('Remove Fragmentos de um membro')).addStringOption(accountOption))
  .addSubcommand((sub) => targetAmount(sub.setName('set').setDescription('Define o saldo de um membro'), 0).addStringOption(accountOption))
  .addSubcommand((sub) => sub.setName('add-role').setDescription('Adiciona Fragmentos a todos os membros de um cargo')
    .addRoleOption((option) => option.setName('role').setDescription('Cargo afetado').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Fragmentos por membro').setMinValue(1).setMaxValue(1000000000000).setRequired(true))
    .addStringOption(accountOption))
  .addSubcommand((sub) => sub.setName('remove-role').setDescription('Remove Fragmentos dos membros de um cargo')
    .addRoleOption((option) => option.setName('role').setDescription('Cargo afetado').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Fragmentos por membro').setMinValue(1).setMaxValue(1000000000000).setRequired(true))
    .addStringOption(accountOption));

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const operation = interaction.options.getSubcommand();
  if (operation === 'balance') {
    const account = await getAccount(interaction.guildId, interaction.user.id);
    return respond(interaction, payload(walletContainer(interaction.user, account, interaction.user.id, true)));
  }
  if (operation === 'transfer') {
    const recipient = interaction.options.getUser('member');
    const amount = interaction.options.getInteger('amount');
    const result = await transferFragments({ guildId: interaction.guildId, senderId: interaction.user.id, recipientId: recipient.id, amount, interactionId: interaction.id });
    await replyV2(interaction, '# Fragmentos enviados\n' + say('transfer') + '\n\nVocê enviou **' + formatFragments(amount) + '** para ' + recipient + '.\n**Carteira restante:** ' + formatFragments(result.sender.wallet), { accentColor: config.visual.fragments });
    return;
  }
  if (operation === 'deposit' || operation === 'withdraw') {
    const amount = interaction.options.getInteger('amount');
    const account = await bankTransfer({ guildId: interaction.guildId, userId: interaction.user.id, amount, direction: operation, interactionId: interaction.id });
    const movement = operation === 'deposit' ? 'foram guardados no banco' : 'voltaram para sua carteira';
    await replyV2(interaction, '# Cofre atualizado\n**' + formatFragments(amount) + '** ' + movement + '.\n\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank), { accentColor: config.visual.fragments });
    return;
  }
  if (operation === 'history') {
    const member = interaction.options.getUser('member');
    if (member && member.id !== interaction.user.id && !(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
      await replyV2(interaction, 'O histórico de outra pessoa é reservado à equipe. O seu está disponível para consulta.', { ephemeral: true });
      return;
    }
    const userId = member?.id || interaction.user.id;
    const page = interaction.options.getInteger('page') || 0;
    const entries = await listTransactions(interaction.guildId, userId, 10, page);
    const lines = entries.length ? entries.map((entry) => {
      const delta = entry.walletDelta ? (entry.walletDelta > 0 ? '+' : '−') + formatFragments(Math.abs(entry.walletDelta))
        : entry.bankDelta ? (entry.bankDelta > 0 ? '+' : '−') + formatFragments(Math.abs(entry.bankDelta)) + ' no banco'
          : entry.currency === 'orbs' ? 'Movimentação de Orbes'
            : entry.currency === 'item' ? 'Item' : 'Registro';
      return '<t:' + Math.floor(new Date(entry.createdAt).getTime() / 1000) + ':R> · **' + transactionLabel(entry.operation) + '** · ' + delta;
    }).join('\n') : 'Este trecho do livro-caixa ainda está em branco.';
    await replyV2(interaction, '# Livro-caixa · página ' + (page + 1) + '\n' + (member ? 'Movimentações de ' + member + '.' : 'Suas últimas movimentações.') + '\n\n' + lines, { ephemeral: true, accentColor: config.visual.fragments });
    return;
  }
  if (operation === 'leaderboard') {
    const category = interaction.options.getString('category') || 'wealth';
    const entries = await getMoneyLeaderboard(interaction.guildId, category, 10);
    const noun = category === 'wallet' ? 'carteira' : category === 'bank' ? 'banco' : 'patrimônio total';
    const lines = entries.map((entry, index) => {
      const score = category === 'wallet' ? entry.wallet : category === 'bank' ? entry.bank : entry.wallet + entry.bank;
      return '**' + (index + 1) + '.** <@' + entry.userId + '> · **' + formatFragments(score) + '**';
    });
    await replyV2(interaction, '# Ranking · ' + noun + '\n\n' + (lines.join('\n') || 'Ainda não há saldos registrados para este ranking.'), { accentColor: config.visual.fragments });
    return;
  }
  if (operation === 'audit') {
    if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
      await replyV2(interaction, 'A auditoria econômica é exclusiva da equipe autorizada.', { ephemeral: true });
      return;
    }
    const recovery = await replayPendingEconomicOperations();
    const audit = await getEconomicAudit(interaction.guildId, { limit: 15 });
    const pending = audit.unresolved.filter((entry) => entry.state === 'pending').length;
    const manual = audit.unresolved.filter((entry) => entry.state === 'manual_review').length;
    const invalid = audit.invalidAccounts.map((entry) => '<@' + entry.userId + '> · carteira ' + formatFragments(entry.wallet) + ' · banco ' + formatFragments(entry.bank));
    const unresolved = audit.unresolved.map((entry) => '• `' + entry._id + '` · ' + entry.kind + ' · ' + entry.state + ' · etapa ' + entry.step);
    const manualCommercial = [
      ...audit.manualListings.map((entry) => '• Mercado `' + entry.listingId + '` · anúncio de <@' + entry.sellerId + '>'),
      ...audit.manualTrades.map((entry) => '• Troca `' + entry.tradeId + '` · ' + entry.participants.map((id) => '<@' + id + '>').join(' ↔ ')),
      ...audit.manualAuctions.map((entry) => '• Leilão `' + entry.auctionId + '` · vendedor <@' + entry.sellerId + '>'),
      ...audit.manualSessions.map((entry) => '• Jogo `' + entry.sessionId + '` · dono <@' + entry.ownerId + '> · ' + entry.game),
    ];
    const content = '# Auditoria econômica\n**Contas:** ' + audit.accountCount.toLocaleString('pt-BR') + ' · **recuperadas agora:** ' + recovery.recovered
      + '\n**Carteiras somadas:** ' + formatFragments(audit.wallet.total) + ' · min ' + formatFragments(audit.wallet.minimum) + ' · max ' + formatFragments(audit.wallet.maximum)
      + '\n**Bancos somados:** ' + formatFragments(audit.bank.total) + ' · min ' + formatFragments(audit.bank.minimum) + ' · max ' + formatFragments(audit.bank.maximum)
      + '\n**Limites atuais:** carteira ' + formatFragments(audit.limits.wallet) + ' · banco ' + formatFragments(audit.limits.bank)
      + '\n**Operações pendentes:** ' + pending + ' · **revisão manual:** ' + manual
      + '\n\n**Contas negativas ou acima dos limites**\n' + (invalid.join('\n') || 'Nenhuma encontrada.')
      + '\n\n**Operações que aguardam conciliação**\n' + (unresolved.join('\n') || 'Nenhuma encontrada.')
      + '\n\n**Comércio e sessões em revisão manual**\n' + (manualCommercial.join('\n') || 'Nenhum registro encontrado.')
      + '\n\nO livro-caixa preserva as movimentações, mas contas anteriores ao registro transacional não possuem saldo de abertura; por isso a auditoria reconcilia operações pendentes e limites sem reescrever saldos históricos.';
    await replyV2(interaction, content, { ephemeral: true, accentColor: config.visual.admin });
    return;
  }
  if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Essa operação pontual é exclusiva da equipe autorizada.', { ephemeral: true });
    return;
  }
  if (operation === 'add-role' || operation === 'remove-role') {
    const role = interaction.options.getRole('role');
    const amount = interaction.options.getInteger('amount');
    const accountType = interaction.options.getString('account') || 'wallet';
    await interaction.guild.members.fetch();
    const memberIds = role.members.map((member) => member.id);
    const result = await adjustRoleFragments({ guildId: interaction.guildId, actorId: interaction.user.id, memberIds, amount, mode: operation === 'add-role' ? 'add' : 'remove', accountType, interactionId: interaction.id });
    await replyV2(interaction, '# Ajuste em massa concluído\n**Cargo:** ' + role + '\n**Conta:** ' + (accountType === 'wallet' ? 'Carteira' : 'Banco') + '\n**Por membro:** ' + formatFragments(amount) + '\n**Concluídos:** ' + result.succeeded + '/' + result.total + (result.failed ? '\n**Não aplicados:** ' + result.failed : ''), { ephemeral: true, accentColor: config.visual.admin });
    return;
  }
  const member = interaction.options.getUser('member');
  const amount = interaction.options.getInteger('amount');
  const accountType = interaction.options.getString('account') || 'wallet';
  const account = await adjustFragments({ guildId: interaction.guildId, actorId: interaction.user.id, userId: member.id, amount, mode: operation, accountType, operation: 'admin_fragments_' + operation, interactionId: interaction.id });
  await replyV2(interaction, '# Bolsa atualizada\n' + member + '\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank), { ephemeral: true, accentColor: config.visual.fragments });
}

module.exports = { data, execute };
