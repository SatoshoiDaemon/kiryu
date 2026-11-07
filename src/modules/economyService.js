const crypto = require('node:crypto');
const mongoose = require('mongoose');
const {
  EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings,
  EconomyCollectRule, EconomyClaim,
} = require('../database');
const {
  ORB_TYPES, EconomyError, assertAmount, orbConversion, remainingMs, formatDuration, periodKey, isCalendarDue,
} = require('./economyUtils');

const logger = require('../logger');
const { errorDetails } = require('./errorDetails');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

async function runStandaloneOperation(task) {
  return task();
}

async function ensureAccount(guildId, userId) {
  try {
    return await EconomyAccount.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { guildId, userId, wallet: 0, bank: 0, orbs: { green: 0, blue: 0, orange: 0, red: 0, black: 0, gold: 0 } } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return EconomyAccount.findOne({ guildId, userId });
  }
}

async function getAccount(guildId, userId) {
  const account = await ensureAccount(guildId, userId);
  return account.toObject ? account.toObject() : account;
}

async function getSettings(guildId) {
  let settings = await EconomySettings.findById(guildId);
  if (!settings) {
    try {
      settings = await EconomySettings.create({ _id: guildId });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      settings = await EconomySettings.findById(guildId);
    }
  }
  if (!settings?.daily || settings.daily.rangesConfigured) return settings;

  // Initialize old settings once with the daily ranges requested for the game.
  // The conditional update lets a concurrent admin configuration win.
  const migrated = await EconomySettings.findOneAndUpdate(
    { _id: guildId, 'daily.rangesConfigured': { $ne: true } },
    { $set: {
      'daily.rewardRanges.fragments': { min: 400, max: 1000 },
      'daily.rewardRanges.orbs.green': { min: 10, max: 100 },
      'daily.rewardRanges.orbs.blue': { min: 10, max: 50 },
      'daily.rewardRanges.orbs.orange': { min: 5, max: 10 },
      'daily.rewardRanges.orbs.red': { min: 0, max: 0 },
      'daily.rewardRanges.orbs.black': { min: 0, max: 0 },
      'daily.rewardRanges.orbs.gold': { min: 0, max: 0 },
      'daily.rangesConfigured': true,
    } },
    { returnDocument: 'after' },
  );
  return migrated || EconomySettings.findById(guildId);
}

function auditRecord(data) {
  return EconomyTransaction.create([data]).catch((error) => {
    logger.error('Operação econômica concluída sem registrar o histórico (' + errorDetails(error) + ').');
    return null;
  });
}

// Balance changes are committed atomically on EconomyAccount. The optional audit
// entry is a separate document and must not make a successful game action fail.
async function auditAfterAccountUpdate(data) {
  try {
    await auditRecord(data);
  } catch (error) {
    logger.error('Saldo atualizado, mas não foi possível gravar o histórico econômico (' + errorDetails(error) + ').');
  }
}

function amountInc(path, amount) {
  return { $inc: { [path]: amount } };
}

async function adjustFragments({ guildId, actorId, userId, amount, operation = 'admin_fragments_add', mode = 'add', accountType = 'wallet' }) {
  assertAmount(amount, 'Quantidade', { min: mode === 'set' ? 0 : 1 });
  if (!['add', 'remove', 'set'].includes(mode)) throw new RangeError('Operação monetária inválida.');
  if (!['wallet', 'bank'].includes(accountType)) throw new RangeError('Conta de Fragmentos inválida.');
  await ensureAccount(guildId, userId);
  const previous = mode === 'set' ? await EconomyAccount.findOne({ guildId, userId }).lean() : null;
  const balancePath = accountType;
  const query = { guildId, userId };
  const update = mode === 'set' ? { $set: { [balancePath]: amount } } : amountInc(balancePath, mode === 'add' ? amount : -amount);
  if (mode === 'add') query[balancePath] = { $lte: MAX_BALANCE - amount };
  if (mode === 'remove') query[balancePath] = { $gte: amount };
  const account = await EconomyAccount.findOneAndUpdate(query, update, { returnDocument: 'after' });
  if (!account) throw new EconomyError(mode === 'remove' ? 'O usuário não possui Fragmentos suficientes nessa conta.' : 'O saldo máximo permitido seria ultrapassado.');
  const delta = mode === 'set' ? amount - (previous?.[balancePath] || 0) : (mode === 'add' ? amount : -amount);
  const deltas = { walletDelta: accountType === 'wallet' ? delta : 0, bankDelta: accountType === 'bank' ? delta : 0 };
  await auditAfterAccountUpdate({ guildId, actorId, userId, operation, currency: 'fragments', amount, ...deltas, details: { mode, accountType, previous: previous?.[balancePath] || 0, result: account[balancePath] } });
  return account.toObject ? account.toObject() : account;
}

async function adjustOrbs({ guildId, actorId, userId, type, amount, operation = 'admin_orbs_add', mode = 'add' }) {
  if (!ORB_TYPES.includes(type)) throw new RangeError('Categoria de Orbe inválida.');
  assertAmount(amount, 'Quantidade', { min: mode === 'set' ? 0 : 1 });
  if (!['add', 'remove', 'set'].includes(mode)) throw new RangeError('Operação de Orbes inválida.');
  await ensureAccount(guildId, userId);
  const path = 'orbs.' + type;
  const previous = mode === 'set' ? await EconomyAccount.findOne({ guildId, userId }).lean() : null;
  const query = { guildId, userId };
  const update = mode === 'set' ? { $set: { [path]: amount } } : amountInc(path, mode === 'add' ? amount : -amount);
  if (mode === 'add') query[path] = { $lte: MAX_BALANCE - amount };
  if (mode === 'remove') query[path] = { $gte: amount };
  const account = await EconomyAccount.findOneAndUpdate(query, update, { returnDocument: 'after' });
  if (!account) throw new EconomyError(mode === 'remove' ? 'O usuário não possui Orbes suficientes nessa categoria.' : 'O saldo máximo permitido seria ultrapassado.');
  await auditAfterAccountUpdate({ guildId, actorId, userId, operation, currency: 'orbs', orbType: type, amount, orbDelta: { [type]: mode === 'set' ? amount - (previous?.orbs?.[type] || 0) : (mode === 'add' ? amount : -amount) }, details: { mode, previous: previous?.orbs?.[type] || 0, result: account.orbs[type] } });
  return account.toObject ? account.toObject() : account;
}

async function bankTransfer({ guildId, userId, amount, direction }) {
  assertAmount(amount, 'Quantidade');
  if (!['deposit', 'withdraw'].includes(direction)) throw new RangeError('Operação bancária inválida.');
  await ensureAccount(guildId, userId);
  const deposit = direction === 'deposit';
  const query = { guildId, userId };
  if (deposit) {
    query.wallet = { $gte: amount };
    query.bank = { $lte: MAX_BALANCE - amount };
  } else {
    query.bank = { $gte: amount };
    query.wallet = { $lte: MAX_BALANCE - amount };
  }
  const account = await EconomyAccount.findOneAndUpdate(query, {
    $inc: { wallet: deposit ? -amount : amount, bank: deposit ? amount : -amount },
  }, { returnDocument: 'after' });
  if (!account) throw new EconomyError(deposit ? 'Saldo insuficiente na carteira ou limite do banco atingido.' : 'Saldo insuficiente no banco ou limite da carteira atingido.');
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: deposit ? 'bank_deposit' : 'bank_withdraw', currency: 'fragments', amount, walletDelta: deposit ? -amount : amount, bankDelta: deposit ? amount : -amount });
  return account.toObject ? account.toObject() : account;
}

async function convertOrbes({ guildId, userId, source, amount, actorId = userId }) {
  const conversion = orbConversion(source, amount);
  await ensureAccount(guildId, userId);
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, ['orbs.' + source]: { $gte: amount }, ['orbs.' + conversion.destination]: { $lte: MAX_BALANCE - conversion.result } },
    { $inc: { ['orbs.' + source]: -amount, ['orbs.' + conversion.destination]: conversion.result } },
    { returnDocument: 'after' },
  );
  if (!account) throw new EconomyError('Saldo insuficiente para essa conversão ou limite de saldo atingido.');
  await auditAfterAccountUpdate({ guildId, actorId, userId, operation: 'orb_conversion', currency: 'orbs', orbType: source, amount, orbDelta: { [source]: -amount, [conversion.destination]: conversion.result } });
  return { account: account.toObject ? account.toObject() : account, conversion };
}

async function claimWork({ guildId, userId, now = Date.now(), random = crypto.randomInt }) {
  const settings = await getSettings(guildId);
  const reward = random(settings.work.min, settings.work.max + 1);
  await ensureAccount(guildId, userId);
  const cutoff = new Date(now - settings.work.cooldownMs);
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, $or: [{ lastWorkAt: null }, { lastWorkAt: { $exists: false } }, { lastWorkAt: { $lte: cutoff } }], wallet: { $lte: MAX_BALANCE - reward } },
    { $inc: { wallet: reward }, $set: { lastWorkAt: new Date(now) } },
    { returnDocument: 'after' },
  );
  if (!account) {
    const current = await EconomyAccount.findOne({ guildId, userId });
    const wait = remainingMs(current?.lastWorkAt, settings.work.cooldownMs, now);
    if (wait) throw new EconomyError('Você poderá trabalhar novamente em **' + formatDuration(wait) + '**.', { remainingMs: wait });
    throw new EconomyError('Não foi possível creditar a recompensa por causa do limite de saldo.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: 'work_reward', currency: 'fragments', amount: reward, walletDelta: reward });
  return { account: account.toObject ? account.toObject() : account, reward, settings };
}

async function claimDaily({ guildId, userId, now = Date.now(), random = crypto.randomInt }) {
  const settings = await getSettings(guildId);
  await ensureAccount(guildId, userId);
  const ranges = settings.daily.rewardRanges;
  const fragments = random(ranges.fragments.min, ranges.fragments.max + 1);
  const orbs = Object.fromEntries(ORB_TYPES.map((type) => {
    const range = ranges.orbs[type];
    return [type, random(range.min, range.max + 1)];
  }));
  const cutoff = new Date(now - settings.daily.cooldownMs);
  const update = { $set: { lastDailyAt: new Date(now) }, $inc: { wallet: fragments } };
  const orbDelta = {};
  for (const [type, amount] of Object.entries(orbs)) {
    if (amount) {
      update.$inc['orbs.' + type] = amount;
      orbDelta[type] = amount;
    }
  }
  const orbBounds = Object.fromEntries(ORB_TYPES.filter((type) => orbs[type]).map((type) => ['orbs.' + type, { $lte: MAX_BALANCE - orbs[type] }]));
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, $or: [{ lastDailyAt: null }, { lastDailyAt: { $exists: false } }, { lastDailyAt: { $lte: cutoff } }], wallet: { $lte: MAX_BALANCE - fragments }, ...orbBounds },
    update,
    { returnDocument: 'after' },
  );
  if (!account) {
    const current = await EconomyAccount.findOne({ guildId, userId });
    const wait = remainingMs(current?.lastDailyAt, settings.daily.cooldownMs, now);
    if (wait) throw new EconomyError('Sua recompensa diária estará disponível em **' + formatDuration(wait) + '**.', { remainingMs: wait });
    throw new EconomyError('Não foi possível creditar a recompensa por causa do limite de saldo.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: 'daily_reward', currency: 'mixed', amount: fragments, walletDelta: fragments, orbDelta, details: { lastCollectedAt: new Date(now) } });
  return { account: account.toObject ? account.toObject() : account, fragments, orbs, collectedAt: new Date(now), cooldownMs: settings.daily.cooldownMs };
}

function itemSnapshot(item, selectedChoice = item.selectedChoice || null) {
  return {
    name: item.name,
    emoji: item.emoji || '📦',
    description: item.description || '',
    inventoryVisible: item.inventoryVisible !== false,
    usable: Boolean(item.usable),
    consumeOnUse: item.consumeOnUse !== false,
    useMessage: item.useMessage || '',
    effectDescription: item.effectDescription || '',
    action: item.action || 'none',
    actionAmount: Number(item.actionAmount || 0),
    actionOrbType: item.actionOrbType || null,
    stackable: item.stackable !== false,
    selectedChoice: selectedChoice ? {
      value: selectedChoice.value,
      label: selectedChoice.label,
      description: selectedChoice.description || '',
    } : null,
  };
}

function itemAvailability(item, now = new Date()) {
  const time = new Date(now).getTime();
  if (item.availableFrom && new Date(item.availableFrom).getTime() > time) return { available: false, reason: 'Ainda não está disponível.' };
  if (item.availableUntil && new Date(item.availableUntil).getTime() <= time) return { available: false, reason: 'A disponibilidade deste item terminou.' };
  if (item.stock !== null && item.stock < item.purchaseQuantity) return { available: false, reason: 'Sem estoque.' };
  return { available: true, reason: '' };
}

async function addInventoryEntry({ guildId, userId, item, quantity }) {
  const snapshot = itemSnapshot(item);
  if (snapshot.stackable) {
    const slot = snapshot.selectedChoice ? 'choice:' + snapshot.selectedChoice.value : 'stack';
    const filter = { guildId, userId, itemId: item._id, slot };
    const existing = await EconomyInventory.findOne(filter).lean();
    if (existing) {
      if (existing.quantity > MAX_BALANCE - quantity) throw new EconomyError('O limite de quantidade do inventário seria ultrapassado.');
      const updated = await EconomyInventory.findOneAndUpdate(
        { _id: existing._id, quantity: { $lte: MAX_BALANCE - quantity } },
        { $inc: { quantity } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!updated) throw new EconomyError('O inventário foi alterado em outra operação. Tente novamente.');
      return updated;
    }
    try {
      return await EconomyInventory.findOneAndUpdate(
        filter,
        { $inc: { quantity }, $setOnInsert: { guildId, userId, itemId: item._id, sku: item.sku, slot, itemSnapshot: snapshot } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false, runValidators: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const updated = await EconomyInventory.findOneAndUpdate(
        { ...filter, quantity: { $lte: MAX_BALANCE - quantity } },
        { $inc: { quantity } },
        { returnDocument: 'after', runValidators: true },
      );
      if (!updated) throw error;
      return updated;
    }
  }
  const entries = Array.from({ length: quantity }, () => ({
    guildId, userId, itemId: item._id, sku: item.sku, slot: new mongoose.Types.ObjectId().toString(), quantity: 1, itemSnapshot: snapshot,
  }));
  await EconomyInventory.insertMany(entries);
  return entries;
}

async function applyItemAction(accountQuery, item) {
  const action = item.action || 'none';
  const amount = Number(item.actionAmount || 0);
  if (!amount || action === 'none') return null;
  if (action === 'grant_fragments') {
    const account = await EconomyAccount.findOneAndUpdate({ ...accountQuery, wallet: { $lte: MAX_BALANCE - amount } }, { $inc: { wallet: amount } }, { returnDocument: 'after' });
    if (!account) throw new EconomyError('O limite de saldo impede executar o efeito do item.');
    return account;
  }
  if (action === 'grant_orb' && ORB_TYPES.includes(item.actionOrbType)) {
    const path = 'orbs.' + item.actionOrbType;
    const account = await EconomyAccount.findOneAndUpdate({ ...accountQuery, [path]: { $lte: MAX_BALANCE - amount } }, { $inc: { [path]: amount } }, { returnDocument: 'after' });
    if (!account) throw new EconomyError('O limite de saldo impede executar o efeito do item.');
    return account;
  }
  throw new EconomyError('A ação configurada para este item não é válida.');
}

async function restorePurchasedBalance(guildId, userId, balancePath, amount) {
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, [balancePath]: { $lte: MAX_BALANCE - amount } },
    { $inc: { [balancePath]: amount } },
    { returnDocument: 'after' },
  );
  if (!account) logger.error('Não foi possível reverter o débito de uma compra cancelada.');
}

async function restorePurchasedStock(item, quantity) {
  const increment = { soldCount: -quantity };
  const filter = { _id: item._id, guildId: item.guildId, soldCount: { $gte: quantity } };
  if (item.stock !== null) increment.stock = quantity;
  const restored = await EconomyItem.findOneAndUpdate(filter, { $inc: increment }, { returnDocument: 'after' });
  if (!restored) logger.error('Não foi possível reverter o estoque de uma compra cancelada.');
}

async function buyItem({ guildId, userId, itemId, purchaseChoice = null, now = new Date(), interactionId = null }) {
  if (interactionId) {
    const previous = await EconomyTransaction.findOne({ idempotencyKey: interactionId }).lean();
    if (previous) return { duplicate: true, transaction: previous };
  }
  await ensureAccount(guildId, userId);
  return runStandaloneOperation(async () => {
    if (interactionId) {
      const previous = await EconomyTransaction.findOne({ idempotencyKey: interactionId }).lean();
      if (previous) return { duplicate: true, transaction: previous };
    }
    const item = await EconomyItem.findOne({ _id: itemId, guildId, active: true, visibleInStore: true, deletedAt: null }).lean();
    if (!item) throw new EconomyError('Este item não está disponível na loja.');
    const choices = Array.isArray(item.purchaseChoices) ? item.purchaseChoices : [];
    let selectedChoice = null;
    if (choices.length) {
      selectedChoice = choices.find((choice) => choice.value === purchaseChoice) || null;
      if (!selectedChoice) throw new EconomyError('Escolha uma das opções disponíveis para este item antes de comprar.');
    } else if (purchaseChoice != null) {
      throw new EconomyError('Este item não possui opções de compra. Atualize a loja e tente novamente.');
    }
    const availability = itemAvailability(item, now);
    if (!availability.available) throw new EconomyError(availability.reason);
    const quantity = item.purchaseQuantity;
    if (!item.stackable && quantity > 1000) throw new EconomyError('Este item não acumulável excede o limite de unidades por compra.');
    const cost = item.price * quantity;
    if (!Number.isSafeInteger(cost)) throw new EconomyError('O preço configurado para este item é inválido.');
    if (item.currency === 'orbs' && !ORB_TYPES.includes(item.orbType)) throw new EconomyError('A moeda configurada para este item é inválida.');

    const balancePath = item.currency === 'fragments' ? 'wallet' : 'orbs.' + item.orbType;
    const account = await EconomyAccount.findOneAndUpdate(
      { guildId, userId, [balancePath]: { $gte: cost } },
      { $inc: { [balancePath]: -cost } },
      { returnDocument: 'after' },
    );
    if (!account) throw new EconomyError('Saldo insuficiente para comprar este item.');

    let updatedItem = null;
    try {
      const purchaseFilter = { _id: item._id, guildId, active: true, visibleInStore: true, deletedAt: null, soldCount: { $lte: MAX_BALANCE - quantity } };
      const purchaseInc = { soldCount: quantity };
      if (item.stock !== null) {
        purchaseFilter.stock = { $gte: quantity };
        purchaseInc.stock = -quantity;
      }
      updatedItem = await EconomyItem.findOneAndUpdate(purchaseFilter, { $inc: purchaseInc }, { returnDocument: 'after' });
      if (!updatedItem) throw new EconomyError(item.stock !== null ? 'O estoque acabou antes de concluir a compra.' : 'Este item não está mais disponível na loja.');

      const toInventory = item.delivery === 'inventory' && item.inventoryVisible;
      let appliedAction = null;
      const purchasedItem = selectedChoice ? { ...item, selectedChoice } : item;
      if (toInventory) await addInventoryEntry({ guildId, userId, item: purchasedItem, quantity });
      else appliedAction = await applyItemAction({ guildId, userId }, item);

      const walletDelta = (item.currency === 'fragments' ? -cost : 0) + (appliedAction && item.action === 'grant_fragments' ? item.actionAmount : 0);
      const orbDelta = {};
      if (item.currency === 'orbs') orbDelta[item.orbType] = (orbDelta[item.orbType] || 0) - cost;
      if (appliedAction && item.action === 'grant_orb') orbDelta[item.actionOrbType] = (orbDelta[item.actionOrbType] || 0) + item.actionAmount;

      const transaction = {
        guildId, actorId: userId, userId, operation: 'item_purchase', currency: item.currency,
        orbType: item.orbType, amount: cost, walletDelta,
        orbDelta: Object.keys(orbDelta).length ? orbDelta : null,
        itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item, selectedChoice),
        details: { quantity, delivery: toInventory ? 'inventory' : 'immediate', action: item.action, actionAmount: item.actionAmount, purchaseChoice: selectedChoice }, idempotencyKey: interactionId,
      };
      await auditRecord(transaction);
      return { account: account.toObject ? account.toObject() : account, item, quantity, cost, deliveredToInventory: toInventory, selectedChoice };
    } catch (error) {
      if (updatedItem) await restorePurchasedStock(item, quantity).catch((restoreError) => logger.error('Falha ao reverter estoque após uma compra cancelada (' + errorDetails(restoreError) + ').'));
      await restorePurchasedBalance(guildId, userId, balancePath, cost).catch((restoreError) => logger.error('Falha ao reverter saldo após uma compra cancelada (' + errorDetails(restoreError) + ').'));
      throw error;
    }
  });
}

async function getStoreItem(guildId, itemId, currency) {
  const item = await EconomyItem.findOne({ _id: itemId, guildId, currency, active: true, visibleInStore: true, deletedAt: null }).lean();
  if (!item) throw new EconomyError('Este item não está disponível na loja. Atualize a página e tente novamente.');
  const availability = itemAvailability(item);
  if (!availability.available) throw new EconomyError(availability.reason);
  return item;
}

async function getStorePage(guildId, currency, { page = 0, pageSize = 4 } = {}) {
  const query = { guildId, currency, active: true, visibleInStore: true, deletedAt: null };
  const total = await EconomyItem.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), pages - 1);
  const items = await EconomyItem.find(query).sort({ createdAt: 1, _id: 1 }).skip(currentPage * pageSize).limit(pageSize).lean();
  return { items, total, page: currentPage, pageSize, pages };
}

async function consumeInventoryUnit(entry) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deleted = await EconomyInventory.deleteOne({ _id: entry._id, quantity: 1 });
    if (deleted.deletedCount) return;
    const decremented = await EconomyInventory.updateOne(
      { _id: entry._id, quantity: { $gt: 1 } },
      { $inc: { quantity: -1 } },
    );
    if (decremented.modifiedCount) return;
  }
  throw new EconomyError('O inventário mudou durante o uso. Atualize e tente novamente.');
}

async function restoreConsumedInventory(entry) {
  await addInventoryEntry({
    guildId: entry.guildId,
    userId: entry.userId,
    item: { ...entry.itemSnapshot, _id: entry.itemId, sku: entry.sku },
    quantity: 1,
  });
}

async function listInventory(guildId, userId, { page = 0, pageSize = 5 } = {}) {
  const query = { guildId, userId, 'itemSnapshot.inventoryVisible': { $ne: false } };
  const total = await EconomyInventory.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), pages - 1);
  const items = await EconomyInventory.find(query).sort({ updatedAt: -1, _id: 1 }).skip(currentPage * pageSize).limit(pageSize).lean();
  return { items, total, page: currentPage, pageSize, pages };
}

async function useInventoryItem({ guildId, userId, sku, now = new Date() }) {
  await ensureAccount(guildId, userId);
  return runStandaloneOperation(async () => {
    const entry = await EconomyInventory.findOne({ guildId, userId, sku }).sort({ slot: 1 }).lean();
    if (!entry) throw new EconomyError('Você não possui esse item no inventário.');
    const item = entry.itemSnapshot;
    if (!item.usable) throw new EconomyError('Esse item não pode ser utilizado.');
    const consumeOnUse = item.consumeOnUse !== false;
    let consumed = false;
    if (consumeOnUse) {
      await consumeInventoryUnit(entry);
      consumed = true;
    }
    let effectAccount;
    try {
      effectAccount = await applyItemAction({ guildId, userId }, item);
      await auditRecord({
        guildId, actorId: userId, userId, operation: 'item_use', currency: 'item', amount: 1,
        walletDelta: item.action === 'grant_fragments' ? Number(item.actionAmount || 0) : 0,
        orbDelta: item.action === 'grant_orb' && item.actionOrbType ? { [item.actionOrbType]: Number(item.actionAmount || 0) } : null,
        itemId: entry.itemId, itemSku: entry.sku, itemSnapshot: item,
        details: { consumed, usedAt: new Date(now), action: item.action, actionAmount: item.actionAmount },
      });
    } catch (error) {
      if (consumed) await restoreConsumedInventory(entry).catch((restoreError) => logger.error('Falha ao devolver item após uso cancelado (' + errorDetails(restoreError) + ').'));
      throw error;
    }
    return { item: itemSnapshot(item), consumed, effectAccount };
  });
}

async function deliverItem({ guildId, actorId, userId, sku, quantity }) {
  assertAmount(quantity, 'Quantidade', { max: 1000000 });
  return runStandaloneOperation(async () => {
    const item = await EconomyItem.findOne({ guildId, sku: String(sku).toLowerCase(), deletedAt: null }).lean();
    if (!item) throw new EconomyError('Item não encontrado no catálogo.');
    if (!item.inventoryVisible) throw new EconomyError('Este item está configurado para não aparecer no inventário.');
    if (!item.stackable && quantity > 1000) throw new RangeError('Itens não acumuláveis podem entregar até 1.000 unidades por operação.');
    await addInventoryEntry({ guildId, userId, item, quantity });
    await auditRecord({ guildId, actorId, userId, operation: 'admin_item_delivery', currency: 'item', amount: quantity, itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item) });
    return item;
  });
}

async function removeInventoryItems({ guildId, actorId, userId, sku, quantity }) {
  assertAmount(quantity, 'Quantidade', { max: 1000000 });
  return runStandaloneOperation(async () => {
    const entries = await EconomyInventory.find({ guildId, userId, sku: String(sku).toLowerCase() }).sort({ slot: 1 }).lean();
    const owned = entries.reduce((total, entry) => total + entry.quantity, 0);
    if (owned < quantity) throw new EconomyError('O usuário não possui essa quantidade no inventário.');
    let remaining = quantity;
    for (const entry of entries) {
      if (!remaining) break;
      const removed = Math.min(entry.quantity, remaining);
      if (removed === entry.quantity) await EconomyInventory.deleteOne({ _id: entry._id, quantity: entry.quantity });
      else await EconomyInventory.updateOne({ _id: entry._id, quantity: { $gte: removed } }, { $inc: { quantity: -removed } });
      remaining -= removed;
    }
    await auditRecord({ guildId, actorId, userId, operation: 'admin_item_removal', currency: 'item', amount: quantity, itemSku: String(sku).toLowerCase() });
    return { removed: quantity };
  });
}

async function getClaimableRules(guildId, roleIds, userId, now = new Date()) {
  if (!roleIds.length) return [];
  const rules = await EconomyCollectRule.find({ guildId, roleId: { $in: roleIds }, active: true }).sort({ createdAt: 1 }).lean();
  const eligibleToday = rules.filter((rule) => isCalendarDue(rule, now));
  if (!eligibleToday.length) return [];
  const claims = await EconomyClaim.find({
    guildId, userId,
    $or: eligibleToday.map((rule) => ({ ruleId: rule._id, periodKey: periodKey(rule, now) })),
  }).lean();
  const keys = new Set(claims.map((claim) => String(claim.ruleId) + ':' + claim.periodKey));
  return eligibleToday.filter((rule) => !keys.has(String(rule._id) + ':' + periodKey(rule, now)));
}

async function claimCollectRules({ guildId, userId, roleIds = [], ruleIds, now = new Date() }) {
  if (!ruleIds.length || ruleIds.length > 25) throw new RangeError('Selecione ao menos uma recompensa disponível.');
  if (!roleIds.length) throw new EconomyError('Você não possui cargo elegível para coletar essa recompensa.');
  await ensureAccount(guildId, userId);
  return runStandaloneOperation(async () => {
    const rules = await EconomyCollectRule.find({ guildId, _id: { $in: ruleIds }, roleId: { $in: roleIds }, active: true }).lean();
    if (!rules.length) throw new EconomyError('Você não possui cargo elegível para essa recompensa.');
    if (rules.length !== new Set(ruleIds.map(String)).size) throw new EconomyError('Uma das regras de coleta foi alterada ou removida. Atualize o comando e tente novamente.');
    if (rules.some((rule) => !isCalendarDue(rule, now))) throw new EconomyError('Essa recompensa ainda não chegou à data de coleta.');
    if (rules.length > 1 && rules.some((rule) => !rule.stackable)) throw new EconomyError('Uma ou mais recompensas só podem ser coletadas individualmente.');
    await ensureAccount(guildId, userId);
    const fragments = rules.reduce((sum, rule) => sum + rule.fragments, 0);
    const orbDelta = {};
    for (const rule of rules) if (rule.orbType && rule.orbAmount) orbDelta[rule.orbType] = (orbDelta[rule.orbType] || 0) + rule.orbAmount;
    const inc = { wallet: fragments };
    for (const [type, amount] of Object.entries(orbDelta)) inc['orbs.' + type] = amount;
    const orbBounds = Object.fromEntries(Object.entries(orbDelta).map(([type, amount]) => ['orbs.' + type, { $lte: MAX_BALANCE - amount }]));
    const claims = rules.map((rule) => ({
      _id: new mongoose.Types.ObjectId(), guildId, userId, ruleId: rule._id,
      periodKey: periodKey(rule, now), collectedAt: new Date(now),
    }));
    try {
      await EconomyClaim.insertMany(claims, { ordered: true });
    } catch (error) {
      await EconomyClaim.deleteMany({ _id: { $in: claims.map((claim) => claim._id) } }).catch((cleanupError) => {
        logger.error('Falha ao limpar reivindicações parciais (' + errorDetails(cleanupError) + ').');
      });
      if (error?.code === 11000 || error?.writeErrors?.some((entry) => entry.code === 11000)) {
        throw new EconomyError('Uma ou mais recompensas já foram coletadas neste período.');
      }
      throw error;
    }
    const account = await EconomyAccount.findOneAndUpdate(
      { guildId, userId, wallet: { $lte: MAX_BALANCE - fragments }, ...orbBounds },
      { $inc: inc },
      { returnDocument: 'after' },
    );
    if (!account) {
      await EconomyClaim.deleteMany({ _id: { $in: claims.map((claim) => claim._id) } });
      throw new EconomyError('O limite de saldo impede creditar essa recompensa.');
    }
    await auditRecord({ guildId, actorId: userId, userId, operation: 'collect_role_reward', currency: 'mixed', amount: fragments, walletDelta: fragments, orbDelta, details: { ruleIds: rules.map((rule) => String(rule._id)), collectedAt: new Date(now) } });
    return { account: account.toObject ? account.toObject() : account, rules, fragments, orbDelta };
  });
}

async function listTransactions(guildId, userId, limit = 25, page = 0) {
  const size = Math.min(100, Math.max(1, limit));
  return EconomyTransaction.find({ guildId, ...(userId ? { userId } : {}) }).sort({ createdAt: -1 }).skip(Math.max(0, page) * size).limit(size).lean();
}

async function deleteCatalogItem({ guildId, actorId, sku }) {
  return runStandaloneOperation(async () => {
    const item = await EconomyItem.findOneAndUpdate(
      { guildId, sku: String(sku).toLowerCase(), deletedAt: null },
      { $set: { active: false, deletedAt: new Date(), updatedBy: actorId } },
      { returnDocument: 'after' },
    );
    if (!item) throw new EconomyError('Item não encontrado ou já removido.');
    await auditRecord({ guildId, actorId, userId: actorId, operation: 'admin_item_delete', currency: 'item', itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item) });
    return item;
  });
}

module.exports = {
  runStandaloneOperation, ensureAccount, getAccount, getSettings, adjustFragments, adjustOrbs, bankTransfer,
  convertOrbes, claimWork, claimDaily, itemAvailability, itemSnapshot, buyItem, getStoreItem, getStorePage,
  listInventory, useInventoryItem, deliverItem, removeInventoryItems, getClaimableRules,
  claimCollectRules, listTransactions, deleteCatalogItem,
};
