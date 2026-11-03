const { createCooldownTracker } = require('../src/modules/cooldown');
const { getMultiplier } = require('../src/modules/xpService');

describe('cooldown individual de mensagens', () => {
  test('bloqueia o mesmo usuário pelo intervalo e permite outro usuário', () => {
    const tracker = createCooldownTracker();
    expect(tracker.canAward('guild:user-a', 5000, 10000)).toBe(true);
    expect(tracker.canAward('guild:user-a', 5000, 14999)).toBe(false);
    expect(tracker.canAward('guild:user-b', 5000, 10001)).toBe(true);
    expect(tracker.canAward('guild:user-a', 5000, 15000)).toBe(true);
  });
});

describe('multiplicadores por cargo', () => {
  const member = { roles: { cache: new Map([['vip', {}], ['booster', {}]]) } };
  const guildConfig = {
    buffs: [{ roleId: 'vip', multiplier: 1.5 }, { roleId: 'booster', multiplier: 2 }],
    stackBuffs: false,
  };

  test('aplica o maior multiplicador quando acumulação está desligada', () => {
    expect(getMultiplier(member, guildConfig)).toBe(2);
  });

  test('acumula multiplicadores quando configurado', () => {
    expect(getMultiplier(member, { ...guildConfig, stackBuffs: true })).toBe(3);
  });

  test('não aplica buff sem cargo correspondente', () => {
    expect(getMultiplier({ roles: { cache: new Map() } }, guildConfig)).toBe(1);
  });
});
