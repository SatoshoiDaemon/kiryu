jest.mock('../src/modules/aiGateway', () => ({ cancelRequest: jest.fn() }));

const { cancelRequest } = require('../src/modules/aiGateway');
const { execute } = require('../src/events/messageDelete');

test('apaga uma geração vinculada à mensagem de origem removida', () => {
  execute({ id: 'source-message' });
  execute({});
  expect(cancelRequest).toHaveBeenCalledTimes(1);
  expect(cancelRequest).toHaveBeenCalledWith('source-message');
});
