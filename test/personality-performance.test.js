const { lines, say } = require('../src/modules/personality');
const metrics = require('../src/modules/performanceMetrics');

describe('personalidade da Kiryu', () => {
  test('mantém múltiplas falas contextuais e alterna repetições imediatas', () => {
    expect(lines.daily.length).toBeGreaterThan(1);
    expect(lines.casinoWin.length).toBeGreaterThan(1);
    expect(say('purchase', {}, () => 0)).not.toBe(say('purchase', {}, () => 0));
  });

  test('mantém mensagens de erro explícitas e compreensíveis', () => {
    expect(say('purchase', { item: 'Relicário' })).toMatch(/.+/);
    expect(lines.error.join(' ')).toMatch(/ação|sucesso/i);
  });
});

describe('métricas de desempenho', () => {
  test('agrega amostras por subsistema e expõe média, pico e buckets', () => {
    metrics.record('test', 'fixture', 35);
    metrics.record('test', 'fixture', 210);
    expect(metrics.snapshot()['test:fixture']).toMatchObject({ count: 2, max: 210, averageMs: 122.5 });
  });
});
