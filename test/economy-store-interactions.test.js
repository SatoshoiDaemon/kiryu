jest.mock('../src/modules/economyService', () => ({
  itemAvailability: jest.fn(() => ({ available: true, reason: '' })),
  getStoreItem: jest.fn(),
  buyItem: jest.fn(),
  getStorePage: jest.fn(),
  getAccount: jest.fn(),
  listInventory: jest.fn(),
  useInventoryItem: jest.fn(),
  bankTransfer: jest.fn(),
  convertOrbes: jest.fn(),
  getClaimableRules: jest.fn(),
  claimCollectRules: jest.fn(),
  deleteCatalogItem: jest.fn(),
}));
jest.mock('../src/modules/economyAdminService', () => ({ editCatalogItem: jest.fn() }));

const economyService = require('../src/modules/economyService');
const { handleEconomyInteraction } = require('../src/modules/economyInteractions');

function componentInteraction({ customId, type, values = [], id = 'interaction-id' }) {
  return {
    id,
    customId,
    guildId: 'guild-id',
    user: { id: 'user-id' },
    values,
    replied: false,
    deferred: false,
    isButton: () => type === 'button',
    isStringSelectMenu: () => type === 'select',
    isModalSubmit: () => false,
    reply: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

describe('compra de produtos com opções na loja', () => {
  beforeEach(() => jest.clearAllMocks());

  test('o botão da loja abre as opções e a seleção compra o produto escolhido', async () => {
    const item = {
      _id: 'item-id', sku: 'bola-de-cristal', name: 'Bola de Cristal', emoji: '🔮', description: 'Escolha o modelo:',
      currency: 'fragments', price: 900,
      purchaseChoices: [
        { value: 'increase', label: '1. Aumenta o custo da magia e o dano em 20%.' },
        { value: 'decrease', label: '2. Diminui o custo da magia e o dano em 20%.' },
      ],
    };
    economyService.getStoreItem.mockResolvedValue(item);
    const buyButton = componentInteraction({ customId: 'econ:store:buy:item-id:fragments:0:1', type: 'button' });

    await handleEconomyInteraction(buyButton);

    expect(economyService.buyItem).not.toHaveBeenCalled();
    expect(buyButton.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: expect.any(Number) }));
    const menuJson = JSON.stringify(buyButton.reply.mock.calls[0][0].components[0].toJSON());
    expect(menuJson).toContain('econ:store:choice:user-id:item-id:fragments:0');
    expect(menuJson).toContain('increase');
    expect(menuJson).toContain('decrease');

    economyService.buyItem.mockResolvedValue({
      item, quantity: 1, cost: 900, deliveredToInventory: true,
      selectedChoice: { value: 'decrease', label: item.purchaseChoices[1].label },
    });
    const select = componentInteraction({
      customId: 'econ:store:choice:user-id:item-id:fragments:0',
      type: 'select', values: ['decrease'], id: 'selection-interaction',
    });

    await handleEconomyInteraction(select);

    expect(economyService.buyItem).toHaveBeenCalledWith({
      guildId: 'guild-id', userId: 'user-id', itemId: 'item-id', purchaseChoice: 'decrease', interactionId: 'selection-interaction',
    });
    const confirmation = JSON.stringify(select.update.mock.calls[0][0].components[0].toJSON());
    expect(confirmation).toContain('2. Diminui o custo da magia e o dano em 20%.');
    expect(confirmation).toContain('adicionado ao seu inventário');
  });
});
