const { EconomyError } = require('./economyUtils');
const { joinGameRoom, startGameRoom, moveGameRoom, leaveGameRoom, getGameRoom } = require('./gameRoomService');
const { roomContainer, showRoom, syncGameRoom } = require('../commands/games/game');

async function updateRoom(interaction, client, session) {
  if (session.messageId && interaction.message?.id !== session.messageId) await syncGameRoom(client, session);
  return interaction.update({ components: [roomContainer(session)], allowedMentions: { parse: [] } });
}

async function handleGameRoomInteraction(interaction, client) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('game:')) return false;
  const parts = customId.split(':');
  if (interaction.isStringSelectMenu() && parts[1] === 'select') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Abra sua própria lista para consultar uma sala.');
    const session = await getGameRoom(interaction.guildId, interaction.values[0]);
    return showRoom(interaction, session, true);
  }
  if (!interaction.isButton()) return false;
  if (parts[1] === 'join') {
    const session = await joinGameRoom({ guildId: interaction.guildId, sessionId: parts[2], userId: interaction.user.id });
    return updateRoom(interaction, client, session);
  }
  if (parts[1] === 'start') {
    if (interaction.user.id !== parts[2]) throw new EconomyError('Somente quem criou a sala pode iniciar.');
    const session = await startGameRoom({ guildId: interaction.guildId, sessionId: parts[3], userId: interaction.user.id });
    return updateRoom(interaction, client, session);
  }
  if (parts[1] === 'move') {
    const session = await moveGameRoom({ guildId: interaction.guildId, sessionId: parts[2], userId: interaction.user.id, position: Number(parts[3]) });
    return updateRoom(interaction, client, session);
  }
  if (parts[1] === 'rps') {
    const session = await moveGameRoom({ guildId: interaction.guildId, sessionId: parts[2], userId: interaction.user.id, choice: parts[3] });
    return updateRoom(interaction, client, session);
  }
  if (parts[1] === 'leave') {
    const session = await leaveGameRoom({ guildId: interaction.guildId, sessionId: parts[2], userId: interaction.user.id });
    return updateRoom(interaction, client, session);
  }
  return false;
}

module.exports = { handleGameRoomInteraction };
