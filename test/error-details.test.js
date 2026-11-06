const { errorDetails } = require('../src/modules/errorDetails');

test('diagnóstico inclui nome, código e mensagem do MongoDB', () => {
  expect(errorDetails({ name: 'MongoServerError', code: 20, codeName: 'IllegalOperation', message: 'Transaction numbers are only allowed on a replica set member or mongos' }))
    .toContain('MongoServerError | 20 | IllegalOperation | Transaction numbers');
});

test('diagnóstico oculta URI e tokens e evita injeção de linhas no log', () => {
  const key = 'TEST_SECRET';
  const previous = process.env[key];
  process.env[key] = 'sensitive-value';
  try {
    const result = errorDetails(new Error('mongodb://user:password@host/db sensitive-value\nnext line'));
    expect(result).not.toMatch(/password|sensitive-value|\n/);
    expect(result).toContain('[MongoDB URI redacted]');
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
