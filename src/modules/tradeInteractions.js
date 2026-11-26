const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { EconomyError } = require('./economyUtils');
const { acceptTrade, confirmTrade, cancelTrade, getTrade } = require('./economyTradeService');
const { basicContainer } = require('./economyViews');
const { showTrade, tradeSummary } = require('../commands/economy/trade');
const config = require('../config');

async function handleTradeInteraction(interaction) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('trade:') || !interaction.isButton()) return false;
  const [, action, ownerId, tradeId] = customId.split(':');
  if (action === 'accept') {
    if (interaction.user.id !== ownerId) throw new EconomyError('Este convite foi enviado a outra pessoa.');
    const session = await acceptTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    const [a, b] = session.participants;
    const rows = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade:open:' + a + ':' + tradeId).setLabel('Abrir oferta privada · remetente').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('trade:open:' + b + ':' + tradeId).setLabel('Abrir oferta privada · convidado').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('trade:cancel:' + a + ':' + tradeId).setLabel('Cancelar').setStyle(ButtonStyle.Danger),
    );
    return interaction.update({ components: [basicContainer('# Convite aceito\nA troca está aberta. Os recursos ficam privados; cada participante pode editar e confirmar a própria oferta pelo painel individual.\n**ID:** `' + tradeId + '`', [rows], config.visual.store)], allowedMentions: { parse: [] } });
  }
  if (action === 'open') {
    if (interaction.user.id !== ownerId) throw new EconomyError('Este painel pertence a outra pessoa.');
    const session = await getTrade(interaction.guildId, tradeId);
    if (!session.participants.includes(interaction.user.id)) throw new EconomyError('Você não participa desta troca.');
    return showTrade(interaction, session);
  }
  if (action === 'confirm') {
    if (interaction.user.id !== ownerId) throw new EconomyError('Este botão pertence a outra pessoa.');
    const result = await confirmTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    const message = result.state === 'completed' ? 'Troca concluída. Os recursos foram entregues aos dois participantes.'
      : 'Sua confirmação foi registrada. A outra pessoa ainda precisa confirmar a mesma versão da oferta.';
    return interaction.update({ components: [basicContainer('# Troca · confirmação\n' + message, [], config.visual.store)], allowedMentions: { parse: [] } });
  }
  if (action === 'cancel') {
    if (interaction.user.id !== ownerId) throw new EconomyError('Este botão pertence a outra pessoa.');
    const result = await cancelTrade({ guildId: interaction.guildId, tradeId, userId: interaction.user.id });
    return interaction.update({ components: [basicContainer('# Troca cancelada\n' + tradeSummary(result), [], config.visual.store)], allowedMentions: { parse: [] } });
  }
  return false;
}

module.exports = { handleTradeInteraction };
