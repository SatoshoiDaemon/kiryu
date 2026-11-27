jest.mock('../src/modules/xpService', () => ({
  ...jest.requireActual('../src/modules/xpService'),
  getProfile: jest.fn().mockResolvedValue({ level: 12, xp: 345 }),
}));
jest.mock('../src/modules/levelView', () => ({
  levelContainer: jest.fn(() => ({ toJSON: () => ({ type: 17 }) })),
}));
jest.mock('../src/modules/components', () => ({
  ...jest.requireActual('../src/modules/components'),
  replyMessageV2: jest.fn().mockResolvedValue(undefined),
}));

const config = require('../src/config');
const { loadCommands } = require('../src/handlers/loadCommands');
const { handlePrefixMessage } = require('../src/handlers/commandHandler');
const { getProfile } = require('../src/modules/xpService');
const { replyMessageV2 } = require('../src/modules/components');

describe('aliases de prefixo mantidos', () => {
  let client;

  beforeEach(() => {
    config.guildId = 'guild';
    client = { config: { prefix: '$' }, commands: loadCommands() };
    getProfile.mockClear();
    replyMessageV2.mockClear();
  });

  function message(content, member = null) {
    return {
      guild: { id: 'guild' },
      guildId: 'guild',
      content,
      author: { id: 'requester', bot: false },
      mentions: { users: { first: () => member } },
      reply: jest.fn().mockResolvedValue(undefined),
    };
  }

  test('$level ainda consulta o próprio nível ou o membro mencionado', async () => {
    const target = { id: 'target', username: 'Membro' };
    const request = message('$level <@target>', target);

    await handlePrefixMessage(request, client);

    expect(getProfile).toHaveBeenCalledWith('guild', 'target');
    expect(request.reply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { repliedUser: false, parse: [] } }));
  });

  test('$roll continua encaminhando expressões ao comando de dados atual', async () => {
    const request = message('$roll 1d20+3');

    await handlePrefixMessage(request, client);

    expect(replyMessageV2).toHaveBeenCalledWith(request, expect.stringContaining('Rolagem 1d20+3'));
  });
});
