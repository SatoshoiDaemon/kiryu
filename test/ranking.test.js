jest.mock('../src/database', () => ({
  UserXp: { find: jest.fn() }, EconomyAccount: { find: jest.fn() },
}));
jest.mock('../src/config', () => ({ guildId: 'guild', visual: { xp: 0xc0265a, fragments: 0xe8a317, dividerUrl: null, assetBaseUrl: 'https://cdn.example/kiryu' } }));

const { UserXp, EconomyAccount } = require('../src/database');
const { data, execute } = require('../src/commands/misc/ranking');

function query(rows) {
  return { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(rows) };
}

describe('ranking comunitário', () => {
  test('serializa ranking em Componentes V2 sem seção sem acessório', async () => {
    UserXp.find.mockReturnValue(query([{ userId: 'u', level: 99, xp: 30 }]));
    const interaction = {
      guildId: 'guild', user: { id: 'caller' },
      options: { getString: () => 'levels' },
      client: { users: { cache: new Map() } },
      editReply: jest.fn(),
    };
    await execute(interaction);
    const card = interaction.editReply.mock.calls[0][0].components[0].toJSON();
    expect(card.type).toBe(17);
    expect(JSON.stringify(card)).toContain('Nível **99**');
    data.toJSON();
  });
});
