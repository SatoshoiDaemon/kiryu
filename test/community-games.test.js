const { makeBoardGame, joinBoardGame, chooseRps, applyBoardMove, evaluateFive, compareScore, runPoker, runRace } = require('../src/modules/communityGames');

describe('regras dos jogos comunitários', () => {
  test('RPS guarda escolhas em segredo até os dois participantes escolherem', () => {
    let game = makeBoardGame('rps', 'a');
    game = joinBoardGame(game, 'b');
    chooseRps(game, 'a', 'rock');
    expect(game.status).toBe('active');
    expect(game.result).toBeNull();
    chooseRps(game, 'b', 'scissors');
    expect(game).toMatchObject({ status: 'completed', result: { winnerId: 'a', draw: false } });
    expect(() => chooseRps(game, 'a', 'paper')).toThrow(/não está ativa/);
  });

  test('Quatro em linha aplica turnos e detecta uma coluna vencedora', () => {
    let game = makeBoardGame('connect4', 'a');
    game = joinBoardGame(game, 'b');
    for (const [userId, column] of [['a',0],['b',1],['a',0],['b',1],['a',0],['b',1],['a',0]]) {
      game = applyBoardMove(game, userId, column).state;
    }
    expect(game).toMatchObject({ status: 'completed', result: { winnerId: 'a', token: 'R' }, moves: 7 });
    expect(() => applyBoardMove(game, 'b', 2)).toThrow(/não está ativa/);
  });

  test('jogo da velha valida turno e fecha vitória ou empate', () => {
    let game = joinBoardGame(makeBoardGame('tictactoe', 'a'), 'b');
    expect(() => applyBoardMove(game, 'b', 0)).toThrow(/vez/);
    for (const [userId, cell] of [['a',0],['b',3],['a',1],['b',4],['a',2]]) game = applyBoardMove(game, userId, cell).state;
    expect(game).toMatchObject({ status: 'completed', result: { winnerId: 'a', token: 'X' } });
  });

  test('avalia poker de cinco cartas e produz uma corrida reproduzível', () => {
    const royalFlush = [
      { rank: 1, suit: 0 }, { rank: 10, suit: 0 }, { rank: 11, suit: 0 }, { rank: 12, suit: 0 }, { rank: 13, suit: 0 },
    ];
    const pair = [
      { rank: 8, suit: 0 }, { rank: 8, suit: 1 }, { rank: 3, suit: 2 }, { rank: 5, suit: 3 }, { rank: 11, suit: 1 },
    ];
    expect(evaluateFive(royalFlush)[0]).toBe(8);
    expect(compareScore(evaluateFive(royalFlush), evaluateFive(pair))).toBeGreaterThan(0);
    const race = runRace(['a', 'b'], () => 4);
    expect(race).toMatchObject({ rounds: 5, winnerIds: ['a', 'b'], draw: true });
    expect(() => runPoker(['a'], () => 0)).toThrow(/2 a 6/);
  });
});
