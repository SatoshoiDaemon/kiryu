const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('node:crypto');
const { MediaGalleryBuilder, MediaGalleryItemBuilder } = require('discord.js');
const { createMarketListing, getMarketListings, getMarketListing, buyMarketListing, closeMarketListing, marketHistory } = require('../../modules/economyExchangeService');
const { replyV2, followUpV2, createContainer, systemAsset } = require('../../modules/components');
const { formatFragments } = require('../../modules/economyUtils');
const { basicContainer, payload } = require('../../modules/economyViews');
const { respond } = require('../../modules/economyViews');
const { say } = require('../../modules/personality');
const config = require('../../config');

const browseContexts = new Map();
const BROWSE_CONTEXT_TTL_MS = 60 * 60 * 1000;

function rememberBrowseContext(ownerId, options) {
  const now = Date.now();
  for (const [token, context] of browseContexts) if (context.expiresAt <= now) browseContexts.delete(token);
  while (browseContexts.size >= 500) browseContexts.delete(browseContexts.keys().next().value);
  const token = crypto.randomBytes(4).toString('hex');
  browseContexts.set(token, {
    ownerId: String(ownerId), search: options.search || '', category: options.category || 'all',
    sort: options.sort || 'newest', sellerId: options.sellerId || null, expiresAt: now + BROWSE_CONTEXT_TTL_MS,
  });
  return token;
}

function getBrowseContext(ownerId, token) {
  const context = browseContexts.get(String(token));
  if (!context || context.expiresAt <= Date.now() || context.ownerId !== String(ownerId)) return null;
  return { search: context.search, category: context.category, sort: context.sort, sellerId: context.sellerId };
}

const data = new SlashCommandBuilder().setName('market').setDescription('Compre e anuncie itens do inventário da comunidade.')
  .addSubcommand((sub) => sub.setName('browse').setDescription('Busque anúncios ativos')
    .addStringOption((option) => option.setName('search').setDescription('Nome, descrição ou SKU').setRequired(false).setMaxLength(50))
    .addStringOption((option) => option.setName('category').setDescription('Categoria do item').setRequired(false).addChoices(
      { name: 'Todas', value: 'all' }, { name: 'Equipamentos', value: 'equipment' }, { name: 'Consumíveis', value: 'consumable' },
      { name: 'Cosméticos', value: 'cosmetic' }, { name: 'Colecionáveis', value: 'collectible' }, { name: 'Outros', value: 'other' },
    ))
    .addStringOption((option) => option.setName('sort').setDescription('Ordenação dos anúncios').setRequired(false).addChoices(
      { name: 'Mais recentes', value: 'newest' }, { name: 'Preço menor', value: 'price_low' }, { name: 'Preço maior', value: 'price_high' }, { name: 'Maior quantidade', value: 'quantity' },
    ))
    .addIntegerOption((option) => option.setName('page').setDescription('Página do mercado').setMinValue(1).setMaxValue(10000).setRequired(false)))
  .addSubcommand((sub) => sub.setName('seller').setDescription('Veja os anúncios de um vendedor')
    .addUserOption((option) => option.setName('member').setDescription('Vendedor').setRequired(true)))
  .addSubcommand((sub) => sub.setName('sell').setDescription('Publique itens do seu inventário')
    .addStringOption((option) => option.setName('item').setDescription('SKU exibido no inventário').setRequired(true).setMaxLength(32))
    .addIntegerOption((option) => option.setName('quantity').setDescription('Unidades anunciadas').setMinValue(1).setMaxValue(1000000).setRequired(true))
    .addIntegerOption((option) => option.setName('price').setDescription('Preço por unidade em Fragmentos').setMinValue(1).setMaxValue(1000000000000).setRequired(true))
    .addStringOption((option) => option.setName('category').setDescription('Categoria pública').setRequired(false).addChoices(
      { name: 'Equipamentos', value: 'equipment' }, { name: 'Consumíveis', value: 'consumable' }, { name: 'Cosméticos', value: 'cosmetic' }, { name: 'Colecionáveis', value: 'collectible' }, { name: 'Outros', value: 'other' },
    ))
    .addBooleanOption((option) => option.setName('expires').setDescription('Expira após o período configurado').setRequired(false)))
  .addSubcommand((sub) => sub.setName('cancel').setDescription('Cancele um anúncio seu')
    .addStringOption((option) => option.setName('listing_id').setDescription('ID mostrado nos detalhes do anúncio').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consulte seu histórico de vendas'));

async function showBrowse(interaction, options, update = false) {
  const result = await getMarketListings(interaction.guildId, options);
  const contextToken = rememberBrowseContext(interaction.user.id, options);
  const lines = result.listings.map((listing, index) => {
    const total = listing.unitPrice * listing.quantity;
    return '**' + (index + 1) + '. ' + (listing.itemSnapshot.emoji || '📦') + ' ' + listing.itemSnapshot.name + '**'
      + '\n' + formatFragments(listing.unitPrice) + ' por unidade · **' + listing.quantity.toLocaleString('pt-BR') + ' unidade(s)** · ' + formatFragments(total) + ' total'
      + '\nVendedor <@' + listing.sellerId + '> · ' + listing.category + ' · ID `' + listing.listingId + '`';
  });
  const rows = [];
  if (result.listings.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('market:select:' + interaction.user.id + ':' + result.page)
    .setPlaceholder('Escolha um anúncio para ver detalhes e comprar')
    .addOptions(result.listings.map((listing) => ({
      label: String(listing.itemSnapshot.name).slice(0, 100),
      value: listing.listingId,
      description: formatFragments(listing.unitPrice) + ' por unidade · ' + listing.quantity + ' disponível(is)',
    })))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('market:browse:' + interaction.user.id + ':' + Math.max(0, result.page - 1) + ':ctx:' + contextToken).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(result.page <= 0),
    new ButtonBuilder().setCustomId('market:browse:' + interaction.user.id + ':' + Math.min(result.pages - 1, result.page + 1) + ':ctx:' + contextToken).setLabel('Próxima').setStyle(ButtonStyle.Primary).setDisabled(result.page >= result.pages - 1),
  ));
  const content = '# Mercado da comunidade\nAnúncios com estoque reservado até a venda, cancelamento ou expiração. Taxa atual descontada do vendedor: consulte `/config`.\n\n'
    + (lines.join('\n\n') || 'Nenhum anúncio corresponde a essa busca.')
    + '\n\nPágina **' + (result.page + 1) + '/' + result.pages + '** · ' + result.total + ' anúncio(s).';
  const container = basicContainer(content, rows, config.visual.store);
  if (update) return interaction.update({ components: [container], allowedMentions: { parse: [] } });
  return respond(interaction, payload(container, true));
}

async function showListing(interaction, listing, update = true) {
  const item = listing.itemSnapshot;
  const total = listing.unitPrice * listing.quantity;
  const content = '# ' + (item.emoji || '📦') + ' ' + item.name + '\n' + (item.description || 'Item anunciado por um membro da comunidade.')
    + '\n\n**ID:** `' + listing.listingId + '`\n**Vendedor:** <@' + listing.sellerId + '>\n**Categoria:** ' + listing.category
    + '\n**Unidades:** ' + listing.quantity.toLocaleString('pt-BR') + '\n**Preço unitário:** ' + formatFragments(listing.unitPrice)
    + '\n**Total:** ' + formatFragments(total) + (listing.expiresAt ? '\n**Expira:** <t:' + Math.floor(new Date(listing.expiresAt).getTime() / 1000) + ':R>' : '\n**Expiração:** sem prazo')
    + '\n\nA reserva será entregue ao comprador após a liquidação e a taxa publicada será descontada do pagamento ao vendedor.';
  const rows = listing.sellerId === interaction.user.id
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('market:cancel:' + interaction.user.id + ':' + listing.listingId).setLabel('Cancelar anúncio').setStyle(ButtonStyle.Danger))]
    : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('market:buy:' + interaction.user.id + ':' + listing.listingId).setLabel('Comprar por ' + total.toLocaleString('pt-BR') + ' Fragmentos').setStyle(ButtonStyle.Success))];
  const media = new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
    .setURL(item.thumbnailUrl && /^https:\/\//i.test(item.thumbnailUrl) ? item.thumbnailUrl : systemAsset('store'))
    .setDescription(item.name || 'Item anunciado'));
  const container = createContainer(content, rows, config.visual.store, { mediaGallery: media });
  return update ? interaction.update({ components: [container], allowedMentions: { parse: [] } }) : respond(interaction, payload(container, true));
}

async function execute(interaction) {
  if (interaction.guildId !== config.guildId) return;
  const action = interaction.options.getSubcommand();
  if (action === 'browse' || action === 'seller') {
    return showBrowse(interaction, {
      ...(action === 'seller' ? { sellerId: interaction.options.getUser('member').id } : {}),
      ...(action === 'browse' ? {
        search: interaction.options.getString('search') || '', category: interaction.options.getString('category') || 'all',
        sort: interaction.options.getString('sort') || 'newest', page: Math.max(0, (interaction.options.getInteger('page') || 1) - 1),
      } : {}),
    });
  }
  if (action === 'sell') {
    const listing = await createMarketListing({ guildId: interaction.guildId, sellerId: interaction.user.id,
      sku: interaction.options.getString('item'), quantity: interaction.options.getInteger('quantity'), unitPrice: interaction.options.getInteger('price'),
      category: interaction.options.getString('category') || 'other', interactionId: interaction.id, expires: interaction.options.getBoolean('expires') !== false });
    return replyV2(interaction, '# Anúncio publicado\n' + say('marketList') + '\n\n**' + listing.itemSnapshot.name + '** · ' + listing.quantity + ' unidade(s) · ' + formatFragments(listing.unitPrice) + ' cada.\n**ID:** `' + listing.listingId + '`\nSeu estoque foi reservado e não pode ser usado enquanto o anúncio estiver ativo.', { accentColor: config.visual.store, ephemeral: true });
  }
  if (action === 'cancel') {
    const listing = await closeMarketListing({ guildId: interaction.guildId, sellerId: interaction.user.id, listingId: interaction.options.getString('listing_id'), reason: 'cancelled' });
    return replyV2(interaction, '# Anúncio cancelado\n**' + listing.itemSnapshot.name + '** voltou ao seu inventário.', { accentColor: config.visual.store, ephemeral: true });
  }
  const entries = await marketHistory(interaction.guildId, interaction.user.id);
  const lines = entries.map((entry) => '**' + entry.itemSnapshot.name + '** · ' + entry.state + ' · ' + entry.quantity + ' unidade(s) · `' + entry.listingId + '`');
  return replyV2(interaction, '# Histórico do mercado\n\n' + (lines.join('\n') || 'Você ainda não possui vendas ou anúncios encerrados.'), { accentColor: config.visual.store, ephemeral: true });
}

module.exports = { data, execute, showBrowse, showListing, getBrowseContext };
