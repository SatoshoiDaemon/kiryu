const { EconomyError } = require('./economyUtils');
const { getAuction, cancelAuction } = require('./auctionService');
const { showAuction } = require('../commands/economy/auction');
const { basicContainer } = require('./economyViews');
const { MessageFlags } = require('discord.js');
const config = require('../config');

async function handleAuctionInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('auction:')) return false;
  const parts = customId.split(':');
  if (interaction.isStringSelectMenu() && parts[1] === 'select') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Abra sua própria lista de leilões para consultar um anúncio.');
    return showAuction(interaction, await getAuction(interaction.guildId, interaction.values[0]), true);
  }
  if (interaction.isButton() && parts[1] === 'cancel') {
    const [, , ownerId, auctionId] = parts;
    if (interaction.user.id !== ownerId) throw new EconomyError('Este botão pertence a outra pessoa.');
    await interaction.deferUpdate();
    const auction = await cancelAuction({ guildId: interaction.guildId, sellerId: interaction.user.id, auctionId });
    return interaction.editReply({ components: [basicContainer('# Leilão cancelado\n**' + auction.itemSnapshot.name + '** voltou ao seu inventário.', [], config.visual.store)], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
  }
  return false;
}

module.exports = { handleAuctionInteraction };
