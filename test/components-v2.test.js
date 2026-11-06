const { MessageFlags } = require('discord.js');
const {
  basicContainer, collectContainer, inventoryContainer, orbsContainer, payload, respond, storeContainer, walletContainer,
} = require('../src/modules/economyViews');

jest.mock('../src/modules/configPanel', () => ({ handleConfigInteraction: jest.fn() }));
jest.mock('../src/modules/components', () => ({ replyV2: jest.fn() }));

const { handleInteraction } = require('../src/handlers/commandHandler');

function collectCustomIds(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectCustomIds(child, result));
  } else if (value && typeof value === 'object') {
    if (typeof value.custom_id === 'string') result.push(value.custom_id);
    Object.values(value).forEach((child) => collectCustomIds(child, result));
  }
  return result;
}

function collectComponentNodes(value, result = []) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectComponentNodes(child, result));
  } else if (value && typeof value === 'object') {
    if (Number.isInteger(value.type)) result.push(value);
    Object.values(value).forEach((child) => collectComponentNodes(child, result));
  }
  return result;
}

function expectValidV2Components(component) {
  const data = component.toJSON();
  const ids = collectCustomIds(data);
  expect(new Set(ids).size).toBe(ids.length);
  const nodes = collectComponentNodes(data);
  expect(nodes.length).toBeLessThanOrEqual(40);
  expect(nodes.filter((node) => node.type === 10).reduce((sum, node) => sum + node.content.length, 0)).toBeLessThanOrEqual(4000);
}

describe('respostas de Components V2', () => {
  test('edita a resposta adiada com a flag V2 junto ao container', async () => {
    const interaction = { deferred: true, replied: false, editReply: jest.fn() };
    const response = payload(basicContainer('# Orbes'), true);

    await respond(interaction, response);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
      components: response.components,
      flags: MessageFlags.IsComponentsV2,
    }));
  });

  test('mantém privacidade em respostas V2 ainda não adiadas', async () => {
    const interaction = { deferred: false, replied: false, reply: jest.fn() };
    const response = payload(basicContainer('# Recompensa diária'), true);

    await respond(interaction, response);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }));
  });

  test('adia o comando sem tentar definir Components V2 antes do primeiro conteúdo', async () => {
    const execute = jest.fn();
    const interaction = {
      commandName: 'orbes',
      isChatInputCommand: () => true,
      deferReply: jest.fn(),
    };

    await handleInteraction(interaction, { commands: new Map([['orbes', { execute, deferEphemeral: true }]]) });

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(execute).toHaveBeenCalledWith(interaction, expect.any(Object));
  });

  test('todos os componentes interativos da loja e do inventário têm custom_id único por mensagem', () => {
    const storeItems = [0, 1, 2].map((index) => ({
      _id: 'item-' + index,
      name: 'Item ' + index,
      description: 'Descrição',
      price: 100,
      purchaseQuantity: 1,
      currency: 'fragments',
      stock: null,
      availableFrom: null,
      availableUntil: null,
    }));
    const inventoryItems = [0, 1].map((index) => ({
      _id: 'entry-' + index,
      sku: 'pocao',
      quantity: 1,
      itemSnapshot: { name: 'Poção', description: '', usable: true },
    }));

    expectValidV2Components(storeContainer(storeItems, 'fragments', 0, 1));
    expectValidV2Components(storeContainer([], 'orbs', 0, 1));
    expectValidV2Components(inventoryContainer({ items: inventoryItems, total: 2, pages: 1 }, 'user', 'user'));
  });

  test('os outros layouts V2 da economia mantêm IDs interativos únicos', () => {
    const user = { id: 'user', username: 'Usuário', toString: () => '<@user>' };
    const account = { wallet: 10, bank: 20, orbs: {} };
    const rules = Array.from({ length: 26 }, (_, index) => ({
      _id: 'rule-' + index,
      name: 'Recompensa ' + index,
      fragments: 10,
      orbType: null,
      orbAmount: 0,
      stackable: true,
      frequency: 'daily',
    }));

    [
      walletContainer(user, account, 'user'),
      orbsContainer(account, 'user'),
      collectContainer(rules, 'user', 0),
    ].forEach(expectValidV2Components);
  });

  test('a loja e o inventário respeitam o limite agregado de texto V2', () => {
    const storeItems = Array.from({ length: 3 }, (_, index) => ({
      _id: 'item-' + index,
      name: 'n'.repeat(80),
      emoji: 'x'.repeat(64),
      description: 'd'.repeat(950),
      price: 100,
      purchaseQuantity: 1,
      currency: 'fragments',
      stock: Number.MAX_SAFE_INTEGER,
      availableFrom: null,
      availableUntil: new Date('9999-12-31T23:59:59.999Z'),
    }));
    const inventoryItems = Array.from({ length: 3 }, (_, index) => ({
      _id: 'entry-' + index,
      sku: 's'.repeat(32),
      quantity: Number.MAX_SAFE_INTEGER,
      itemSnapshot: { name: 'n'.repeat(80), emoji: 'x'.repeat(64), description: 'd'.repeat(800), usable: true },
    }));

    expectValidV2Components(storeContainer(storeItems, 'fragments', 0, 1));
    expectValidV2Components(inventoryContainer({ items: inventoryItems, total: 3, pages: 1 }, 'user', 'user'));
  });
});
