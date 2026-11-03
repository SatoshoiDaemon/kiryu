jest.mock('../src/modules/xpService', () => ({
  awardVoiceXp: jest.fn(),
  getGuildConfig: jest.fn(),
}));

const config = require('../src/config');
const { awardVoiceXp, getGuildConfig } = require('../src/modules/xpService');
const { sweep, trackedMembers } = require('../src/modules/voiceXp');

function makeClient(states) {
  const guild = {
    id: config.guildId,
    voiceStates: { cache: new Map(states.map((state) => [state.member.id, state])) },
  };
  for (const state of states) state.member.guild = guild;
  return { guilds: { cache: new Map([[guild.id, guild]]) } };
}

describe('XP por voz', () => {
  beforeEach(() => {
    trackedMembers.clear();
    awardVoiceXp.mockReset().mockResolvedValue({});
    getGuildConfig.mockReset().mockResolvedValue({
      voiceXp: { min: 20, max: 100, intervalMs: 300000, excludedChannelIds: [] },
    });
  });

  test('inicia a contagem ao detectar usuários conectados e concede XP após o intervalo', async () => {
    const member = { id: 'user-a', user: { bot: false }, voice: { channelId: 'voice-a' } };
    const client = makeClient([{ member, channelId: 'voice-a' }]);
    await sweep(client);
    expect(awardVoiceXp).not.toHaveBeenCalled();
    const startedAt = trackedMembers.get(config.guildId + ':user-a').lastAwardAt;
    await sweep(client, startedAt + 300000);
    expect(awardVoiceXp).toHaveBeenCalledWith(config.guildId, 'user-a', member);
  });

  test('não concede XP a bots, desconectados ou em canais excluídos', async () => {
    const bot = { id: 'bot', user: { bot: true }, voice: { channelId: 'voice-a' } };
    const excluded = { id: 'excluded', user: { bot: false }, voice: { channelId: 'voice-x' } };
    const disconnected = { id: 'disconnected', user: { bot: false }, voice: { channelId: null } };
    getGuildConfig.mockResolvedValue({
      voiceXp: { min: 20, max: 100, intervalMs: 60000, excludedChannelIds: ['voice-x'] },
    });
    const client = makeClient([
      { member: bot, channelId: 'voice-a' },
      { member: excluded, channelId: 'voice-x' },
      { member: disconnected, channelId: null },
    ]);
    await sweep(client, Date.now() + 3600000);
    expect(awardVoiceXp).not.toHaveBeenCalled();
  });
});
