const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { createAuction, placeBid, buyNow, cancelAuction, getAuction, listAuctions, auctionHistory } = require('../../modules/auctionService');
const { basicContainer, payload } = require('../../modules/economyViews');
const { replyV2, createContainer, systemAsset } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { say } = require('../../modules/personality');
const config = require('../../config');

const data = new SlashCommandBuilder().setName('auction').setDescription('Crie e dispute leilões de itens do inventário.')
  .addSubcommand((sub) => sub.setName('list').setDescription('Veja os leilões abertos'))
  .addSubcommand((sub) => sub.setName('view').setDescription('Consulte regras e lances de um leilão')
    .addStringOption((option) => option.setName('auction_id').setDescription('ID do leilão').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('create').setDescription('Reserve um item para leiloar')
    .addStringOption((option) => option.setName('item').setDescription('SKU do item no inventário').setRequired(true).setMaxLength(32))
    .addIntegerOption((option) => option.setName('quantity').setDescription('Unidades reservadas').setMinValue(1).setMaxValue(1000000).setRequired(true))
    .addIntegerOption((option) => option.setName('starting_bid').setDescription('Lance inicial em Fragmentos').setMinValue(1).setMaxValue(1000000000000).setRequired(true))
    .addIntegerOption((option) => option.setName('buy_now').setDescription('Compra imediata opcional').setMinValue(1).setMaxValue(1000000000000).setRequired(false))
    .addIntegerOption((option) => option.setName('duration_hours').setDescription('Duração de 1 a 168 horas').setMinValue(1).setMaxValue(168).setRequired(true)))
  .addSubcommand((sub) => sub.setName('bid').setDescription('Registre um lance reservado na carteira')
    .addStringOption((option) => option.setName('auction_id').setDescription('ID do leilão').setRequired(true).setMaxLength(32))
    .addIntegerOption((option) => option.setName('amount').setDescription('Valor total do novo lance').setMinValue(1).setMaxValue(1000000000000).setRequired(true)))
  .addSubcommand((sub) => sub.setName('buy-now').setDescription('Compre imediatamente pelo preço anunciado')
    .addStringOption((option) => option.setName('auction_id').setDescription('ID do leilão').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancele um leilão sem lances')
    .addStringOption((option) => option.setName('auction_id').setDescription('ID do leilão').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consulte seus leilões e lances recentes'));

function auctionText(auction) {
  const highest = auction.highBidderId ? '<@' + auction.highBidderId + '> · ' + formatFragments(auction.currentBid) : 'Nenhum lance';
  const bids = (auction.bids || []).slice(-10).reverse().map((bid) => '• <@' + bid.bidderId + '> · ' + formatFragments(bid.amount));
  const lines = [
    '# Leilão · ' + (auction.itemSnapshot.emoji || '📦') + ' ' + auction.itemSnapshot.name,
    auction.itemSnapshot.description || 'Item anunciado pela comunidade.',
    '',
    '**ID:** `' + auction.auctionId + '`', '**Vendedor:** <@' + auction.sellerId + '>',
    '**Unidades:** ' + auction.quantity, '**Lance inicial:** ' + formatFragments(auction.startingBid),
    '**Próximo lance mínimo:** ' + formatFragments(auction.currentBid ? auction.currentBid + auction.minIncrement : auction.startingBid),
    '**Maior lance:** ' + highest, '**Compra imediata:** ' + (auction.buyNow ? formatFragments(auction.buyNow) : 'não disponível'),
    '**Encerra:** <t:' + Math.floor(new Date(auction.expiresAt).getTime() / 1000) + ':R>',
    '', '**Lances recentes:**', bids.join('\n') || 'Nenhum lance registrado.',
    '', 'Cada lance reserva Fragmentos da carteira. Ao superar um lance, a reserva anterior é devolvida. No encerramento, o vencedor recebe o item e o vendedor recebe o valor final menos a taxa configurada.',
  ];
  return lines.join('\n');
}

async function showAuction(interaction, auction, update = false) {
  const rows = [];
  if (auction.state === 'open' && auction.sellerId === interaction.user.id && !auction.highBidderId) {
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('auction:cancel:' + interaction.user.id + ':' + auction.auctionId).setLabel('Cancelar leilão').setStyle(ButtonStyle.Danger)));
  }
  const media = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
    .setURL(auction.itemSnapshot.thumbnailUrl && /^https:\/\//i.test(auction.itemSnapshot.thumbnailUrl) ? auction.itemSnapshot.thumbnailUrl : systemAsset('store'))
    .setDescription(auction.itemSnapshot.name || 'Item do leilão'));
  const container = createContainer(auctionText(auction), rows, config.visual.store, { mediaGallery: media });
  if (update) return interaction.update({ components: [container], allowedMentions: { parse: [] } });
  return replyV2(interaction, auctionText(auction), { ephemeral: true, accentColor: config.visual.store, rows });
}

async function showList(interaction, page = 0, update = false) {
  const result = await listAuctions(interaction.guildId, { page, pageSize: 10 });
  const lines = result.auctions.map((auction) => '**' + auction.itemSnapshot.name + '** · ' + (auction.highBidderId ? formatFragments(auction.currentBid) : 'sem lances')
    + ' · vendedor <@' + auction.sellerId + '> · encerra <t:' + Math.floor(new Date(auction.expiresAt).getTime() / 1000) + ':R> · `' + auction.auctionId + '`');
  const rows = [];
  if (result.auctions.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('auction:select:' + interaction.user.id)
    .setPlaceholder('Abrir regras e lances de um leilão')
    .addOptions(result.auctions.map((auction) => ({ label: String(auction.itemSnapshot.name).slice(0, 100), value: auction.auctionId,
      description: (auction.currentBid ? auction.currentBid.toLocaleString('pt-BR') : auction.startingBid.toLocaleString('pt-BR')) + ' Fragmentos · fecha em breve' })))));
  const content = '# Leilões abertos\nOs lances são reservas de Fragmentos. A devolução ao maior lance anterior ocorre automaticamente quando alguém o supera.\n\n'
    + (lines.join('\n') || 'Não há leilões abertos agora.') + '\n\nPágina ' + (result.page + 1) + '/' + result.pages + ' · ' + result.total + ' leilão(ões).';
  const container = basicContainer(content, rows, config.visual.store);
  if (update) return interaction.update({ components: [container], allowedMentions: { parse: [] } });
  return replyV2(interaction, content, { ephemeral: true, accentColor: config.visual.store, rows });
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const action = interaction.options.getSubcommand();
  if (action === 'list') return showList(interaction);
  if (action === 'view') return showAuction(interaction, await getAuction(interaction.guildId, interaction.options.getString('auction_id')));
  if (action === 'create') {
    const auction = await createAuction({ guildId: interaction.guildId, sellerId: interaction.user.id, sku: interaction.options.getString('item'),
      quantity: interaction.options.getInteger('quantity'), startingBid: interaction.options.getInteger('starting_bid'), buyNow: interaction.options.getInteger('buy_now'),
      durationHours: interaction.options.getInteger('duration_hours'), interactionId: interaction.id });
    return replyV2(interaction, '# Leilão aberto\n' + say('auction') + '\n\n**' + auction.itemSnapshot.name + '** está reservado até o encerramento.\n**ID:** `' + auction.auctionId + '`\n**Lance inicial:** ' + formatFragments(auction.startingBid)
      + (auction.buyNow ? '\n**Compra imediata:** ' + formatFragments(auction.buyNow) : '') + '\n**Encerra:** <t:' + Math.floor(new Date(auction.expiresAt).getTime() / 1000) + ':R>', { ephemeral: true, accentColor: config.visual.store });
  }
  if (action === 'bid') {
    const auction = await placeBid({ guildId: interaction.guildId, bidderId: interaction.user.id, auctionId: interaction.options.getString('auction_id'), amount: interaction.options.getInteger('amount') });
    return replyV2(interaction, '# Lance registrado\nSeu lance de **' + formatFragments(auction.currentBid) + '** está reservado na carteira.\n**Leilão:** `' + auction.auctionId + '`\n**Próximo mínimo:** ' + formatFragments(auction.currentBid + auction.minIncrement), { ephemeral: true, accentColor: config.visual.store });
  }
  if (action === 'buy-now') {
    const auction = await buyNow({ guildId: interaction.guildId, bidderId: interaction.user.id, auctionId: interaction.options.getString('auction_id') });
    return replyV2(interaction, '# Compra imediata concluída\nO item foi entregue ao vencedor e o lance reservado foi liquidado.', { ephemeral: true, accentColor: config.visual.store });
  }
  if (action === 'cancel') {
    await cancelAuction({ guildId: interaction.guildId, sellerId: interaction.user.id, auctionId: interaction.options.getString('auction_id') });
    return replyV2(interaction, '# Leilão cancelado\nO item reservado voltou ao seu inventário.', { ephemeral: true, accentColor: config.visual.store });
  }
  const history = await auctionHistory(interaction.guildId, interaction.user.id);
  const lines = history.map((auction) => '• `' + auction.auctionId + '` · **' + auction.itemSnapshot.name + '** · ' + auction.state + (auction.highBidderId === interaction.user.id ? ' · seu maior lance' : ''));
  return replyV2(interaction, '# Histórico de leilões\n\n' + (lines.join('\n') || 'Você ainda não participou de um leilão.'), { ephemeral: true, accentColor: config.visual.store });
}

module.exports = { data, execute, auctionText, showAuction, showList };
