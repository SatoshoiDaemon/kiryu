const crypto = require('node:crypto');
const { Auction, EconomyInventory, EconomyOperation } = require('../database');
const { getSettings, getAccount, addInventoryEntry, runEconomicOperation, walletCapacityGuard } = require('./economyService');
const { EconomyError, assertAmount } = require('./economyUtils');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;
const plain = (value) => value?.toObject ? value.toObject() : value;

async function createAuction({ guildId, sellerId, sku, quantity, startingBid, buyNow = null, durationHours = 24, interactionId, now = new Date() }) {
  assertAmount(quantity, 'Quantidade', { max: 1000000 });
  assertAmount(startingBid, 'Lance inicial');
  if (buyNow != null) {
    assertAmount(buyNow, 'Compra imediata');
    if (buyNow < startingBid) throw new RangeError('A compra imediata deve ser igual ou maior que o lance inicial.');
  }
  assertAmount(durationHours, 'Duração em horas', { min: 1, max: 168 });
  const auctionId = String('a' + (interactionId || crypto.randomUUID())).slice(0, 32);
  const existing = await Auction.findOne({ auctionId }).lean();
  if (existing) return existing;
  const inventory = await EconomyInventory.findOne({ guildId, userId: sellerId, sku: String(sku).toLowerCase(), quantity: { $gte: quantity } }).sort({ quantity: -1 }).lean();
  if (!inventory) throw new EconomyError('Seu inventário não cobre a quantidade anunciada.');
  const settings = await getSettings(guildId);
  const minIncrement = Math.max(1, Number(settings?.economy?.auctionMinIncrement) || 10);
  const session = await Auction.create({
    guildId, auctionId, sellerId, inventoryId: inventory._id, itemSnapshot: inventory.itemSnapshot,
    quantity, startingBid, buyNow, currentBid: 0, highBidderId: null, state: 'reserving',
    expiresAt: new Date(new Date(now).getTime() + durationHours * 3600000), minIncrement,
  });
  const marker = 'auction:' + auctionId;
  const reserved = await EconomyInventory.findOneAndUpdate({ _id: inventory._id, quantity: { $gte: quantity }, marketReservationIds: { $ne: marker } }, {
    $inc: { quantity: -quantity }, $addToSet: { marketReservationIds: marker },
  }, { returnDocument: 'after' });
  if (!reserved) {
    await Auction.updateOne({ auctionId, state: 'reserving' }, { $set: { state: 'cancelled' } });
    throw new EconomyError('O inventário mudou antes do leilão ser publicado.');
  }
  return plain(await Auction.findOneAndUpdate({ auctionId, state: 'reserving' }, { $set: { state: 'open' } }, { returnDocument: 'after' }));
}

async function reserveBid({ guildId, bidderId, auctionId, amount, now = new Date() }) {
  assertAmount(amount, 'Lance');
  const auction = await Auction.findOne({ guildId, auctionId, state: 'open' }).lean();
  if (!auction) throw new EconomyError('Este leilão não está aberto para lances.');
  if (auction.sellerId === bidderId) throw new EconomyError('O vendedor não pode dar lances no próprio leilão.');
  if (new Date(auction.expiresAt) <= now) throw new EconomyError('O prazo do leilão terminou.');
  if (auction.buyNow && amount >= auction.buyNow) throw new EconomyError('Use `/auction buy-now` para comprar pelo valor imediato.');
  const minimum = auction.currentBid ? auction.currentBid + auction.minIncrement : auction.startingBid;
  if (!Number.isSafeInteger(minimum) || amount < minimum) throw new EconomyError('O próximo lance precisa ser de pelo menos **' + minimum.toLocaleString('pt-BR') + '** Fragmentos.');
  const previousBidderId = auction.highBidderId;
  const previousAmount = Number(auction.currentBid || 0);
  const debit = previousBidderId === bidderId ? amount - previousAmount : amount;
  const bidRevision = auction.revision + 1;
  const operationId = 'auction:' + auctionId + ':bid:' + bidRevision;
  const pendingBid = { bidderId, amount, debit, previousBidderId, previousAmount, operationId, buyNow: false, placedAt: now };
  const claimed = await Auction.findOneAndUpdate({ guildId, auctionId, state: 'open', revision: auction.revision }, {
    $set: { state: 'settling', pendingBid, operationId, settlementKind: null }, $inc: { revision: 1 },
  }, { returnDocument: 'after' }).lean();
  if (!claimed) throw new EconomyError('Outro lance foi registrado. Atualize o leilão e tente novamente.');
  return finalizePendingBid(claimed);
}

async function finalizePendingBid(auction) {
  const current = plain(auction);
  const bid = current.pendingBid;
  if (!bid) return current;
  const settings = await getSettings(current.guildId);
  const walletLimit = Math.max(1, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE));
  const legs = [{ userId: bid.bidderId, inc: { wallet: -bid.debit }, guards: { wallet: { $gte: bid.debit } }, failure: 'Sua carteira não cobre o lance.' }];
  if (bid.previousBidderId && bid.previousBidderId !== bid.bidderId) legs.push({
    userId: bid.previousBidderId, inc: { wallet: bid.previousAmount }, guards: { wallet: { $lte: walletLimit - bid.previousAmount }, ...walletCapacityGuard(walletLimit, bid.previousAmount) },
    failure: 'O lance anterior não pôde ser devolvido ao participante por causa do limite de saldo.',
  });
  try {
    await runEconomicOperation({
      operationId: bid.operationId, guildId: current.guildId, kind: 'auction_bid',
      request: { auctionId: current.auctionId, bidderId: bid.bidderId, amount: bid.amount, revision: current.revision },
      execution: {
        legs,
        compensation: { userId: bid.bidderId, inc: { wallet: bid.debit }, guards: walletCapacityGuard(walletLimit, bid.debit) },
        transactions: [
          { guildId: current.guildId, actorId: bid.bidderId, userId: bid.bidderId, operation: 'auction_bid_reserved', currency: 'fragments', amount: bid.debit, walletDelta: -bid.debit, details: { auctionId: current.auctionId, bid: bid.amount } },
          ...(bid.previousBidderId && bid.previousBidderId !== bid.bidderId ? [{ guildId: current.guildId, actorId: bid.bidderId, userId: bid.previousBidderId, operation: 'auction_bid_refund', currency: 'fragments', amount: bid.previousAmount, walletDelta: bid.previousAmount, details: { auctionId: current.auctionId, outbidBy: bid.bidderId } }] : []),
        ],
        result: { auctionId: current.auctionId, bidderId: bid.bidderId, amount: bid.amount },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(bid.operationId).lean();
    if (operation?.state === 'cancelled') {
      await Auction.updateOne({ auctionId: current.auctionId, state: 'settling', operationId: bid.operationId }, {
        $set: { state: 'open', pendingBid: null, operationId: null, settlementError: error.publicMessage || error.message },
      });
    } else if (operation?.state === 'manual_review') {
      await Auction.updateOne({ auctionId: current.auctionId, state: 'settling' }, { $set: { state: 'manual_review' } });
    }
    throw error;
  }
  const saved = await Auction.findOneAndUpdate({ auctionId: current.auctionId, state: 'settling', operationId: bid.operationId }, {
    $set: { state: 'open', currentBid: bid.amount, highBidderId: bid.bidderId, pendingBid: null, operationId: null, settlementError: null },
    $push: { bids: { bidderId: bid.bidderId, amount: bid.amount, operationId: bid.operationId, placedAt: bid.placedAt } },
  }, { returnDocument: 'after' }).lean();
  const result = saved || await Auction.findOne({ auctionId: current.auctionId }).lean();
  if (bid.buyNow && result?.state === 'open') {
    const closing = await Auction.findOneAndUpdate({ auctionId: current.auctionId, state: 'open' }, {
      $set: { state: 'settling', settlementKind: 'close', operationId: 'auction:' + current.auctionId + ':settlement' },
    }, { returnDocument: 'after' }).lean();
    return closing ? closeAuction(closing, { reason: 'expired', now: bid.placedAt }) : Auction.findOne({ auctionId: current.auctionId }).lean();
  }
  return result;
}

async function releaseAuctionItem(auction) {
  const marker = 'auction:' + auction.auctionId;
  const returned = await EconomyInventory.findOneAndUpdate({ _id: auction.inventoryId, marketReservationIds: marker }, {
    $inc: { quantity: auction.quantity }, $pull: { marketReservationIds: marker }, $addToSet: { marketReturnedIds: marker },
  }, { returnDocument: 'after' });
  if (returned) return true;
  if (await EconomyInventory.findOne({ _id: auction.inventoryId, marketReturnedIds: marker }).select('_id').lean()) return true;
  throw new EconomyError('A reserva do item do leilão não foi localizada.');
}

async function deliverAuctionItem(auction) {
  const entry = await EconomyInventory.findOne({ _id: auction.inventoryId, guildId: auction.guildId, userId: auction.sellerId }).lean();
  if (!entry) throw new EconomyError('O item reservado não foi localizado.');
  const marker = 'auction:' + auction.auctionId;
  await addInventoryEntry({ guildId: auction.guildId, userId: auction.highBidderId, item: { ...entry.itemSnapshot, _id: entry.itemId, sku: entry.sku }, quantity: auction.quantity, deliveryId: marker });
  const consumed = await EconomyInventory.findOneAndUpdate({ _id: auction.inventoryId, marketReservationIds: marker }, {
    $pull: { marketReservationIds: marker }, $addToSet: { marketConsumedIds: marker },
  }, { returnDocument: 'after' });
  if (!consumed && !await EconomyInventory.findOne({ _id: auction.inventoryId, marketConsumedIds: marker }).select('_id').lean()) throw new EconomyError('A reserva do item do leilão precisa ser conciliada.');
  return true;
}

async function closeAuction(auction, { reason = 'expired', now = new Date() } = {}) {
  const current = plain(auction);
  if (!current.highBidderId || current.currentBid <= 0) {
    await releaseAuctionItem(current);
    const state = reason === 'cancelled' ? 'cancelled' : 'expired';
    const closed = await Auction.findOneAndUpdate({ auctionId: current.auctionId, state: 'settling', settlementKind: { $in: ['close', 'cancel'] } }, {
      $set: { state, completedAt: now },
    }, { returnDocument: 'after' });
    await EconomyInventory.updateOne({ _id: current.inventoryId }, { $pull: { marketReturnedIds: 'auction:' + current.auctionId } }).catch(() => {});
    return plain(closed);
  }
  const settings = await getSettings(current.guildId);
  const feePercent = Math.min(50, Math.max(0, Number(settings?.economy?.auctionFeePercent) || 0));
  const fee = Math.floor(current.currentBid * feePercent / 100);
  const sellerGets = current.currentBid - fee;
  const walletLimit = Math.max(1, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE));
  const operationId = current.operationId || 'auction:' + current.auctionId + ':settlement';
  try {
    await runEconomicOperation({
      operationId, guildId: current.guildId, kind: 'auction_settlement',
      request: { auctionId: current.auctionId, bidderId: current.highBidderId, sellerId: current.sellerId, amount: current.currentBid, fee },
      execution: {
        legs: sellerGets ? [{ userId: current.sellerId, inc: { wallet: sellerGets }, guards: { wallet: { $lte: walletLimit - sellerGets }, ...walletCapacityGuard(walletLimit, sellerGets) }, failure: 'A carteira do vendedor atingiu o limite configurado.' }] : [],
        transactions: [
          { guildId: current.guildId, actorId: current.highBidderId, userId: current.sellerId, operation: 'auction_sale', currency: 'fragments', amount: sellerGets, walletDelta: sellerGets, itemId: current.inventoryId, itemSnapshot: current.itemSnapshot, details: { auctionId: current.auctionId, buyerId: current.highBidderId, gross: current.currentBid, fee } },
          ...(fee ? [{ guildId: current.guildId, actorId: current.highBidderId, userId: current.sellerId, operation: 'auction_fee', currency: 'none', amount: fee, itemId: current.inventoryId, details: { auctionId: current.auctionId } }] : []),
        ],
        result: { auctionId: current.auctionId, sellerGets, fee },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(operationId).lean();
    if (operation?.state === 'cancelled') {
      const refundId = 'auction:' + current.auctionId + ':settlement-refund';
      await runEconomicOperation({
        operationId: refundId, guildId: current.guildId, kind: 'auction_failed_refund',
        request: { auctionId: current.auctionId, bidderId: current.highBidderId, amount: current.currentBid },
        execution: {
          legs: [{ userId: current.highBidderId, inc: { wallet: current.currentBid }, guards: { wallet: { $lte: MAX_BALANCE - current.currentBid }, ...walletCapacityGuard(MAX_BALANCE, current.currentBid) }, failure: 'O lance precisa ser devolvido manualmente.' }],
          transactions: [{ guildId: current.guildId, actorId: current.sellerId, userId: current.highBidderId, operation: 'auction_bid_refund', currency: 'fragments', amount: current.currentBid, walletDelta: current.currentBid, details: { auctionId: current.auctionId, reason: 'seller_balance_limit' } }],
          result: { auctionId: current.auctionId, refunded: current.currentBid },
        },
      });
      await releaseAuctionItem(current);
      await Auction.updateOne({ auctionId: current.auctionId, state: 'settling' }, { $set: { state: 'cancelled', settlementError: error.publicMessage || error.message, completedAt: now } });
      return Auction.findOne({ auctionId: current.auctionId }).lean();
    }
    throw error;
  }
  await deliverAuctionItem(current);
  const completed = await Auction.findOneAndUpdate({ auctionId: current.auctionId, state: 'settling' }, { $set: { state: 'completed', completedAt: now } }, { returnDocument: 'after' });
  await EconomyInventory.updateMany({ deliveryIds: 'auction:' + current.auctionId }, { $pull: { deliveryIds: 'auction:' + current.auctionId } }).catch(() => {});
  await EconomyInventory.updateOne({ _id: current.inventoryId }, { $pull: { marketConsumedIds: 'auction:' + current.auctionId } }).catch(() => {});
  return plain(completed);
}

async function buyNow({ guildId, bidderId, auctionId, now = new Date() }) {
  const auction = await Auction.findOne({ guildId, auctionId, state: 'open' }).lean();
  if (!auction?.buyNow) throw new EconomyError('Este leilão não possui compra imediata.');
  if (auction.sellerId === bidderId) throw new EconomyError('O vendedor não pode comprar o próprio leilão.');
  if (new Date(auction.expiresAt) <= now) throw new EconomyError('O prazo do leilão terminou.');
  const required = auction.currentBid ? auction.currentBid + auction.minIncrement : auction.startingBid;
  if (auction.buyNow < required && auction.highBidderId !== bidderId) throw new EconomyError('O próximo lance mínimo já supera o valor de compra imediata.');
  const amount = auction.buyNow;
  // Purchase is a reserved bid at the fixed price, followed by immediate closing.
  const bidOperationId = 'auction:' + auctionId + ':bid:' + (auction.revision + 1);
  const claimed = await Auction.findOneAndUpdate({ guildId, auctionId, state: 'open', revision: auction.revision }, {
    $set: { state: 'settling', settlementKind: 'close', operationId: bidOperationId, pendingBid: {
      bidderId, amount, debit: auction.highBidderId === bidderId ? amount - auction.currentBid : amount,
      previousBidderId: auction.highBidderId, previousAmount: auction.currentBid,
      operationId: bidOperationId, buyNow: true, placedAt: now,
    } }, $inc: { revision: 1 },
  }, { returnDocument: 'after' }).lean();
  if (!claimed) throw new EconomyError('O leilão foi alterado por outra pessoa.');
  return finalizePendingBid(claimed);
}

async function placeBid({ guildId, bidderId, auctionId, amount, now = new Date() }) {
  const result = await reserveBid({ guildId, bidderId, auctionId, amount, now });
  return result;
}

async function cancelAuction({ guildId, sellerId, auctionId, now = new Date() }) {
  const auction = await Auction.findOne({ guildId, auctionId }).lean();
  if (!auction) throw new EconomyError('Leilão não encontrado.');
  if (auction.sellerId !== sellerId) throw new EconomyError('Somente quem criou o leilão pode cancelá-lo.');
  if (auction.highBidderId) throw new EconomyError('Um leilão com lances não pode ser cancelado; aguarde o encerramento.');
  const claimed = await Auction.findOneAndUpdate({ guildId, auctionId, state: 'open', highBidderId: null }, { $set: { state: 'settling', settlementKind: 'cancel' }, $inc: { revision: 1 } }, { returnDocument: 'after' }).lean();
  if (!claimed) throw new EconomyError('O leilão foi alterado e não pode ser cancelado agora.');
  return closeAuction(claimed, { reason: 'cancelled', now });
}

async function getAuction(guildId, auctionId) {
  const auction = await Auction.findOne({ guildId, auctionId }).lean();
  if (!auction) throw new EconomyError('Leilão não encontrado.');
  return auction;
}

async function listAuctions(guildId, { sellerId = null, page = 0, pageSize = 10 } = {}) {
  const query = { guildId, state: 'open' };
  if (sellerId) query.sellerId = sellerId;
  const size = Math.max(1, Math.min(20, pageSize));
  const total = await Auction.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  const auctions = await Auction.find(query).sort({ expiresAt: 1 }).skip(currentPage * size).limit(size).lean();
  return { auctions, total, page: currentPage, pages };
}

async function auctionHistory(guildId, userId, limit = 25) {
  return Auction.find({ guildId, $or: [{ sellerId: userId }, { highBidderId: userId }, { 'bids.bidderId': userId }] }).sort({ updatedAt: -1 }).limit(Math.max(1, Math.min(100, limit))).lean();
}

async function processAuctions({ now = new Date(), limit = 100 } = {}) {
  let bidsFinalized = 0;
  const settling = await Auction.find({ state: 'settling' }).sort({ updatedAt: 1 }).limit(limit).lean();
  for (const auction of settling) {
    if (auction.pendingBid) {
      const op = await EconomyOperation.findById(auction.pendingBid.operationId).lean();
      if (op?.state === 'completed') {
        await finalizePendingBid(auction).catch(() => {});
        bidsFinalized += 1;
      } else if (op?.state === 'cancelled') {
        await Auction.updateOne({ auctionId: auction.auctionId, state: 'settling' }, { $set: { state: 'open', pendingBid: null, operationId: null } });
      } else if (op?.state === 'manual_review') {
        await Auction.updateOne({ auctionId: auction.auctionId, state: 'settling' }, { $set: { state: 'manual_review', settlementError: 'A reserva do lance precisa de revisão da equipe.' } });
      } else if (op?.state === 'pending') {
        await finalizePendingBid(auction).catch(() => {});
      } else if (!op) {
        await Auction.updateOne({ auctionId: auction.auctionId, state: 'settling' }, { $set: { state: 'open', pendingBid: null, operationId: null } });
      }
      continue;
    }
    await closeAuction(auction, { reason: auction.settlementKind === 'cancel' ? 'cancelled' : 'expired', now }).catch(async () => {
      await Auction.updateOne({ auctionId: auction.auctionId, state: 'settling' }, { $set: { state: 'manual_review', settlementError: 'Falha ao liquidar ou devolver o item reservado.' } });
    });
  }
  const immediate = await Auction.find({ state: 'open', settlementKind: 'close' }).sort({ updatedAt: 1 }).limit(limit).lean();
  for (const auction of immediate) {
    const claimed = await Auction.findOneAndUpdate({ auctionId: auction.auctionId, state: 'open', settlementKind: 'close', revision: auction.revision }, {
      $set: { state: 'settling', operationId: 'auction:' + auction.auctionId + ':settlement' }, $inc: { revision: 1 },
    }, { returnDocument: 'after' }).lean();
    if (claimed) await closeAuction(claimed, { reason: 'expired', now }).catch(() => {});
  }
  const expired = await Auction.find({ guildId: { $exists: true }, state: 'open', expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(limit).lean();
  for (const auction of expired) {
    const claimed = await Auction.findOneAndUpdate({ auctionId: auction.auctionId, state: 'open', revision: auction.revision }, { $set: { state: 'settling', settlementKind: 'close', operationId: 'auction:' + auction.auctionId + ':settlement' }, $inc: { revision: 1 } }, { returnDocument: 'after' }).lean();
    if (claimed) await closeAuction(claimed, { reason: 'expired', now }).catch(() => {});
  }
  const reserving = await Auction.find({ state: 'reserving' }).limit(limit).lean();
  for (const auction of reserving) {
    const marker = 'auction:' + auction.auctionId;
    let row = await EconomyInventory.findOne({ _id: auction.inventoryId, marketReservationIds: marker }).select('_id').lean();
    if (!row) row = await EconomyInventory.findOneAndUpdate({ _id: auction.inventoryId, quantity: { $gte: auction.quantity }, marketReservationIds: { $ne: marker } }, { $inc: { quantity: -auction.quantity }, $addToSet: { marketReservationIds: marker } }, { returnDocument: 'after' });
    await Auction.updateOne({ auctionId: auction.auctionId, state: 'reserving' }, { $set: { state: row ? 'open' : 'cancelled' } });
  }
  return { bidsFinalized, settling: settling.length, expired: expired.length };
}

module.exports = { createAuction, placeBid, buyNow, cancelAuction, getAuction, listAuctions, auctionHistory, processAuctions, closeAuction };
