const crypto = require('node:crypto');
const { GameSession, EconomyOperation } = require('../database');
const { getSettings, runEconomicOperation, assertCasinoChannel, walletCapacityGuard } = require('./economyService');
const { EconomyError, assertAmount, dailyCycle, formatFragments } = require('./economyUtils');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
function sessionIdFor(guildId, dayKey) { return 'lottery:' + guildId + ':' + dayKey; }

async function ensureLottery({ guildId, now = new Date() }) {
  const date = new Date(now);
  const cycle = dailyCycle(date);
  const settings = await getSettings(guildId);
  const sessionId = sessionIdFor(guildId, cycle.dayKey);
  let session = await GameSession.findOne({ sessionId });
  if (session) return { session: session.toObject ? session.toObject() : session, settings, cycle };
  try {
    session = await GameSession.create({
      guildId, sessionId, game: 'lottery', ownerId: 'kiryu-lottery', playerIds: [],
      state: { dayKey: cycle.dayKey, ticketPrice: settings.casino?.lotteryTicketPrice || 100, tickets: [], pendingTickets: [], entryIds: [], ticketCount: 0, pot: 0 },
      status: 'open', revision: 0, expiresAt: cycle.nextResetAt,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    session = await GameSession.findOne({ sessionId });
  }
  return { session: session.toObject ? session.toObject() : session, settings, cycle };
}

async function recordTicketEntry(sessionId, pending) {
  const session = await GameSession.findOne({ sessionId }).lean();
  if (!session) throw new EconomyError('A edição da loteria não foi encontrada.');
  const present = (session.state?.tickets || []).some((entry) => entry.entryId === pending.entryId);
  if (present) return session;
  if (session.status !== 'open') throw new EconomyError('A edição encerrou antes do registro do bilhete.');
  const result = await GameSession.findOneAndUpdate({
    sessionId, status: 'open', 'state.pendingTickets.entryId': pending.entryId,
  }, {
    $pull: { 'state.pendingTickets': { entryId: pending.entryId } },
    $push: { 'state.tickets': { entryId: pending.entryId, userId: pending.userId, count: pending.count, total: pending.total } },
    $inc: { 'state.ticketCount': pending.count, 'state.pot': pending.total, revision: 1 },
    $addToSet: { playerIds: pending.userId },
  }, { returnDocument: 'after' }).lean();
  if (result) return result;
  const retry = await GameSession.findOne({ sessionId, 'state.tickets.entryId': pending.entryId }).lean();
  if (retry) return retry;
  throw new EconomyError('O bilhete não pôde ser incluído; a reserva aguarda conciliação.');
}

async function buyLotteryTickets({ guildId, userId, count = 1, interactionId, channelId = null, now = new Date() }) {
  assertAmount(count, 'Bilhetes', { max: 10 });
  const { session, settings } = await ensureLottery({ guildId, now });
  assertCasinoChannel(settings, channelId);
  if (settings.casino?.games?.lottery?.enabled === false) throw new EconomyError('A loteria comunitária está pausada pela equipe.');
  if (session.status !== 'open' || new Date(session.expiresAt) <= new Date(now)) throw new EconomyError('A edição atual da loteria já fechou.');
  const price = Number(session.state.ticketPrice) || 100;
  const total = price * count;
  if (!Number.isSafeInteger(total)) throw new RangeError('O total excede o limite seguro.');
  const maxTickets = Number(settings.casino?.maxLotteryTicketsPerMember) || 100;
  const owned = (session.state.tickets || []).filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.count, 0)
    + (session.state.pendingTickets || []).filter((entry) => entry.userId === userId).reduce((sum, entry) => sum + entry.count, 0);
  if (owned + count > maxTickets) throw new EconomyError('O limite configurado é de ' + maxTickets + ' bilhetes por pessoa nesta edição.');
  const entryId = String(interactionId || crypto.randomUUID()).slice(0, 80);
  if (session.state.entryIds?.includes(entryId)) {
    const saved = await GameSession.findOne({ sessionId: session.sessionId, 'state.tickets.entryId': entryId }).lean();
    if (saved) return { session: saved, count, total, price, duplicate: true };
    const pending = session.state.pendingTickets?.find((entry) => entry.entryId === entryId);
    const operation = await EconomyOperation.findById('lottery:ticket:' + entryId).lean();
    if (pending && operation?.state === 'completed') {
      const registered = await recordTicketEntry(session.sessionId, pending);
      await EconomyOperation.updateOne({ _id: operation._id, state: 'completed' }, { $set: { step: 'ticket_recorded' } });
      return { session: registered, count: pending.count, total: pending.total, price: pending.total / pending.count, duplicate: true };
    }
    throw new EconomyError('A compra deste bilhete ainda está sendo conciliada. Consulte a loteria novamente em instantes.');
  }
  const pending = { entryId, userId, count, total, createdAt: new Date(now) };
  const memberTicketCount = {
    $sum: {
      $map: {
        input: { $filter: {
          input: { $concatArrays: [{ $ifNull: ['$state.tickets', []] }, { $ifNull: ['$state.pendingTickets', []] }] },
          as: 'entry', cond: { $eq: ['$$entry.userId', userId] },
        } },
        as: 'entry', in: '$$entry.count',
      },
    },
  };
  const reserved = await GameSession.findOneAndUpdate({
    sessionId: session.sessionId, status: 'open', expiresAt: { $gt: now }, 'state.entryIds': { $ne: entryId },
    $expr: { $lte: [{ $add: [count, memberTicketCount] }, maxTickets] },
  }, {
    $push: { 'state.pendingTickets': pending }, $addToSet: { 'state.entryIds': entryId }, $inc: { revision: 1 },
  }, { returnDocument: 'after' });
  if (!reserved) throw new EconomyError('A edição da loteria fechou enquanto você comprava os bilhetes.');
  const operationId = 'lottery:ticket:' + entryId;
  try {
    await runEconomicOperation({
      operationId, guildId, kind: 'lottery_ticket',
      request: { sessionId: session.sessionId, entryId, userId, count, total },
      execution: {
        legs: [{ userId, inc: { wallet: -total }, guards: { wallet: { $gte: total } }, failure: 'Sua carteira não cobre esses bilhetes.' }],
        transactions: [{ guildId, actorId: userId, userId, operation: 'lottery_ticket', currency: 'fragments', amount: total, walletDelta: -total, details: { sessionId: session.sessionId, count, ticketPrice: price, entryId } }],
        result: { sessionId: session.sessionId, entryId, userId, count, total },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(operationId).lean();
    if (operation?.state === 'cancelled') {
      await GameSession.updateOne({ sessionId: session.sessionId, status: 'open' }, { $pull: { 'state.pendingTickets': { entryId }, 'state.entryIds': entryId }, $inc: { revision: 1 } });
    }
    throw error;
  }
  const registered = await recordTicketEntry(session.sessionId, pending);
  await EconomyOperation.updateOne({ _id: operationId, state: 'completed' }, { $set: { step: 'ticket_recorded' } });
  return { session: registered, count, total, price, duplicate: false };
}

function pickLotteryWinner(tickets, randomInt = crypto.randomInt) {
  const total = tickets.reduce((sum, entry) => sum + Math.max(0, Number(entry.count) || 0), 0);
  if (!total) return null;
  const draw = randomInt(0, total);
  let cursor = 0;
  for (const entry of tickets) {
    cursor += Math.max(0, Number(entry.count) || 0);
    if (draw < cursor) return { userId: entry.userId, entryId: entry.entryId, winningTicket: draw - (cursor - entry.count) + 1 };
  }
  return null;
}

async function closeLottery(session, { now = new Date(), randomInt = crypto.randomInt } = {}) {
  const current = session.toObject ? session.toObject() : session;
  if (current.status === 'open') {
    if ((current.state.pendingTickets || []).length) throw new EconomyError('A loteria aguarda concluir a compra de bilhetes pendentes.');
    const claimed = await GameSession.findOneAndUpdate({ sessionId: current.sessionId, status: 'open', revision: current.revision, expiresAt: { $lte: now }, 'state.pendingTickets': { $size: 0 } }, {
      $set: { status: 'settling' }, $inc: { revision: 1 },
    }, { returnDocument: 'after' }).lean();
    if (!claimed) return GameSession.findOne({ sessionId: current.sessionId }).lean();
    return closeLottery(claimed, { now, randomInt });
  }
  if (current.status === 'completed') return current;
  if (current.status !== 'settling') throw new EconomyError('Esta edição da loteria não pode ser encerrada.');
  let winner = current.state.winner || null;
  let payout = Number(current.state.payout || 0);
  let fee = Number(current.state.fee || 0);
  if (!current.state.drawnAt) {
    winner = pickLotteryWinner(current.state.tickets || [], randomInt);
    const gross = winner ? Number(current.state.pot || 0) : 0;
    const settings = await getSettings(current.guildId);
    fee = winner ? Math.floor(gross * (Number(settings.economy?.lotteryFeePercent) || 0) / 100) : 0;
    payout = gross - fee;
    const updated = await GameSession.findOneAndUpdate({ sessionId: current.sessionId, status: 'settling', 'state.drawnAt': null }, {
      $set: { 'state.winner': winner, 'state.payout': payout, 'state.fee': fee, 'state.drawnAt': now, 'state.outcome': winner ? 'drawn' : 'no_entries' }, $inc: { revision: 1 },
    }, { returnDocument: 'after' }).lean();
    if (updated) return closeLottery(updated, { now, randomInt });
    return closeLottery(await GameSession.findOne({ sessionId: current.sessionId }).lean(), { now, randomInt });
  }
  const operationId = 'lottery:' + current.sessionId + ':draw';
  const settings = await getSettings(current.guildId);
  const walletLimit = Math.max(1, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE));
  try {
    await runEconomicOperation({
    operationId, guildId: current.guildId, kind: 'lottery_draw',
    request: { sessionId: current.sessionId, winnerId: winner?.userId || null, payout },
    execution: {
      legs: winner && payout ? [{ userId: winner.userId, inc: { wallet: payout }, guards: { wallet: { $lte: walletLimit - payout }, ...walletCapacityGuard(walletLimit, payout) }, failure: 'O prêmio excede o limite de saldo; a edição aguarda revisão da equipe.' }] : [],
      transactions: [{ guildId: current.guildId, actorId: current.ownerId, userId: winner?.userId || current.ownerId, operation: 'lottery_prize', currency: 'fragments', amount: payout, walletDelta: payout, details: { sessionId: current.sessionId, winnerId: winner?.userId || null, gross: current.state.pot || 0, fee } }],
      result: { sessionId: current.sessionId, winnerId: winner?.userId || null, payout, fee },
    },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(operationId).lean();
    if (operation?.state === 'cancelled' || operation?.state === 'manual_review') {
      await GameSession.updateOne({ sessionId: current.sessionId, status: 'settling' }, { $set: { status: 'manual_review', 'state.settlementError': error.publicMessage || error.message } });
    }
    throw error;
  }
  const completed = await GameSession.findOneAndUpdate({ sessionId: current.sessionId, status: 'settling' }, { $set: { status: 'completed', settledAt: now }, $inc: { revision: 1 } }, { returnDocument: 'after' });
  return completed?.toObject ? completed.toObject() : completed;
}

async function processLotteries({ now = new Date(), limit = 100 } = {}) {
  const sessions = await GameSession.find({ game: 'lottery', status: { $in: ['open', 'settling'] } }).sort({ expiresAt: 1 }).limit(limit).lean();
  let recoveredTickets = 0;
  let closed = 0;
  for (const session of sessions) {
    for (const pending of session.state.pendingTickets || []) {
      const operation = await EconomyOperation.findById('lottery:ticket:' + pending.entryId).lean();
      if (!operation) {
        await GameSession.updateOne({ sessionId: session.sessionId, status: 'open' }, { $pull: { 'state.pendingTickets': { entryId: pending.entryId }, 'state.entryIds': pending.entryId }, $inc: { revision: 1 } });
        continue;
      }
      if (operation.state === 'cancelled') {
        await GameSession.updateOne({ sessionId: session.sessionId, status: 'open' }, { $pull: { 'state.pendingTickets': { entryId: pending.entryId }, 'state.entryIds': pending.entryId }, $inc: { revision: 1 } });
        continue;
      }
      if (operation.state === 'completed' && operation.step !== 'ticket_recorded') {
        await recordTicketEntry(session.sessionId, pending);
        await EconomyOperation.updateOne({ _id: operation._id, state: 'completed' }, { $set: { step: 'ticket_recorded' } });
        recoveredTickets += 1;
      }
    }
    const fresh = await GameSession.findOne({ sessionId: session.sessionId }).lean();
    if (fresh?.status === 'settling' || (fresh?.status === 'open' && new Date(fresh.expiresAt) <= now && !(fresh.state.pendingTickets || []).length)) {
      try { await closeLottery(fresh, { now }); closed += 1; } catch { /* Kept for next recovery tick. */ }
    }
  }
  return { recoveredTickets, closed, scanned: sessions.length };
}

async function lotteryHistory(guildId, userId, limit = 20) {
  return GameSession.find({ guildId, game: 'lottery', $or: [{ playerIds: userId }, { 'state.winner.userId': userId }] }).sort({ updatedAt: -1 }).limit(limit).lean();
}

function lotterySummary(session) {
  return '# Loteria da comunidade\n**Bilhete:** ' + formatFragments(session.state.ticketPrice) + ' · **Bilhetes vendidos:** ' + Number(session.state.ticketCount || 0).toLocaleString('pt-BR')
    + ' · **Prêmio acumulado:** ' + formatFragments(session.state.pot || 0)
    + '\n**Sorteio:** <t:' + Math.floor(new Date(session.expiresAt).getTime() / 1000) + ':R> · meia-noite em `America/Sao_Paulo`'
    + (session.status === 'manual_review' ? '\n**Liquidação:** aguardando revisão da equipe.' : '')
    + (session.status === 'completed' ? '\n**Vencedor:** ' + (session.state.winner?.userId ? '<@' + session.state.winner.userId + '>' : 'sem bilhetes') + ' · **Prêmio:** ' + formatFragments(session.state.payout || 0) : '')
    + '\n\nA chance de cada pessoa corresponde apenas à quantidade de bilhetes comprados. O sorteio não considera saldo, histórico nem comportamento.';
}

module.exports = { ensureLottery, buyLotteryTickets, closeLottery, processLotteries, lotteryHistory, lotterySummary, pickLotteryWinner };
