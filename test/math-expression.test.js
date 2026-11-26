const { calculate } = require('../src/modules/mathExpression');

describe('calculadora segura', () => {
  test.each([
    ['(12 + 3) * 4 / 2', 30],
    ['2^3^2', 512],
    ['-2^2', -4],
    ['2^-2', 0.25],
    ['8 / 4 * 2', 4],
  ])('calcula %s', (expression, expected) => {
    expect(calculate(expression)).toBe(expected);
  });

  test.each(['1/0', '2**3', 'process.exit()', '9^99', '(2+3'])('recusa expressões inseguras ou inválidas: %s', (expression) => {
    expect(() => calculate(expression)).toThrow(RangeError);
  });
});
