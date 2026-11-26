const crypto = require('node:crypto');
const { EconomyAccount, EconomyOperation, EconomyTransaction, EconomySettings, GameSession } = require('../database');
const { getSettings, runEconomicOperation, getAccount, assertCasinoChannel } = require('./economyService');
const { EconomyError, assertAmount, dailyCycle } = require('./economyUtils');
const { createBlackjackState, blackjackTotal, blackjackPayout, stepBlackjack, createMinesState, revealMine } = require('./casinoGames');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const GAME_TITLES = { blackjack: 'Blackjack', mines: 'Minas' };

function copy(value) { return JSON.parse(JSON.stringify(value)); }

async function newSession({ guildId, userId, interactionId, game, bet, state, channelId = null, now = Date.now() }) {
  const settings = await getSettings(guildId);
  const casino = settings?.casino || {};
  assertCasinoChannel(settings, channelId);
  if (casino.games?.[game]?.enabled === false) throw new EconomyError('Esse jogo está temporariamente indisponível.');
  assertAmount(bet, 'Aposta', { max: casino.maxBet || 1000000000 });
  const walletLimit = Math.max(1, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE));
  const maxMultiplier = game === 'blackjack' ? 2.5 : 10000;
  const reservedPayout = Math.ceil(bet * maxMultiplier);
  if (!Number.isSafeInteger(reservedPayout)) throw new EconomyError('Essa aposta excede o limite seguro de pagamento do jogo.');
  const guardAnd = [];
  if (casino.cooldownMs > 0) guardAnd.push({ $or: [
    { lastCasinoAt: null }, { lastCasinoAt: { $exists: false } },
    { lastCasinoAt: { $lte: new Date(now - casino.cooldownMs) } },
  ] });
  const dayKey = dailyCycle(now).dayKey;
  if (casino.dailyLossLimit > 0) guardAnd.push({ $or: [
    { casinoLossDay: { $ne: dayKey } },
    { $expr: { $lte: [{ $add: [{ $ifNull: ['$casinoLossToday', 0] }, bet] }, casino.dailyLossLimit] } },
  ] });
  const sessionId = String(game === 'blackjack' ? 'bj' : 'mi') + String(interactionId || crypto.randomUUID()).slice(-26);
  const expiresAt = new Date(now + (Number(casino.sessionMinutes) || 15) * 60_000);
  let session = await GameSession.findOne({ sessionId });
  if (session) {
    const value = session.toObject ? session.toObject() : session;
    if (value.ownerId !== userId || value.game !== game || value.state?.bet !== bet) throw new EconomyError('Esta interação já iniciou outra sessão.');
    return value;
  }
  try {
    session = await GameSession.create({ guildId, sessionId, game, ownerId: userId, playerIds: [userId], state: { ...state, bet, reservedPayout }, status: 'settling', revision: 0, channelId, expiresAt });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    session = await GameSession.findOne({ sessionId });
    return session?.toObject ? session.toObject() : session;
  }
  try {
    await runEconomicOperation({
      operationId: 'casino-session:' + sessionId + ':stake', guildId, kind: 'casino_session_stake',
      request: { sessionId, userId, game, bet },
      execution: {
        legs: [{ userId, inc: { wallet: -bet }, set: { activeCasinoSessionId: sessionId, casinoReservedPayout: reservedPayout, lastCasinoAt: new Date(now) }, guards: {
          wallet: { $gte: bet, $lte: walletLimit + bet - reservedPayout },
          activeCasinoSessionId: { $in: [null, ''] },
          ...(guardAnd.length ? { $and: guardAnd } : {}),
        }, failure: 'A carteira não cobre a aposta, o limite de perdas ou o espaço de pagamento reservado.' }],
        transactions: [{ guildId, actorId: userId, userId, operation: 'casino_' + game + '_stake', currency: 'fragments', amount: bet, walletDelta: -bet, details: { sessionId } }],
        result: { sessionId, bet },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById('casino-session:' + sessionId + ':stake').lean().catch(() => null);
    if (operation?.state === 'cancelled') {
      await GameSession.updateOne({ sessionId, status: 'settling' }, { $set: { status: 'cancelled' } });
    } else if (operation?.state === 'manual_review') {
      await GameSession.updateOne({ sessionId, status: 'settling' }, { $set: { status: 'manual_review', 'state.settlementError': error.publicMessage || error.message } });
    }
    // Pending and completed journal entries are recovered by the scheduler.
    // Keep their session in `settling` so an accepted stake cannot be orphaned.
    throw error;
  }
  const active = await GameSession.findOneAndUpdate({ sessionId, status: 'settling' }, { $set: { status: state.status === 'completed' ? 'settling' : 'active' }, $inc: { revision: 1 } }, { returnDocument: 'after' });
  const plain = active?.toObject ? active.toObject() : active;
  return plain;
}

async function settleSession(session, { payout = 0, outcome, now = Date.now() } = {}) {
  const current = session.toObject ? session.toObject() : session;
  if (current.status === 'completed') return { session: current, account: await getAccount(current.guildId, current.ownerId), duplicate: true };
  const safePayout = Number(payout) || 0;
  if (!Number.isSafeInteger(safePayout) || safePayout < 0 || safePayout > MAX_BALANCE) throw new EconomyError('O pagamento do jogo excede o limite seguro.');
  const operationId = 'casino-session:' + current.sessionId + ':settlement';
  const dayKey = dailyCycle(now).dayKey;
  const loss = Math.max(0, Number(current.state.bet || 0) - safePayout);
  let result;
  try {
    result = await runEconomicOperation({
      operationId, guildId: current.guildId, kind: 'casino_session_settlement',
      request: { sessionId: current.sessionId, userId: current.ownerId, payout: safePayout },
      execution: {
        legs: [{ userId: current.ownerId, pipeline: [{ $set: {
          wallet: { $add: [{ $ifNull: ['$wallet', 0] }, safePayout] },
          casinoReservedPayout: 0,
          activeCasinoSessionId: null,
          casinoLossDay: dayKey,
          casinoLossToday: { $cond: [
            { $eq: ['$casinoLossDay', dayKey] },
            { $add: [{ $ifNull: ['$casinoLossToday', 0] }, loss] },
            loss,
          ] },
        } }], guards: { activeCasinoSessionId: current.sessionId, casinoReservedPayout: { $gte: safePayout } }, failure: 'A reserva do pagamento não corresponde à sessão; a equipe precisa conciliar a conta.' }],
        transactions: [{ guildId: current.guildId, actorId: current.ownerId, userId: current.ownerId, operation: 'casino_' + current.game + '_settlement', currency: 'fragments', amount: current.state.bet, walletDelta: safePayout, details: { sessionId: current.sessionId, payout: safePayout, outcome } }],
        result: { payout: safePayout, outcome },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(operationId).lean();
    if (operation?.state === 'cancelled' || operation?.state === 'manual_review') {
      await GameSession.updateOne({ sessionId: current.sessionId, status: 'settling' }, { $set: { status: 'manual_review', 'state.settlementError': error.publicMessage || error.message } });
    }
    throw error;
  }
  const completed = await GameSession.findOneAndUpdate(
    { sessionId: current.sessionId, status: { $in: ['settling', 'active'] } },
    { $set: { status: 'completed', 'state.outcome': outcome, 'state.payout': safePayout, settledAt: new Date(now) }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  return { session: completed?.toObject ? completed.toObject() : completed || current, account: result.accounts?.[0] || await getAccount(current.guildId, current.ownerId), duplicate: result.duplicate };
}

async function startBlackjack({ guildId, userId, bet, interactionId, randomInt, channelId = null, now = Date.now() }) {
  const state = createBlackjackState(randomInt);
  const session = await newSession({ guildId, userId, interactionId, game: 'blackjack', bet, state, channelId, now });
  if (session.state?.status === 'completed' && session.status !== 'completed') {
    const payout = blackjackPayout(session.state, bet);
    const settled = await settleSession(session, { payout, outcome: session.state.outcome, now });
    return settled.session;
  }
  return session;
}

async function blackjackAction({ sessionId, userId, action, now = Date.now(), randomInt }) {
  const session = await GameSession.findOne({ sessionId, game: 'blackjack' }).lean();
  if (!session || session.ownerId !== userId) throw new EconomyError('Esta mão pertence a outra pessoa ou não existe mais.');
  if (session.status !== 'active') throw new EconomyError('Esta mão já foi encerrada.');
  if (new Date(session.expiresAt).getTime() <= now) throw new EconomyError('O tempo desta mão terminou. A sessão está sendo encerrada.');
  const state = copy(session.state);
  stepBlackjack(state, action, randomInt);
  const nextStatus = state.status === 'completed' ? 'settling' : 'active';
  const updated = await GameSession.findOneAndUpdate(
    { sessionId, ownerId: userId, status: 'active', revision: session.revision },
    { $set: { state, status: nextStatus }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new EconomyError('A mão foi atualizada em outra interação. Abra o painel atual e tente novamente.');
  const plain = updated.toObject ? updated.toObject() : updated;
  if (state.status === 'completed') {
    const result = await settleSession(plain, { payout: blackjackPayout(state, session.state.bet), outcome: state.outcome, now });
    return result.session;
  }
  return plain;
}

async function startMines({ guildId, userId, bet, interactionId, randomInt, mineCount = 5, channelId = null, now = Date.now() }) {
  const state = createMinesState({ randomInt, size: 24, mineCount });
  return newSession({ guildId, userId, interactionId, game: 'mines', bet, state, channelId, now });
}

async function minesAction({ sessionId, userId, cell = null, cashOut = false, now = Date.now() }) {
  const session = await GameSession.findOne({ sessionId, game: 'mines' }).lean();
  if (!session || session.ownerId !== userId) throw new EconomyError('Este tabuleiro pertence a outra pessoa ou não existe mais.');
  if (session.status !== 'active') throw new EconomyError('Este tabuleiro já foi encerrado.');
  if (new Date(session.expiresAt).getTime() <= now) throw new EconomyError('O tempo desta sessão terminou.');
  const state = copy(session.state);
  let payout = null;
  let outcome = null;
  if (cashOut) {
    if (!state.revealed.length) throw new EconomyError('Revele ao menos uma casa segura antes de encerrar a rodada.');
    payout = Math.floor(state.bet * state.multiplier);
    state.status = 'cashed_out'; outcome = 'cash_out';
  } else {
    const result = revealMine(state, cell);
    if (result.hitMine) { payout = 0; outcome = 'mine'; }
  }
  const nextStatus = payout == null ? 'active' : 'settling';
  const updated = await GameSession.findOneAndUpdate(
    { sessionId, ownerId: userId, status: 'active', revision: session.revision },
    { $set: { state, status: nextStatus }, $inc: { revision: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new EconomyError('O tabuleiro mudou em outra interação. Abra o painel atual e tente novamente.');
  const plain = updated.toObject ? updated.toObject() : updated;
  if (payout != null) {
    const settled = await settleSession(plain, { payout, outcome, now });
    return settled.session;
  }
  return plain;
}

async function expireCasinoSessions({ now = new Date(), limit = 100 } = {}) {
  const expired = await GameSession.find({ game: { $in: ['blackjack', 'mines'] }, status: 'active', expiresAt: { $lte: now } }).limit(limit).lean();
  let settled = 0;
  for (const session of expired) {
    const claimed = await GameSession.findOneAndUpdate({ sessionId: session.sessionId, status: 'active', revision: session.revision }, { $set: { status: 'settling' }, $inc: { revision: 1 } }, { returnDocument: 'after' });
    if (!claimed) continue;
    const plain = claimed.toObject ? claimed.toObject() : claimed;
    if (session.game === 'blackjack') {
      const state = copy(session.state);
      stepBlackjack(state, 'stand');
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling', revision: plain.revision }, { $set: { state } });
      await settleSession({ ...plain, state }, { payout: blackjackPayout(state, state.bet), outcome: state.outcome, now: new Date(now).getTime() });
    } else {
      const payout = session.state.revealed.length ? Math.floor(session.state.bet * session.state.multiplier) : session.state.bet;
      const state = { ...session.state, status: 'expired', outcome: session.state.revealed.length ? 'auto_cash_out' : 'stake_returned' };
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling', revision: plain.revision }, { $set: { state } });
      await settleSession({ ...plain, state }, { payout, outcome: state.outcome, now: new Date(now).getTime() });
    }
    settled += 1;
  }
  return { settled, scanned: expired.length };
}

async function recoverCasinoSessions({ now = Date.now(), limit = 100 } = {}) {
  const sessions = await GameSession.find({ game: { $in: ['blackjack', 'mines'] }, status: 'settling' }).sort({ updatedAt: 1 }).limit(limit).lean();
  let recovered = 0;
  for (const session of sessions) {
    const stake = await EconomyOperation.findById('casino-session:' + session.sessionId + ':stake').lean();
    if (!stake) {
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling', revision: session.revision }, { $set: { status: 'cancelled' } });
      recovered += 1;
      continue;
    }
    if (stake.state === 'cancelled') {
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling' }, { $set: { status: 'cancelled' } });
      recovered += 1;
      continue;
    }
    if (stake.state !== 'completed') continue;
    const settlement = await EconomyOperation.findById('casino-session:' + session.sessionId + ':settlement').lean();
    if (settlement?.state === 'completed') {
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling' }, { $set: { status: 'completed', settledAt: new Date(now) } });
      recovered += 1;
      continue;
    }
    if (settlement?.state === 'cancelled' || settlement?.state === 'manual_review') continue;
    if (session.state?.status === 'completed' || session.state?.status === 'busted' || session.state?.status === 'cashed_out' || session.state?.outcome) {
      const payout = session.game === 'blackjack'
        ? blackjackPayout(session.state, session.state.bet)
        : session.state.status === 'cashed_out' ? Math.floor(session.state.bet * session.state.multiplier) : 0;
      await settleSession(session, { payout, outcome: session.state.outcome || session.state.status, now });
      recovered += 1;
      continue;
    }
    await GameSession.updateOne({ sessionId: session.sessionId, status: 'settling', revision: session.revision }, { $set: { status: 'active' } });
    recovered += 1;
  }
  return { recovered, pending: sessions.length - recovered };
}

function blackjackView(session) {
  const state = session.state || {};
  const playerTotal = blackjackTotal(state.player || []);
  const dealerTotal = state.status === 'active' ? null : blackjackTotal(state.dealer || []);
  const outcome = state.outcome || 'playing';
  const actions = session.status === 'active' ? ['hit', 'stand'] : [];
  return { title: GAME_TITLES.blackjack, playerTotal, dealerTotal, outcome, actions, bet: state.bet, status: session.status };
}

module.exports = { startBlackjack, blackjackAction, startMines, minesAction, expireCasinoSessions, recoverCasinoSessions, settleSession, blackjackView };
