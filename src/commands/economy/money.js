const { SlashCommandBuilder } = require('discord.js');
const { isAuthorized } = require('../../modules/permissions');
const { adjustFragments, transferFragments, getAccount, listTransactions, bankTransfer } = require('../../modules/economyService');
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
  .addSubcommand((sub) => targetAmount(sub.setName('add').setDescription('Adiciona Fragmentos a um membro')).addStringOption(accountOption))
  .addSubcommand((sub) => targetAmount(sub.setName('remove').setDescription('Remove Fragmentos de um membro')).addStringOption(accountOption))
  .addSubcommand((sub) => targetAmount(sub.setName('set').setDescription('Define o saldo de um membro'), 0).addStringOption(accountOption));

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
    const result = await transferFragments({ guildId: interaction.guildId, senderId: interaction.user.id, recipientId: recipient.id, amount });
    await replyV2(interaction, '# Fragmentos enviados\n' + say('transfer') + '\n\nVocê enviou **' + formatFragments(amount) + '** para ' + recipient + '.\n**Carteira restante:** ' + formatFragments(result.sender.wallet), { accentColor: config.visual.fragments });
    return;
  }
  if (operation === 'deposit' || operation === 'withdraw') {
    const amount = interaction.options.getInteger('amount');
    const account = await bankTransfer({ guildId: interaction.guildId, userId: interaction.user.id, amount, direction: operation });
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
  if (!(await isAuthorized(interaction.member, interaction.user.id, interaction.guildId))) {
    await replyV2(interaction, 'Essa operação pontual é exclusiva da equipe autorizada.', { ephemeral: true });
    return;
  }
  const member = interaction.options.getUser('member');
  const amount = interaction.options.getInteger('amount');
  const accountType = interaction.options.getString('account') || 'wallet';
  const account = await adjustFragments({ guildId: interaction.guildId, actorId: interaction.user.id, userId: member.id, amount, mode: operation, accountType, operation: 'admin_fragments_' + operation });
  await replyV2(interaction, '# Bolsa atualizada\n' + member + '\n**Carteira:** ' + formatFragments(account.wallet) + '\n**Banco:** ' + formatFragments(account.bank), { ephemeral: true, accentColor: config.visual.fragments });
}

module.exports = { data, execute };
