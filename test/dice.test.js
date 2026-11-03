const { parseDiceExpression } = require('../src/modules/dice');

describe('interpretação de dados', () => {
  test('interpreta dados e modificador positivo', () => {
    const result = parseDiceExpression('4d20+10', () => 5);
    expect(result).toMatchObject({ rolls: [5, 5, 5, 5], modifier: 10, total: 30 });
  });

  test('aplica modificador negativo', () => {
    expect(parseDiceExpression('3d6-2', () => 4).total).toBe(10);
  });

  test('rejeita sintaxe inválida e limites abusivos', () => {
    expect(() => parseDiceExpression('2d')).toThrow(/inválida/);
    expect(() => parseDiceExpression('101d20')).toThrow(/entre 1 e 100/);
    expect(() => parseDiceExpression('2d1')).toThrow(/entre 2 e 10.000/);
  });
});
