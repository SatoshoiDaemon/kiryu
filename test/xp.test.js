const {
  requiredXP,
  addXp,
  removeXp,
  addLevels,
  removeLevels,
  progressBar,
} = require('../src/modules/xp');

describe('progressão de experiência', () => {
  test.each([[0, 100], [1, 200], [2, 300], [10, 1100], [50, 5100], [100, 10100]])(
    'nível %i exige %i XP',
    (level, expected) => expect(requiredXP(level)).toBe(expected),
  );

  test('preserva XP excedente ao subir de nível', () => {
    expect(addXp({ level: 0, xp: 90 }, 25)).toMatchObject({ level: 1, xp: 15, levelsGained: 1 });
  });

  test('concede vários níveis em uma única alteração', () => {
    expect(addXp({ level: 0, xp: 0 }, 650)).toMatchObject({ level: 3, xp: 50, levelsGained: 3 });
  });

  test('remove XP atravessando níveis anteriores', () => {
    expect(removeXp({ level: 2, xp: 10 }, 50)).toMatchObject({ level: 1, xp: 160, levelsLost: 1, xpRemoved: 50 });
  });

  test('não deixa XP ou nível negativos ao remover mais XP que o saldo', () => {
    expect(removeXp({ level: 1, xp: 10 }, 1000)).toMatchObject({ level: 0, xp: 0, levelsLost: 1, xpRemoved: 110 });
  });

  test('adiciona e remove níveis mantendo progresso válido', () => {
    expect(addLevels({ level: 2, xp: 50 }, 3)).toMatchObject({ level: 5, xp: 50 });
    expect(removeLevels({ level: 2, xp: 50 }, 4)).toMatchObject({ level: 0, xp: 50, levelsLost: 2 });
  });

  test('barra de progresso respeita o limite e o tamanho', () => {
    expect(progressBar(50, 0, 10)).toBe('█████░░░░░');
    expect(progressBar(150, 0, 10)).toBe('██████████');
  });
});
