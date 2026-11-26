const crypto = require('node:crypto');
const { EconomyAccount, EconomyInventory, TradeSession, EconomyOperation } = require('../database');
const { getSettings, getAccount, addInventoryEntry, runEconomicOperation, walletCapacityGuard } = require('./economyService');
const { EconomyError, assertAmount, ORB_TYPES } = require('./economyUtils');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const emptyOffer = () => ({ fragments: 0, orbs: {}, items: [] });

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function plain(value) { return value?.toObject ? value.toObject() : value; }

async function inviteTrade({ guildId, inviterId, inviteeId, interactionId, now = new Date() }) {
  if (!inviteeId || inviterId === inviteeId) throw new EconomyError('Escolha outra pessoa para negociar.');
  const settings = await getSettings(guildId);
  const hours = Math.min(168, Math.max(1, Number(settings?.economy?.tradeExpiryHours) || 24));
  const tradeId = String('t' + (interactionId || crypto.randomUUID())).slice(0, 32);
  const existing = await TradeSession.findOne({ tradeId }).lean();
  if (existing) return existing;
  try {
    return plain(await TradeSession.create({
      guildId, tradeId, participants: [inviterId, inviteeId], inviteeId, state: 'invited',
      offers: { [inviterId]: emptyOffer(), [inviteeId]: emptyOffer() }, confirmed: [], revision: 0,
      history: [{ actorId: inviterId, action: 'invited', at: new Date(now) }], expiresAt: new Date(new Date(now).getTime() + hours * 3600000),
    }));
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return TradeSession.findOne({ tradeId }).lean();
  }
}

async function acceptTrade({ guildId, tradeId, userId, now = new Date() }) {
  const session = await TradeSession.findOneAndUpdate({ guildId, tradeId, state: 'invited', inviteeId: userId, expiresAt: { $gt: now } }, {
    $set: { state: 'open' }, $push: { history: { actorId: userId, action: 'accepted', at: now } },
  }, { returnDocument: 'after' });
  if (!session) throw new EconomyError('A troca não está mais disponível para aceitar.');
  return plain(session);
}

async function updateTradeOffer({ guildId, tradeId, userId, currency, amount, orbType = null, sku = null, quantity = null, now = new Date() }) {
  const session = await TradeSession.findOne({ guildId, tradeId, state: 'open', participants: userId }).lean();
  if (!session) throw new EconomyError('A troca não está aberta para você.');
  const offers = copy(session.offers || {});
  const offer = { ...emptyOffer(), ...(offers[userId] || {}) };
  if (currency === 'fragments') {
    assertAmount(amount, 'Fragmentos', { min: 0 });
    offer.fragments = amount;
  } else if (currency === 'orb') {
    if (!ORB_TYPES.includes(orbType)) throw new RangeError('Categoria de Orbe inválida.');
    assertAmount(amount, 'Orbes', { min: 0 });
    offer.orbs = { ...offer.orbs, [orbType]: amount };
    if (!amount) delete offer.orbs[orbType];
  } else if (currency === 'item') {
    const cleanSku = String(sku || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(cleanSku)) throw new RangeError('Informe um SKU de item válido.');
    assertAmount(quantity, 'Unidades', { min: 0, max: 1000000 });
    const items = [...(offer.items || [])];
    const index = items.findIndex((item) => item.sku === cleanSku);
    if (!quantity) { if (index >= 0) items.splice(index, 1); }
    else if (index >= 0) items[index] = { sku: cleanSku, quantity };
    else {
      if (items.length >= 5) throw new EconomyError('Cada participante pode oferecer até cinco SKUs diferentes.');
      items.push({ sku: cleanSku, quantity });
    }
    offer.items = items;
  } else throw new RangeError('Tipo de recurso inválido.');
  offers[userId] = offer;
  const revision = session.revision + 1;
  const updated = await TradeSession.findOneAndUpdate({ guildId, tradeId, state: 'open', revision: session.revision }, {
    $set: { offers, confirmed: [] }, $inc: { revision: 1 },
    $push: { history: { actorId: userId, action: 'offer_changed:' + currency, at: now, revision } },
  }, { returnDocument: 'after' });
  if (!updated) throw new EconomyError('A troca mudou ao mesmo tempo. Atualize a oferta e tente novamente.');
  return plain(updated);
}

async function reserveTradeItems(session) {
  for (const userId of session.participants) {
    const offer = session.offers?.[userId] || emptyOffer();
    for (const item of offer.items || []) {
      const existing = await EconomyInventory.findOne({ guildId: session.guildId, userId, sku: item.sku, tradeReservationIds: session.tradeId }).select('_id').lean();
      if (existing) continue;
      const reserved = await EconomyInventory.findOneAndUpdate({ guildId: session.guildId, userId, sku: item.sku, quantity: { $gte: item.quantity }, tradeReservationIds: { $ne: session.tradeId } }, {
        $inc: { quantity: -item.quantity }, $addToSet: { tradeReservationIds: session.tradeId },
      }, { returnDocument: 'after' });
      if (!reserved) throw new EconomyError('O inventário de <@' + userId + '> não cobre a oferta de `' + item.sku + '`.');
    }
  }
}

async function releaseTradeItems(session) {
  for (const userId of session.participants) {
    const offer = session.offers?.[userId] || emptyOffer();
    for (const item of offer.items || []) {
      const row = await EconomyInventory.findOneAndUpdate({ guildId: session.guildId, userId, sku: item.sku, tradeReservationIds: session.tradeId }, {
        $inc: { quantity: item.quantity }, $pull: { tradeReservationIds: session.tradeId }, $addToSet: { tradeReturnedIds: session.tradeId },
      }, { returnDocument: 'after' });
      if (!row) {
        const returned = await EconomyInventory.findOne({ guildId: session.guildId, userId, sku: item.sku, tradeReturnedIds: session.tradeId }).select('_id').lean();
        if (!returned) continue;
      }
    }
  }
}

function accountLeg(session, userId, otherId, limits) {
  const outgoing = session.offers?.[userId] || emptyOffer();
  const incoming = session.offers?.[otherId] || emptyOffer();
  const inc = { wallet: Number(incoming.fragments || 0) - Number(outgoing.fragments || 0) };
  const guards = { wallet: { $gte: Number(outgoing.fragments || 0) } };
  if (inc.wallet > 0) {
    guards.wallet.$lte = limits.wallet - inc.wallet;
    Object.assign(guards, walletCapacityGuard(limits.wallet, inc.wallet));
  }
  const orbDelta = {};
  for (const type of ORB_TYPES) {
    const send = Number(outgoing.orbs?.[type] || 0);
    const receive = Number(incoming.orbs?.[type] || 0);
    const delta = receive - send;
    if (!delta && !send) continue;
    inc['orbs.' + type] = delta;
    guards['orbs.' + type] = { $gte: send };
    if (delta > 0) guards['orbs.' + type].$lte = MAX_BALANCE - delta;
    orbDelta[type] = delta;
  }
  return { userId, inc, guards, outgoing, incoming, orbDelta };
}

async function transferTradeItems(session) {
  for (const sellerId of session.participants) {
    const buyerId = session.participants.find((id) => id !== sellerId);
    const offer = session.offers?.[sellerId] || emptyOffer();
    for (let index = 0; index < (offer.items || []).length; index += 1) {
      const item = offer.items[index];
      const entry = await EconomyInventory.findOne({ guildId: session.guildId, userId: sellerId, sku: item.sku, tradeReservationIds: session.tradeId }).lean();
      if (!entry) {
        const consumed = await EconomyInventory.findOne({ guildId: session.guildId, userId: sellerId, sku: item.sku, tradeConsumedIds: session.tradeId }).select('_id').lean();
        if (!consumed) throw new EconomyError('Um item reservado não foi localizado durante a entrega.');
      } else {
        await addInventoryEntry({ guildId: session.guildId, userId: buyerId, item: { ...entry.itemSnapshot, _id: entry.itemId, sku: entry.sku }, quantity: item.quantity, deliveryId: 'trade:' + session.tradeId + ':' + sellerId + ':' + index });
        const consumed = await EconomyInventory.findOneAndUpdate({ _id: entry._id, tradeReservationIds: session.tradeId }, {
          $pull: { tradeReservationIds: session.tradeId }, $addToSet: { tradeConsumedIds: session.tradeId },
        }, { returnDocument: 'after' });
        if (!consumed) throw new EconomyError('A reserva do item mudou durante a liquidação.');
      }
    }
  }
}

async function settleTrade(session) {
  const current = plain(session);
  const [a, b] = current.participants;
  const settings = await getSettings(current.guildId);
  const limits = {
    wallet: Math.max(1, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE)),
  };
  try {
    await reserveTradeItems(current);
  } catch (error) {
    try {
      await releaseTradeItems(current);
      await TradeSession.updateOne({ tradeId: current.tradeId, state: 'settling' }, { $set: { state: 'open', confirmed: [], operationId: null, lastError: error.publicMessage || error.message }, $inc: { revision: 1 } });
    } catch (releaseError) {
      await TradeSession.updateOne({ tradeId: current.tradeId, state: 'settling' }, { $set: { state: 'manual_review', lastError: releaseError.publicMessage || releaseError.message } }).catch(() => {});
    }
    throw error;
  }
  const legA = accountLeg(current, a, b, limits);
  const legB = accountLeg(current, b, a, limits);
  const compensation = { userId: a, inc: Object.fromEntries(Object.entries(legA.inc).map(([key, value]) => [key, -value])), guards: {} };
  if (legA.inc.wallet > 0) compensation.guards.wallet = { $gte: legA.inc.wallet };
  else if (legA.inc.wallet < 0) {
    compensation.guards.wallet = { $lte: MAX_BALANCE + legA.inc.wallet };
    Object.assign(compensation.guards, walletCapacityGuard(limits.wallet, -legA.inc.wallet));
  }
  for (const [path, delta] of Object.entries(legA.inc)) {
    if (!path.startsWith('orbs.') || !delta) continue;
    compensation.guards[path] = delta > 0 ? { $gte: delta } : { $lte: MAX_BALANCE + delta };
  }
  const transaction = (leg, recipientId) => ({
    guildId: current.guildId, actorId: leg.userId, userId: leg.userId, operation: 'trade_transfer', currency: 'mixed',
    amount: Number(leg.outgoing.fragments || 0), walletDelta: leg.inc.wallet,
    orbDelta: Object.keys(leg.orbDelta).length ? leg.orbDelta : null,
    details: { tradeId: current.tradeId, recipientId, items: leg.outgoing.items || [] },
  });
  const opId = current.operationId || 'trade:' + current.tradeId + ':r' + current.revision;
  try {
    await runEconomicOperation({
      operationId: opId, guildId: current.guildId, kind: 'direct_trade',
      request: { tradeId: current.tradeId, revision: current.revision, offers: current.offers },
      execution: {
        legs: [legA, legB].map(({ userId, inc, guards }) => ({ userId, inc, guards, failure: 'Uma das carteiras ou reservas de Orbes não cobre a oferta.' })),
        compensation,
        transactions: [transaction(legA, b), transaction(legB, a)],
        result: { tradeId: current.tradeId, participants: current.participants },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(opId).lean();
    if (operation?.state === 'manual_review') {
      await TradeSession.updateOne({ tradeId: current.tradeId }, { $set: { state: 'manual_review', lastError: error.publicMessage || error.message } });
      throw error;
    }
    if (operation?.state === 'cancelled') {
      try {
        await releaseTradeItems(current);
        await TradeSession.updateOne({ tradeId: current.tradeId, state: 'settling' }, { $set: { state: 'open', confirmed: [], operationId: null, lastError: error.publicMessage || error.message }, $inc: { revision: 1 } });
      } catch (releaseError) {
        await TradeSession.updateOne({ tradeId: current.tradeId, state: 'settling' }, { $set: { state: 'manual_review', lastError: releaseError.publicMessage || releaseError.message } }).catch(() => {});
      }
    }
    throw error;
  }
  try {
    await transferTradeItems(current);
  } catch (error) {
    try {
      const failed = await TradeSession.findOneAndUpdate({ tradeId: current.tradeId, state: 'settling' }, {
        $inc: { settlementAttempts: 1 }, $set: { lastError: error.publicMessage || error.message },
      }, { returnDocument: 'after' }).lean();
      if (failed?.settlementAttempts >= 5) {
        await TradeSession.updateOne({ tradeId: current.tradeId, state: 'settling', settlementAttempts: { $gte: 5 } }, {
          $set: { state: 'manual_review' }, $push: { history: { action: 'manual_review', at: new Date(), revision: current.revision, reason: error.publicMessage || error.message } },
        });
      }
    } catch { /* Keep the session settling so a later recovery pass can retry. */ }
    throw error;
  }
  const completed = await TradeSession.findOneAndUpdate({ tradeId: current.tradeId, state: 'settling' }, {
    $set: { state: 'completed', completedAt: new Date() }, $push: { history: { action: 'settled', at: new Date(), revision: current.revision } },
  }, { returnDocument: 'after' });
  await EconomyInventory.updateMany({ tradeConsumedIds: current.tradeId }, { $pull: { tradeConsumedIds: current.tradeId } }).catch(() => {});
  await EconomyInventory.updateMany({ deliveryIds: { $regex: '^trade:' + current.tradeId } }, { $pull: { deliveryIds: { $regex: '^trade:' + current.tradeId } } }).catch(() => {});
  await EconomyInventory.updateMany({ tradeReturnedIds: current.tradeId }, { $pull: { tradeReturnedIds: current.tradeId } }).catch(() => {});
  return plain(completed);
}

async function confirmTrade({ guildId, tradeId, userId, now = new Date() }) {
  const session = await TradeSession.findOne({ guildId, tradeId, state: 'open', participants: userId, expiresAt: { $gt: now } }).lean();
  if (!session) throw new EconomyError('A troca não está aberta ou expirou.');
  const confirmed = await TradeSession.findOneAndUpdate({ guildId, tradeId, state: 'open', revision: session.revision, participants: userId }, {
    $addToSet: { confirmed: userId }, $push: { history: { actorId: userId, action: 'confirmed', at: now, revision: session.revision } },
  }, { returnDocument: 'after' }).lean();
  if (!confirmed) throw new EconomyError('A oferta mudou; revise a troca e confirme novamente.');
  if (!confirmed.participants.every((id) => confirmed.confirmed.includes(id))) return confirmed;
  const settling = await TradeSession.findOneAndUpdate({ guildId, tradeId, state: 'open', revision: confirmed.revision, confirmed: { $all: confirmed.participants } }, {
    $set: { state: 'settling', operationId: 'trade:' + tradeId + ':r' + confirmed.revision },
  }, { returnDocument: 'after' }).lean();
  if (!settling) return TradeSession.findOne({ guildId, tradeId }).lean();
  return settleTrade(settling);
}

async function cancelTrade({ guildId, tradeId, userId, now = new Date() }) {
  const session = await TradeSession.findOneAndUpdate({ guildId, tradeId, participants: userId, state: { $in: ['invited', 'open'] } }, {
    $set: { state: 'cancelled' }, $push: { history: { actorId: userId, action: 'cancelled', at: now } },
  }, { returnDocument: 'after' });
  if (!session) throw new EconomyError('Esta troca não pode mais ser cancelada.');
  return plain(session);
}

async function getTrade(guildId, tradeId) {
  const session = await TradeSession.findOne({ guildId, tradeId }).lean();
  if (!session) throw new EconomyError('Troca não encontrada.');
  return session;
}

async function tradeHistory(guildId, userId, limit = 20) {
  return TradeSession.find({ guildId, participants: userId }).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(50, limit))).lean();
}

async function processTradeSessions({ now = new Date(), limit = 100 } = {}) {
  const expired = await TradeSession.updateMany({ state: { $in: ['invited', 'open'] }, expiresAt: { $lte: now } }, { $set: { state: 'expired' } });
  const settling = await TradeSession.find({ state: 'settling' }).sort({ updatedAt: 1 }).limit(limit).lean();
  let recovered = 0;
  for (const session of settling) {
    try { await settleTrade(session); recovered += 1; }
    catch { /* Remains open, pending or under manual review for a later pass. */ }
  }
  return { expired: expired.modifiedCount || 0, recovered };
}

module.exports = { inviteTrade, acceptTrade, updateTradeOffer, confirmTrade, cancelTrade, getTrade, tradeHistory, processTradeSessions, settleTrade };
