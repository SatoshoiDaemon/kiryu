const crypto = require('node:crypto');

const SYMBOLS = ['🌸', '⚔️', '🔮', '👑', '🐉'];
const WHEEL = [0, 0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 3];
const KENO_PAYOUTS = { 0: 0, 1: 0, 2: 0.5, 3: 3, 4: 15, 5: 100 };
const TREASURE_PAYOUTS = [0, 0, 1, 1, 3];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function integer(randomInt, min, max) {
  const value = Number(randomInt(min, max));
  if (!Number.isInteger(value) || value < min || value >= max) throw new RangeError('O gerador aleatório retornou um valor inválido.');
  return value;
}

function shuffle(values, randomInt = crypto.randomInt) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = integer(randomInt, 0, index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function result(game, bet, payout, outcome, details = {}) {
  return { game, bet, payout, net: payout - bet, outcome, details };
}

function resolveInstantGame({ game, bet, choice, numbers, multiplier = 2, randomInt = crypto.randomInt }) {
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('A aposta deve ser um número inteiro positivo.');
  if (!Number.isSafeInteger(multiplier) || multiplier < 1 || multiplier > 100) throw new RangeError('O multiplicador precisa ficar entre 1 e 100.');
  if (game === 'coin' || game === 'flip' || game === 'coinflip') {
    if (!['heads', 'tails', 'cara', 'coroa'].includes(choice)) throw new RangeError('Escolha cara ou coroa.');
    const outcome = integer(randomInt, 0, 2) ? 'tails' : 'heads';
    const won = choice === outcome || (choice === 'cara' && outcome === 'heads') || (choice === 'coroa' && outcome === 'tails');
    return result('coinflip', bet, won ? bet * multiplier : 0, outcome, { choice });
  }
  if (game === 'dice') {
    if (!['high', 'low', 'alto', 'baixo'].includes(choice)) throw new RangeError('Escolha alto ou baixo.');
    const face = integer(randomInt, 1, 7);
    if (face === 4) return result(game, bet, bet, face, { choice, push: true });
    const high = choice === 'high' || choice === 'alto';
    const won = high ? face > 4 : face < 4;
    return result(game, bet, won ? bet * multiplier : 0, face, { choice });
  }
  if (game === 'slots') {
    const outcome = Array.from({ length: 3 }, () => SYMBOLS[integer(randomInt, 0, SYMBOLS.length)]);
    const triple = outcome.every((symbol) => symbol === outcome[0]);
    const pair = !triple && new Set(outcome).size < 3;
    return result(game, bet, triple ? bet * Math.max(2, multiplier) : pair ? bet : 0, outcome, { triple, pair });
  }
  if (game === 'roulette') {
    const pocket = integer(randomInt, 0, 37);
    const color = pocket === 0 ? 'green' : RED_NUMBERS.has(pocket) ? 'red' : 'black';
    let win = false;
    let totalMultiplier = 0;
    if (/^\d+$/.test(String(choice ?? ''))) {
      const selected = Number(choice);
      if (selected < 0 || selected > 36) throw new RangeError('A casa da roleta vai de 0 a 36.');
      win = selected === pocket;
      totalMultiplier = 36;
    } else if (['red', 'black'].includes(choice)) {
      win = color === choice;
      totalMultiplier = 2;
    } else if (choice === 'even' || choice === 'odd') {
      win = pocket !== 0 && (pocket % 2 === 0 ? 'even' : 'odd') === choice;
      totalMultiplier = 2;
    } else throw new RangeError('Escolha uma cor, par/ímpar ou um número de 0 a 36.');
    return result(game, bet, win ? bet * totalMultiplier : 0, { pocket, color }, { choice, totalMultiplier });
  }
  if (game === 'highlow') {
    if (!['high', 'low'].includes(choice)) throw new RangeError('Escolha maior ou menor.');
    const first = integer(randomInt, 1, 14);
    const second = integer(randomInt, 1, 14);
    if (first === second) return result(game, bet, bet, { first, second }, { choice, push: true });
    const won = choice === 'high' ? second > first : second < first;
    return result(game, bet, won ? bet * multiplier : 0, { first, second }, { choice });
  }
  if (game === 'wheel') {
    const index = integer(randomInt, 0, WHEEL.length);
    const totalMultiplier = WHEEL[index];
    return result(game, bet, Math.floor(bet * totalMultiplier), { index, multiplier: totalMultiplier }, { sectors: WHEEL.length });
  }
  if (game === 'keno') {
    if (!Array.isArray(numbers) || numbers.length !== 5 || new Set(numbers).size !== 5 || numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 40)) {
      throw new RangeError('Escolha cinco números diferentes entre 1 e 40.');
    }
    const draw = shuffle(Array.from({ length: 40 }, (_, index) => index + 1), randomInt).slice(0, 10);
    const hits = numbers.filter((number) => draw.includes(number)).length;
    const totalMultiplier = KENO_PAYOUTS[hits];
    return result(game, bet, Math.floor(bet * totalMultiplier), { draw, hits }, { selected: [...numbers].sort((a, b) => a - b), totalMultiplier, payoutTable: KENO_PAYOUTS });
  }
  if (game === 'treasure') {
    const selected = Number(choice);
    if (!Number.isInteger(selected) || selected < 0 || selected > 4) throw new RangeError('Escolha um baú numerado de 1 a 5.');
    const chests = shuffle(TREASURE_PAYOUTS, randomInt);
    const totalMultiplier = chests[selected];
    return result(game, bet, bet * totalMultiplier, { selected, chests }, { totalMultiplier, payoutTable: TREASURE_PAYOUTS });
  }
  throw new RangeError('Jogo do cassino inválido.');
}

function newDeck(randomInt = crypto.randomInt) {
  return shuffle(Array.from({ length: 52 }, (_, index) => ({ rank: (index % 13) + 1, suit: Math.floor(index / 13) })), randomInt);
}

function blackjackTotal(hand) {
  let total = hand.reduce((sum, card) => sum + (card.rank > 10 ? 10 : card.rank === 1 ? 11 : card.rank), 0);
  let aces = hand.filter((card) => card.rank === 1).length;
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

function createBlackjackState(randomInt = crypto.randomInt) {
  const deck = newDeck(randomInt);
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  const playerNatural = blackjackTotal(player) === 21;
  const dealerNatural = blackjackTotal(dealer) === 21;
  const outcome = playerNatural && dealerNatural ? 'push' : playerNatural ? 'natural' : dealerNatural ? 'loss' : null;
  return { deck, player, dealer, status: outcome ? 'completed' : 'active', outcome };
}

function stepBlackjack(state, action, randomInt = crypto.randomInt) {
  if (!state || state.status !== 'active') throw new RangeError('Esta mão de Blackjack já terminou.');
  if (action === 'hit') {
    state.player.push(state.deck.pop() || newDeck(randomInt).pop());
    if (blackjackTotal(state.player) > 21) {
      state.status = 'completed';
      state.outcome = 'loss';
    }
    return { state, playerTotal: blackjackTotal(state.player), dealerTotal: null };
  }
  if (action !== 'stand') throw new RangeError('Ação de Blackjack inválida.');
  while (blackjackTotal(state.dealer) < 17) state.dealer.push(state.deck.pop() || newDeck(randomInt).pop());
  const playerTotal = blackjackTotal(state.player);
  const dealerTotal = blackjackTotal(state.dealer);
  state.status = 'completed';
  state.outcome = playerTotal > 21 ? 'loss' : dealerTotal > 21 || playerTotal > dealerTotal ? 'win' : playerTotal === dealerTotal ? 'push' : 'loss';
  return { state, playerTotal, dealerTotal };
}

function blackjackPayout(state, bet) {
  if (state.outcome === 'natural') return Math.floor(bet * 2.5);
  if (state.outcome === 'win') return bet * 2;
  if (state.outcome === 'push') return bet;
  return 0;
}

function createMinesState({ randomInt = crypto.randomInt, size = 25, mineCount = 5 } = {}) {
  if (!Number.isInteger(size) || !Number.isInteger(mineCount) || mineCount < 1 || mineCount >= size) throw new RangeError('Configuração de minas inválida.');
  const cells = shuffle(Array.from({ length: size }, (_, index) => index), randomInt);
  return { size, mineCount, mines: cells.slice(0, mineCount), revealed: [], status: 'active', multiplier: 1 };
}

function minesMultiplier(safeRevealed, { size = 25, mineCount = 5, returnRate = 0.95 } = {}) {
  if (!Number.isInteger(safeRevealed) || safeRevealed < 0 || safeRevealed > size - mineCount) throw new RangeError('Quantidade revelada inválida.');
  let safeProbability = 1;
  for (let index = 0; index < safeRevealed; index += 1) safeProbability *= (size - mineCount - index) / (size - index);
  return safeRevealed === 0 ? 1 : Math.floor(Math.min(10000, returnRate / safeProbability) * 100) / 100;
}

function revealMine(state, cell) {
  if (!state || state.status !== 'active') throw new RangeError('Esta partida de Minas já terminou.');
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.size || state.revealed.includes(cell)) throw new RangeError('Escolha uma casa ainda fechada no tabuleiro.');
  if (state.mines.includes(cell)) {
    state.revealed.push(cell);
    state.status = 'busted';
    return { state, hitMine: true, multiplier: 0 };
  }
  state.revealed.push(cell);
  state.multiplier = minesMultiplier(state.revealed.length, state);
  return { state, hitMine: false, multiplier: state.multiplier };
}

module.exports = {
  SYMBOLS, WHEEL, KENO_PAYOUTS, TREASURE_PAYOUTS, RED_NUMBERS,
  resolveInstantGame, blackjackTotal, createBlackjackState, stepBlackjack, blackjackPayout,
  createMinesState, minesMultiplier, revealMine,
};
