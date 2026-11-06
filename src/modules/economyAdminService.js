const {
  EconomyItem, EconomyTransaction, EconomySettings, EconomyCollectRule,
} = require('../database');
const { inTransaction, getSettings, itemSnapshot } = require('./economyService');
const { ORB_TYPES, assertAmount, EconomyError, MAX_AMOUNT } = require('./economyUtils');

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

async function auditAdmin(data, session) {
  await EconomyTransaction.create([data], { session });
}

async function configureWork({ guildId, actorId, min, max, cooldownMinutes }) {
  assertAmount(min, 'Recompensa mínima', { min: 0, max: MAX_AMOUNT });
  assertAmount(max, 'Recompensa máxima', { min: 0, max: MAX_AMOUNT });
  if (min > max) throw new RangeError('A recompensa mínima não pode superar a máxima.');
  assertAmount(cooldownMinutes, 'Cooldown em minutos', { min: 1, max: 525600 });
  const settings = await getSettings(guildId);
  return inTransaction(async (session) => {
    settings.work.min = min;
    settings.work.max = max;
    settings.work.cooldownMs = cooldownMinutes * 60000;
    await settings.save({ session });
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_work_config', currency: 'none', details: { min, max, cooldownMinutes } }, session);
    return settings;
  });
}

async function configureDaily({ guildId, actorId, fragments, cooldownHours, orbs }) {
  assertAmount(fragments, 'Fragmentos diários', { min: 0, max: MAX_AMOUNT });
  assertAmount(cooldownHours, 'Cooldown em horas', { min: 1, max: 8760 });
  for (const type of ORB_TYPES) assertAmount(Number(orbs[type] || 0), 'Recompensa de Orbes', { min: 0, max: MAX_AMOUNT });
  const settings = await getSettings(guildId);
  return inTransaction(async (session) => {
    settings.daily.fragments = fragments;
    settings.daily.cooldownMs = cooldownHours * 3600000;
    for (const type of ORB_TYPES) settings.daily.orbs[type] = Number(orbs[type] || 0);
    await settings.save({ session });
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_daily_config', currency: 'mixed', amount: fragments, details: { cooldownHours, orbs } }, session);
    return settings;
  });
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
  return inTransaction(async (session) => {
    const [rule] = await EconomyCollectRule.create([{ guildId, ...ruleData, createdBy: actorId }], { session });
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_create', currency: 'none', details: { ruleId: String(rule._id), name: rule.name, roleId: rule.roleId } }, session);
    return rule;
  });
}

async function editCollectRule({ guildId, actorId, ruleId, ...changes }) {
  return inTransaction(async (session) => {
    const rule = await EconomyCollectRule.findOne({ guildId, _id: ruleId, active: true }).session(session);
    if (!rule) throw new EconomyError('Regra de coleta não encontrada.');
    const proposed = { ...rule.toObject(), ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) };
    const normalized = normalizeRule(proposed);
    Object.assign(rule, normalized);
    await rule.save({ session });
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_edit', currency: 'none', details: { ruleId: String(rule._id), changes } }, session);
    return rule;
  });
}

async function removeCollectRule({ guildId, actorId, ruleId }) {
  return inTransaction(async (session) => {
    const rule = await EconomyCollectRule.findOneAndUpdate({ guildId, _id: ruleId, active: true }, { $set: { active: false } }, { new: true, session });
    if (!rule) throw new EconomyError('Regra de coleta não encontrada ou já desativada.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_collect_rule_remove', currency: 'none', details: { ruleId: String(rule._id), name: rule.name } }, session);
    return rule;
  });
}

async function createCatalogItem({ guildId, actorId, ...raw }) {
  const data = validateItem(raw);
  if (!data.name?.trim() || !data.description?.trim()) throw new RangeError('Nome e descrição do item são obrigatórios.');
  if (!Number.isSafeInteger(data.price * data.purchaseQuantity)) throw new RangeError('O custo por compra ultrapassa o limite seguro de inteiro.');
  if (data.availableFrom) data.availableFrom = new Date(data.availableFrom);
  if (data.availableUntil) data.availableUntil = new Date(data.availableUntil);
  return inTransaction(async (session) => {
    try {
      const [item] = await EconomyItem.create([{ ...data, guildId, createdBy: actorId }], { session });
      await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_create', currency: 'item', itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item) }, session);
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
  return inTransaction(async (session) => {
    const item = await EconomyItem.findOneAndUpdate(
      { guildId, sku: parseSku(sku), deletedAt: null },
      { $set: { ...entries, updatedBy: actorId } },
      { new: true, runValidators: true, session },
    );
    if (!item) throw new EconomyError('Item não encontrado no catálogo.');
    if (item.currency === 'orbs' && !item.orbType) throw new RangeError('Itens pagos com Orbes precisam de uma categoria.');
    if (item.action === 'grant_orb' && !item.actionOrbType) throw new RangeError('A ação configurada precisa de categoria de Orbe.');
    if (item.action !== 'none' && item.actionAmount < 1) throw new RangeError('Uma ação automática precisa de quantidade maior que zero.');
    if (item.usable && (item.delivery === 'immediate' || !item.inventoryVisible)) throw new RangeError('Itens utilizáveis precisam aparecer no inventário e usar entrega por inventário.');
    if (!item.stackable && item.purchaseQuantity > MAX_NONSTACKABLE_BATCH) throw new RangeError('Itens não acumuláveis podem entregar até ' + MAX_NONSTACKABLE_BATCH + ' unidades por compra.');
    if (item.availableFrom && item.availableUntil && item.availableFrom >= item.availableUntil) throw new RangeError('A data final deve ser posterior à data inicial.');
    if (!Number.isSafeInteger(item.price * item.purchaseQuantity)) throw new RangeError('O custo por compra ultrapassa o limite seguro de inteiro.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_edit', currency: 'item', itemId: item._id, itemSku: item.sku, itemSnapshot: itemSnapshot(item), details: { fields: Object.keys(entries) } }, session);
    return item;
  });
}

async function setCatalogStock({ guildId, actorId, sku, stock }) {
  if (stock !== null) assertAmount(stock, 'Estoque', { min: 0 });
  return inTransaction(async (session) => {
    const item = await EconomyItem.findOneAndUpdate({ guildId, sku: parseSku(sku), deletedAt: null }, { $set: { stock, updatedBy: actorId } }, { new: true, session });
    if (!item) throw new EconomyError('Item não encontrado no catálogo.');
    await auditAdmin({ guildId, actorId, userId: actorId, operation: 'admin_item_stock', currency: 'item', itemId: item._id, itemSku: item.sku, details: { stock } }, session);
    return item;
  });
}

module.exports = {
  parseSku, validateItem, configureWork, configureDaily, normalizeRule, createCollectRule,
  editCollectRule, removeCollectRule, createCatalogItem, editCatalogItem, setCatalogStock,
};
