const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { inviteTrade, acceptTrade, updateTradeOffer, confirmTrade, cancelTrade, getTrade, tradeHistory } = require('../../modules/economyTradeService');
const { basicContainer, payload } = require('../../modules/economyViews');
const { replyV2, followUpV2 } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { say } = require('../../modules/personality');
const config = require('../../config');

const ORB_CHOICES = [
  { name: 'Verde', value: 'green' }, { name: 'Azul', value: 'blue' }, { name: 'Laranja', value: 'orange' },
  { name: 'Vermelha', value: 'red' }, { name: 'Preta', value: 'black' }, { name: 'Dourada', value: 'gold' },
];
const data = new SlashCommandBuilder().setName('trade').setDescription('Negocie Fragmentos, Orbes e itens com outro membro.')
  .addSubcommand((sub) => sub.setName('invite').setDescription('Convide alguém para uma troca bilateral')
    .addUserOption((option) => option.setName('member').setDescription('Membro convidado').setRequired(true)))
  .addSubcommand((sub) => sub.setName('accept').setDescription('Aceite um convite de troca')
    .addStringOption((option) => option.setName('trade_id').setDescription('ID do convite').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('offer').setDescription('Altere seus recursos oferecidos')
    .addStringOption((option) => option.setName('trade_id').setDescription('ID da troca').setRequired(true).setMaxLength(32))
    .addStringOption((option) => option.setName('type').setDescription('Recurso oferecido').setRequired(true).addChoices(
      { name: 'Fragmentos', value: 'fragments' }, { name: 'Orbes', value: 'orb' }, { name: 'Item', value: 'item' },
    ))
    .addIntegerOption((option) => option.setName('amount').setDescription('Quantidade de Fragmentos ou Orbes; 0 remove').setMinValue(0).setMaxValue(1000000000000).setRequired(false))
    .addStringOption((option) => option.setName('orb_type').setDescription('Categoria do Orbe').setRequired(false).addChoices(...ORB_CHOICES))
    .addStringOption((option) => option.setName('item').setDescription('SKU do inventário').setRequired(false).setMaxLength(32))
    .addIntegerOption((option) => option.setName('quantity').setDescription('Unidades do item; 0 remove').setMinValue(0).setMaxValue(1000000).setRequired(false)))
  .addSubcommand((sub) => sub.setName('confirm').setDescription('Confirme a versão atual da oferta')
    .addStringOption((option) => option.setName('trade_id').setDescription('ID da troca').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('view').setDescription('Consulte as ofertas dos dois participantes')
    .addStringOption((option) => option.setName('trade_id').setDescription('ID da troca').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancele uma troca aberta')
    .addStringOption((option) => option.setName('trade_id').setDescription('ID da troca').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consulte suas trocas recentes'));

function offerText(session, userId) {
  const offer = session.offers?.[userId] || { fragments: 0, orbs: {}, items: [] };
  const resources = [];
  if (offer.fragments) resources.push(formatFragments(offer.fragments));
  for (const [type, amount] of Object.entries(offer.orbs || {})) if (amount) resources.push(amount.toLocaleString('pt-BR') + ' Orbes ' + type);
  for (const item of offer.items || []) resources.push(item.quantity + ' × `' + item.sku + '`');
  return resources.join(' · ') || 'Nenhum recurso oferecido.';
}

function tradeSummary(session) {
  const [a, b] = session.participants;
  const status = ({ invited: 'aguardando convite', open: 'ofertas abertas', settling: 'liquidando', completed: 'concluída', cancelled: 'cancelada', expired: 'expirada', manual_review: 'em revisão' })[session.state] || session.state;
  return '# Troca `' + session.tradeId + '` · ' + status + '\n**Participantes:** <@' + a + '> ↔ <@' + b + '>\n**Versão da oferta:** ' + session.revision
    + '\n\n**<@' + a + '> oferece**\n' + offerText(session, a) + '\n\n**<@' + b + '> oferece**\n' + offerText(session, b)
    + '\n\n**Confirmações atuais:** ' + (session.confirmed?.length ? session.confirmed.map((id) => '<@' + id + '>').join(', ') : 'nenhuma')
    + (session.lastError ? '\n\n**Última validação:** ' + session.lastError : '')
    + '\n\nToda alteração invalida as confirmações anteriores. Os recursos só são reservados na liquidação bilateral.';
}

function tradeRows(session, userId) {
  if (session.state !== 'open' || !session.participants.includes(userId)) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('trade:confirm:' + userId + ':' + session.tradeId).setLabel('Confirmar oferta atual').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('trade:cancel:' + userId + ':' + session.tradeId).setLabel('Cancelar troca').setStyle(ButtonStyle.Danger),
  )];
}

async function showTrade(interaction, session, update = false) {
  const container = basicContainer(tradeSummary(session), tradeRows(session, interaction.user.id), config.visual.store);
  if (update) return interaction.update({ components: [container], allowedMentions: { parse: [] } });
  return replyV2(interaction, tradeSummary(session), { ephemeral: true, accentColor: config.visual.store, rows: tradeRows(session, interaction.user.id) });
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const action = interaction.options.getSubcommand();
  if (action === 'invite') {
    const member = interaction.options.getUser('member');
    const session = await inviteTrade({ guildId: interaction.guildId, inviterId: interaction.user.id, inviteeId: member.id, interactionId: interaction.id });
    const invite = basicContainer('# Troca convidada\n<@' + interaction.user.id + '> convidou <@' + member.id + '> para negociar Fragmentos, Orbes e itens.\n**ID:** `' + session.tradeId + '`\nO convite expira <t:' + Math.floor(new Date(session.expiresAt).getTime() / 1000) + ':R>.', [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade:accept:' + member.id + ':' + session.tradeId).setLabel('Aceitar convite').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trade:cancel:' + interaction.user.id + ':' + session.tradeId).setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    )], config.visual.store);
    await interaction.channel.send({ components: [invite], flags: MessageFlags.IsComponentsV2, allowedMentions: { users: [interaction.user.id, member.id], parse: [] } });
    return replyV2(interaction, '# Convite enviado\nA Kiryu publicou um convite sem expor saldos ou itens. **ID:** `' + session.tradeId + '`', { ephemeral: true, accentColor: config.visual.store });
  }
  const tradeId = action === 'history' ? null : interaction.options.getString('trade_id');
  if (action === 'accept') {
    const session = await acceptTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    return replyV2(interaction, '# Convite aceito\n' + say('trade') + '\n\nA troca está aberta. Os dois participantes podem alterar seus recursos com `/trade offer` e consultar o painel com `/trade view`.\n**ID:** `' + tradeId + '`', { ephemeral: true, accentColor: config.visual.store });
  }
  if (action === 'offer') {
    const type = interaction.options.getString('type');
    const session = await updateTradeOffer({ guildId: interaction.guildId, tradeId, userId: interaction.user.id, currency: type,
      amount: interaction.options.getInteger('amount') ?? 0, orbType: interaction.options.getString('orb_type'),
      sku: interaction.options.getString('item'), quantity: interaction.options.getInteger('quantity') ?? 0 });
    return showTrade(interaction, session);
  }
  if (action === 'confirm') {
    const session = await confirmTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    return replyV2(interaction, session.state === 'completed' ? '# Troca liquidada\nOs recursos confirmados foram entregues aos dois inventários.'
      : '# Confirmação registrada\nA versão **' + session.revision + '** da oferta está confirmada por você. A outra pessoa precisa confirmar a mesma versão para liquidar.', { ephemeral: true, accentColor: config.visual.store });
  }
  if (action === 'view') {
    const session = await getTrade(interaction.guildId, tradeId);
    if (!session.participants.includes(interaction.user.id)) throw new Error('Esta troca pertence a outras pessoas.');
    return showTrade(interaction, session);
  }
  if (action === 'cancel') {
    await cancelTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    return replyV2(interaction, '# Troca cancelada\nNenhum recurso havia sido transferido.', { ephemeral: true, accentColor: config.visual.store });
  }
  const history = await tradeHistory(interaction.guildId, interaction.user.id);
  const lines = history.map((session) => '• `' + session.tradeId + '` · ' + session.state + ' · <@' + session.participants.find((id) => id !== interaction.user.id) + '> · <t:' + Math.floor(new Date(session.updatedAt).getTime() / 1000) + ':R>');
  return replyV2(interaction, '# Histórico de trocas\n\n' + (lines.join('\n') || 'Você ainda não participou de uma troca.'), { ephemeral: true, accentColor: config.visual.store });
}

module.exports = { data, execute, tradeSummary, tradeRows, showTrade };
