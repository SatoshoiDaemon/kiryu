jest.mock('../src/database', () => ({
  EconomyItem: { find: jest.fn() },
  EconomyAccount: {}, EconomyInventory: {}, EconomyTransaction: {}, EconomySettings: {}, EconomyCollectRule: {}, EconomyClaim: {},
}));
jest.mock('../src/modules/xpService', () => ({ getGuildConfig: jest.fn() }));

const config = require('../src/config');
const { EconomyItem } = require('../src/database');
const { handleConfigInteraction } = require('../src/modules/configPanel');

describe('configuração de lojas dentro de /config', () => {
  test('mostra catálogo e seleciona itens sem IDs internos na interface', async () => {
    EconomyItem.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ sku: 'item', name: 'Item', emoji: '🎁', currency: 'fragments', price: 25, stock: null }]),
    });
    const interaction = { customId: 'config:nav', user: { id: config.ownerId }, guildId: config.guildId,
      values: ['stores'], isStringSelectMenu: () => true, isButton: () => false, isRoleSelectMenu: () => false,
      isChannelSelectMenu: () => false, isModalSubmit: () => false, update: jest.fn() };
    await handleConfigInteraction(interaction);
    const card = interaction.update.mock.calls[0][0].components[0].toJSON();
    expect(JSON.stringify(card)).toContain('Item');
    expect(JSON.stringify(card)).toContain('config:store:select:0');
    expect(JSON.stringify(card)).not.toContain('MongoDB');
  });

  test('categoria de Orbe para um item novo é escolhida por seletor nativo', async () => {
    const interaction = { customId: 'config:store:create:orbs', user: { id: config.ownerId }, guildId: config.guildId,
      isButton: () => true, isStringSelectMenu: () => false, isRoleSelectMenu: () => false,
      isChannelSelectMenu: () => false, isModalSubmit: () => false, update: jest.fn() };
    await handleConfigInteraction(interaction);
    const menu = interaction.update.mock.calls[0][0].components[0].toJSON().components
      .flatMap((component) => component.components || []).find((component) => component.custom_id === 'config:store:create:orbtype');
    expect(menu.options.map((option) => option.value)).toEqual(['green', 'blue', 'orange', 'red', 'black', 'gold']);
  });

  test('modal de item de Orbes usa quatro campos após a categoria nativa', async () => {
    const interaction = { customId: 'config:store:create:orbtype', user: { id: config.ownerId }, guildId: config.guildId,
      values: ['blue'], isButton: () => false, isStringSelectMenu: () => true, isRoleSelectMenu: () => false,
      isChannelSelectMenu: () => false, isModalSubmit: () => false, showModal: jest.fn() };
    await expect(handleConfigInteraction(interaction)).resolves.toBe(true);
    expect(interaction.showModal.mock.calls[0][0].toJSON().components).toHaveLength(4);
    expect(interaction.showModal.mock.calls[0][0].toJSON().custom_id).toContain(':orbs:blue');
  });
});
