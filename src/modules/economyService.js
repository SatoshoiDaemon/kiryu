const crypto = require('node:crypto');
const mongoose = require('mongoose');
const {
  EconomyAccount, EconomyItem, EconomyInventory, EconomyTransaction, EconomySettings,
  EconomyCollectRule, EconomyClaim, EconomyOperation, MarketListing, TradeSession, Auction, GameSession,
} = require('../database');
const {
  ORB_TYPES, EconomyError, assertAmount, orbConversion, remainingMs, formatDuration, periodKey, isCalendarDue, dailyCycle,
} = require('./economyUtils');

const logger = require('../logger');
const { errorDetails } = require('./errorDetails');
const { resolveInstantGame } = require('./casinoGames');

const MAX_BALANCE = Number.MAX_SAFE_INTEGER;

async function runStandaloneOperation(task) {
  return task();
}

async function ensureAccount(guildId, userId) {
  const settings = await getSettings(guildId);
  const walletLimit = Math.max(0, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE));
  const bankLimit = Math.max(0, Math.min(MAX_BALANCE, Number(settings?.economy?.bankLimit) || MAX_BALANCE));
  const initialWallet = Math.max(0, Math.min(walletLimit, Number(settings?.economy?.initialWallet) || 0));
  const initialBank = Math.max(0, Math.min(bankLimit, Number(settings?.economy?.initialBank) || 0));
  try {
    return await EconomyAccount.findOneAndUpdate(
      { guildId, userId },
      { $setOnInsert: { guildId, userId, wallet: initialWallet, bank: initialBank, orbs: { green: 0, blue: 0, orange: 0, red: 0, black: 0, gold: 0 } } },
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
  // New fields use additive schema defaults. Never rewrite configured reward
  // ranges here: older settings may contain operator-managed values without
  // the newer migration marker.
  return settings;
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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

async function getOrCreateEconomicOperation({ operationId, guildId, kind, request, execution }) {
  if (!EconomyOperation) return { operation: null, execution, resumed: false };
  const id = String(operationId || crypto.randomUUID()).slice(0, 160);
  let operation = await EconomyOperation.findById(id);
  if (operation) {
    const value = operation.toObject ? operation.toObject() : operation;
    if (value.kind !== kind || JSON.stringify(canonical(value.payload?.request)) !== JSON.stringify(canonical(request))) {
      throw new EconomyError('Esta interação já foi associada a outra operação econômica.');
    }
    return { operation: value, execution: value.payload, resumed: true };
  }
  try {
    operation = await EconomyOperation.create({ _id: id, guildId, kind, state: 'pending', step: 'created', payload: { request, ...execution } });
    return { operation: operation.toObject ? operation.toObject() : operation, execution: operation.payload || { request, ...execution }, resumed: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    operation = await EconomyOperation.findById(id);
    const value = operation?.toObject ? operation.toObject() : operation;
    if (!value || value.kind !== kind || JSON.stringify(canonical(value.payload?.request)) !== JSON.stringify(canonical(request))) throw error;
    return { operation: value, execution: value.payload, resumed: true };
  }
}

async function applyAccountMutation({ guildId, userId, operationKey, inc = {}, set = {}, guards = {}, pipeline = null }) {
  await ensureAccount(guildId, userId);
  const query = { guildId, userId, recentOperationKeys: { $ne: operationKey }, ...guards };
  const update = pipeline ? [...pipeline, { $set: { recentOperationKeys: { $setUnion: [{ $ifNull: ['$recentOperationKeys', []] }, [operationKey]] } } }]
    : { $inc: inc, $addToSet: { recentOperationKeys: operationKey } };
  if (!pipeline && Object.keys(set).length) update.$set = set;
  const account = await EconomyAccount.findOneAndUpdate(query, update, { returnDocument: 'after' });
  if (account) return { account: account.toObject ? account.toObject() : account, duplicate: false };
  const previous = await EconomyAccount.findOne({ guildId, userId, recentOperationKeys: operationKey });
  if (previous) return { account: previous.toObject ? previous.toObject() : previous, duplicate: true };
  return null;
}

async function clearEconomicOperationMarkers(operation, execution) {
  const keys = (execution?.legs || []).map((_, index) => operation._id + ':leg:' + index)
    .concat(operation._id + ':compensation');
  if (keys.length && EconomyAccount?.updateMany) {
    await EconomyAccount.updateMany({ recentOperationKeys: { $in: keys } }, { $pull: { recentOperationKeys: { $in: keys } } }).catch(() => {});
  }
}

async function resumeEconomicOperation(operation, execution = operation?.payload) {
  if (!operation) throw new EconomyError('A operação econômica não foi localizada para recuperação.');
  if (operation.state === 'completed') {
    await clearEconomicOperationMarkers(operation, execution);
    return { duplicate: true, result: operation.result || execution?.result };
  }
  if (operation.state === 'cancelled') {
    await clearEconomicOperationMarkers(operation, execution);
    throw new EconomyError(execution?.failure || 'A operação econômica não foi concluída.');
  }
  if (operation.state !== 'pending') throw new EconomyError('A operação econômica aguarda revisão da equipe.');
  const applied = [];
  for (let index = 0; index < (execution?.legs || []).length; index += 1) {
    const leg = execution.legs[index];
    const result = await applyAccountMutation({
      guildId: operation.guildId,
      userId: leg.userId,
      operationKey: operation._id + ':leg:' + index,
      inc: leg.inc,
      set: leg.set || {},
      guards: leg.guards || {},
      pipeline: leg.pipeline || null,
    });
    if (!result) {
      if (index === 0) {
        const message = leg.failure || 'Saldo insuficiente para concluir essa operação.';
        await EconomyOperation.updateOne({ _id: operation._id, state: 'pending' }, { $set: { state: 'cancelled', step: 'cancelled', 'payload.failure': message } });
        throw new EconomyError(message);
      }
      const compensation = execution.compensation;
      if (compensation) {
        const rollback = await applyAccountMutation({
          guildId: operation.guildId,
          userId: compensation.userId,
          operationKey: operation._id + ':compensation',
          inc: compensation.inc,
          guards: compensation.guards || {},
        });
        if (!rollback) {
          await EconomyOperation.updateOne({ _id: operation._id, state: 'pending' }, { $set: { state: 'manual_review', step: 'compensation_failed' } });
          throw new EconomyError('A operação precisa de revisão da equipe; nenhum outro saldo deve ser movimentado.');
        }
      }
      const message = leg.failure || 'A operação não pôde ser liquidada; o valor foi devolvido.';
      await EconomyOperation.updateOne({ _id: operation._id, state: 'pending' }, { $set: { state: 'cancelled', step: 'compensated', 'payload.failure': message } });
      await clearEconomicOperationMarkers(operation, execution);
      throw new EconomyError(message);
    }
    applied.push(result.account);
    await EconomyOperation.updateOne({ _id: operation._id, state: 'pending' }, { $set: { step: 'leg_' + (index + 1) } });
  }
  for (let index = 0; index < (execution?.transactions || []).length; index += 1) {
    const transaction = execution.transactions[index];
    const key = operation._id + ':transaction:' + index;
    await EconomyTransaction.updateOne({ idempotencyKey: key }, { $setOnInsert: { ...transaction, idempotencyKey: key } }, { upsert: true });
  }
  await EconomyOperation.updateOne({ _id: operation._id, state: 'pending' }, { $set: { state: 'completed', step: 'completed', result: execution.result || null } });
  await clearEconomicOperationMarkers(operation, execution);
  return { duplicate: false, result: execution.result, accounts: applied };
}

function economyLimits(settings) {
  return {
    wallet: Math.max(0, Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE)),
    bank: Math.max(0, Math.min(MAX_BALANCE, Number(settings?.economy?.bankLimit) || MAX_BALANCE)),
  };
}

function walletCapacityGuard(limit, credit = 0) {
  return { $expr: { $lte: [
    { $add: [{ $ifNull: ['$wallet', 0] }, { $ifNull: ['$casinoReservedPayout', 0] }, Number(credit || 0)] },
    Number(limit),
  ] } };
}

function assertCasinoChannel(settings, channelId) {
  const allowed = settings?.casino?.allowedChannelIds || [];
  if (allowed.length && !allowed.includes(String(channelId || ''))) throw new EconomyError('O cassino só está disponível nos canais configurados pela equipe.');
}

async function runEconomicOperation(input) {
  const prepared = await getOrCreateEconomicOperation(input);
  if (!prepared.operation) return { ...(await input.fallback()) };
  return resumeEconomicOperation(prepared.operation, prepared.execution);
}

async function replayPendingEconomicOperations({ limit = 100 } = {}) {
  if (!EconomyOperation) return { recovered: 0, pending: 0 };
  const operations = await EconomyOperation.find({ state: 'pending' }).sort({ updatedAt: 1 }).limit(limit).lean();
  let recovered = 0;
  for (const operation of operations) {
    try {
      await resumeEconomicOperation(operation, operation.payload);
      recovered += 1;
    } catch (error) {
      if (!(error instanceof EconomyError)) logger.warn('Operação econômica pendente (' + operation.kind + ') aguarda recuperação (' + errorDetails(error) + ').');
    }
  }
  return { recovered, pending: operations.length - recovered };
}

function amountInc(path, amount) {
  return { $inc: { [path]: amount } };
}

async function adjustFragments({ guildId, actorId, userId, amount, operation = 'admin_fragments_add', mode = 'add', accountType = 'wallet', interactionId = null }) {
  assertAmount(amount, 'Quantidade', { min: mode === 'set' ? 0 : 1 });
  if (!['add', 'remove', 'set'].includes(mode)) throw new RangeError('Operação monetária inválida.');
  if (!['wallet', 'bank'].includes(accountType)) throw new RangeError('Conta de Fragmentos inválida.');
  await ensureAccount(guildId, userId);
  const limits = economyLimits(await getSettings(guildId));
  const previous = mode === 'set' ? await EconomyAccount.findOne({ guildId, userId }).lean() : null;
  const balancePath = accountType;
  if (interactionId && EconomyOperation?.findById && EconomyOperation?.create) {
    const delta = mode === 'set' ? amount - Number(previous?.[balancePath] || 0) : mode === 'add' ? amount : -amount;
    const guards = mode === 'add' ? { [balancePath]: { $lte: limits[accountType] - amount }, ...(accountType === 'wallet' ? walletCapacityGuard(limits.wallet, amount) : {}) }
      : mode === 'remove' ? { [balancePath]: { $gte: amount } }
        : { [balancePath]: { $eq: Number(previous?.[balancePath] || 0) }, ...(accountType === 'wallet' ? { $expr: { $lte: [{ $ifNull: ['$casinoReservedPayout', 0] }, limits.wallet - amount] } } : {}) };
    const result = await runEconomicOperation({
      operationId: 'admin:' + interactionId + ':' + userId,
      guildId,
      kind: 'admin_balance_adjustment',
      request: { actorId, userId, amount, mode, accountType, operation },
      execution: {
        legs: [{ userId, inc: mode === 'set' ? {} : { [balancePath]: delta }, set: mode === 'set' ? { [balancePath]: amount } : {}, guards,
          failure: mode === 'remove' ? 'O usuário não possui Fragmentos suficientes nessa conta.' : mode === 'set' ? 'O saldo mudou durante o ajuste; atualize e tente novamente.' : 'O saldo máximo permitido seria ultrapassado.' }],
        transactions: [{ guildId, actorId, userId, operation, currency: 'fragments', amount, walletDelta: accountType === 'wallet' ? delta : 0, bankDelta: accountType === 'bank' ? delta : 0,
          details: { mode, accountType, previous: Number(previous?.[balancePath] || 0), result: mode === 'set' ? amount : Number(previous?.[balancePath] || 0) + delta } }],
        result: { userId, mode, accountType, amount },
      },
    });
    return result.accounts?.[0] || getAccount(guildId, userId);
  }
  const query = { guildId, userId };
  const update = mode === 'set' ? { $set: { [balancePath]: amount } } : amountInc(balancePath, mode === 'add' ? amount : -amount);
  if (mode === 'set' && amount > limits[accountType]) throw new EconomyError('O saldo definido supera o limite configurado para essa conta.');
  if (mode === 'add') {
    query[balancePath] = { $lte: limits[accountType] - amount };
    if (accountType === 'wallet') Object.assign(query, walletCapacityGuard(limits.wallet, amount));
  }
  if (mode === 'remove') query[balancePath] = { $gte: amount };
  if (mode === 'set' && accountType === 'wallet') query.$expr = { $lte: [{ $ifNull: ['$casinoReservedPayout', 0] }, limits.wallet - amount] };
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

async function bankTransfer({ guildId, userId, amount, direction, interactionId = null }) {
  assertAmount(amount, 'Quantidade');
  if (!['deposit', 'withdraw'].includes(direction)) throw new RangeError('Operação bancária inválida.');
  if (EconomyOperation?.findById && EconomyOperation?.create) {
    const settings = await getSettings(guildId);
    const limits = economyLimits(settings);
    const deposit = direction === 'deposit';
    const movement = deposit ? 'bank_deposit' : 'bank_withdraw';
    const operation = await runEconomicOperation({
      operationId: 'bank:' + (interactionId || crypto.randomUUID()), guildId, kind: movement,
      request: { userId, amount, direction },
      execution: {
        legs: [{ userId, inc: { wallet: deposit ? -amount : amount, bank: deposit ? amount : -amount }, guards: deposit
          ? { wallet: { $gte: amount }, bank: { $lte: limits.bank - amount } }
          : { bank: { $gte: amount }, wallet: { $lte: limits.wallet - amount }, ...walletCapacityGuard(limits.wallet, amount) }, failure: deposit ? 'Saldo insuficiente na carteira ou limite do banco atingido.' : 'Saldo insuficiente no banco ou limite da carteira atingido.' }],
        transactions: [{ guildId, actorId: userId, userId, operation: movement, currency: 'fragments', amount,
          walletDelta: deposit ? -amount : amount, bankDelta: deposit ? amount : -amount }],
        result: { userId, amount, direction },
      },
    });
    if (operation.accounts?.[0]) return operation.accounts[0];
    return getAccount(guildId, userId);
  }
  await ensureAccount(guildId, userId);
  const settings = await getSettings(guildId);
  const limits = economyLimits(settings);
  const deposit = direction === 'deposit';
  const query = { guildId, userId };
  if (deposit) {
    query.wallet = { $gte: amount };
    query.bank = { $lte: limits.bank - amount };
  } else {
    query.bank = { $gte: amount };
    query.wallet = { $lte: limits.wallet - amount };
    Object.assign(query, walletCapacityGuard(limits.wallet, amount));
  }
  const account = await EconomyAccount.findOneAndUpdate(query, {
    $inc: { wallet: deposit ? -amount : amount, bank: deposit ? amount : -amount },
  }, { returnDocument: 'after' });
  if (!account) throw new EconomyError(deposit ? 'Saldo insuficiente na carteira ou limite do banco atingido.' : 'Saldo insuficiente no banco ou limite da carteira atingido.');
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: deposit ? 'bank_deposit' : 'bank_withdraw', currency: 'fragments', amount, walletDelta: deposit ? -amount : amount, bankDelta: deposit ? amount : -amount });
  return account.toObject ? account.toObject() : account;
}

async function transferFragments({ guildId, senderId, recipientId, amount, interactionId = null }) {
  assertAmount(amount, 'Quantidade');
  if (!recipientId || senderId === recipientId) throw new EconomyError('Escolha outra pessoa para receber os Fragmentos.');
  if (EconomyOperation?.findById && EconomyOperation?.create) {
    const settings = await getSettings(guildId);
    const limits = economyLimits(settings);
    const result = await runEconomicOperation({
      operationId: 'transfer:' + (interactionId || crypto.randomUUID()), guildId, kind: 'member_transfer',
      request: { senderId, recipientId, amount },
      execution: {
        legs: [
          { userId: senderId, inc: { wallet: -amount }, guards: { wallet: { $gte: amount } }, failure: 'Sua carteira não tem Fragmentos suficientes para esse envio.' },
          { userId: recipientId, inc: { wallet: amount }, guards: { wallet: { $lte: limits.wallet - amount }, ...walletCapacityGuard(limits.wallet, amount) }, failure: 'A outra carteira atingiu o limite. Nenhum Fragmento foi enviado.' },
        ],
        compensation: { userId: senderId, inc: { wallet: amount }, guards: { wallet: { $lte: MAX_BALANCE - amount } } },
        transactions: [
          { guildId, actorId: senderId, userId: senderId, operation: 'member_transfer_out', currency: 'fragments', amount, walletDelta: -amount, details: { recipientId } },
          { guildId, actorId: senderId, userId: recipientId, operation: 'member_transfer_in', currency: 'fragments', amount, walletDelta: amount, details: { senderId } },
        ],
        result: { senderId, recipientId, amount },
      },
    });
    const accounts = result.accounts || [];
    if (accounts.length >= 2) return { sender: accounts[0], recipient: accounts[1], duplicate: Boolean(result.duplicate) };
    const [sender, recipient] = await Promise.all([getAccount(guildId, senderId), getAccount(guildId, recipientId)]);
    return { sender, recipient, duplicate: true };
  }
  const limits = economyLimits(await getSettings(guildId));
  await Promise.all([ensureAccount(guildId, senderId), ensureAccount(guildId, recipientId)]);
  const sender = await EconomyAccount.findOneAndUpdate(
    { guildId, userId: senderId, wallet: { $gte: amount } },
    { $inc: { wallet: -amount } },
    { returnDocument: 'after' },
  );
  if (!sender) throw new EconomyError('Sua carteira não tem Fragmentos suficientes para esse envio.');
  const recipient = await EconomyAccount.findOneAndUpdate(
    { guildId, userId: recipientId, wallet: { $lte: limits.wallet - amount }, ...walletCapacityGuard(limits.wallet, amount) },
    { $inc: { wallet: amount } },
    { returnDocument: 'after' },
  );
  if (!recipient) {
    const refunded = await EconomyAccount.findOneAndUpdate(
      { guildId, userId: senderId, wallet: { $lte: MAX_BALANCE - amount } },
      { $inc: { wallet: amount } },
      { returnDocument: 'after' },
    );
    if (!refunded) logger.error('Transferência interrompida e estorno pendente para ' + senderId + ' em ' + guildId + '.');
    throw new EconomyError(refunded ? 'A outra carteira atingiu o limite. Nenhum Fragmento foi enviado.' : 'A transferência precisa de revisão da equipe; guarde este aviso e chame a staff.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: senderId, userId: senderId, operation: 'member_transfer_out', currency: 'fragments', amount, walletDelta: -amount, details: { recipientId } });
  await auditAfterAccountUpdate({ guildId, actorId: senderId, userId: recipientId, operation: 'member_transfer_in', currency: 'fragments', amount, walletDelta: amount, details: { senderId } });
  return { sender: sender.toObject ? sender.toObject() : sender, recipient: recipient.toObject ? recipient.toObject() : recipient };
}

async function playCasino({ guildId, userId, game, amount, choice, numbers, random = crypto.randomInt, interactionId = null, channelId = null }) {
  const settings = await getSettings(guildId);
  const casino = settings?.casino || {};
  assertCasinoChannel(settings, channelId);
  const limits = economyLimits(settings);
  const casinoGame = game === 'coin' || game === 'coinflip' ? 'flip' : game;
  const gameSettings = casino[casinoGame] || casino.games?.[game] || { enabled: true, multiplier: game === 'slots' ? 5 : 2 };
  if (gameSettings.enabled === false) throw new EconomyError('Esse jogo está temporariamente indisponível.');
  assertAmount(amount, 'Aposta', { max: casino.maxBet || 1000000000 });
  const multiplier = gameSettings.multiplier || (game === 'slots' ? 5 : 2);
  const gameResult = resolveInstantGame({ game, bet: amount, choice, numbers, multiplier, randomInt: random });
  const now = Date.now();
  const outcome = game === 'coin' || game === 'coinflip' ? (gameResult.outcome === 'heads' ? 'cara' : 'coroa') : gameResult.outcome;
  const result = {
    outcome,
    multiplier: gameResult.details?.totalMultiplier || multiplier,
    payout: gameResult.payout,
    net: gameResult.net,
    details: gameResult.details,
    message: gameResult.net > 0 ? 'O resultado ficou do seu lado. A Kiryu paga conforme as regras publicadas.'
      : gameResult.net === 0 ? 'Empate. Sua aposta voltou inteira para a carteira.'
        : 'Desta vez a mesa ficou com a aposta. As chances permanecem iguais em todas as partidas.',
  };
  const ledgerGame = game === 'coinflip' ? 'coin' : game;
  const transaction = { guildId, actorId: userId, userId, operation: 'casino_' + ledgerGame, currency: 'fragments', amount, walletDelta: result.net, details: { choice, numbers, outcome: result.outcome, net: result.net, payout: result.payout, game: result.details } };
  if (EconomyOperation?.findById && EconomyOperation?.create) {
    const loss = Math.max(0, -result.net);
    const dayKey = dailyCycle(now).dayKey;
    const checks = [];
    if (casino.cooldownMs > 0) checks.push({ $or: [
      { lastCasinoAt: null }, { lastCasinoAt: { $exists: false } },
      { lastCasinoAt: { $lte: new Date(now - casino.cooldownMs) } },
    ] });
    if (loss && casino.dailyLossLimit > 0) checks.push({ $or: [
      { casinoLossDay: { $ne: dayKey } },
      { $expr: { $lte: [{ $add: [{ $ifNull: ['$casinoLossToday', 0] }, loss] }, casino.dailyLossLimit] } },
    ] });
    const setStage = { wallet: { $add: [{ $ifNull: ['$wallet', 0] }, result.net] }, lastCasinoAt: new Date(now) };
    if (loss) {
      setStage.casinoLossDay = dayKey;
      setStage.casinoLossToday = { $cond: [
        { $eq: ['$casinoLossDay', dayKey] },
        { $add: [{ $ifNull: ['$casinoLossToday', 0] }, loss] },
        loss,
      ] };
    }
    const key = 'casino:' + (interactionId || crypto.randomUUID());
    const committed = await runEconomicOperation({
      operationId: key, guildId, kind: 'casino_game',
      request: { userId, game, amount, choice, numbers: numbers || null },
      execution: {
        legs: [{ userId, guards: {
          wallet: { $gte: amount, ...(result.net > 0 ? { $lte: limits.wallet - result.net } : {}) },
          activeCasinoSessionId: { $in: [null, ''] },
          ...(result.net > 0 ? walletCapacityGuard(limits.wallet, result.net) : {}),
          ...(checks.length ? { $and: checks } : {}),
        }, pipeline: [{ $set: {
          wallet: setStage.wallet,
          recentOperationKeys: { $setUnion: [{ $ifNull: ['$recentOperationKeys', []] }, [key + ':leg:0']] },
          lastCasinoAt: setStage.lastCasinoAt,
          ...(loss ? { casinoLossDay: dayKey, casinoLossToday: setStage.casinoLossToday } : {}),
        } }], failure: 'Confira a carteira, o limite diário de perdas e o intervalo entre partidas.' }],
        transactions: [transaction],
        result: { ...result, amount },
      },
    });
    const saved = committed.result || result;
    const account = committed.accounts?.[0] || await getAccount(guildId, userId);
    return { ...saved, amount, account, duplicate: Boolean(committed.duplicate) };
  }
  await ensureAccount(guildId, userId);
  const query = { guildId, userId, wallet: { $gte: amount }, activeCasinoSessionId: { $in: [null, ''] } };
  if (result.net > 0) query.wallet.$lte = limits.wallet - result.net;
  const account = await EconomyAccount.findOneAndUpdate(query, { $inc: { wallet: result.net } }, { returnDocument: 'after' });
  if (!account) throw new EconomyError('A aposta precisa caber na sua carteira atual. Confira seu saldo e tente novamente.');
  await auditAfterAccountUpdate(transaction);
  return { ...result, amount, account: account.toObject ? account.toObject() : account };
}

async function convertOrbes({ guildId, userId, source, amount, actorId = userId }) {
  const settings = await getSettings(guildId);
  const conversion = orbConversion(source, amount, settings.orbs?.conversionRate || 10);
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
  if (settings.work?.enabled === false) throw new EconomyError('O trabalho está pausado pela equipe.');
  const reward = random(settings.work.min, settings.work.max + 1);
  const limits = economyLimits(settings);
  await ensureAccount(guildId, userId);
  const cutoff = new Date(now - settings.work.cooldownMs);
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, $or: [{ lastWorkAt: null }, { lastWorkAt: { $exists: false } }, { lastWorkAt: { $lte: cutoff } }], wallet: { $lte: limits.wallet - reward }, ...walletCapacityGuard(limits.wallet, reward) },
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

async function claimAdventure({ guildId, userId, now = Date.now(), random = crypto.randomInt }) {
  const settings = await getSettings(guildId);
  const rule = settings?.adventure || { enabled: true, min: 80, max: 800, cooldownMs: 7200000 };
  if (rule.enabled === false) throw new EconomyError('As expedições estão pausadas pela equipe.');
  assertAmount(rule.min, 'Recompensa mínima da expedição', { min: 0 });
  assertAmount(rule.max, 'Recompensa máxima da expedição', { min: 0 });
  if (rule.min > rule.max) throw new EconomyError('As recompensas de expedição precisam de revisão da equipe.');
  const reward = random(rule.min, rule.max + 1);
  await ensureAccount(guildId, userId);
  const cutoff = new Date(now - rule.cooldownMs);
  const walletLimit = Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE);
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, $or: [{ lastAdventureAt: null }, { lastAdventureAt: { $exists: false } }, { lastAdventureAt: { $lte: cutoff } }], wallet: { $lte: walletLimit - reward }, ...walletCapacityGuard(walletLimit, reward) },
    { $inc: { wallet: reward }, $set: { lastAdventureAt: new Date(now) } },
    { returnDocument: 'after' },
  );
  if (!account) {
    const current = await EconomyAccount.findOne({ guildId, userId });
    const wait = remainingMs(current?.lastAdventureAt, rule.cooldownMs, now);
    if (wait) throw new EconomyError('A trilha abre de novo em **' + formatDuration(wait) + '**.', { remainingMs: wait });
    throw new EconomyError('O limite de saldo impede receber essa recompensa.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: 'adventure_reward', currency: 'fragments', amount: reward, walletDelta: reward, details: { collectedAt: new Date(now) } });
  return { account: account.toObject ? account.toObject() : account, reward, settings };
}

async function claimCrime({ guildId, userId, now = Date.now(), random = crypto.randomInt }) {
  const settings = await getSettings(guildId);
  const rule = settings?.crime || { enabled: true, min: 100, max: 1200, fineMin: 50, fineMax: 400, failChancePercent: 35, cooldownMs: 10800000 };
  if (rule.enabled === false) throw new EconomyError('Essa atividade está suspensa pela equipe.');
  const failed = random(0, 100) < rule.failChancePercent;
  const amount = failed ? random(rule.fineMin, rule.fineMax + 1) : random(rule.min, rule.max + 1);
  await ensureAccount(guildId, userId);
  const current = await EconomyAccount.findOne({ guildId, userId }).lean();
  const fine = failed ? Math.min(amount, Number(current?.wallet || 0)) : amount;
  const delta = failed ? -fine : amount;
  const cutoff = new Date(now - rule.cooldownMs);
  const walletLimit = Math.min(MAX_BALANCE, Number(settings?.economy?.walletLimit) || MAX_BALANCE);
  const account = await EconomyAccount.findOneAndUpdate(
    {
      guildId, userId,
      $or: [{ lastCrimeAt: null }, { lastCrimeAt: { $exists: false } }, { lastCrimeAt: { $lte: cutoff } }],
      wallet: failed ? { $gte: fine } : { $lte: walletLimit - amount },
      ...(!failed ? walletCapacityGuard(walletLimit, amount) : {}),
    },
    { $inc: { wallet: delta }, $set: { lastCrimeAt: new Date(now) } },
    { returnDocument: 'after' },
  );
  if (!account) {
    const latest = await EconomyAccount.findOne({ guildId, userId });
    const wait = remainingMs(latest?.lastCrimeAt, rule.cooldownMs, now);
    if (wait) throw new EconomyError('A Kiryu recomenda deixar a poeira baixar por **' + formatDuration(wait) + '**.', { remainingMs: wait });
    throw new EconomyError('O limite de saldo impede concluir esse resultado.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: failed ? 'crime_failed' : 'crime_reward', currency: 'fragments', amount: failed ? fine : amount, walletDelta: delta, details: { success: !failed, collectedAt: new Date(now) } });
  return { account: account.toObject ? account.toObject() : account, success: !failed, reward: failed ? 0 : amount, fine: failed ? fine : 0, settings };
}

async function claimPassiveIncome({ guildId, userId, now = Date.now() }) {
  const settings = await getSettings(guildId);
  const rule = settings?.passiveIncome || {};
  const reward = Number(rule.amount) || 0;
  if (rule.enabled !== true || reward < 1) throw new EconomyError('A renda passiva está desativada pela equipe.');
  const intervalMs = Math.max(3600000, Number(rule.intervalMs) || 86400000);
  const limits = economyLimits(settings);
  await ensureAccount(guildId, userId);
  const cutoff = new Date(now - intervalMs);
  const account = await EconomyAccount.findOneAndUpdate({
    guildId, userId,
    $or: [{ lastPassiveAt: null }, { lastPassiveAt: { $exists: false } }, { lastPassiveAt: { $lte: cutoff } }],
    wallet: { $lte: limits.wallet - reward },
    ...walletCapacityGuard(limits.wallet, reward),
  }, { $inc: { wallet: reward }, $set: { lastPassiveAt: new Date(now) } }, { returnDocument: 'after' });
  if (!account) {
    const current = await EconomyAccount.findOne({ guildId, userId });
    const wait = remainingMs(current?.lastPassiveAt, intervalMs, now);
    if (wait) throw new EconomyError('Sua renda passiva ficará disponível em **' + formatDuration(wait) + '**.', { remainingMs: wait });
    throw new EconomyError('O limite de saldo impede receber essa renda passiva.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: 'passive_income', currency: 'fragments', amount: reward, walletDelta: reward });
  return { account: account.toObject ? account.toObject() : account, reward, intervalMs };
}

async function claimDaily({ guildId, userId, now = Date.now(), random = crypto.randomInt }) {
  const settings = await getSettings(guildId);
  if (settings.daily?.enabled === false) throw new EconomyError('O daily está temporariamente pausado pela equipe.');
  const current = await ensureAccount(guildId, userId);
  const { dayKey, nextResetAt } = dailyCycle(now);
  // Preserve a claim made before the calendar-key migration if it happened
  // earlier today; legacy timestamps remain available for history.
  if (!current?.dailyClaimDay && current?.lastDailyAt && dailyCycle(current.lastDailyAt).dayKey === dayKey) {
    await EconomyAccount.findOneAndUpdate(
      { guildId, userId, dailyClaimDay: null },
      { $set: { dailyClaimDay: dayKey } },
      { returnDocument: 'after' },
    );
  }
  const ranges = settings.daily.rewardRanges;
  const fragments = random(ranges.fragments.min, ranges.fragments.max + 1);
  const orbs = Object.fromEntries(ORB_TYPES.map((type) => {
    const range = ranges.orbs[type];
    return [type, random(range.min, range.max + 1)];
  }));
  const update = { $set: { lastDailyAt: new Date(now), dailyClaimDay: dayKey }, $inc: { wallet: fragments } };
  const orbDelta = {};
  for (const [type, amount] of Object.entries(orbs)) {
    if (amount) {
      update.$inc['orbs.' + type] = amount;
      orbDelta[type] = amount;
    }
  }
  const orbBounds = Object.fromEntries(ORB_TYPES.filter((type) => orbs[type]).map((type) => ['orbs.' + type, { $lte: MAX_BALANCE - orbs[type] }]));
  const limits = economyLimits(settings);
  const account = await EconomyAccount.findOneAndUpdate(
    { guildId, userId, dailyClaimDay: { $ne: dayKey }, wallet: { $lte: limits.wallet - fragments }, ...walletCapacityGuard(limits.wallet, fragments), ...orbBounds },
    update,
    { returnDocument: 'after' },
  );
  if (!account) {
    const current = await EconomyAccount.findOne({ guildId, userId });
    if (current?.dailyClaimDay === dayKey) {
      throw new EconomyError('Hoje você já pegou sua recompensa. A Kiryu libera a próxima <t:' + Math.floor(nextResetAt.getTime() / 1000) + ':R>.', { nextResetAt, dayKey });
    }
    throw new EconomyError('Não foi possível creditar a recompensa por causa do limite de saldo.');
  }
  await auditAfterAccountUpdate({ guildId, actorId: userId, userId, operation: 'daily_reward', currency: 'mixed', amount: fragments, walletDelta: fragments, orbDelta, details: { lastCollectedAt: new Date(now) } });
  return { account: account.toObject ? account.toObject() : account, fragments, orbs, collectedAt: new Date(now), dayKey, nextResetAt };
}

function itemSnapshot(item, selectedChoice = item.selectedChoice || null) {
  return {
    name: item.name,
    emoji: item.emoji || '📦',
    thumbnailUrl: item.thumbnailUrl || '',
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

async function addInventoryEntry({ guildId, userId, item, quantity, deliveryId = null }) {
  const snapshot = itemSnapshot(item);
  if (deliveryId && snapshot.stackable) {
    const slot = snapshot.selectedChoice ? 'choice:' + snapshot.selectedChoice.value : 'stack';
    const filter = { guildId, userId, itemId: item._id, slot, deliveryIds: { $ne: String(deliveryId) }, quantity: { $lte: MAX_BALANCE - quantity } };
    try {
      const updated = await EconomyInventory.findOneAndUpdate(filter, {
        $inc: { quantity }, $addToSet: { deliveryIds: String(deliveryId) },
        $setOnInsert: { guildId, userId, itemId: item._id, sku: item.sku, slot, itemSnapshot: snapshot },
      }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false });
      return updated;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const duplicate = await EconomyInventory.findOne({ guildId, userId, itemId: item._id, slot, deliveryIds: String(deliveryId) }).lean();
      if (duplicate) return duplicate;
      throw error;
    }
  }
  if (deliveryId && !snapshot.stackable) {
    const entries = [];
    for (let index = 0; index < quantity; index += 1) {
      const slot = 'delivery:' + String(deliveryId) + ':' + index;
      const filter = { guildId, userId, itemId: item._id, slot };
      try {
        entries.push(await EconomyInventory.findOneAndUpdate(filter, {
          $setOnInsert: { guildId, userId, itemId: item._id, sku: item.sku, slot, quantity: 1, itemSnapshot: snapshot, deliveryIds: [String(deliveryId)] },
        }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false }));
      } catch (error) {
        if (error?.code !== 11000) throw error;
        entries.push(await EconomyInventory.findOne(filter).lean());
      }
    }
    return entries;
  }
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
    const settings = await getSettings(accountQuery.guildId);
    const limits = economyLimits(settings);
    const account = await EconomyAccount.findOneAndUpdate({ ...accountQuery, wallet: { $lte: limits.wallet - amount }, ...walletCapacityGuard(limits.wallet, amount) }, { $inc: { wallet: amount } }, { returnDocument: 'after' });
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

async function buyItem({ guildId, userId, itemId, purchaseChoice = null, units = 1, now = new Date(), interactionId = null }) {
  assertAmount(units, 'Unidades por compra', { min: 1, max: 10 });
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
    const quantity = item.purchaseQuantity * units;
    if (!Number.isSafeInteger(quantity)) throw new EconomyError('A quantidade total excede o limite seguro.');
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
        details: { quantity, units, delivery: toInventory ? 'inventory' : 'immediate', action: item.action, actionAmount: item.actionAmount, purchaseChoice: selectedChoice }, idempotencyKey: interactionId,
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

async function listInventory(guildId, userId, { page = 0, pageSize = 5, filter = 'all' } = {}) {
  const query = { guildId, userId, quantity: { $gt: 0 }, 'itemSnapshot.inventoryVisible': { $ne: false } };
  if (filter === 'usable') query['itemSnapshot.usable'] = true;
  else if (filter === 'persistent') query['itemSnapshot.consumeOnUse'] = false;
  else if (filter === 'not_usable') query['itemSnapshot.usable'] = false;
  const total = await EconomyInventory.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(0, page), pages - 1);
  const items = await EconomyInventory.find(query).sort({ updatedAt: -1, _id: 1 }).skip(currentPage * pageSize).limit(pageSize).lean();
  return { items, total, page: currentPage, pageSize, pages, filter };
}

async function useInventoryItem({ guildId, userId, sku, inventoryId = null, now = new Date() }) {
  await ensureAccount(guildId, userId);
  return runStandaloneOperation(async () => {
    const query = inventoryId ? { guildId, userId, _id: inventoryId, quantity: { $gt: 0 } } : { guildId, userId, sku, quantity: { $gt: 0 } };
    const entryQuery = EconomyInventory.findOne(query);
    if (!inventoryId && entryQuery.sort) entryQuery.sort({ slot: 1 });
    const entry = await (entryQuery.lean ? entryQuery.lean() : entryQuery);
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
    const settings = await getSettings(guildId);
    const limits = economyLimits(settings);
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
      { guildId, userId, wallet: { $lte: limits.wallet - fragments }, ...walletCapacityGuard(limits.wallet, fragments), ...orbBounds },
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

async function getMoneyLeaderboard(guildId, category = 'wealth', limit = 10) {
  if (!['wallet', 'bank', 'wealth'].includes(category)) throw new RangeError('Categoria de ranking inválida.');
  const size = Math.max(1, Math.min(25, Number(limit) || 10));
  const score = category === 'wealth' ? { $add: [{ $ifNull: ['$wallet', 0] }, { $ifNull: ['$bank', 0] }] } : '$' + category;
  return EconomyAccount.aggregate([
    { $match: { guildId } },
    { $project: { userId: 1, wallet: { $ifNull: ['$wallet', 0] }, bank: { $ifNull: ['$bank', 0] }, score } },
    { $sort: { score: -1, userId: 1 } },
    { $limit: size },
  ]);
}

async function adjustRoleFragments({ guildId, actorId, memberIds, amount, mode, accountType = 'wallet', interactionId = null }) {
  if (!['add', 'remove'].includes(mode)) throw new RangeError('Operação em massa inválida.');
  assertAmount(amount, 'Quantidade');
  const uniqueIds = [...new Set((memberIds || []).map(String))];
  if (!uniqueIds.length) throw new EconomyError('Esse cargo não possui membros para ajustar.');
  let succeeded = 0;
  let failed = 0;
  const failures = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 10) {
    const results = await Promise.allSettled(uniqueIds.slice(offset, offset + 10).map((userId) => adjustFragments({
      guildId, actorId, userId, amount, mode, accountType, operation: 'admin_fragments_' + mode + '_role',
      interactionId: interactionId ? interactionId + ':' + userId : null,
    })));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') succeeded += 1;
      else {
        failed += 1;
        failures.push({ userId: uniqueIds[offset + index], message: result.reason?.publicMessage || result.reason?.message || 'falha' });
      }
    });
  }
  return { total: uniqueIds.length, succeeded, failed, failures: failures.slice(0, 10) };
}

async function getEconomicAudit(guildId, { limit = 20 } = {}) {
  const settings = await getSettings(guildId);
  const limits = economyLimits(settings);
  const [accountCount, walletTotals, bankTotals, invalidAccounts, unresolved, recentTransactions, manualListings, manualTrades, manualAuctions, manualSessions] = await Promise.all([
    EconomyAccount.countDocuments({ guildId }),
    EconomyAccount.aggregate([{ $match: { guildId } }, { $group: { _id: null, total: { $sum: '$wallet' }, minimum: { $min: '$wallet' }, maximum: { $max: '$wallet' } } }]),
    EconomyAccount.aggregate([{ $match: { guildId } }, { $group: { _id: null, total: { $sum: '$bank' }, minimum: { $min: '$bank' }, maximum: { $max: '$bank' } } }]),
    EconomyAccount.find({ guildId, $or: [
      { wallet: { $lt: 0 } }, { bank: { $lt: 0 } }, { wallet: { $gt: limits.wallet } }, { bank: { $gt: limits.bank } },
    ] }).select('userId wallet bank').limit(25).lean(),
    EconomyOperation.find({ guildId, state: { $in: ['pending', 'manual_review'] } }).sort({ updatedAt: 1 }).limit(limit).lean(),
    EconomyTransaction.find({ guildId }).sort({ createdAt: -1 }).limit(limit).lean(),
    MarketListing.find({ guildId, state: 'manual_review' }).sort({ updatedAt: -1 }).limit(limit).lean(),
    TradeSession.find({ guildId, state: 'manual_review' }).sort({ updatedAt: -1 }).limit(limit).lean(),
    Auction.find({ guildId, state: 'manual_review' }).sort({ updatedAt: -1 }).limit(limit).lean(),
    GameSession.find({ guildId, status: 'manual_review' }).sort({ updatedAt: -1 }).limit(limit).lean(),
  ]);
  return { accountCount, wallet: walletTotals[0] || { total: 0, minimum: 0, maximum: 0 }, bank: bankTotals[0] || { total: 0, minimum: 0, maximum: 0 }, limits, invalidAccounts, unresolved, recentTransactions, manualListings, manualTrades, manualAuctions, manualSessions };
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
  runStandaloneOperation, ensureAccount, getAccount, getSettings, adjustFragments, adjustOrbs, bankTransfer, transferFragments, playCasino, assertCasinoChannel, walletCapacityGuard,
  convertOrbes, claimWork, claimDaily, itemAvailability, itemSnapshot, buyItem, getStoreItem, getStorePage,
  listInventory, useInventoryItem, deliverItem, removeInventoryItems, getClaimableRules,
  claimCollectRules, listTransactions, deleteCatalogItem,
  claimAdventure, claimCrime, claimPassiveIncome, getMoneyLeaderboard, getEconomicAudit, adjustRoleFragments, applyAccountMutation, runEconomicOperation, resumeEconomicOperation, replayPendingEconomicOperations,
  addInventoryEntry,
};
