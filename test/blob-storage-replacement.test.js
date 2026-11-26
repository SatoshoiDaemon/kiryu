jest.mock('../src/database/models/BlobObject', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../src/database', () => ({
  MemberProfile: {}, EconomyItem: {}, GuildConfig: {}, BadgeDefinition: {},
  ManagedMessage: { updateOne: jest.fn() },
}));
jest.mock('@squarecloud/blob', () => ({
  SquareCloudBlob: jest.fn().mockImplementation(() => ({ delete: jest.fn().mockResolvedValue({ deleted: 1 }) })),
}));

const BlobObject = require('../src/database/models/BlobObject');
const { ManagedMessage } = require('../src/database');
const { replaceObject } = require('../src/modules/blobStorage');

describe('substituição de assets do Blob', () => {
  const originalApiKey = process.env.SQUARECLOUD_API_KEY;

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.SQUARECLOUD_API_KEY;
    else process.env.SQUARECLOUD_API_KEY = originalApiKey;
  });

  test('migra referências de mensagens gerenciadas e remove o objeto antigo', async () => {
    process.env.SQUARECLOUD_API_KEY = 'test-key';
    const oldObject = { _id: 'old-object', references: [{ system: 'message', key: 'message-1' }], save: jest.fn().mockResolvedValue(undefined) };
    const newObject = { _id: 'new-object', references: [], url: 'https://blob.example/new.png', filename: 'new.png' };
    BlobObject.findOne.mockImplementation(({ _id }) => Promise.resolve(_id === oldObject._id ? oldObject : newObject));
    BlobObject.findOneAndUpdate.mockImplementation((filter, update) => ({
      lean: async () => {
        const target = filter._id === oldObject._id ? oldObject : newObject;
        if (update.$push) target.references.push(update.$push.references);
        if (update.$pull) target.references = target.references.filter((reference) => !(reference.system === update.$pull.references.system && reference.key === update.$pull.references.key));
        return target;
      },
    }));
    BlobObject.findById.mockImplementation(() => ({ lean: async () => oldObject }));
    ManagedMessage.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(replaceObject(oldObject._id, newObject._id, 'guild-1')).resolves.toMatchObject({ deleted: true });

    expect(ManagedMessage.updateOne).toHaveBeenCalledWith({ guildId: 'guild-1', messageId: 'message-1', imageObjectId: oldObject._id }, {
      $set: { imageObjectId: newObject._id, 'payload.imageObjectId': newObject._id, 'payload.imageUrl': newObject.url },
    });
    expect(newObject.references).toEqual([{ system: 'message', key: 'message-1' }]);
    expect(oldObject.deletedAt).toBeInstanceOf(Date);
  });
});
