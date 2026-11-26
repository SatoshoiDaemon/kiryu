jest.mock('../src/database', () => ({
  BadgeDefinition: { find: jest.fn() },
  MemberProfile: { findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('../src/modules/permissions', () => ({ isAuthorized: jest.fn() }));

const { BadgeDefinition, MemberProfile } = require('../src/database');
const { isAuthorized } = require('../src/modules/permissions');
const { data, execute, handleBadgeInteraction } = require('../src/commands/admin/badges');

function listQuery(data) {
  return { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(data) };
}

describe('/badges administração', () => {
  beforeEach(() => {
    isAuthorized.mockReset().mockResolvedValue(true);
    BadgeDefinition.find.mockReset();
    MemberProfile.findOneAndUpdate.mockReset().mockResolvedValue(undefined);
    MemberProfile.updateOne.mockReset().mockResolvedValue(undefined);
  });

  test('serializa operações de atribuição e remoção', () => {
    expect(data.toJSON().options.map((option) => option.name)).toEqual(['assign', 'remove']);
  });

  test('abre seletor nativo de badges para atribuição', async () => {
    BadgeDefinition.find.mockReturnValue(listQuery([{ _id: 'badge-1', name: 'Farol', symbol: '✧', category: 'events' }]));
    const interaction = {
      member: {}, user: { id: 'staff' }, guildId: 'guild',
      options: { getSubcommand: () => 'assign', getUser: () => ({ id: 'member' }) },
      editReply: jest.fn().mockResolvedValue(undefined),
    };
    await execute(interaction);
    const output = interaction.editReply.mock.calls[0][0];
    expect(JSON.stringify(output.components[0].toJSON())).toContain('badge-admin:assign:member');
    expect(JSON.stringify(output.components[0].toJSON())).toContain('Farol');
  });

  test('atribui badge especial sem duplicatas e verifica novamente a permissão', async () => {
    BadgeDefinition.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: 'badge-1' }]) });
    const interaction = {
      customId: 'badge-admin:assign:member', member: {}, user: { id: 'staff' }, guildId: 'guild', values: ['badge-1'],
      isStringSelectMenu: () => true, update: jest.fn().mockResolvedValue(undefined),
    };
    await expect(handleBadgeInteraction(interaction)).resolves.toBe(true);
    expect(MemberProfile.findOneAndUpdate).toHaveBeenCalledWith(
      { guildId: 'guild', userId: 'member' }, { $addToSet: { specialBadges: { $each: ['badge-1'] } } },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    expect(isAuthorized).toHaveBeenCalledWith(interaction.member, 'staff', 'guild');
  });

  test('remove badges revoga IDs selecionados', async () => {
    BadgeDefinition.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ _id: 'badge-1' }, { _id: 'badge-2' }]) });
    const interaction = {
      customId: 'badge-admin:remove:member', member: {}, user: { id: 'staff' }, guildId: 'guild', values: ['badge-1', 'badge-2'],
      isStringSelectMenu: () => true, update: jest.fn().mockResolvedValue(undefined),
    };
    await handleBadgeInteraction(interaction);
    expect(MemberProfile.updateOne).toHaveBeenCalledWith({ guildId: 'guild', userId: 'member' }, { $pullAll: { specialBadges: ['badge-1', 'badge-2'] } });
  });
});
