const mockAccounts = new Map();
const mockOperations = new Map();
const mockLedger = new Map();

function mockAccountKey(guildId, userId) { return guildId + ':' + userId; }
function mockSetPath(target, path, value) {
  const parts = path.split('.'); let current = target;
  while (parts.length > 1) { const part = parts.shift(); current[part] ||= {}; current = current[part]; }
  current[parts[0]] = value;
}
function mockGetPath(target, path) { return path.split('.').reduce((value, part) => value?.[part], target); }
function mockMeets(value, condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return value === condition;
  if ('$gte' in condition && !(value >= condition.$gte)) return false;
  if ('$lte' in condition && !(value <= condition.$lte)) return false;
  if ('$eq' in condition && value !== condition.$eq) return false;
  if ('$ne' in condition && value === condition.$ne) return false;
  if ('$in' in condition && !condition.$in.includes(value)) return false;
  return true;
}

jest.mock('../src/database', () => ({
  EconomyAccount: {
    findOneAndUpdate: jest.fn(async (query, update, options = {}) => {
      const key = mockAccountKey(query.guildId, query.userId);
      let account = mockAccounts.get(key);
      if (!account && options.upsert) {
        account = { guildId: query.guildId, userId: query.userId, wallet: 0, bank: 0, recentOperationKeys: [] };
        mockAccounts.set(key, account);
      }
      if (!account) return null;
      if (query.recentOperationKeys?.$ne && account.recentOperationKeys.includes(query.recentOperationKeys.$ne)) return null;
      for (const [path, condition] of Object.entries(query)) {
        if (path.startsWith('$') || path === 'guildId' || path === 'userId' || path === 'recentOperationKeys') continue;
        if (!mockMeets(mockGetPath(account, path), condition)) return null;
      }
      for (const [path, amount] of Object.entries(update.$inc || {})) mockSetPath(account, path, (mockGetPath(account, path) || 0) + amount);
      for (const [path, value] of Object.entries(update.$set || {})) mockSetPath(account, path, value);
      for (const [path, value] of Object.entries(update.$setOnInsert || {})) if (mockGetPath(account, path) === undefined) mockSetPath(account, path, value);
      for (const [path, value] of Object.entries(update.$addToSet || {})) {
        const list = mockGetPath(account, path) || []; if (!list.includes(value)) list.push(value); mockSetPath(account, path, list);
      }
      return { ...account, toObject: () => ({ ...account, recentOperationKeys: [...account.recentOperationKeys] }) };
    }),
    findOne: jest.fn(async (query) => {
      const account = mockAccounts.get(mockAccountKey(query.guildId, query.userId));
      if (!account) return null;
      if (query.recentOperationKeys && !account.recentOperationKeys.includes(query.recentOperationKeys)) return null;
      return { ...account, toObject: () => ({ ...account }) };
    }),
    updateMany: jest.fn(async (query, update) => {
      const keys = query.recentOperationKeys?.$in || [];
      for (const account of mockAccounts.values()) account.recentOperationKeys = account.recentOperationKeys.filter((key) => !keys.includes(key));
      return { modifiedCount: 1 };
    }),
  },
  EconomyOperation: {
    findById: jest.fn(async (id) => mockOperations.get(id) || null),
    create: jest.fn(async (operation) => {
      if (mockOperations.has(operation._id)) { const error = new Error('duplicate'); error.code = 11000; throw error; }
      const stored = { ...operation };
      mockOperations.set(operation._id, stored);
      return { ...stored, toObject: () => ({ ...stored }) };
    }),
    updateOne: jest.fn(async (filter, update) => {
      const operation = mockOperations.get(filter._id);
      if (!operation || (filter.state && operation.state !== filter.state)) return { modifiedCount: 0 };
      for (const [path, value] of Object.entries(update.$set || {})) mockSetPath(operation, path, value);
      return { modifiedCount: 1 };
    }),
  },
  EconomyTransaction: {
    updateOne: jest.fn(async (filter, update) => { mockLedger.set(filter.idempotencyKey, update.$setOnInsert); return { upsertedCount: 1 }; }),
  },
  EconomySettings: { findById: jest.fn(async () => ({ economy: { initialWallet: 0, initialBank: 0, walletLimit: 1000, bankLimit: 1000 } })) },
  EconomyItem: {}, EconomyInventory: {}, EconomyCollectRule: {}, EconomyClaim: {}, MarketListing: {}, TradeSession: {}, Auction: {}, GameSession: {},
}));

const db = require('../src/database');
const { runEconomicOperation } = require('../src/modules/economyService');

describe('diário econômico para MongoDB standalone', () => {
  beforeEach(() => {
    mockAccounts.clear(); mockOperations.clear(); mockLedger.clear();
    jest.clearAllMocks();
    mockAccounts.set('g:a', { guildId: 'g', userId: 'a', wallet: 500, bank: 0, recentOperationKeys: [] });
    mockAccounts.set('g:b', { guildId: 'g', userId: 'b', wallet: 200, bank: 0, recentOperationKeys: [] });
  });

  function transferOperation(id = 'transfer:test', recipientLimit = 900) {
    return {
      operationId: id, guildId: 'g', kind: 'member_transfer', request: { senderId: 'a', recipientId: 'b', amount: 100 },
      execution: {
        legs: [
          { userId: 'a', inc: { wallet: -100 }, guards: { wallet: { $gte: 100 } } },
          { userId: 'b', inc: { wallet: 100 }, guards: { wallet: { $lte: recipientLimit } }, failure: 'Limite do destinatário.' },
        ],
        compensation: { userId: 'a', inc: { wallet: 100 }, guards: { wallet: { $lte: Number.MAX_SAFE_INTEGER - 100 } } },
        transactions: [
          { guildId: 'g', userId: 'a', operation: 'transfer_out', amount: 100, walletDelta: -100 },
          { guildId: 'g', userId: 'b', operation: 'transfer_in', amount: 100, walletDelta: 100 },
        ],
        result: { amount: 100 },
      },
    };
  }

  test('execuções simultâneas com a mesma chave transferem uma vez e criam um único livro-caixa', async () => {
    const input = transferOperation();
    const results = await Promise.all([runEconomicOperation(input), runEconomicOperation(input)]);
    expect(mockAccounts.get('g:a').wallet).toBe(400);
    expect(mockAccounts.get('g:b').wallet).toBe(300);
    expect(mockOperations.get(input.operationId).state).toBe('completed');
    expect(mockLedger.size).toBe(2);
    expect(results).toHaveLength(2);
    expect(mockOperations.size).toBe(1);
    expect(db.EconomyOperation.create).toHaveBeenCalledTimes(2); // uma inserção vence; a segunda lê o registro único
  });

  test('retoma um diário pendente sem aplicar duas vezes a perna já gravada', async () => {
    const input = transferOperation('transfer:restart');
    const execution = { ...input.execution, request: input.request };
    mockOperations.set(input.operationId, { _id: input.operationId, guildId: 'g', kind: input.kind, state: 'pending', step: 'leg_1', payload: execution });
    mockAccounts.get('g:a').wallet = 400;
    mockAccounts.get('g:a').recentOperationKeys.push(input.operationId + ':leg:0');

    await expect(runEconomicOperation(input)).resolves.toMatchObject({ result: { amount: 100 } });
    expect(mockAccounts.get('g:a').wallet).toBe(400);
    expect(mockAccounts.get('g:b').wallet).toBe(300);
    expect(mockOperations.get(input.operationId).state).toBe('completed');
    expect(mockLedger.size).toBe(2);
  });

  test('compensa a primeira perna quando o crédito do destinatário excede o limite', async () => {
    const input = transferOperation('transfer:capacity', 100);
    await expect(runEconomicOperation(input)).rejects.toMatchObject({ publicMessage: 'Limite do destinatário.' });
    expect(mockAccounts.get('g:a').wallet).toBe(500);
    expect(mockAccounts.get('g:b').wallet).toBe(200);
    expect(mockOperations.get(input.operationId).state).toBe('cancelled');
    expect(mockAccounts.get('g:a').recentOperationKeys).toEqual([]);
    expect(mockLedger.size).toBe(0);
  });

  test('falha se uma chave idempotente for reutilizada para outra solicitação', async () => {
    const input = transferOperation('transfer:reuse');
    await runEconomicOperation(input);
    await expect(runEconomicOperation({ ...input, request: { ...input.request, amount: 200 } }))
      .rejects.toMatchObject({ publicMessage: expect.stringMatching(/associada a outra operação/) });
    expect(mockAccounts.get('g:a').wallet).toBe(400);
    expect(mockAccounts.get('g:b').wallet).toBe(300);
  });
});
