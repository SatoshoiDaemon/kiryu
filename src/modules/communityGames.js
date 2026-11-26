const crypto = require('node:crypto');

function makeBoardGame(game, ownerId) {
  if (!['rps', 'connect4', 'tictactoe'].includes(game)) throw new RangeError('Jogo comunitário inválido.');
  return game === 'connect4'
    ? { game, players: [ownerId], board: Array.from({ length: 6 }, () => Array(7).fill(null)), turn: 0, moves: 0, status: 'open', result: null }
    : game === 'tictactoe'
      ? { game, players: [ownerId], board: Array(9).fill(null), turn: 0, moves: 0, status: 'open', result: null }
      : { game, players: [ownerId], choices: {}, status: 'open', result: null };
}

function joinBoardGame(state, userId) {
  if (state.status !== 'open') throw new Error('A sala não está mais aberta.');
  if (state.players.includes(userId)) return state;
  if (state.players.length >= 2) throw new Error('Esta partida já está cheia.');
  state.players.push(userId);
  state.status = 'active';
  return state;
}

function rpsResult(a, b) {
  if (a === b) return 'draw';
  return ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) ? 'first' : 'second';
}

function chooseRps(state, userId, choice) {
  if (state.game !== 'rps' || state.status !== 'active') throw new Error('Esta partida de RPS não está ativa.');
  if (!state.players.includes(userId)) throw new Error('Você não participa desta partida.');
  if (!['rock', 'paper', 'scissors'].includes(choice)) throw new RangeError('Escolha pedra, papel ou tesoura.');
  if (state.choices[userId]) throw new Error('Sua escolha já foi registrada.');
  state.choices[userId] = choice;
  if (state.players.every((id) => state.choices[id])) {
    const [first, second] = state.players;
    const result = rpsResult(state.choices[first], state.choices[second]);
    state.status = 'completed';
    state.result = { winnerId: result === 'draw' ? null : result === 'first' ? first : second, draw: result === 'draw' };
  }
  return state;
}

function lineWinner(board, row, column, token, rows, columns, target = 4) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  return dirs.some(([dr, dc]) => {
    let count = 1;
    for (const direction of [-1, 1]) {
      let r = row + dr * direction; let c = column + dc * direction;
      while (r >= 0 && r < rows && c >= 0 && c < columns && board[r][c] === token) { count += 1; r += dr * direction; c += dc * direction; }
    }
    return count >= target;
  });
}

function applyBoardMove(state, userId, position) {
  if (!['connect4', 'tictactoe'].includes(state.game) || state.status !== 'active') throw new Error('Esta partida não está ativa.');
  const [first, second] = state.players;
  const current = state.turn % 2 ? second : first;
  if (current !== userId) throw new Error('Ainda não é sua vez.');
  if (state.game === 'tictactoe') {
    if (!Number.isInteger(position) || position < 0 || position > 8 || state.board[position]) throw new RangeError('Escolha uma casa vazia do tabuleiro.');
    const token = current === first ? 'X' : 'O';
    state.board[position] = token;
    state.moves += 1;
    state.turn += 1;
    if (lineWinner([state.board.slice(0,3),state.board.slice(3,6),state.board.slice(6,9)], Math.floor(position / 3), position % 3, token, 3, 3, 3)) {
      state.status = 'completed'; state.result = { winnerId: current, token };
    }
  } else {
    if (!Number.isInteger(position) || position < 0 || position > 6) throw new RangeError('Escolha uma coluna entre 1 e 7.');
    let row = -1;
    for (let candidate = 5; candidate >= 0; candidate -= 1) if (!state.board[candidate][position]) { row = candidate; break; }
    if (row < 0) throw new RangeError('Essa coluna está cheia.');
    const token = current === first ? 'R' : 'Y';
    state.board[row][position] = token;
    state.moves += 1;
    state.turn += 1;
    if (lineWinner(state.board, row, position, token, 6, 7, 4)) { state.status = 'completed'; state.result = { winnerId: current, token }; }
  }
  const draw = state.game === 'connect4' ? state.moves >= 42 : state.moves >= 9;
  if (state.status === 'active' && draw) { state.status = 'completed'; state.result = { winnerId: null, draw: true }; }
  return { state, currentPlayerId: current };
}

function shuffledDeck(randomInt = crypto.randomInt) {
  const cards = Array.from({ length: 52 }, (_, index) => ({ rank: (index % 13) + 1, suit: Math.floor(index / 13) }));
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = randomInt(0, index + 1);
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

function evaluateFive(cards) {
  const ranks = cards.map((card) => card.rank === 1 ? 14 : card.rank).sort((a,b) => b-a);
  const counts = new Map();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
  const groups = [...counts.entries()].sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(ranks)].sort((a,b) => b-a);
  const straightHigh = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0]
    : unique.toString() === '14,5,4,3,2' ? 5 : 0;
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a,b) => b-a)];
  const pairs = groups.filter(([,count]) => count === 2).map(([rank]) => rank).sort((a,b) => b-a);
  if (pairs.length === 2) return [2, ...pairs, groups.find(([,count]) => count === 1)[0]];
  if (pairs.length === 1) return [1, pairs[0], ...groups.filter(([,count]) => count === 1).map(([rank]) => rank).sort((a,b) => b-a)];
  return [0, ...ranks];
}

function compareScore(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

function bestPokerHand(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a += 1) for (let b = a + 1; b < cards.length - 3; b += 1)
    for (let c = b + 1; c < cards.length - 2; c += 1) for (let d = c + 1; d < cards.length - 1; d += 1)
      for (let e = d + 1; e < cards.length; e += 1) {
        const score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (!best || compareScore(score, best) > 0) best = score;
      }
  return best;
}

function runPoker(players, randomInt = crypto.randomInt) {
  if (players.length < 2 || players.length > 6) throw new RangeError('Poker recreativo aceita de 2 a 6 participantes.');
  const deck = shuffledDeck(randomInt);
  const holes = Object.fromEntries(players.map((id) => [id, [deck.pop(), deck.pop()]]));
  const community = Array.from({ length: 5 }, () => deck.pop());
  const scores = players.map((id) => ({ userId: id, score: bestPokerHand([...holes[id], ...community]) }));
  const best = scores.reduce((current, row) => !current || compareScore(row.score, current) > 0 ? row : current, null);
  const winners = scores.filter((row) => compareScore(row.score, best.score) === 0).map((row) => row.userId);
  return { holes, community, scores, winnerIds: winners, draw: winners.length > 1 };
}

function runRace(players, randomInt = crypto.randomInt) {
  if (players.length < 2 || players.length > 8) throw new RangeError('A corrida recreativa aceita de 2 a 8 participantes.');
  const finish = 20;
  const tracks = players.map((userId) => ({ userId, progress: 0, steps: [] }));
  let round = 0;
  while (round < 20 && !tracks.some((track) => track.progress >= finish)) {
    tracks.forEach((track) => { const step = randomInt(1, 5); track.steps.push(step); track.progress += step; });
    round += 1;
  }
  const max = Math.max(...tracks.map((track) => track.progress));
  const winnerIds = tracks.filter((track) => track.progress === max).map((track) => track.userId);
  return { tracks, winnerIds, draw: winnerIds.length > 1, rounds: round };
}

function startRps(state) {
  if (state.players.length !== 2) throw new Error('Pedra, papel e tesoura precisa de dois participantes.');
  state.status = 'active';
  return state;
}

module.exports = { makeBoardGame, joinBoardGame, rpsResult, chooseRps, applyBoardMove, evaluateFive, compareScore, bestPokerHand, runPoker, runRace, startRps };
