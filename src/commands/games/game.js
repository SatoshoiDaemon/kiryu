const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { basicContainer, payload } = require('../../modules/economyViews');
const { replyV2 } = require('../../modules/components');
const { cardLabel } = require('../../modules/casinoArt');
const { createGameRoom, joinGameRoom, startGameRoom, moveGameRoom, leaveGameRoom, getGameRoom, listGameRooms, gameHistory } = require('../../modules/gameRoomService');
const { say } = require('../../modules/personality');
const config = require('../../config');

const NAMES = { rps: 'Pedra, papel e tesoura', connect4: 'Quatro em linha', tictactoe: 'Jogo da velha', racing: 'Corrida', poker: 'Poker recreativo' };
const data = new SlashCommandBuilder().setName('game').setDescription('Crie salas comunitárias e jogue sem apostas.')
  .addSubcommand((sub) => sub.setName('create').setDescription('Crie uma sala pública ou convide alguém')
    .addStringOption((option) => option.setName('game').setDescription('Jogo da sala').setRequired(true).addChoices(
      { name: 'Pedra, papel e tesoura', value: 'rps' }, { name: 'Quatro em linha', value: 'connect4' },
      { name: 'Jogo da velha', value: 'tictactoe' }, { name: 'Corrida', value: 'racing' }, { name: 'Poker recreativo', value: 'poker' },
    ))
    .addStringOption((option) => option.setName('visibility').setDescription('Visibilidade da sala').setRequired(false).addChoices(
      { name: 'Pública', value: 'public' }, { name: 'Privada', value: 'private' },
    ))
    .addUserOption((option) => option.setName('invitee').setDescription('Convidado; torna a sala privada').setRequired(false)))
  .addSubcommand((sub) => sub.setName('list').setDescription('Encontre salas públicas abertas'))
  .addSubcommand((sub) => sub.setName('join').setDescription('Entre em uma sala pública ou convite privado')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('start').setDescription('Inicie corrida ou poker recreativo')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('move').setDescription('Faça uma jogada no tabuleiro')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32))
    .addIntegerOption((option) => option.setName('position').setDescription('Casa 1–9 ou coluna 1–7').setMinValue(1).setMaxValue(9).setRequired(true)))
  .addSubcommand((sub) => sub.setName('choose').setDescription('Escolha pedra, papel ou tesoura')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32))
    .addStringOption((option) => option.setName('choice').setDescription('Sua escolha').setRequired(true).addChoices(
      { name: 'Pedra', value: 'rock' }, { name: 'Papel', value: 'paper' }, { name: 'Tesoura', value: 'scissors' },
    )))
  .addSubcommand((sub) => sub.setName('leave').setDescription('Saia da sala ou encerre uma partida')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('view').setDescription('Reconecte-se ao estado persistido de uma partida')
    .addStringOption((option) => option.setName('session_id').setDescription('ID da sala').setRequired(true).setMaxLength(32)))
  .addSubcommand((sub) => sub.setName('history').setDescription('Consulte suas partidas recentes'));

function boardText(session) {
  const { game, state } = session;
  if (game === 'tictactoe') return state.board.map((cell, index) => cell || String(index + 1)).reduce((rows, cell, index) => {
    if (index % 3 === 0) rows.push([]); rows.at(-1).push(cell === 'X' ? '❌' : cell === 'O' ? '⭕' : cell); return rows;
  }, []).map((row) => row.join(' │ ')).join('\n──┼───┼──\n');
  if (game === 'connect4') return state.board.map((row) => row.map((cell) => cell === 'R' ? '🔴' : cell === 'Y' ? '🟡' : '⚪').join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
  if (game === 'rps') return state.players.map((id) => '<@' + id + '>: ' + (state.choices?.[id] ? 'escolha registrada' : 'aguardando escolha')).join('\n');
  if (game === 'racing') return (state.result?.tracks || []).map((track, index) => '**' + (index + 1) + '.** <@' + track.userId + '> · ' + '▰'.repeat(Math.min(20, Math.ceil(track.progress))) + '▱'.repeat(Math.max(0, 20 - Math.ceil(track.progress))) + (session.status === 'completed' ? ' · ' + track.progress + ' casas' : '')).join('\n');
  if (game === 'poker') {
    if (!state.result) return state.players.map((id, index) => '• Jogador ' + (index + 1) + ' · <@' + id + '>').join('\n') + '\n\nCartas fechadas até o showdown.';
    const result = state.result;
    const hands = Object.entries(result.holes || {}).map(([id, cards]) => '<@' + id + '>: ' + cards.map(cardLabel).join(' · '));
    return '**Mesa:** ' + result.community.map(cardLabel).join(' · ') + '\n\n' + hands.join('\n');
  }
  return '';
}

function resultText(session) {
  const result = session.state.result;
  if (!result) return '';
  if (session.game === 'poker' && result.winnerIds) return '\n\n**' + (result.draw ? 'Empate entre' : 'Vencedor(es)') + ':** ' + result.winnerIds.map((id) => '<@' + id + '>').join(', ');
  if (session.game === 'racing' && result.winnerIds) return '\n\n**Chegada:** ' + result.winnerIds.map((id) => '<@' + id + '>').join(', ');
  if (result.draw) return '\n\n**Resultado:** empate.' + (result.timeout ? ' O tempo da rodada terminou.' : '');
  if (result.winnerId) return '\n\n**Vencedor:** <@' + result.winnerId + '>' + (result.abandonedBy ? ' · a outra pessoa saiu da partida.' : result.timeoutBy ? ' · <@' + result.timeoutBy + '> excedeu o tempo da jogada.' : '');
  return '';
}

function roomRows(session) {
  const rows = [];
  if (session.status === 'open' && session.state.players.length < session.state.maxPlayers) {
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('game:join:' + session.sessionId).setLabel('Entrar na sala').setStyle(ButtonStyle.Success)));
  }
  if (session.status === 'open' && ['poker','racing'].includes(session.game)) rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('game:start:' + session.ownerId + ':' + session.sessionId).setLabel('Iniciar partida').setStyle(ButtonStyle.Primary).setDisabled(session.playerIds.length < 2),
  ));
  if (session.status === 'active' && session.game === 'rps' && session.playerIds.some((id) => !session.state.choices?.[id])) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('game:rps:' + session.sessionId + ':rock').setLabel('Pedra').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('game:rps:' + session.sessionId + ':paper').setLabel('Papel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('game:rps:' + session.sessionId + ':scissors').setLabel('Tesoura').setStyle(ButtonStyle.Secondary),
    ));
  }
  if (session.status === 'active' && session.game === 'tictactoe') {
    for (let row = 0; row < 3; row += 1) rows.push(new ActionRowBuilder().addComponents(Array.from({ length: 3 }, (_, col) => {
      const position = row * 3 + col; const value = session.state.board[position];
      return new ButtonBuilder().setCustomId('game:move:' + session.sessionId + ':' + position).setLabel(value || String(position + 1)).setStyle(value === 'X' ? ButtonStyle.Primary : value === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(Boolean(value));
    })));
  }
  if (session.status === 'active' && session.game === 'connect4') rows.push(new ActionRowBuilder().addComponents(Array.from({ length: 7 }, (_, col) =>
    new ButtonBuilder().setCustomId('game:move:' + session.sessionId + ':' + col).setLabel(String(col + 1)).setStyle(ButtonStyle.Primary))));
  if (['open', 'active'].includes(session.status)) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId('game:leave:' + session.sessionId).setLabel(session.ownerId === session.playerIds[0] ? 'Sair / encerrar se criou a sala' : 'Sair da partida').setStyle(ButtonStyle.Danger)));
  return rows;
}

function roomText(session) {
  const players = session.playerIds.map((id) => '<@' + id + '>').join(', ');
  const current = session.status === 'active' && ['connect4','tictactoe'].includes(session.game) ? session.playerIds[session.state.turn % 2] : null;
  return '# ' + NAMES[session.game] + ' · sala `' + session.sessionId + '`\n**Estado:** ' + session.status + ' · **Jogadores:** ' + session.playerIds.length + '/' + session.state.maxPlayers
    + '\n**Participantes:** ' + (players || 'ninguém') + '\n**Prazo:** <t:' + Math.floor(new Date(session.expiresAt).getTime() / 1000) + ':R>'
    + (session.state.turnExpiresAt && session.status === 'active' ? '\n**Prazo desta jogada:** <t:' + Math.floor(new Date(session.state.turnExpiresAt).getTime() / 1000) + ':R>' : '')
    + (current ? '\n**Vez:** <@' + current + '>' : '')
    + (session.game === 'poker' ? '\nPoker de Texas hold’em recreativo, sem apostas: todos recebem duas cartas, a mesa revela cinco comunitárias e vence a melhor mão de cinco cartas.' : '')
    + (session.game === 'racing' ? '\nCorrida recreativa sem apostas. Cada participante percorre uma pista gerada uma única vez no início.' : '')
    + '\n\n' + boardText(session) + resultText(session)
    + '\n\nPartida recreativa, sem apostas ou prêmios financeiros.';
}

function roomContainer(session) { return basicContainer(roomText(session), roomRows(session), config.visual.casino); }

async function syncGameRoom(client, session) {
  if (!session?.channelId || !session?.messageId) return false;
  const channel = await client.channels.fetch(session.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(session.messageId).catch(() => null);
  if (!message) return false;
  await message.edit({ components: [roomContainer(session)], allowedMentions: { parse: [] } });
  return true;
}

async function showRoom(interaction, session, update = false) {
  if (update) return interaction.update({ components: [roomContainer(session)], allowedMentions: { parse: [] } });
  return replyV2(interaction, roomText(session), { ephemeral: true, accentColor: config.visual.casino, rows: roomRows(session) });
}

async function showList(interaction) {
  const result = await listGameRooms(interaction.guildId);
  const rows = result.rooms.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId('game:select:' + interaction.user.id).setPlaceholder('Abrir uma sala comunitária')
    .addOptions(result.rooms.map((session) => ({ label: NAMES[session.game] + ' · ' + session.ownerId.slice(-4), value: session.sessionId,
      description: session.playerIds.length + '/' + session.state.maxPlayers + ' jogador(es) · ' + session.sessionId }))))] : [];
  const content = '# Salas públicas\nPartidas recreativas persistem após reinícios e podem ser reabertas com `/game view`.\n\n'
    + (result.rooms.map((session) => '• **' + NAMES[session.game] + '** · <@' + session.ownerId + '> · ' + session.playerIds.length + '/' + session.state.maxPlayers + ' · `' + session.sessionId + '`').join('\n') || 'Não há salas abertas agora.');
  return replyV2(interaction, content, { ephemeral: true, accentColor: config.visual.casino, rows });
}

async function execute(interaction, client) {
  if (interaction.guildId !== config.guildId) return;
  const action = interaction.options.getSubcommand();
  if (action === 'create') {
    const invitee = interaction.options.getUser('invitee');
    const visibility = invitee ? 'private' : interaction.options.getString('visibility') || 'public';
    const session = await createGameRoom({ guildId: interaction.guildId, ownerId: interaction.user.id, game: interaction.options.getString('game'), visibility, inviteeId: invitee?.id, interactionId: interaction.id, channelId: interaction.channelId });
    const sent = await interaction.channel.send({ components: [roomContainer(session)], allowedMentions: { users: invitee ? [invitee.id] : [], parse: [] } });
    await require('../../database').GameSession.updateOne({ sessionId: session.sessionId }, { $set: { messageId: sent.id, channelId: sent.channelId } });
    return replyV2(interaction, '# Sala criada\n' + (invitee ? 'Convite enviado para ' + invitee + '.' : 'A sala está pública para entrada.') + '\n**Jogo:** ' + NAMES[session.game] + '\n**ID:** `' + session.sessionId + '`\n' + say('gameRoom'), { ephemeral: true, accentColor: config.visual.casino });
  }
  if (action === 'list') return showList(interaction);
  if (action === 'history') {
    const history = await gameHistory(interaction.guildId, interaction.user.id);
    return replyV2(interaction, '# Partidas recentes\n\n' + (history.map((session) => '• `' + session.sessionId + '` · ' + NAMES[session.game] + ' · ' + session.status + ' · <t:' + Math.floor(new Date(session.updatedAt).getTime() / 1000) + ':R>').join('\n') || 'Você ainda não participou de uma sala.'), { ephemeral: true, accentColor: config.visual.casino });
  }
  const sessionId = interaction.options.getString('session_id');
  let session;
  if (action === 'join') session = await joinGameRoom({ guildId: interaction.guildId, sessionId, userId: interaction.user.id });
  else if (action === 'start') session = await startGameRoom({ guildId: interaction.guildId, sessionId, userId: interaction.user.id });
  else if (action === 'move') {
    const room = await getGameRoom(interaction.guildId, sessionId);
    const position = interaction.options.getInteger('position') - 1;
    if (room.game === 'connect4' && position > 6) throw new RangeError('Quatro em linha usa colunas de 1 a 7.');
    session = await moveGameRoom({ guildId: interaction.guildId, sessionId, userId: interaction.user.id, position });
  } else if (action === 'choose') session = await moveGameRoom({ guildId: interaction.guildId, sessionId, userId: interaction.user.id, choice: interaction.options.getString('choice') });
  else if (action === 'leave') session = await leaveGameRoom({ guildId: interaction.guildId, sessionId, userId: interaction.user.id });
  else session = await getGameRoom(interaction.guildId, sessionId);
  await syncGameRoom(client, session);
  return showRoom(interaction, session);
}

module.exports = { data, execute, deferEphemeral: true, NAMES, boardText, resultText, roomText, roomRows, roomContainer, showRoom, showList, syncGameRoom };
