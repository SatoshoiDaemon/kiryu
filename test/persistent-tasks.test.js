const { Giveaway } = require('../src/database');
const { pickWinners, pollSummary, giveawayComponents } = require('../src/modules/persistentTasks');

describe('tarefas comunitárias persistentes', () => {
  test('seleciona vencedores distintos e evita repetir vencedores anteriores', () => {
    const winners = pickWinners(['a', 'b', 'c', 'd'], 3, ['a']);
    expect(winners).toHaveLength(3);
    expect(new Set(winners).size).toBe(3);
    expect(winners).not.toContain('a');
  });

  test('mostra resultados da enquete com contagem salva', () => {
    expect(pollSummary({ question: 'Qual trilha?', options: ['Norte', 'Sul'], votes: [{ option: 0 }, { option: 0 }, { option: 1 }] }))
      .toContain('1. **Norte** · 2 voto(s)');
  });

  test('serializa o botão de participação para recuperação da mensagem', () => {
    const components = giveawayComponents({ messageId: '123456789012345678' });
    expect(components[0].toJSON().components[0].custom_id).toBe('giveaway:join:123456789012345678');
  });

  test('persiste estados ativos e finalizados em coleções com índice por vencimento', () => {
    expect(Giveaway.schema.path('status').enumValues).toEqual(['active', 'ending', 'ended', 'cancelled']);
    expect(Giveaway.schema.indexes().some(([keys]) => keys.status === 1 && keys.endsAt === 1)).toBe(true);
  });
});
