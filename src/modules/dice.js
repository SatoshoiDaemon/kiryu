const DICE_EXPRESSION = /^(\d{1,3})d(\d{1,5})(?:([+-])(\d{1,6}))?$/i;

function parseDiceExpression(expression, randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min) {
  const match = String(expression || '').trim().match(DICE_EXPRESSION);
  if (!match) throw new Error('Expressão inválida. Use, por exemplo, 2d20+3.');

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifierAmount = Number(match[4] || 0);
  const modifier = match[3] === '-' ? -modifierAmount : modifierAmount;
  if (count < 1 || count > 100) throw new RangeError('A quantidade de dados deve estar entre 1 e 100.');
  if (sides < 2 || sides > 10000) throw new RangeError('Cada dado deve ter entre 2 e 10.000 faces.');
  if (modifierAmount > 10000) throw new RangeError('O modificador deve estar entre -10.000 e 10.000.');

  const rolls = Array.from({ length: count }, () => randomInt(1, sides));
  const formatted = count + 'd' + sides + (modifier ? (modifier > 0 ? '+' : '') + modifier : '');
  return { expression: formatted, rolls, modifier, total: rolls.reduce((sum, roll) => sum + roll, modifier) };
}

module.exports = { DICE_EXPRESSION, parseDiceExpression };
