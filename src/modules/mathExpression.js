function calculate(input) {
  const source = String(input || '').replace(/\s+/g, '');
  if (!source || source.length > 80 || !/^[0-9.+\-*/^()]+$/.test(source)) throw new RangeError('Use apenas números, parênteses e os operadores +, −, ×, ÷ e ^.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/^]/g) || [];
  if (tokens.join('') !== source) throw new RangeError('A expressão matemática contém símbolos inválidos.');
  let index = 0;
  function primary() {
    const token = tokens[index++];
    if (token === '+') return expression(3);
    if (token === '-') return -expression(3);
    if (token === '(') {
      const value = expression(0);
      if (tokens[index++] !== ')') throw new RangeError('Feche os parênteses da expressão.');
      return value;
    }
    if (!token || !/^\d/.test(token) && !token.startsWith('.')) throw new RangeError('A expressão está incompleta.');
    const value = Number(token);
    if (!Number.isFinite(value)) throw new RangeError('O número informado é inválido.');
    return value;
  }
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  function expression(minPrecedence) {
    let left = primary();
    while (index < tokens.length) {
      const operator = tokens[index];
      const rank = precedence[operator];
      if (!rank || rank < minPrecedence) break;
      index += 1;
      const right = expression(rank + (operator === '^' ? 0 : 1));
      if (operator === '+') left += right;
      if (operator === '-') left -= right;
      if (operator === '*') left *= right;
      if (operator === '/') { if (right === 0) throw new RangeError('Não é possível dividir por zero.'); left /= right; }
      if (operator === '^') left = left ** right;
      if (!Number.isFinite(left) || Math.abs(left) > Number.MAX_SAFE_INTEGER) throw new RangeError('O resultado ultrapassa o limite seguro.');
    }
    return left;
  }
  const result = expression(0);
  if (index !== tokens.length) throw new RangeError('A expressão não pôde ser interpretada.');
  return Object.is(result, -0) ? 0 : result;
}

module.exports = { calculate };
