jest.mock('../src/modules/cooldown', () => ({ createCooldownTracker: () => ({ canAward: jest.fn(() => true) }) }));
jest.mock('../src/modules/xpService', () => ({ getGuildConfig: jest.fn(), awardMessageXp: jest.fn() }));
jest.mock('../src/modules/triggers', () => ({ findTrigger: jest.fn(() => null), chooseResponse: jest.fn(() => null) }));
jest.mock('../src/modules/levelUpNotifications', () => ({ notifyLevelUp: jest.fn().mockResolvedValue({ status: 'unconfigured' }) }));
jest.mock('../src/modules/aiConversation', () => ({ handleAIMessage: jest.fn().mockResolvedValue({ status: 'ignored' }) }));
jest.mock('../src/modules/communityCommands', () => ({ handleAfkMessage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/modules/components', () => ({ replyMessageV2: jest.fn() }));
jest.mock('../src/handlers/commandHandler', () => ({ handlePrefixMessage: jest.fn() }));
jest.mock('../src/logger', () => ({ warn: jest.fn() }));

const { getGuildConfig, awardMessageXp } = require('../src/modules/xpService');
const { notifyLevelUp } = require('../src/modules/levelUpNotifications');
const { handleAIMessage } = require('../src/modules/aiConversation');
const { replyMessageV2 } = require('../src/modules/components');
const { execute } = require('../src/events/messageCreate');

describe('notificação de XP em mensagens', () => {
  beforeEach(() => { jest.clearAllMocks(); getGuildConfig.mockResolvedValue({ triggers: [] }); });

  function fixture(result) {
    const message = {
      guild: {}, guildId: 'guild', channelId: 'conversation', content: 'mensagem normal',
      author: { id: 'member', bot: false, toString: () => '<@member>' }, member: {},
      reply: jest.fn(),
    };
    awardMessageXp.mockResolvedValue(result);
    return { message, client: { config: { guildId: 'guild', prefix: '!' }, commands: new Map() } };
  }

  test('level up de mensagem segue apenas para o serviço do canal dedicado', async () => {
    const result = { levelsGained: 1, level: 3, xp: 8, levelUp: { enabled: true, channelId: 'xp-feed' } };
    const { message, client } = fixture(result);
    await execute(message, client);
    expect(awardMessageXp).toHaveBeenCalledWith('guild', 'member', message.member, 'conversation', expect.any(Object), expect.any(Number), { guildConfig: { triggers: [] } });
    expect(notifyLevelUp).toHaveBeenCalledWith(message.guild, message.author, result);
    expect(handleAIMessage).toHaveBeenCalledWith(message, client, { guildConfig: { triggers: [] }, hasDeterministicResponse: false });
    expect(replyMessageV2).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
  });

  test('XP sem subida de nível não publica notificações', async () => {
    const { message, client } = fixture({ levelsGained: 0, level: 2, xp: 55, levelUp: { enabled: true, channelId: 'xp-feed' } });
    await execute(message, client);
    expect(awardMessageXp).toHaveBeenCalledTimes(1);
    expect(notifyLevelUp).not.toHaveBeenCalled();
    expect(replyMessageV2).not.toHaveBeenCalled();
    expect(handleAIMessage).toHaveBeenCalledTimes(1);
  });
});
