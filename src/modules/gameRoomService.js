const crypto = require('node:crypto');
const { GameSession } = require('../database');
const { getSettings, assertCasinoChannel } = require('./economyService');
const { EconomyError } = require('./economyUtils');
const { makeBoardGame, joinBoardGame, chooseRps, applyBoardMove, runPoker, runRace } = require('./communityGames');

const GAME_TYPES = ['rps', 'connect4', 'tictactoe', 'racing', 'poker'];
const MAX_PLAYERS = { rps: 2, connect4: 2, tictactoe: 2, racing: 8, poker: 6 };
const plain = (value) => value?.toObject ? value.toObject() : value;
const clone = (value) => JSON.parse(JSON.stringify(value));

async function createGameRoom({ guildId, ownerId, game, visibility = 'public', inviteeId = null, interactionId, channelId = null, now = Date.now() }) {
  if (!GAME_TYPES.includes(game)) throw new RangeError('Escolha RPS, Connect 4, jogo da velha, corrida ou poker recreativo.');
  if (!['public', 'private'].includes(visibility)) throw new RangeError('Tipo de sala inválido.');
  if (visibility === 'private' && (!inviteeId || inviteeId === ownerId)) throw new EconomyError('Uma sala privada precisa de outro membro convidado.');
  const settings = await getSettings(guildId);
  assertCasinoChannel(settings, channelId);
  if (settings.casino?.games?.[game]?.enabled === false) throw new EconomyError('Esse jogo está temporariamente indisponível.');
  const sessionId = String('gm' + (interactionId || crypto.randomUUID())).slice(0, 32);
  const existing = await GameSession.findOne({ sessionId }).lean();
  if (existing) return existing;
  const nowMs = new Date(now).getTime();
  const expiresAt = new Date(nowMs + (Number(settings.casino?.sessionMinutes) || 15) * 60_000);
  const state = GAME_TYPES.slice(0, 3).includes(game) ? makeBoardGame(game, ownerId)
    : { game, players: [ownerId], status: 'open', visibility, inviteeId, result: null };
  state.turnExpiresAt = null;
  state.visibility = visibility;
  state.inviteeId = inviteeId;
  state.maxPlayers = MAX_PLAYERS[game];
  try {
    return plain(await GameSession.create({ guildId, sessionId, game, ownerId, playerIds: [ownerId], state, status: 'open', revision: 0, channelId, expiresAt }));
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return GameSession.findOne({ sessionId }).lean();
  }
}

async function joinGameRoom({ guildId, sessionId, userId, now = Date.now() }) {
  const session = await GameSession.findOne({ guildId, sessionId }).lean();
  if (!session || !GAME_TYPES.includes(session.game)) throw new EconomyError('Sala de jogo não encontrada.');
  if (session.status !== 'open') throw new EconomyError('Essa sala não está mais aberta.');
  if (new Date(session.expiresAt).getTime() <= now) throw new EconomyError('O prazo para entrar nessa sala terminou.');
  const state = clone(session.state);
  if (state.visibility === 'private' && state.inviteeId !== userId && session.ownerId !== userId) throw new EconomyError('Essa sala privada tem um convite para outra pessoa.');
  if (state.players.includes(userId)) return session;
  if (state.players.length >= MAX_PLAYERS[session.game]) throw new EconomyError('Essa sala já atingiu o limite de jogadores.');
  if (['rps', 'connect4', 'tictactoe'].includes(session.game)) joinBoardGame(state, userId);
  else state.players.push(userId);
  const status = ['rps', 'connect4', 'tictactoe'].includes(session.game) ? 'active' : 'open';
  if (status === 'active') {
    const settings = await getSettings(guildId);
    state.turnExpiresAt = new Date(new Date(now).getTime() + (Number(settings.casino?.turnTimeoutMinutes) || 2) * 60_000);
  }
  const saved = await GameSession.findOneAndUpdate({ guildId, sessionId, state: 'open', revision: session.revision }, {
    $set: { state, playerIds: state.players, status }, $inc: { revision: 1 },
  }, { returnDocument: 'after' });
  if (!saved) throw new EconomyError('Outra pessoa entrou ao mesmo tempo. Atualize a lista e tente novamente.');
  return plain(saved);
}

async function startGameRoom({ guildId, sessionId, userId, randomInt }) {
  const session = await GameSession.findOne({ guildId, sessionId, state: 'open' }).lean();
  if (!session) throw new EconomyError('A sala não está disponível para iniciar.');
  if (session.ownerId !== userId) throw new EconomyError('Somente a pessoa que abriu a sala pode iniciar o jogo.');
  if (['rps', 'connect4', 'tictactoe'].includes(session.game)) throw new EconomyError('Esta partida começa assim que o segundo jogador entra.');
  if (session.playerIds.length < 2) throw new EconomyError('A partida precisa de pelo menos dois jogadores.');
  const state = clone(session.state);
  state.status = 'completed';
  state.result = session.game === 'poker' ? runPoker(session.playerIds, randomInt) : runRace(session.playerIds, randomInt);
  const saved = await GameSession.findOneAndUpdate({ guildId, sessionId, state: 'open', revision: session.revision }, {
    $set: { state, status: 'completed' }, $inc: { revision: 1 },
  }, { returnDocument: 'after' });
  if (!saved) throw new EconomyError('A sala foi alterada em outra interação.');
  return plain(saved);
}

async function moveGameRoom({ guildId, sessionId, userId, position, choice = null, now = Date.now() }) {
  const session = await GameSession.findOne({ guildId, sessionId, status: 'active' }).lean();
  if (!session) throw new EconomyError('A partida não está ativa.');
  if (!session.playerIds.includes(userId)) throw new EconomyError('Você não participa desta partida.');
  const state = clone(session.state);
  if (session.game === 'rps') chooseRps(state, userId, choice);
  else applyBoardMove(state, userId, position);
  if (state.status === 'active') {
    const settings = await getSettings(guildId);
    state.turnExpiresAt = new Date(new Date(now).getTime() + (Number(settings.casino?.turnTimeoutMinutes) || 2) * 60_000);
  } else state.turnExpiresAt = null;
  const status = state.status === 'completed' ? 'completed' : 'active';
  const saved = await GameSession.findOneAndUpdate({ guildId, sessionId, status: 'active', revision: session.revision }, {
    $set: { state, status }, $inc: { revision: 1 },
  }, { returnDocument: 'after' });
  if (!saved) throw new EconomyError('A partida avançou em outra interação. Reabra a sala para ver o estado atual.');
  return plain(saved);
}

async function leaveGameRoom({ guildId, sessionId, userId }) {
  const session = await GameSession.findOne({ guildId, sessionId, playerIds: userId, status: { $in: ['open', 'active'] } }).lean();
  if (!session) throw new EconomyError('Você não pode sair desta sala agora.');
  const state = clone(session.state);
  if (session.status === 'active' && session.playerIds.length === 2) {
    const winnerId = session.playerIds.find((id) => id !== userId);
    state.status = 'completed'; state.result = { winnerId, abandonedBy: userId };
    const saved = await GameSession.findOneAndUpdate({ sessionId, status: 'active', revision: session.revision }, { $set: { state, status: 'completed' }, $inc: { revision: 1 } }, { returnDocument: 'after' });
    if (!saved) throw new EconomyError('A partida foi alterada em outra interação.');
    return plain(saved);
  }
  if (session.ownerId === userId) {
    const saved = await GameSession.findOneAndUpdate({ sessionId, revision: session.revision, status: session.status }, { $set: { status: 'cancelled', state: { ...state, status: 'cancelled', result: { abandonedBy: userId } } }, $inc: { revision: 1 } }, { returnDocument: 'after' });
    return plain(saved);
  }
  state.players = state.players.filter((id) => id !== userId);
  const playerIds = session.playerIds.filter((id) => id !== userId);
  const saved = await GameSession.findOneAndUpdate({ sessionId, revision: session.revision, status: session.status }, { $set: { state, playerIds }, $inc: { revision: 1 } }, { returnDocument: 'after' });
  return plain(saved);
}

async function getGameRoom(guildId, sessionId) {
  const session = await GameSession.findOne({ guildId, sessionId, game: { $in: GAME_TYPES } }).lean();
  if (!session) throw new EconomyError('Sala de jogo não encontrada.');
  return session;
}

async function listGameRooms(guildId, page = 0, pageSize = 10) {
  const query = { guildId, game: { $in: GAME_TYPES }, status: 'open', 'state.visibility': 'public' };
  const total = await GameSession.countDocuments(query);
  const size = Math.max(1, Math.min(20, pageSize));
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const rooms = await GameSession.find(query).sort({ createdAt: -1 }).skip(current * size).limit(size).lean();
  return { rooms, total, page: current, pages };
}

async function gameHistory(guildId, userId, limit = 20) {
  return GameSession.find({ guildId, game: { $in: GAME_TYPES }, playerIds: userId }).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(50, limit))).lean();
}

async function processGameRooms({ now = new Date(), limit = 100 } = {}) {
  const result = await GameSession.updateMany({ game: { $in: GAME_TYPES }, status: { $in: ['open', 'active'] }, expiresAt: { $lte: now } }, {
    $set: { status: 'expired', 'state.status': 'expired' }, $inc: { revision: 1 },
  });
  const dueTurns = await GameSession.find({ game: { $in: ['rps', 'connect4', 'tictactoe'] }, status: 'active', expiresAt: { $gt: now }, 'state.turnExpiresAt': { $lte: now } }).sort({ 'state.turnExpiresAt': 1 }).limit(limit).lean();
  let turnTimeouts = 0;
  for (const session of dueTurns) {
    const state = clone(session.state);
    if (session.game === 'rps') {
      const chosen = session.playerIds.filter((id) => state.choices?.[id]);
      if (chosen.length === 1) state.result = { winnerId: chosen[0], timeoutBy: session.playerIds.find((id) => id !== chosen[0]) };
      else state.result = { winnerId: null, draw: true, timeout: true };
    } else {
      const timedOut = session.playerIds[state.turn % 2];
      state.result = { winnerId: session.playerIds.find((id) => id !== timedOut), timeoutBy: timedOut };
    }
    state.status = 'completed';
    state.turnExpiresAt = null;
    const saved = await GameSession.findOneAndUpdate({ sessionId: session.sessionId, status: 'active', revision: session.revision, 'state.turnExpiresAt': { $lte: now } }, {
      $set: { state, status: 'completed' }, $inc: { revision: 1 },
    }, { returnDocument: 'after' });
    if (saved) turnTimeouts += 1;
  }
  return { expired: result.modifiedCount || 0, turnTimeouts };
}

module.exports = { GAME_TYPES, MAX_PLAYERS, createGameRoom, joinGameRoom, startGameRoom, moveGameRoom, leaveGameRoom, getGameRoom, listGameRooms, gameHistory, processGameRooms };
