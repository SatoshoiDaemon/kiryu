const {
  resolveInstantGame, blackjackTotal, createBlackjackState, stepBlackjack, blackjackPayout,
  createMinesState, minesMultiplier, revealMine, WHEEL, KENO_PAYOUTS, TREASURE_PAYOUTS,
} = require('../src/modules/casinoGames');

describe('regras do cassino', () => {
  test('cara ou coroa usa uma escolha uniforme e paga o total configurado', () => {
    expect(resolveInstantGame({ game: 'coin', bet: 100, choice: 'heads', multiplier: 2, randomInt: () => 0 }))
      .toMatchObject({ payout: 200, net: 100, outcome: 'heads' });
    expect(resolveInstantGame({ game: 'coin', bet: 100, choice: 'heads', randomInt: () => 1 }))
      .toMatchObject({ payout: 0, net: -100, outcome: 'tails' });
  });

  test('roleta europeia usa zero verde, 18 vermelhos e retornos publicados', () => {
    expect(resolveInstantGame({ game: 'roulette', bet: 10, choice: 'red', randomInt: () => 1 }))
      .toMatchObject({ payout: 20, outcome: { pocket: 1, color: 'red' } });
    expect(resolveInstantGame({ game: 'roulette', bet: 10, choice: 'even', randomInt: () => 0 }))
      .toMatchObject({ payout: 0, outcome: { pocket: 0, color: 'green' } });
    expect(resolveInstantGame({ game: 'roulette', bet: 10, choice: '7', randomInt: () => 7 }))
      .toMatchObject({ payout: 360, net: 350 });
    expect(() => resolveInstantGame({ game: 'roulette', bet: 10, choice: '37' })).toThrow(/0 a 36/);
  });

  test('alto/baixo devolve a aposta em empate e só paga resultado favorável', () => {
    const values = [5, 5];
    expect(resolveInstantGame({ game: 'highlow', bet: 50, choice: 'high', randomInt: () => values.shift() }))
      .toMatchObject({ payout: 50, net: 0, details: { push: true } });
    const next = [4, 12];
    expect(resolveInstantGame({ game: 'highlow', bet: 50, choice: 'high', randomInt: () => next.shift() }))
      .toMatchObject({ payout: 100, net: 50 });
  });

  test('roda, keno e baús têm tabelas publicadas e apostas inteiras', () => {
    expect(WHEEL).toHaveLength(16);
    expect(WHEEL.reduce((sum, value) => sum + value, 0) / WHEEL.length).toBeLessThan(1);
    expect(KENO_PAYOUTS).toMatchObject({ 0: 0, 2: 0.5, 5: 100 });
    expect(TREASURE_PAYOUTS).toEqual([0, 0, 1, 1, 3]);
    expect(() => resolveInstantGame({ game: 'keno', bet: 10, numbers: [1, 1, 2, 3, 4] })).toThrow(/cinco números/);
  });

  test('cartas contam Ás como 1 ou 11 e Blackjack termina com ações determinísticas', () => {
    expect(blackjackTotal([{ rank: 1 }, { rank: 10 }])).toBe(21);
    expect(blackjackTotal([{ rank: 1 }, { rank: 9 }, { rank: 5 }])).toBe(15);
    const state = { deck: [{ rank: 10, suit: 0 }], player: [{ rank: 10, suit: 1 }, { rank: 8, suit: 1 }], dealer: [{ rank: 10, suit: 2 }, { rank: 6, suit: 2 }], status: 'active' };
    expect(stepBlackjack(state, 'hit').state.outcome).toBe('loss');
    expect(() => stepBlackjack(state, 'stand')).toThrow(/já terminou/);
    expect(blackjackPayout({ outcome: 'natural' }, 101)).toBe(252);
  });

  test('Minas persiste casas e calcula pagamentos progressivos sem casas repetidas', () => {
    const game = createMinesState({ randomInt: (min) => min });
    expect(game.mines).toHaveLength(5);
    expect(new Set(game.mines).size).toBe(5);
    expect(minesMultiplier(0)).toBe(1);
    expect(minesMultiplier(1)).toBe(1.18);
    const safeCell = Array.from({ length: 25 }, (_, index) => index).find((index) => !game.mines.includes(index));
    const first = revealMine(game, safeCell);
    expect(first).toMatchObject({ hitMine: false, state: { status: 'active', revealed: [safeCell] } });
    expect(() => revealMine(game, safeCell)).toThrow(/ainda fechada/);
    const mine = game.mines[0];
    expect(revealMine(game, mine)).toMatchObject({ hitMine: true, state: { status: 'busted' } });
  });

  test('slots e dados usam retornos totais explícitos sem quase-vitória', () => {
    const same = [0, 0, 0];
    expect(resolveInstantGame({ game: 'slots', bet: 40, multiplier: 5, randomInt: () => same.shift() }))
      .toMatchObject({ payout: 200, net: 160, details: { triple: true } });
    const pair = [0, 0, 1];
    expect(resolveInstantGame({ game: 'slots', bet: 40, randomInt: () => pair.shift() }))
      .toMatchObject({ payout: 40, net: 0, details: { pair: true } });
    expect(resolveInstantGame({ game: 'dice', bet: 30, choice: 'high', randomInt: () => 4 }))
      .toMatchObject({ payout: 30, net: 0, details: { push: true } });
  });

  test('keno e baús retornam o resultado completo e rejeitam entrada inválida', () => {
    expect(resolveInstantGame({ game: 'keno', bet: 10, numbers: [1, 2, 3, 4, 5], randomInt: (_min, max) => max - 1 }))
      .toMatchObject({ outcome: { hits: 5, draw: expect.arrayContaining([1, 2, 3, 4, 5]) }, details: { totalMultiplier: 100 } });
    const chestValues = [0, 0, 0, 0];
    expect(resolveInstantGame({ game: 'treasure', bet: 25, choice: '0', randomInt: () => chestValues.shift() ?? 0 }))
      .toMatchObject({ payout: 0, outcome: { selected: 0, chests: expect.arrayContaining([0, 1, 3]) } });
  });
});
