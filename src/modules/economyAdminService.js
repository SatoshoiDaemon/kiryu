const {
  EconomyItem, EconomyTransaction, EconomySettings, EconomyCollectRule,
} = require('../database');
const { runStandaloneOperation, getSettings, itemSnapshot } = require('./economyService');
const { ORB_TYPES, assertAmount, EconomyError, MAX_AMOUNT } = require('./economyUtils');
const logger = require('../logger');
const { errorDetails } = require('./errorDetails');

const CURRENCIES = ['fragments', 'orbs'];
const ACTIONS = ['none', 'grant_fragments', 'grant_orb'];
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'interval', 'calendar'];
const skuPattern = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const MAX_NONSTACKABLE_BATCH = 1000;

function parseSku(sku) {
  const value = String(sku || '').trim().toLowerCase();
  if (!skuPattern.test(value)) throw new RangeError('O identificador deve ter de 2 a 32 caracteres: letras minúsculas, números, hífen ou sublinhado.');
  return value;
}

function validateItem(data, { partial = false } = {}) {
  const next = { ...data };
  if (next.sku != null) next.sku = parseSku(next.sku);
  if (next.thumbnailUrl != null) {
    next.thumbnailUrl = String(next.thumbnailUrl).trim();
    if (next.thumbnailUrl && (!/^https:\/\//i.test(next.thumbnailUrl) || next.thumbnailUrl.length > 500)) throw new RangeError('A arte do item precisa usar uma URL HTTPS válida de até 500 caracteres.');
  }
  if (next.price != null) assertAmount(next.price, 'Preço', { min: 0 });
  if (next.purchaseQuantity != null) assertAmount(next.purchaseQuantity, 'Quantidade por compra', { max: 1000000 });
  if (next.stock != null) assertAmount(next.stock, 'Estoque', { min: 0 });
  if (next.currency != null && !CURRENCIES.includes(next.currency)) throw new RangeError('Moeda do item inválida.');
  if (next.orbType != null && !ORB_TYPES.includes(next.orbType)) throw new RangeError('Categoria de Orbe inválida.');
  if (next.action != null && !ACTIONS.includes(next.action)) throw new RangeError('Ação de item inválida.');
  if (next.actionOrbType != null && !ORB_TYPES.includes(next.actionOrbType)) throw new RangeError('Categoria de Orbe para efeito inválida.');
  if (next.actionAmount != null) assertAmount(next.actionAmount, 'Quantidade do efeito', { min: 0 });
  if (next.currency === 'orbs' && !next.orbType && !partial) throw new RangeError('Escolha a categoria de Orbe usada como preço.');
  if (next.action === 'grant_orb' && !next.actionOrbType && !partial) throw new RangeError('Escolha a categoria de Orbe do efeito.');
  if (next.action && next.action !== 'none' && Number(next.actionAmount || 0) < 1 && !partial) throw new RangeError('Uma ação automática precisa de quantidade maior que zero.');
  if (next.delivery === 'immediate' && next.usable) throw new RangeError('Um item entregue imediatamente não pode ser utilizável pelo inventário.');
  if (next.inventoryVisible === false && next.usable) throw new RangeError('Um item oculto do inventário não pode ser utilizável.');
  if (next.delivery != null && !['inventory', 'immediate'].includes(next.delivery)) throw new RangeError('Tipo de entrega inválido.');
  if (next.stackable === false && Number(next.purchaseQuantity || 1) > MAX_NONSTACKABLE_BATCH) throw new RangeError('Itens não acumuláveis podem entregar até ' + MAX_NONSTACKABLE_BATCH + ' unidades por compra.');
  if (next.availableFrom && Number.isNaN(new Date(next.availableFrom).getTime())) throw new RangeError('Data inicial inválida. Use ISO 8601.');
  if (next.availableUntil && Number.isNaN(new Date(next.availableUntil).getTime())) throw new RangeError('Data final inválida. Use ISO 8601.');
  if (next.availableFrom && next.availableUntil && new Date(next.availableFrom) >= new Date(next.availableUntil)) throw new RangeError('A data final deve ser posterior à data inicial.');
  return next;
}

async function auditAdmin(data) {
  try {
    await EconomyTransaction.create([data]);
  } catch (error) {
    logger.error('Configuração aplicada, mas não foi possível gravar o histórico econômico (' + errorDetails(error) + ').');
  }
}

async function configureWork({ guildId, actorId, min, max, cooldownMinutes, enabled }) {
  if (min !== undefined) assertAmount(min, 'Recompensa mínima', { min: 0, max: MAX_AMOUNT });
  if (max !== undefined) assertAmount(max, 'Recompensa máxima', { min: 0, max: MAX_AMOUNT });
  if (min !== undefined && max !== undefined && min > max) throw new RangeError('A recompensa mínima não pode superar a máxima.');
  if (cooldownMinutes !== undefined) assertAmount(cooldownMinutes, 'Cooldown em minutos', { min: 1, max: 525600 });
  if (enabled === undefined && (min === undefined || max === undefined || cooldownMinutes === undefined)) throw new RangeError('Informe as recompensas, o intervalo ou a disponibilidade do trabalho.');
  const settings = await getSettings(guildId);
  if (min !== undefined) settings.work.min = min;
  if (max !== undefined) settings.work.max = max;
  if (cooldownMinutes !== undefined) settings.work.cooldownMs = cooldownMinutes * 60000;
  if (enabled !== undefined) settings.work.enabled = Boolean(enabled);
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_work_config', currency: 'none', details: { min, max, cooldownMinutes, enabled } });
  return settings;
}

async function configureOrbConversion({ guildId, actorId, conversionRate }) {
  assertAmount(conversionRate, 'Taxa de conversão', { min: 2, max: 1000000 });
  const settings = await getSettings(guildId);
  if (!settings.orbs) settings.orbs = { conversionRate: 10 };
  settings.orbs.conversionRate = conversionRate;
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_orb_conversion_config', currency: 'none', details: { conversionRate } });
  return settings;
}

async function configureCasino({ guildId, actorId, changes }) {
  const games = ['flip', 'dice', 'slots'];
  const extendedGames = ['blackjack', 'roulette', 'mines', 'highlow', 'wheel', 'keno', 'treasure', 'racing', 'lottery', 'poker'];
  const patch = {};
  if (changes.maxBet !== undefined) patch.maxBet = assertAmount(changes.maxBet, 'Aposta máxima', { min: 1, max: 1000000000 });
  for (const field of ['cooldownMs', 'dailyLossLimit', 'sessionMinutes', 'turnTimeoutMinutes', 'lotteryTicketPrice', 'maxLotteryTicketsPerMember']) {
    if (changes[field] === undefined) continue;
    const limits = {
      cooldownMs: [0, 86400000], dailyLossLimit: [0, Number.MAX_SAFE_INTEGER], sessionMinutes: [1, 120], turnTimeoutMinutes: [1, 60],
      lotteryTicketPrice: [1, Number.MAX_SAFE_INTEGER], maxLotteryTicketsPerMember: [1, 1000],
    }[field];
    patch[field] = assertAmount(changes[field], field, { min: limits[0], max: limits[1] });
  }
  if (changes.allowedChannelIds !== undefined) {
    if (!Array.isArray(changes.allowedChannelIds) || changes.allowedChannelIds.length > 5 || changes.allowedChannelIds.some((id) => !/^\d{5,25}$/.test(String(id)))) {
      throw new RangeError('Escolha até cinco canais de texto válidos.');
    }
    patch.allowedChannelIds = [...new Set(changes.allowedChannelIds.map(String))];
  }
  for (const game of games) {
    if (!changes[game]) continue;
    patch[game] = {};
    if (changes[game].enabled !== undefined) patch[game].enabled = Boolean(changes[game].enabled);
    if (changes[game].multiplier !== undefined) patch[game].multiplier = assertAmount(changes[game].multiplier, 'Multiplicador de pagamento', { min: 2, max: 100 });
  }
  for (const game of extendedGames) {
    if (!changes.games?.[game]) continue;
    patch.games ||= {};
    patch.games[game] = { enabled: Boolean(changes.games[game].enabled) };
  }
  if (!Object.keys(patch).length) throw new RangeError('Informe uma configuração de cassino para alterar.');
  const settings = await getSettings(guildId);
  if (!settings.casino) settings.casino = {};
  for (const [game, multiplier] of Object.entries({ flip: 2, dice: 2, slots: 5 })) {
    if (!settings.casino[game]) settings.casino[game] = { enabled: true, multiplier };
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'maxBet') settings.casino.maxBet = value;
    else if (['cooldownMs', 'dailyLossLimit', 'sessionMinutes', 'turnTimeoutMinutes', 'lotteryTicketPrice', 'maxLotteryTicketsPerMember', 'allowedChannelIds'].includes(key)) settings.casino[key] = value;
    else if (key === 'games') {
      for (const [game, config] of Object.entries(value)) settings.casino.games[game].enabled = config.enabled;
    }
    else Object.assign(settings.casino[key], value);
  }
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_casino_config', currency: 'none', details: patch });
  return settings;
}

async function configureIncome({ guildId, actorId, changes }) {
  const patch = {};
  for (const source of ['adventure', 'crime', 'passiveIncome']) {
    if (!changes[source]) continue;
    const input = changes[source];
    const normalized = {};
    if (input.enabled !== undefined) normalized.enabled = Boolean(input.enabled);
    for (const field of ['min', 'max', 'fineMin', 'fineMax', 'amount']) {
      if (input[field] !== undefined) normalized[field] = assertAmount(input[field], source + ' ' + field, { min: 0, max: MAX_AMOUNT });
    }
    if (input.failChancePercent !== undefined) normalized.failChancePercent = assertAmount(input.failChancePercent, 'Chance de falha', { min: 0, max: 100 });
    if (input.cooldownMinutes !== undefined) normalized.cooldownMs = assertAmount(input.cooldownMinutes, 'Cooldown em minutos', { min: 1, max: 525600 }) * 60000;
    if (input.intervalHours !== undefined) normalized.intervalMs = assertAmount(input.intervalHours, 'Intervalo em horas', { min: 1, max: 8760 }) * 3600000;
    if (Object.keys(normalized).length) patch[source] = normalized;
  }
  for (const [source, fields] of Object.entries(patch)) {
    if (fields.min !== undefined && fields.max !== undefined && fields.min > fields.max) throw new RangeError('O mínimo não pode superar o máximo em ' + source + '.');
    if (fields.fineMin !== undefined && fields.fineMax !== undefined && fields.fineMin > fields.fineMax) throw new RangeError('A multa mínima não pode superar a máxima.');
  }
  if (!Object.keys(patch).length) throw new RangeError('Informe uma fonte de renda para alterar.');
  const settings = await getSettings(guildId);
  for (const [source, fields] of Object.entries(patch)) Object.assign(settings[source], fields);
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_income_config', currency: 'none', details: patch });
  return settings;
}

async function configureEconomy({ guildId, actorId, changes }) {
  const limits = {
    initialWallet: [0, MAX_AMOUNT], initialBank: [0, MAX_AMOUNT], walletLimit: [1, MAX_AMOUNT], bankLimit: [1, MAX_AMOUNT],
    marketFeePercent: [0, 50], marketListingDays: [1, 30], maxListingsPerMember: [1, 100], auctionFeePercent: [0, 50],
    auctionMinIncrement: [1, MAX_AMOUNT], tradeExpiryHours: [1, 168], lotteryFeePercent: [0, 50],
  };
  const patch = {};
  for (const [field, value] of Object.entries(changes || {})) {
    if (!Object.hasOwn(limits, field) || value === undefined) continue;
    patch[field] = assertAmount(value, field, { min: limits[field][0], max: limits[field][1] });
  }
  if (!Object.keys(patch).length) throw new RangeError('Informe uma configuração econômica para alterar.');
  if (patch.initialWallet !== undefined && patch.walletLimit !== undefined && patch.initialWallet > patch.walletLimit) throw new RangeError('O saldo inicial de carteira não pode superar o limite definido.');
  if (patch.initialBank !== undefined && patch.bankLimit !== undefined && patch.initialBank > patch.bankLimit) throw new RangeError('O saldo inicial de banco não pode superar o limite definido.');
  const settings = await getSettings(guildId);
  Object.assign(settings.economy, patch);
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_economy_config', currency: 'none', details: patch });
  return settings;
}

function validateRewardRange(range, label) {
  if (!range) throw new RangeError('Informe os limites de ' + label + '.');
  assertAmount(range.min, label + ' mínimo', { min: 0, max: MAX_AMOUNT });
  assertAmount(range.max, label + ' máximo', { min: 0, max: MAX_AMOUNT });
  if (range.min > range.max) throw new RangeError('O mínimo de ' + label + ' não pode superar o máximo.');
  return { min: range.min, max: range.max };
}

async function configureDaily({ guildId, actorId, fragmentRange, orbRanges = {}, enabled }) {
  const fragments = fragmentRange ? validateRewardRange(fragmentRange, 'Fragmentos diários') : null;
  const orbs = fragments ? Object.fromEntries(ORB_TYPES.map((type) => [
    type,
    validateRewardRange(orbRanges[type] || { min: 0, max: 0 }, 'Orbes ' + type),
  ])) : null;
  if (!fragments && enabled === undefined) throw new RangeError('Informe recompensas ou a disponibilidade do daily.');
  const settings = await getSettings(guildId);
  if (fragments) {
    settings.daily.rewardRanges.fragments = fragments;
    for (const type of ORB_TYPES) settings.daily.rewardRanges.orbs[type] = orbs[type];
    settings.daily.rangesConfigured = true;
  }
  if (enabled !== undefined) settings.daily.enabled = Boolean(enabled);
  await settings.save();
  await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_daily_config', currency: fragments ? 'mixed' : 'none', amount: fragments?.min || 0, details: { fragments, orbs, enabled } });
  return settings;
}

function normalizeRule(data) {
  const next = { ...data };
  if (!FREQUENCIES.includes(next.frequency)) throw new RangeError('Frequência de coleta inválida.');
  next.fragments = Number(next.fragments || 0);
  next.orbAmount = Number(next.orbAmount || 0);
  assertAmount(next.fragments, 'Fragmentos da recompensa', { min: 0, max: MAX_AMOUNT });
  assertAmount(next.orbAmount, 'Orbes da recompensa', { min: 0, max: MAX_AMOUNT });
  if (next.orbType && !ORB_TYPES.includes(next.orbType)) throw new RangeError('Categoria de Orbe inválida.');
  if (next.orbAmount > 0 && !next.orbType) throw new RangeError('Escolha uma categoria para a recompensa em Orbes.');
  if (!next.fragments && !next.orbAmount) throw new RangeError('A regra deve entregar Fragmentos ou Orbes.');
  if (next.frequency === 'interval') {
    assertAmount(next.intervalMs, 'Intervalo', { min: 60000, max: MAX_AMOUNT });
  } else {
    next.intervalMs = null;
  }
  if (next.frequency === 'calendar') {
    if (!['week', 'month'].includes(next.calendarUnit)) throw new RangeError('Escolha semana ou mês para a frequência de calendário.');
    const max = next.calendarUnit === 'week' ? 6 : 31;
    assertAmount(next.calendarValue, 'Data do calendário', { min: next.calendarUnit === 'week' ? 0 : 1, max });
  } else {
    next.calendarUnit = null;
    next.calendarValue = null;
  }
  next.stackable = Boolean(next.stackable);
  return next;
}

async function createCollectRule({ guildId, actorId, ...data }) {
  const ruleData = normalizeRule(data);
  if (!ruleData.roleId) throw new RangeError('Selecione um cargo elegível.');
  return runStandaloneOperation(async () => {
    const [rule] = await EconomyCollectRule.create([{ guildId, ...ruleData, createdBy: actorId }]);
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_create', currency: 'none', details: { ruleId: String(rule._id), name: rule.name, roleId: rule.roleId } });
    return rule;
  });
}

async function editCollectRule({ guildId, actorId, ruleId, ...changes }) {
  return runStandaloneOperation(async () => {
    const rule = await EconomyCollectRule.findOne({ guildId, _id: ruleId, active: true });
    if (!rule) throw new EconomyError('Regra de coleta não encontrada.');
    const proposed = { ...rule.toObject(), ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) };
    const normalized = normalizeRule(proposed);
    Object.assign(rule, normalized);
    await rule.save();
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_edit', currency: 'none', details: { ruleId: String(rule._id), changes } });
    return rule;
  });
}

async function removeCollectRule({ guildId, actorId, ruleId }) {
  return runStandaloneOperation(async () => {
    const rule = await EconomyCollectRule.findOneAndUpdate({ guildId, _id: ruleId, active: true }, { $set: { active: false } }, { returnDocument: 'after' });
    if (!rule) throw new EconomyError('Regra de coleta não encontrada ou já desativada.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_remove', currency: 'none', details: { ruleId: String(rule._id), name: rule.name } });
    return rule;
  });
}

async function createCatalogItem({ guildId, actorId, ...raw }) {
  const data = validateItem(raw);
  if (!data.name?.trim() || !data.description?.trim()) throw new RangeError('Nome e descrição do item são obrigatórios.');
  if (!Number.isSafeInteger(data.price * data.purchaseQuantity)) throw new RangeError('O custo por compra ultrapassa o limite seguro de inteiro.');
  if (data.availableFrom) data.availableFrom = new Date(data.availableFrom);
  if (data.availableUntil) data.availableUntil = new Date(data.availableUntil);
  return runStandaloneOperation(async () => {
    try {
      const [item] = await EconomyItem.create([{ ...data, guildId, createdBy: actorId }]);
      await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_create', currency: 'item', itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item) });
      return item;
    } catch (error) {
      if (error?.code === 11000) throw new EconomyError('Esse identificador de item já está em uso.');
      throw error;
    }
  });
}

async function editCatalogItem({ guildId, actorId, sku, changes }) {
  const normalized = validateItem(changes, { partial: true });
  if (normalized.availableFrom) normalized.availableFrom = new Date(normalized.availableFrom);
  if (normalized.availableUntil) normalized.availableUntil = new Date(normalized.availableUntil);
  const entries = Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
  if (!Object.keys(entries).length) throw new RangeError('Informe ao menos um campo para alterar.');
  return runStandaloneOperation(async () => {
    const filter = { guildId, sku: parseSku(sku), deletedAt: null };
    const current = await EconomyItem.findOne(filter).lean();
    if (!current) throw new EconomyError('Item não encontrado no catálogo.');
    const proposed = validateItem({ ...current, ...entries });
    if (proposed.currency === 'orbs' && !proposed.orbType) throw new RangeError('Itens pagos com Orbes precisam de uma categoria.');
    if (proposed.action === 'grant_orb' && !proposed.actionOrbType) throw new RangeError('A ação configurada precisa de categoria de Orbe.');
    if (proposed.action !== 'none' && proposed.actionAmount < 1) throw new RangeError('Uma ação automática precisa de quantidade maior que zero.');
    if (proposed.usable && (proposed.delivery === 'immediate' || !proposed.inventoryVisible)) throw new RangeError('Itens utilizáveis precisam aparecer no inventário e usar entrega por inventário.');
    if (!proposed.stackable && proposed.purchaseQuantity > MAX_NONSTACKABLE_BATCH) throw new RangeError('Itens não acumuláveis podem entregar até ' + MAX_NONSTACKABLE_BATCH + ' unidades por compra.');
    if (proposed.availableFrom && proposed.availableUntil && new Date(proposed.availableFrom) >= new Date(proposed.availableUntil)) throw new RangeError('A data final deve ser posterior à data inicial.');
    if (!Number.isSafeInteger(proposed.price * proposed.purchaseQuantity)) throw new RangeError('O custo por compra ultrapassa o limite seguro de inteiro.');
    const item = await EconomyItem.findOneAndUpdate(
      filter,
      { $set: { ...entries, updatedBy: actorId } },
      { returnDocument: 'after', runValidators: true },
    );
    if (!item) throw new EconomyError('Item não encontrado no catálogo.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_edit', currency: 'item', itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item), details: { fields: Object.keys(entries) } });
    return item;
  });
}

async function setCatalogStock({ guildId, actorId, sku, stock }) {
  if (stock !== null) assertAmount(stock, 'Estoque', { min: 0 });
  return runStandaloneOperation(async () => {
    const item = await EconomyItem.findOneAndUpdate({ guildId, sku: parseSku(sku), deletedAt: null }, { $set: { stock, updatedBy: actorId } }, { returnDocument: 'after' });
    if (!item) throw new EconomyError('Item não encontrado no catálogo.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_stock', currency: 'item', itemId: item._id, itemSku: item.sku, details: { stock } });
    return item;
  });
}

module.exports = {
  parseSku, validateItem, configureWork, configureDaily, configureOrbConversion, configureCasino, configureIncome, configureEconomy, normalizeRule, createCollectRule,
  editCollectRule, removeCollectRule, createCatalogItem, editCatalogItem, setCatalogStock,
};
