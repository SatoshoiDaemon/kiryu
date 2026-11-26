jest.mock('../src/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }));

const logger = require('../src/logger');
const { notifyLevelUp, levelUpText } = require('../src/modules/levelUpNotifications');

function fixture({ channelId = 'announcements', permissions = true, send = jest.fn().mockResolvedValue(undefined), fetch = jest.fn() } = {}) {
  const channel = {
    id: channelId, isTextBased: () => true, send,
    permissionsFor: () => ({ has: () => permissions }),
  };
  const guild = {
    channels: { cache: new Map(channelId ? [[channelId, channel]] : []), fetch },
    members: { me: { id: 'bot' } },
  };
  const user = { id: 'member', toString: () => '<@member>' };
  const result = { levelsGained: 1, level: 5, xp: 23, levelUp: { enabled: true, channelId, message: 'Parabéns {member}: nível {level}, {xp} XP.' } };
  return { channel, guild, user, result, send };
}

describe('roteamento das notificações de nível', () => {
  beforeEach(() => jest.clearAllMocks());

  test('publica no canal dedicado com as variáveis renderizadas', async () => {
    const state = fixture();
    await expect(notifyLevelUp(state.guild, state.user, state.result)).resolves.toEqual({ status: 'sent' });
    expect(state.send).toHaveBeenCalledTimes(1);
    const payload = state.send.mock.calls[0][0];
    expect(JSON.stringify(payload.components[0].toJSON())).toContain('Parabéns <@member>: nível 5, 23 XP.');
    expect(payload.allowedMentions.users).toEqual(['member']);
    expect(levelUpText(state.result, state.user)).toContain('XP neste nível');
  });

  test('não envia em conversas quando o canal não foi configurado', async () => {
    const state = fixture({ channelId: '' });
    state.result.levelUp.channelId = '';
    await expect(notifyLevelUp(state.guild, state.user, state.result)).resolves.toEqual({ status: 'unconfigured' });
    expect(state.send).not.toHaveBeenCalled();
  });

  test('trata canal removido e permissões insuficientes sem lançar ou tentar outro destino', async () => {
    const missing = fixture({ channelId: 'deleted', fetch: jest.fn().mockRejectedValue(new Error('Unknown Channel')) });
    missing.guild.channels.cache.clear();
    await expect(notifyLevelUp(missing.guild, missing.user, missing.result)).resolves.toEqual({ status: 'missing' });
    expect(missing.send).not.toHaveBeenCalled();

    const forbidden = fixture({ permissions: false });
    await expect(notifyLevelUp(forbidden.guild, forbidden.user, forbidden.result)).resolves.toEqual({ status: 'forbidden' });
    expect(forbidden.send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  test('notifica falha de envio sem interromper a concessão de XP', async () => {
    const state = fixture({ send: jest.fn().mockRejectedValue(new Error('Missing Permissions')) });
    await expect(notifyLevelUp(state.guild, state.user, state.result)).resolves.toEqual({ status: 'failed' });
    expect(state.send).toHaveBeenCalledTimes(1);
  });
});
