const { EconomyError, formatFragments } = require('./economyUtils');
const { getMarketListing, buyMarketListing, closeMarketListing } = require('./economyExchangeService');
const { basicContainer, payload } = require('./economyViews');
const { formatFragments: money } = require('./economyUtils');
const { showBrowse, showListing, getBrowseContext } = require('../commands/economy/market');
const config = require('../config');

async function handleExchangeInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('market:')) return false;
  const parts = customId.split(':');
  if ((interaction.isButton() || interaction.isStringSelectMenu()) && parts[2] && parts[1] !== 'browse' && interaction.user.id !== parts[2]) {
    throw new EconomyError('Abra seu próprio painel do mercado para continuar.');
  }
  if (interaction.isStringSelectMenu() && parts[1] === 'select') {
    const listing = await getMarketListing(interaction.guildId, interaction.values[0]);
    return showListing(interaction, listing, true);
  }
  if (interaction.isButton() && parts[1] === 'browse') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Abra seu próprio painel do mercado para continuar.');
    const page = Number(parts[3]) || 0;
    const context = parts[4] === 'ctx' ? getBrowseContext(interaction.user.id, parts[5]) : null;
    return showBrowse(interaction, { ...(context || { sort: parts[4] || 'newest', category: parts[5] || 'all' }), page }, true);
  }
  if (interaction.isButton() && parts[1] === 'buy') {
    const [, , ownerId, listingId] = parts;
    if (interaction.user.id !== ownerId) throw new EconomyError('Esse botão pertence a outra pessoa.');
    await interaction.deferUpdate();
    const result = await buyMarketListing({ guildId: interaction.guildId, buyerId: interaction.user.id, listingId, interactionId: interaction.id });
    const container = basicContainer('# Compra concluída\n**' + result.listing.itemSnapshot.name + '** × ' + result.listing.quantity
      + ' foi entregue ao seu inventário.\n**Total pago:** ' + formatFragments(result.total) + '\n\n' + (result.fee ? 'A taxa publicada de **' + formatFragments(result.fee) + '** foi descontada do vendedor.' : 'Nenhuma taxa foi aplicada.'), [], config.visual.store);
    return interaction.editReply({ components: [container], flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
  if (interaction.isButton() && parts[1] === 'cancel') {
    const [, , ownerId, listingId] = parts;
    if (interaction.user.id !== ownerId) throw new EconomyError('Esse botão pertence a outra pessoa.');
    await interaction.deferUpdate();
    const listing = await closeMarketListing({ guildId: interaction.guildId, sellerId: interaction.user.id, listingId, reason: 'cancelled' });
    return interaction.editReply({ components: [basicContainer('# Anúncio cancelado\n**' + listing.itemSnapshot.name + '** voltou ao inventário reservado.', [], config.visual.store)], flags: require('discord.js').MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
  return true;
}

module.exports = { handleExchangeInteraction };
