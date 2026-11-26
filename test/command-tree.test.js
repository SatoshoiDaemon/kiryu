const { loadCommands } = require('../src/handlers/loadCommands');

function namesOfOptions(options = []) {
  return options.flatMap((option) => [option.name, ...namesOfOptions(option.options)]);
}

describe('árvore definitiva de comandos slash', () => {
  const commands = loadCommands();

  test('serializa todos os comandos e mantém nomes de comandos, grupos e opções em inglês', () => {
    const definitions = [...commands.values()].map((command) => command.data.toJSON());
    expect(definitions).toHaveLength(52);
    for (const definition of definitions) {
      expect(definition.name).toMatch(/^[a-z][a-z0-9_-]*$/);
      for (const name of namesOfOptions(definition.options)) expect(name).toMatch(/^[a-z][a-z0-9_-]*$/);
    }
  });

  test('expõe progressão administrativa sob /xp e todas as operações de nível no grupo level', () => {
    const xp = commands.get('xp').data.toJSON();
    expect(xp.options.map((option) => option.name)).toEqual(['add', 'remove', 'set', 'reset', 'level']);
    expect(xp.options.at(-1).options.map((option) => option.name)).toEqual(['view', 'add', 'remove', 'set']);
  });

  test('usa raízes inglesas e mantém descrições em português', () => {
    const names = [...commands.keys()].sort();
    expect(names).toEqual(['afk', 'announce', 'avatar', 'badges', 'ban', 'banner', 'botinfo', 'calculate', 'casino', 'channelinfo', 'choose', 'coinflip', 'color', 'config', 'daily', 'dice', 'embed', 'emojiinfo', 'giveaway', 'help', 'inventory', 'kick', 'lock', 'membercount', 'money', 'orbs', 'ping', 'poll', 'profile', 'profile-edit', 'purge', 'qr', 'random', 'ranking', 'remind', 'rewards', 'roleinfo', 'serverinfo', 'shop', 'slowmode', 'stickerinfo', 'timeout', 'timestamp', 'translate', 'unban', 'unlock', 'uptime', 'userinfo', 'warn', 'warnings', 'work', 'xp']);
    expect(names).not.toContain('orbes');
    expect(names).not.toContain('economia');
    expect(names).not.toContain('roll');
    expect(commands.get('orbs').data.description).toContain('Orbes');
  });

  test('/config mantém importação do System Prompt e upload de assets opcionais', () => {
    const config = commands.get('config').data.toJSON();
    expect(config.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'prompt_file', type: 11, required: false }),
      expect.objectContaining({ name: 'asset_file', type: 11, required: false }),
    ]));
  });
});
