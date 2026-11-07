jest.mock('../src/database/models/EconomyItem', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../src/database/models/EconomyInventory', () => ({ updateMany: jest.fn() }));

const EconomyItem = require('../src/database/models/EconomyItem');
const EconomyInventory = require('../src/database/models/EconomyInventory');
const { products, seedEconomyStores } = require('../src/database/seeds/economyStores');

describe('seed das lojas da economia', () => {
  const catalog = new Map();

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.clear();
    EconomyItem.findOneAndUpdate.mockImplementation(async (filter, update, options) => {
      const key = filter.guildId + ':' + filter.sku;
      const previous = catalog.get(key);
      if (!previous && !options.upsert) return null;
      const item = { ...previous, ...update.$set, ...(previous ? {} : update.$setOnInsert) };
      catalog.set(key, item);
      return item;
    });
    EconomyInventory.updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 0 });
  });

  test('cria 23 itens de Fragmentos e 3 de Orbes com identificadores estáveis', async () => {
    await expect(seedEconomyStores('guild-1')).resolves.toEqual({ fragments: 23, orbs: 3 });
    expect(catalog.size).toBe(26);
    expect(new Set(products.map((item) => item.sku)).size).toBe(26);
    expect([...catalog.values()].filter((item) => item.currency === 'fragments')).toHaveLength(23);
    expect([...catalog.values()].filter((item) => item.currency === 'orbs')).toHaveLength(3);
  });

  test('preços do catálogo correspondem à lista solicitada', () => {
    const priceBySku = Object.fromEntries(products.map((item) => [item.sku, [item.currency, item.orbType || null, item.price]]));
    expect(priceBySku).toEqual({
      antidoto: ['fragments', null, 500],
      'pocao-energia-menor': ['fragments', null, 500],
      'pocao-vida-menor': ['fragments', null, 500],
      'tocha-sentinela': ['fragments', null, 600],
      'bola-de-cristal': ['fragments', null, 900],
      'dados-normais': ['fragments', null, 999],
      totem: ['fragments', null, 1200],
      'selo-monstros': ['fragments', null, 1333],
      picareta: ['fragments', null, 1500],
      'fragmento-diamantita': ['fragments', null, 2400],
      'boneco-palha': ['fragments', null, 3000],
      'coracao-pedra': ['fragments', null, 4500],
      'pesos-treino': ['fragments', null, 5000],
      bokken: ['fragments', null, 7000],
      'teoria-magia': ['fragments', null, 7000],
      'minerio-tier-1': ['fragments', null, 10000],
      'algemas-nulificadoras': ['fragments', null, 12500],
      'manto-invisibilidade': ['fragments', null, 15000],
      'minerio-tier-2': ['fragments', null, 15000],
      'cronometro-encantado': ['fragments', null, 15777],
      'bolsa-sem-fundo': ['fragments', null, 20000],
      'minerio-tier-3': ['fragments', null, 25000],
      casa: ['fragments', null, 100000],
      'tomo-esquecimento': ['orbs', 'orange', 10],
      'lagrima-larval': ['orbs', 'orange', 20],
      'manual-guerra': ['orbs', 'red', 10],
    });
  });

  test('executar o seed duas vezes atualiza os mesmos SKUs sem duplicar itens', async () => {
    await seedEconomyStores('guild-1');
    await seedEconomyStores('guild-1');

    expect(catalog.size).toBe(26);
    expect(EconomyItem.findOneAndUpdate).toHaveBeenCalledTimes(52);
    for (const [filter, , options] of EconomyItem.findOneAndUpdate.mock.calls) {
      expect(filter.guildId).toBe('guild-1');
      expect(options.upsert).toBe(true);
    }
  });

  test('os itens transferidos são semeados somente em Orbes e ficam utilizáveis sem consumo', async () => {
    await seedEconomyStores('guild-1');
    const bySku = new Map([...catalog.values()].map((item) => [item.sku, item]));
    expect(bySku.get('tomo-esquecimento')).toMatchObject({ currency: 'orbs', orbType: 'orange', price: 10, usable: true, consumeOnUse: false });
    expect(bySku.get('lagrima-larval')).toMatchObject({ currency: 'orbs', orbType: 'orange', price: 20, usable: true, consumeOnUse: false });
    expect(bySku.get('manual-guerra')).toMatchObject({ currency: 'orbs', orbType: 'red', price: 10, usable: true, consumeOnUse: false });
    expect([...catalog.values()].filter((item) => item.currency === 'fragments').map((item) => item.sku))
      .not.toEqual(expect.arrayContaining(['tomo-esquecimento', 'lagrima-larval']));
  });

  test('as mensagens de uso dos itens especiais são exatas e não executam ações automáticas', () => {
    const bySku = new Map(products.map((item) => [item.sku, item]));
    expect(bySku.get('tomo-esquecimento').useMessage).toBe('Você utilizou o Tomo do Esquecimento! Para realizar o reset de suas classes, dirija-se à staff do servidor.');
    expect(bySku.get('lagrima-larval').useMessage).toBe('Você utilizou a Lágrima Larval! Para realizar a redistribuição dos seus atributos, dirija-se à staff do servidor.');
    expect(bySku.get('manual-guerra').useMessage).toBe('Você utilizou o Manual da Guerra! Para realizar sua evolução de classe, certifique-se de cumprir os requisitos necessários e dirija-se à staff do servidor.');
    for (const sku of ['tomo-esquecimento', 'lagrima-larval', 'manual-guerra']) {
      expect(bySku.get(sku)).toMatchObject({ usable: true, consumeOnUse: false, action: 'none', actionAmount: 0 });
    }
  });

  test('itens com efeitos de vários usos ou duração permanecem no inventário para controle narrativo', () => {
    const bySku = new Map(products.map((item) => [item.sku, item]));
    expect(bySku.get('picareta')).toMatchObject({ usable: true, consumeOnUse: false });
    expect(bySku.get('boneco-palha')).toMatchObject({ usable: true, consumeOnUse: false });
  });

  test('preserva as opções de compra da Bola de Cristal e dos Minérios', () => {
    const bySku = new Map(products.map((item) => [item.sku, item]));
    expect(bySku.get('bola-de-cristal').purchaseChoices).toHaveLength(2);
    expect(bySku.get('minerio-tier-1').purchaseChoices.map((choice) => choice.label)).toEqual([
      '1kg de Oricalco', '1kg de Adamantita', '1kg de Mithril', '1kg de Obsidiano',
    ]);
    expect(bySku.get('minerio-tier-2').purchaseChoices.map((choice) => choice.label)).toEqual([
      '1kg de Vibrânio', '1kg de Dlithio', '1kg de Clorofita',
    ]);
  });

  test('atualiza apenas snapshots dos três itens pendentes sem alterar quantidade ou usuário', async () => {
    await seedEconomyStores('guild-1');
    expect(EconomyInventory.updateMany).toHaveBeenCalledTimes(3);
    expect(EconomyInventory.updateMany).toHaveBeenCalledWith(
      { guildId: 'guild-1', sku: 'tomo-esquecimento' },
      { $set: expect.objectContaining({ 'itemSnapshot.consumeOnUse': false, 'itemSnapshot.usable': true }) },
    );
  });
});
