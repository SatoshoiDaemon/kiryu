const crypto = require('node:crypto');
const {
  EconomyAccount, EconomyInventory, EconomySettings, MarketListing, EconomyOperation,
} = require('../database');
const { getSettings, getAccount, ensureAccount, addInventoryEntry, runEconomicOperation, walletCapacityGuard } = require('./economyService');
const { EconomyError, assertAmount } = require('./economyUtils');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

function plain(value) { return value?.toObject ? value.toObject() : value; }
function safeRegex(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 50); }

async function createMarketListing({ guildId, sellerId, sku, inventoryId = null, quantity, unitPrice, category = 'other', interactionId, now = new Date(), expires = true }) {
  assertAmount(quantity, 'Quantidade', { max: 1000000 });
  assertAmount(unitPrice, 'Preço unitário');
  const total = quantity * unitPrice;
  if (!Number.isSafeInteger(total)) throw new RangeError('O preço total excede o limite seguro.');
  const settings = await getSettings(guildId);
  const economy = settings?.economy || {};
  const listingId = String('m' + (interactionId || crypto.randomUUID())).slice(0, 32);
  const existing = await MarketListing.findOne({ listingId }).lean();
  if (existing) {
    if (existing.sellerId !== sellerId || existing.sku !== sku || existing.quantity !== quantity || existing.unitPrice !== unitPrice) throw new EconomyError('Esta interação já publicou outro anúncio.');
    return existing;
  }
  const activeCount = await MarketListing.countDocuments({ guildId, sellerId, state: { $in: ['active', 'reserving', 'settling'] } });
  if (activeCount >= (Number(economy.maxListingsPerMember) || 10)) throw new EconomyError('Você já atingiu o limite de anúncios ativos.');
  const inventoryQuery = { guildId, userId: sellerId, sku: String(sku).toLowerCase(), quantity: { $gte: quantity } };
  if (inventoryId) inventoryQuery._id = inventoryId;
  const inventory = await EconomyInventory.findOne(inventoryQuery).sort({ quantity: -1, updatedAt: 1 }).lean();
  if (!inventory) throw new EconomyError('Não há unidades suficientes deste item no seu inventário.');
  const durationDays = Math.min(30, Math.max(1, Number(economy.marketListingDays) || 7));
  const expiresAt = expires ? new Date(new Date(now).getTime() + durationDays * 86400000) : null;
  let listing = await MarketListing.create({
    guildId, listingId, sellerId, inventoryId: inventory._id, sku: inventory.sku,
    itemSnapshot: inventory.itemSnapshot, quantity, unitPrice, category: String(category || 'other').trim().toLowerCase().slice(0, 32),
    state: 'reserving', expiresAt,
  });
  const reserved = await EconomyInventory.findOneAndUpdate(
    { _id: inventory._id, guildId, userId: sellerId, quantity: { $gte: quantity }, marketReservationIds: { $ne: listingId } },
    { $inc: { quantity: -quantity }, $addToSet: { marketReservationIds: listingId } },
    { returnDocument: 'after' },
  );
  if (!reserved) {
    await MarketListing.updateOne({ listingId, state: 'reserving' }, { $set: { state: 'cancelled' } });
    throw new EconomyError('O inventário mudou antes do anúncio ser reservado. Atualize e tente novamente.');
  }
  listing = await MarketListing.findOneAndUpdate({ listingId, state: 'reserving' }, { $set: { state: 'active' } }, { returnDocument: 'after' });
  return plain(listing);
}

async function getMarketListings(guildId, { search = '', category = null, sellerId = null, sort = 'newest', page = 0, pageSize = 5, now = new Date() } = {}) {
  const query = { guildId, state: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
  if (category && category !== 'all') query.category = String(category).trim().toLowerCase().slice(0, 32);
  if (sellerId) query.sellerId = String(sellerId);
  if (search) {
    const regex = new RegExp(safeRegex(search), 'i');
    query.$and = [{ $or: [{ 'itemSnapshot.name': regex }, { 'itemSnapshot.description': regex }, { sku: regex }] }];
  }
  const order = sort === 'price_low' ? { unitPrice: 1, createdAt: -1 }
    : sort === 'price_high' ? { unitPrice: -1, createdAt: -1 }
      : sort === 'quantity' ? { quantity: -1, createdAt: -1 } : { createdAt: -1, _id: 1 };
  const size = Math.max(1, Math.min(10, Number(pageSize) || 5));
  const total = await MarketListing.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(0, Number(page) || 0), pages - 1);
  const listings = await MarketListing.find(query).sort(order).skip(currentPage * size).limit(size).lean();
  return { listings, total, page: currentPage, pages, pageSize: size };
}

async function getMarketListing(guildId, listingId) {
  const listing = await MarketListing.findOne({ guildId, listingId }).lean();
  if (!listing) throw new EconomyError('Anúncio não encontrado. Atualize a busca do mercado.');
  return listing;
}

async function releaseMarketReservation(listing) {
  const returned = await EconomyInventory.findOneAndUpdate(
    { _id: listing.inventoryId, guildId: listing.guildId, userId: listing.sellerId, marketReservationIds: listing.listingId },
    { $inc: { quantity: listing.quantity }, $pull: { marketReservationIds: listing.listingId }, $addToSet: { marketReturnedIds: listing.listingId } },
    { returnDocument: 'after' },
  );
  if (returned) return true;
  const marker = await EconomyInventory.findOne({ _id: listing.inventoryId, marketReturnedIds: listing.listingId }).select('_id').lean();
  if (marker) return true;
  const consumed = await EconomyInventory.findOne({ _id: listing.inventoryId, marketConsumedIds: listing.listingId }).select('_id').lean();
  if (consumed) return false;
  throw new EconomyError('A reserva do item não pôde ser conciliada; o anúncio foi encaminhado para revisão.');
}

async function consumeMarketReservation(listing) {
  const consumed = await EconomyInventory.findOneAndUpdate(
    { _id: listing.inventoryId, guildId: listing.guildId, userId: listing.sellerId, marketReservationIds: listing.listingId },
    { $pull: { marketReservationIds: listing.listingId }, $addToSet: { marketConsumedIds: listing.listingId } },
    { returnDocument: 'after' },
  );
  if (consumed) return true;
  const marker = await EconomyInventory.findOne({ _id: listing.inventoryId, marketConsumedIds: listing.listingId }).select('_id').lean();
  if (marker) return true;
  throw new EconomyError('A reserva do vendedor não foi localizada. O anúncio precisa de revisão.');
}

async function completeMarketPurchase(listing) {
  const sellerInventory = await EconomyInventory.findOne({ _id: listing.inventoryId, guildId: listing.guildId, userId: listing.sellerId }).lean();
  if (!sellerInventory) throw new EconomyError('O item reservado não foi localizado. O anúncio precisa de revisão.');
  await addInventoryEntry({
    guildId: listing.guildId, userId: listing.buyerId,
    item: { ...sellerInventory.itemSnapshot, _id: sellerInventory.itemId, sku: sellerInventory.sku },
    quantity: listing.quantity, deliveryId: listing.listingId,
  });
  await consumeMarketReservation(listing);
  const sold = await MarketListing.findOneAndUpdate({ listingId: listing.listingId, state: 'settling', buyerId: listing.buyerId }, {
    $set: { state: 'sold', settledAt: new Date() },
  }, { returnDocument: 'after' });
  await EconomyInventory.updateMany({ guildId: listing.guildId, userId: listing.buyerId, deliveryIds: listing.listingId }, { $pull: { deliveryIds: listing.listingId } }).catch(() => {});
  await EconomyInventory.updateOne({ _id: listing.inventoryId }, { $pull: { marketConsumedIds: listing.listingId } }).catch(() => {});
  return plain(sold);
}

async function buyMarketListing({ guildId, buyerId, listingId, interactionId, now = new Date() }) {
  let listing = await MarketListing.findOne({ guildId, listingId }).lean();
  if (!listing) throw new EconomyError('Anúncio não encontrado.');
  if (listing.sellerId === buyerId) throw new EconomyError('Você não pode comprar seu próprio anúncio.');
  if (listing.state === 'sold') {
    if (listing.buyerId === buyerId) return { listing, duplicate: true };
    throw new EconomyError('Esse anúncio já foi vendido.');
  }
  if (listing.state === 'active') {
    if (listing.expiresAt && new Date(listing.expiresAt) <= now) {
      await closeMarketListing({ guildId, sellerId: listing.sellerId, listingId, reason: 'expired', now });
      throw new EconomyError('Esse anúncio expirou e o item voltou ao inventário do vendedor.');
    }
    const operationId = 'market:' + listingId + ':buy:' + String(interactionId || crypto.randomUUID()).slice(0, 80);
    listing = await MarketListing.findOneAndUpdate({ guildId, listingId, state: 'active' }, { $set: { state: 'settling', buyerId, operationId } }, { returnDocument: 'after' }).lean();
    if (!listing) return buyMarketListing({ guildId, buyerId, listingId, interactionId, now });
  } else if (listing.state !== 'settling' || listing.buyerId !== buyerId) {
    throw new EconomyError('Esse anúncio não pode ser comprado neste estado.');
  }
  const settings = await getSettings(guildId);
  const economy = settings?.economy || {};
  const total = listing.unitPrice * listing.quantity;
  const fee = Math.floor(total * (Number(economy.marketFeePercent) || 0) / 100);
  const sellerGets = total - fee;
  const walletLimit = Math.max(0, Math.min(MAX_BALANCE, Number(economy.walletLimit) || MAX_BALANCE));
  const operationId = listing.operationId || 'market:' + listingId + ':buy:' + String(interactionId || crypto.randomUUID()).slice(0, 80);
  try {
    await runEconomicOperation({
      operationId, guildId, kind: 'market_purchase',
      request: { listingId, buyerId, sellerId: listing.sellerId, total, fee },
      execution: {
        legs: [
          { userId: buyerId, inc: { wallet: -total }, guards: { wallet: { $gte: total } }, failure: 'Sua carteira não cobre o valor total deste anúncio.' },
          { userId: listing.sellerId, inc: { wallet: sellerGets }, guards: { wallet: { $lte: walletLimit - sellerGets }, ...walletCapacityGuard(walletLimit, sellerGets) }, failure: 'A carteira do vendedor não comporta o pagamento; nenhum Fragmento foi perdido.' },
        ],
        compensation: { userId: buyerId, inc: { wallet: total }, guards: { wallet: { $lte: MAX_BALANCE - total }, ...walletCapacityGuard(walletLimit, total) } },
        transactions: [
          { guildId, actorId: buyerId, userId: buyerId, operation: 'market_purchase', currency: 'fragments', amount: total, walletDelta: -total, itemId: listing.inventoryId, itemSku: listing.sku, itemSnapshot: listing.itemSnapshot, details: { listingId, sellerId: listing.sellerId, quantity: listing.quantity } },
          { guildId, actorId: buyerId, userId: listing.sellerId, operation: 'market_sale', currency: 'fragments', amount: sellerGets, walletDelta: sellerGets, itemId: listing.inventoryId, itemSku: listing.sku, itemSnapshot: listing.itemSnapshot, details: { listingId, buyerId, fee, gross: total } },
          ...(fee ? [{ guildId, actorId: buyerId, userId: listing.sellerId, operation: 'market_fee', currency: 'none', amount: fee, details: { listingId, feePercent: economy.marketFeePercent } }] : []),
        ],
        result: { listingId, buyerId, sellerId: listing.sellerId, total, fee, sellerGets },
      },
    });
  } catch (error) {
    const operation = await EconomyOperation.findById(operationId).lean();
    if (operation?.state === 'cancelled') {
      await MarketListing.updateOne({ listingId, state: 'settling', buyerId }, { $set: { state: 'active', buyerId: null, operationId: null } });
    } else if (operation?.state === 'manual_review') {
      await MarketListing.updateOne({ listingId, state: 'settling' }, { $set: { state: 'manual_review' } });
    }
    throw error;
  }
  const completed = await completeMarketPurchase(listing);
  const account = await getAccount(guildId, buyerId);
  return { listing: completed, total, fee, sellerGets, account, duplicate: false };
}

async function closeMarketListing({ guildId, sellerId, listingId, reason = 'cancelled', now = new Date() }) {
  if (!['cancelled', 'expired'].includes(reason)) throw new RangeError('Motivo de encerramento inválido.');
  const listing = await MarketListing.findOne({ guildId, listingId }).lean();
  if (!listing) throw new EconomyError('Anúncio não encontrado.');
  if (sellerId && listing.sellerId !== sellerId) throw new EconomyError('Somente quem publicou o anúncio pode cancelá-lo.');
  if (listing.state === reason) return listing;
  if (listing.state === 'sold') throw new EconomyError('Esse anúncio já foi vendido e não pode ser cancelado.');
  if (listing.state !== 'active' && listing.state !== 'settling') throw new EconomyError('Esse anúncio já foi encerrado.');
  const claimed = listing.state === 'settling' && !listing.buyerId ? listing
    : await MarketListing.findOneAndUpdate({ guildId, listingId, state: 'active' }, { $set: { state: 'settling', buyerId: null, operationId: 'market:' + listingId + ':' + reason } }, { returnDocument: 'after' }).lean();
  if (!claimed) throw new EconomyError('Uma compra está sendo concluída; o anúncio não pode ser cancelado agora.');
  try {
    await releaseMarketReservation(claimed);
  } catch (error) {
    await MarketListing.updateOne({ listingId, state: 'settling', buyerId: null }, { $set: { state: 'manual_review' } });
    throw error;
  }
  const closed = await MarketListing.findOneAndUpdate({ listingId, state: 'settling', buyerId: null }, { $set: { state: reason, settledAt: new Date(now) } }, { returnDocument: 'after' });
  await EconomyInventory.updateOne({ _id: listing.inventoryId }, { $pull: { marketReturnedIds: listingId } }).catch(() => {});
  return plain(closed);
}

async function processMarketListings({ now = new Date(), limit = 100 } = {}) {
  const reserving = await MarketListing.find({ state: 'reserving' }).sort({ createdAt: 1 }).limit(limit).lean();
  let activated = 0;
  for (const listing of reserving) {
    const reserved = await EconomyInventory.findOne({ _id: listing.inventoryId, marketReservationIds: listing.listingId }).select('_id').lean();
    if (reserved) {
      await MarketListing.updateOne({ listingId: listing.listingId, state: 'reserving' }, { $set: { state: 'active' } });
      activated += 1;
    } else {
      const inventory = await EconomyInventory.findOneAndUpdate({ _id: listing.inventoryId, quantity: { $gte: listing.quantity }, marketReservationIds: { $ne: listing.listingId } }, {
        $inc: { quantity: -listing.quantity }, $addToSet: { marketReservationIds: listing.listingId },
      }, { returnDocument: 'after' });
      await MarketListing.updateOne({ listingId: listing.listingId, state: 'reserving' }, { $set: { state: inventory ? 'active' : 'cancelled' } });
      if (inventory) activated += 1;
    }
  }
  const stale = await MarketListing.find({ state: 'settling' }).limit(limit).lean();
  for (const listing of stale) {
    if (listing.buyerId) {
      const operation = await EconomyOperation.findById(listing.operationId).lean();
      if (operation?.state === 'completed') await completeMarketPurchase(listing).catch(async () => MarketListing.updateOne({ listingId: listing.listingId }, { $set: { state: 'manual_review' } }));
      else if (operation?.state === 'cancelled') await MarketListing.updateOne({ listingId: listing.listingId, state: 'settling' }, { $set: { state: 'active', buyerId: null, operationId: null } });
      else if (operation?.state === 'manual_review') await MarketListing.updateOne({ listingId: listing.listingId, state: 'settling' }, { $set: { state: 'manual_review' } });
      else if (operation?.state === 'pending') await buyMarketListing({ guildId: listing.guildId, buyerId: listing.buyerId, listingId: listing.listingId }).catch(() => {});
      else if (!operation) await MarketListing.updateOne({ listingId: listing.listingId, state: 'settling' }, { $set: { state: 'active', buyerId: null, operationId: null } });
    } else {
      const reason = String(listing.operationId || '').endsWith(':expired') ? 'expired' : 'cancelled';
      await releaseMarketReservation(listing).then(async () => {
        await MarketListing.updateOne({ listingId: listing.listingId, state: 'settling', buyerId: null }, { $set: { state: reason, settledAt: now } });
        await EconomyInventory.updateOne({ _id: listing.inventoryId }, { $pull: { marketReturnedIds: listing.listingId } }).catch(() => {});
      }).catch(async () => MarketListing.updateOne({ listingId: listing.listingId }, { $set: { state: 'manual_review' } }));
    }
  }
  const due = await MarketListing.find({ state: 'active', expiresAt: { $ne: null, $lte: now } }).sort({ expiresAt: 1 }).limit(limit).lean();
  for (const listing of due) await closeMarketListing({ guildId: listing.guildId, listingId: listing.listingId, reason: 'expired', now }).catch(() => {});
  return { activated, stale: stale.length, expired: due.length };
}

async function marketHistory(guildId, userId, limit = 25) {
  return MarketListing.find({ guildId, state: { $in: ['sold', 'cancelled', 'expired'] }, $or: [{ sellerId: userId }, { buyerId: userId }] })
    .sort({ settledAt: -1 }).limit(Math.max(1, Math.min(100, limit))).lean();
}

module.exports = { createMarketListing, getMarketListings, getMarketListing, buyMarketListing, closeMarketListing, processMarketListings, marketHistory };
