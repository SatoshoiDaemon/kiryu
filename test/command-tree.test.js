const { loadCommands } = require('../src/handlers/loadCommands');

function namesOfOptions(options = []) {
  return options.flatMap((option) => [option.name, ...namesOfOptions(option.options)]);
}

describe('árvore definitiva de comandos slash', () => {
  const commands = loadCommands();

  test('serializa todos os comandos e mantém nomes de comandos, grupos e opções em inglês', () => {
    const definitions = [...commands.values()].map((command) => command.data.toJSON());
    expect(definitions).toHaveLength(15);
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
    expect(names).toEqual(['casino', 'choose', 'coinflip', 'config', 'daily', 'inventory', 'money', 'orbs', 'profile', 'ranking', 'rewards', 'roll', 'shop', 'work', 'xp']);
    expect(names).not.toContain('orbes');
    expect(names).not.toContain('economia');
    expect(commands.get('orbs').data.description).toContain('Orbes');
  });
});
