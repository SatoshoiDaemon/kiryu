jest.mock('../src/database', () => ({
  EconomyAccount: { findOneAndUpdate: jest.fn(), findOne: jest.fn() },
  EconomyItem: { findOne: jest.fn(), findOneAndUpdate: jest.fn(), countDocuments: jest.fn(), find: jest.fn() },
  EconomyInventory: { findOneAndUpdate: jest.fn(), insertMany: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn() },
  EconomyTransaction: { findOne: jest.fn(), create: jest.fn() },
  EconomySettings: { findById: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn() },
  EconomyCollectRule: { find: jest.fn() },
  EconomyClaim: { find: jest.fn(), insertMany: jest.fn() },
}));

jest.mock('../src/logger', () => ({ error: jest.fn() }));

const mongoose = require('mongoose');
const logger = require('../src/logger');
const db = require('../src/database');
const { inTransaction, getSettings, claimWork, bankTransfer, buyItem, getStorePage, claimDaily, convertOrbes, getClaimableRules, claimCollectRules, useInventoryItem } = require('../src/modules/economyService');

function doc(values = {}) {
  return { ...values, toObject: () => ({ ...values }) };
}

function query(value) {
  return {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
    sort: jest.fn().mockReturnThis(),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

describe('atomicidade das operações econômicas', () => {
  let session;

  beforeEach(() => {
    jest.clearAllMocks();
    session = { withTransaction: jest.fn(async (operation) => operation()), endSession: jest.fn() };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
  });

  afterEach(() => jest.restoreAllMocks());

  test('trabalho atualiza saldo e cooldown atomicamente sem transação', async () => {
    const now = Date.now();
    const account = doc({ wallet: 250, lastWorkAt: new Date(now) });
    db.EconomySettings.findById.mockResolvedValue({ work: { min: 100, max: 500, cooldownMs: 3600000 } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(account);
    await expect(claimWork({ guildId: 'g', userId: 'u', now, random: () => 250 }))
      .resolves.toMatchObject({ reward: 250, account: { wallet: 250 } });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[1][2])
      .toEqual({ returnDocument: 'after' });
    expect(db.EconomyTransaction.create).toHaveBeenCalledWith([
      expect.objectContaining({ operation: 'work_reward', walletDelta: 250 }),
    ]);
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('falha no histórico não desfaz nem reporta como falho um trabalho creditado', async () => {
    db.EconomySettings.findById.mockResolvedValue({ work: { min: 100, max: 500, cooldownMs: 3600000 } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 250, lastWorkAt: new Date() }));
    db.EconomyTransaction.create.mockRejectedValue(new Error('histórico indisponível'));
    await expect(claimWork({ guildId: 'g', userId: 'u', random: () => 250 }))
      .resolves.toMatchObject({ reward: 250, account: { wallet: 250 } });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('histórico econômico'));
  });

  test('settings existentes recebem as faixas diárias aleatórias uma só vez', async () => {
    const migrated = { daily: { rewardRanges: { fragments: { min: 400, max: 1000 } }, rangesConfigured: true } };
    db.EconomySettings.findById.mockResolvedValue({ daily: { rangesConfigured: false } });
    db.EconomySettings.findOneAndUpdate.mockResolvedValue(migrated);
    await expect(getSettings('g')).resolves.toBe(migrated);
    expect(db.EconomySettings.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'g', 'daily.rangesConfigured': { $ne: true } },
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
  });

  test.each([
    { name: 'MongoServerError', message: 'This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.' },
    { code: 20, message: 'Transaction numbers are only allowed on a replica set member or mongos' },
  ])('operações realmente multirregistro explicam quando não há transações: %j', async (error) => {
    session.withTransaction.mockRejectedValue(error);
    const task = jest.fn();
    await expect(inTransaction(task)).rejects.toMatchObject({
      publicMessage: expect.stringContaining('transações'), cause: error,
    });
    expect(task).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test('outros erros de transação preservam a causa original', async () => {
    const failure = new Error('conexão perdida');
    session.withTransaction.mockRejectedValue(failure);
    await expect(inTransaction(jest.fn())).rejects.toBe(failure);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test('depósito exige saldo suficiente e atualiza carteira e banco atomicamente', async () => {
    const account = doc({ wallet: 100, bank: 50 });
    db.EconomyAccount.findOneAndUpdate
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(doc({ wallet: 60, bank: 90 }));
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(bankTransfer({ guildId: 'g', userId: 'u', amount: 40, direction: 'deposit' }))
      .resolves.toMatchObject({ wallet: 60, bank: 90 });

    const debit = db.EconomyAccount.findOneAndUpdate.mock.calls[1];
    expect(debit[0]).toMatchObject({ wallet: { $gte: 40 }, bank: { $lte: Number.MAX_SAFE_INTEGER - 40 } });
    expect(debit[1]).toEqual({ $inc: { wallet: -40, bank: 40 } });
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('saque insuficiente falha sem permitir saldo bancário negativo', async () => {
    const account = doc({ wallet: 10, bank: 2 });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(account).mockResolvedValueOnce(null);

    await expect(bankTransfer({ guildId: 'g', userId: 'u', amount: 3, direction: 'withdraw' }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/Saldo insuficiente/) });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[1][0].bank).toEqual({ $gte: 3 });
  });

  test('uma compra do último item filtra estoque antes de debitar a carteira', async () => {
    const item = {
      _id: 'item-id', guildId: 'g', sku: 'antidoto', name: 'Antídoto', description: 'Uso narrativo', emoji: '🧪',
      currency: 'fragments', price: 500, stock: 1, purchaseQuantity: 1, active: true, visibleInStore: true,
      deletedAt: null, inventoryVisible: true, delivery: 'inventory', stackable: true, usable: false,
      consumeOnUse: true, action: 'none', actionAmount: 0,
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 1000, bank: 0 }));
    db.EconomyItem.findOne.mockReturnValue(query(item));
    db.EconomyItem.findOneAndUpdate.mockResolvedValue(null);

    await expect(buyItem({ guildId: 'g', userId: 'u', itemId: 'item-id' }))
      .rejects.toMatchObject({ publicMessage: 'O estoque acabou antes de concluir a compra.' });

    expect(db.EconomyItem.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ stock: { $gte: 1 } });
    expect(db.EconomyAccount.findOneAndUpdate).toHaveBeenCalledTimes(1); // conta preparada; débito não ocorreu
    expect(db.EconomyInventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(db.EconomyTransaction.create).not.toHaveBeenCalled();
  });

  test('compra com saldo suficiente debita, reduz estoque, entrega e registra uma transação', async () => {
    const item = {
      _id: 'item-id', guildId: 'g', sku: 'antidoto', name: 'Antídoto', description: 'Uso narrativo', emoji: '🧪',
      currency: 'fragments', price: 100, stock: 2, purchaseQuantity: 1, active: true, visibleInStore: true,
      deletedAt: null, inventoryVisible: true, delivery: 'inventory', stackable: true, usable: false,
      consumeOnUse: true, action: 'none', actionAmount: 0,
    };
    const account = doc({ wallet: 400, bank: 0, orbs: {} });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(doc({ wallet: 500, bank: 0 })).mockResolvedValueOnce(doc({ wallet: 500, bank: 0 })).mockResolvedValueOnce(account);
    db.EconomyItem.findOne.mockReturnValue(query(item));
    db.EconomyItem.findOneAndUpdate.mockResolvedValue({ ...item, stock: 1, soldCount: 1 });
    db.EconomyInventory.findOne.mockReturnValue(query(null));
    db.EconomyInventory.findOneAndUpdate.mockResolvedValue({ quantity: 1 });
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(buyItem({ guildId: 'g', userId: 'u', itemId: 'item-id' }))
      .resolves.toMatchObject({ cost: 100, deliveredToInventory: true, account: { wallet: 400 } });
    expect(db.EconomyItem.findOneAndUpdate.mock.calls[0][0].stock).toEqual({ $gte: 1 });
    expect(db.EconomyItem.findOneAndUpdate.mock.calls[0][1].$inc).toEqual({ soldCount: 1, stock: -1 });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][0].wallet).toEqual({ $gte: 100 });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][1].$inc.wallet).toBe(-100);
    expect(db.EconomyInventory.findOneAndUpdate.mock.calls[0][1].$inc.quantity).toBe(1);
    expect(db.EconomyTransaction.create.mock.calls[0][0][0]).toMatchObject({ operation: 'item_purchase', walletDelta: -100, itemSku: 'antidoto' });
  });

  test('repetir /daily no cooldown não credita uma segunda recompensa', async () => {
    const now = new Date('2026-11-06T12:00:00Z');
    const previousClaim = new Date('2026-11-06T11:00:00Z');
    const account = doc({ wallet: 500, bank: 0, orbs: { green: 1 } });
    db.EconomySettings.findById.mockResolvedValue({ daily: {
      rewardRanges: { fragments: { min: 500, max: 500 }, orbs: {
        green: { min: 1, max: 1 }, blue: { min: 0, max: 0 }, orange: { min: 0, max: 0 },
        red: { min: 0, max: 0 }, black: { min: 0, max: 0 }, gold: { min: 0, max: 0 },
      } },
      cooldownMs: 86400000, rangesConfigured: true,
    } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(account).mockResolvedValueOnce(null);
    db.EconomyAccount.findOne.mockReturnValue(query({ lastDailyAt: previousClaim }));

    await expect(claimDaily({ guildId: 'g', userId: 'u', now, random: (min) => min }))
      .rejects.toMatchObject({ publicMessage: expect.stringContaining('23h') });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[1][0].$or[2].lastDailyAt.$lte)
      .toEqual(new Date(now.getTime() - 86400000));
    expect(db.EconomyTransaction.create).not.toHaveBeenCalled();
  });

  test('/daily sorteia cada faixa e credita Fragmentos e Orbes numa atualização atômica', async () => {
    const now = Date.now();
    const updated = doc({ wallet: 1000, orbs: { green: 100, blue: 50, orange: 10 }, lastDailyAt: new Date(now) });
    db.EconomySettings.findById.mockResolvedValue({ daily: {
      rewardRanges: {
        fragments: { min: 400, max: 1000 },
        orbs: {
          green: { min: 10, max: 100 }, blue: { min: 10, max: 50 }, orange: { min: 5, max: 10 },
          red: { min: 0, max: 0 }, black: { min: 0, max: 0 }, gold: { min: 0, max: 0 },
        },
      },
      cooldownMs: 86400000, rangesConfigured: true,
    } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(doc({ wallet: 0 })).mockResolvedValueOnce(updated);

    const random = jest.fn((_min, max) => max - 1);
    await expect(claimDaily({ guildId: 'g', userId: 'u', now, random }))
      .resolves.toMatchObject({ fragments: 1000, orbs: { green: 100, blue: 50, orange: 10 }, account: { wallet: 1000 } });
    expect(random.mock.calls).toEqual([[400, 1001], [10, 101], [10, 51], [5, 11], [0, 1], [0, 1], [0, 1]]);
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[1][1].$inc)
      .toEqual({ wallet: 1000, 'orbs.green': 100, 'orbs.blue': 50, 'orbs.orange': 10 });
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test('conversão de Orbes usa filtro de saldo atômico', async () => {
    const account = doc({ wallet: 0, bank: 0, orbs: { green: 9, blue: 0 } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(account).mockResolvedValueOnce(null);

    await expect(convertOrbes({ guildId: 'g', userId: 'u', source: 'green', amount: 10 }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/Saldo insuficiente/) });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[1][0]).toMatchObject({ 'orbs.green': { $gte: 10 }, 'orbs.blue': { $lte: Number.MAX_SAFE_INTEGER - 1 } });
    expect(db.EconomyTransaction.create).not.toHaveBeenCalled();
  });

  test('usuário sem cargo elegível não vê nem coleta regras de cargo', async () => {
    await expect(getClaimableRules('g', [], 'u')).resolves.toEqual([]);
    await expect(claimCollectRules({ guildId: 'g', userId: 'u', roleIds: [], ruleIds: ['rule-id'] }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/cargo elegível/) });
    expect(db.EconomyCollectRule.find).not.toHaveBeenCalled();

    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 0, bank: 0 }));
    db.EconomyCollectRule.find.mockReturnValue(query([]));
    await expect(claimCollectRules({ guildId: 'g', userId: 'u', roleIds: ['cargo-incorreto'], ruleIds: ['rule-id'] }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/cargo elegível/) });
    expect(db.EconomyCollectRule.find.mock.calls[0][0].roleId.$in).toEqual(['cargo-incorreto']);
  });

  test('recompensas stackable de cargos diferentes acumulam em uma coleta', async () => {
    const rules = [
      { _id: new mongoose.Types.ObjectId(), roleId: 'nobre', name: 'Nobre', frequency: 'weekly', fragments: 100, orbType: 'green', orbAmount: 1, stackable: true },
      { _id: new mongoose.Types.ObjectId(), roleId: 'patrono', name: 'Patrono', frequency: 'monthly', fragments: 200, orbType: 'green', orbAmount: 2, stackable: true },
    ];
    const account = doc({ wallet: 300, bank: 0, orbs: { green: 3 } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(doc({ wallet: 0, bank: 0 })).mockResolvedValueOnce(doc({ wallet: 0, bank: 0 })).mockResolvedValueOnce(account);
    db.EconomyCollectRule.find.mockReturnValue(query(rules));
    db.EconomyClaim.insertMany.mockResolvedValue([]);
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(claimCollectRules({ guildId: 'g', userId: 'u', roleIds: ['nobre', 'patrono'], ruleIds: rules.map((rule) => String(rule._id)) }))
      .resolves.toMatchObject({ fragments: 300, orbDelta: { green: 3 } });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][1].$inc).toEqual({ wallet: 300, 'orbs.green': 3 });
    expect(db.EconomyCollectRule.find.mock.calls[0][0].roleId.$in).toEqual(['nobre', 'patrono']);
    expect(db.EconomyClaim.insertMany).toHaveBeenCalledTimes(1);
  });

  test('uso de um item consumível remove uma unidade e registra a ação', async () => {
    const entry = {
      _id: 'inventory-row', guildId: 'g', userId: 'u', itemId: 'item-id', sku: 'antidoto', quantity: 1,
      itemSnapshot: { name: 'Antídoto', emoji: '🧪', description: 'Uso narrativo', usable: true, consumeOnUse: true, action: 'none', stackable: true },
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(doc({ wallet: 0, bank: 0 })).mockResolvedValueOnce(doc({ wallet: 0, bank: 0 }));
    db.EconomyInventory.findOne.mockReturnValue(query(entry));
    db.EconomyInventory.deleteOne.mockResolvedValue({ deletedCount: 1 });
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(useInventoryItem({ guildId: 'g', userId: 'u', sku: 'antidoto' }))
      .resolves.toMatchObject({ consumed: true, item: { name: 'Antídoto' } });
    expect(db.EconomyInventory.deleteOne).toHaveBeenCalledWith({ _id: 'inventory-row' }, { session });
    expect(db.EconomyTransaction.create.mock.calls[0][0][0].operation).toBe('item_use');
  });

  test('compra sem saldo não entrega o item nem grava transação', async () => {
    const item = {
      _id: 'item-id', guildId: 'g', sku: 'antidoto', name: 'Antídoto', description: 'Uso narrativo', emoji: '🧪',
      currency: 'fragments', price: 500, stock: 1, purchaseQuantity: 1, active: true, visibleInStore: true,
      deletedAt: null, inventoryVisible: true, delivery: 'inventory', stackable: true, usable: false,
      consumeOnUse: true, action: 'none', actionAmount: 0,
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(doc({ wallet: 0, bank: 0 })).mockResolvedValueOnce(doc({ wallet: 0, bank: 0 })).mockResolvedValueOnce(null);
    db.EconomyItem.findOne.mockReturnValue(query(item));
    db.EconomyItem.findOneAndUpdate.mockResolvedValue(item);

    await expect(buyItem({ guildId: 'g', userId: 'u', itemId: 'item-id' }))
      .rejects.toMatchObject({ publicMessage: 'Saldo insuficiente para comprar este item.' });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][0].wallet).toEqual({ $gte: 500 });
    expect(db.EconomyInventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(db.EconomyTransaction.create).not.toHaveBeenCalled();
  });

  test('compra com Orbes debita a denominação configurada pelo catálogo', async () => {
    const item = {
      _id: 'orb-item-id', guildId: 'g', sku: 'tomo-esquecimento', name: 'Tomo do Esquecimento', description: 'Reset de classes', emoji: '📖',
      currency: 'orbs', orbType: 'orange', price: 10, stock: null, soldCount: 0, purchaseQuantity: 1, active: true, visibleInStore: true,
      deletedAt: null, inventoryVisible: true, delivery: 'inventory', stackable: true, usable: true, consumeOnUse: false, action: 'none', actionAmount: 0,
    };
    const account = doc({ wallet: 0, bank: 0, orbs: { orange: 0 } });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(account).mockResolvedValueOnce(account).mockResolvedValueOnce(account);
    db.EconomyItem.findOne.mockReturnValue(query(item));
    db.EconomyItem.findOneAndUpdate.mockResolvedValue(item);
    db.EconomyInventory.findOne.mockReturnValue(query(null));
    db.EconomyInventory.findOneAndUpdate.mockResolvedValue({ quantity: 1 });
    db.EconomyTransaction.create.mockResolvedValue([]);

    await buyItem({ guildId: 'g', userId: 'u', itemId: 'orb-item-id' });

    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][0]['orbs.orange']).toEqual({ $gte: 10 });
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls[2][1].$inc['orbs.orange']).toBe(-10);
    expect(db.EconomyTransaction.create.mock.calls[0][0][0]).toMatchObject({ currency: 'orbs', orbType: 'orange', amount: 10 });
  });

  test('compra com escolha salva a opção escolhida no inventário e no histórico', async () => {
    const item = {
      _id: 'crystal-id', guildId: 'g', sku: 'bola-de-cristal', name: 'Bola de Cristal', description: 'Escolha um modelo', emoji: '🔮',
      currency: 'fragments', price: 900, stock: null, soldCount: 0, purchaseQuantity: 1, active: true, visibleInStore: true,
      deletedAt: null, inventoryVisible: true, delivery: 'inventory', stackable: true, usable: false, consumeOnUse: true,
      purchaseChoices: [
        { value: 'increase', label: 'Aumenta custo e dano em 20%', description: '' },
        { value: 'decrease', label: 'Diminui custo e dano em 20%', description: '' },
      ],
      action: 'none', actionAmount: 0,
    };
    const account = doc({ wallet: 100, bank: 0, orbs: {} });
    db.EconomyAccount.findOneAndUpdate.mockResolvedValueOnce(account).mockResolvedValueOnce(account).mockResolvedValueOnce(account);
    db.EconomyItem.findOne.mockReturnValue(query(item));
    db.EconomyItem.findOneAndUpdate.mockResolvedValue(item);
    db.EconomyInventory.findOne.mockReturnValue(query(null));
    db.EconomyInventory.findOneAndUpdate.mockResolvedValue({ quantity: 1 });
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(buyItem({ guildId: 'g', userId: 'u', itemId: 'crystal-id', purchaseChoice: 'decrease' }))
      .resolves.toMatchObject({ selectedChoice: { value: 'decrease', label: 'Diminui custo e dano em 20%' } });
    expect(db.EconomyInventory.findOneAndUpdate.mock.calls[0][1].$setOnInsert.itemSnapshot.selectedChoice)
      .toMatchObject({ value: 'decrease', label: 'Diminui custo e dano em 20%' });
    expect(db.EconomyInventory.findOne.mock.calls[0][0].slot).toBe('choice:decrease');
    expect(db.EconomyTransaction.create.mock.calls[0][0][0].details.purchaseChoice)
      .toMatchObject({ value: 'decrease', label: 'Diminui custo e dano em 20%' });
  });

  test('páginas da loja filtram por moeda e incluem todos os itens sem quebrar a última página', async () => {
    const lastPageItems = [{ sku: 'minerio-tier-3' }, { sku: 'casa' }];
    const queryBuilder = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(lastPageItems),
    };
    db.EconomyItem.countDocuments.mockResolvedValue(23);
    db.EconomyItem.find.mockReturnValue(queryBuilder);

    await expect(getStorePage('g', 'fragments', { page: 7, pageSize: 3 }))
      .resolves.toMatchObject({ total: 23, page: 7, pageSize: 3, pages: 8, items: lastPageItems });
    expect(db.EconomyItem.find).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'g', currency: 'fragments' }));
    expect(queryBuilder.skip).toHaveBeenCalledWith(21);
    expect(queryBuilder.limit).toHaveBeenCalledWith(3);

    db.EconomyItem.countDocuments.mockResolvedValue(3);
    db.EconomyItem.find.mockReturnValue({ ...queryBuilder, lean: jest.fn().mockResolvedValue([{ sku: 'tomo-esquecimento' }, { sku: 'lagrima-larval' }, { sku: 'manual-guerra' }]) });
    await expect(getStorePage('g', 'orbs', { page: 0, pageSize: 3 }))
      .resolves.toMatchObject({ total: 3, page: 0, pages: 1 });
    expect(db.EconomyItem.find).toHaveBeenLastCalledWith(expect.objectContaining({ guildId: 'g', currency: 'orbs' }));
  });

  test('itens que aguardam confirmação da staff permanecem no inventário após usar', async () => {
    const entry = {
      _id: 'pending-row', guildId: 'g', userId: 'u', itemId: 'item-id', sku: 'manual-guerra', quantity: 1,
      itemSnapshot: { name: 'Manual da Guerra', emoji: '📕', usable: true, consumeOnUse: false, useMessage: 'Dirija-se à staff.', action: 'none', stackable: true },
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 0, bank: 0 }));
    db.EconomyInventory.findOne.mockReturnValue(query(entry));
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(useInventoryItem({ guildId: 'g', userId: 'u', sku: 'manual-guerra' }))
      .resolves.toMatchObject({ consumed: false, item: { useMessage: 'Dirija-se à staff.' } });
    expect(db.EconomyInventory.deleteOne).not.toHaveBeenCalled();
    expect(db.EconomyInventory.updateOne).not.toHaveBeenCalled();
    expect(db.EconomyTransaction.create.mock.calls[0][0][0].details.consumed).toBe(false);
  });

  test.each([
    ['tomo-esquecimento', 'Você utilizou o Tomo do Esquecimento! Para realizar o reset de suas classes, dirija-se à staff do servidor.'],
    ['lagrima-larval', 'Você utilizou a Lágrima Larval! Para realizar a redistribuição dos seus atributos, dirija-se à staff do servidor.'],
    ['manual-guerra', 'Você utilizou o Manual da Guerra! Para realizar sua evolução de classe, certifique-se de cumprir os requisitos necessários e dirija-se à staff do servidor.'],
  ])('%s mantém uma cópia no inventário e não altera saldos ao solicitar a staff', async (sku, useMessage) => {
    const entry = {
      _id: 'staff-request-row', guildId: 'g', userId: 'u', itemId: 'item-id', sku, quantity: 1,
      itemSnapshot: { name: sku, emoji: '📖', usable: true, consumeOnUse: false, useMessage, action: 'none', actionAmount: 0, stackable: true },
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 0, bank: 0, orbs: { orange: 10, red: 0 } }));
    db.EconomyInventory.findOne.mockReturnValue(query(entry));
    db.EconomyTransaction.create.mockResolvedValue([]);

    await expect(useInventoryItem({ guildId: 'g', userId: 'u', sku }))
      .resolves.toMatchObject({ consumed: false, item: { useMessage } });
    expect(db.EconomyInventory.deleteOne).not.toHaveBeenCalled();
    expect(db.EconomyInventory.updateOne).not.toHaveBeenCalled();
    expect(db.EconomyAccount.findOneAndUpdate.mock.calls.every(([, update]) => Boolean(update.$setOnInsert))).toBe(true);
    expect(db.EconomyTransaction.create.mock.calls[0][0][0]).toMatchObject({
      operation: 'item_use', itemSku: sku, walletDelta: 0, orbDelta: null,
      details: { consumed: false, action: 'none', actionAmount: 0 },
    });
  });

  test('itens com escolhas exigem uma opção válida antes de debitar moedas', async () => {
    const item = {
      _id: 'ore-id', guildId: 'g', sku: 'minerio-tier-1', name: 'Minério Tier 1', currency: 'fragments', price: 10000,
      stock: null, purchaseQuantity: 1, active: true, visibleInStore: true, deletedAt: null,
      purchaseChoices: [{ value: 'oricalco', label: '1kg de Oricalco' }],
    };
    db.EconomyAccount.findOneAndUpdate.mockResolvedValue(doc({ wallet: 20000, bank: 0 }));
    db.EconomyItem.findOne.mockReturnValue(query(item));

    await expect(buyItem({ guildId: 'g', userId: 'u', itemId: 'ore-id' }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/Escolha uma das opções/) });
    expect(db.EconomyItem.findOneAndUpdate).not.toHaveBeenCalled();
    expect(db.EconomyInventory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(db.EconomyAccount.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
