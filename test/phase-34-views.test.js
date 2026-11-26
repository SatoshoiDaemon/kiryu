const { casinoContainer, GAME_RULES } = require('../src/modules/casinoInteractions');
const { showListing } = require('../src/commands/economy/market');
const { showAuction } = require('../src/commands/economy/auction');
const { showTrade } = require('../src/commands/economy/trade');
const { roomContainer } = require('../src/commands/games/game');

function containsText(value, text) {
  return JSON.stringify(value).includes(text);
}

describe('interfaces de cassino e comércio', () => {
  test('mesa do cassino renderiza uma imagem PNG e publica regras do jogo', () => {
    const view = casinoContainer('# Blackjack · sua mão', {
      game: 'blackjack',
      state: { status: 'active', player: [{ rank: 1, suit: 0 }, { rank: 10, suit: 1 }], dealer: [{ rank: 9, suit: 2 }, { rank: 5, suit: 3 }] },
      details: { playerTotal: 21, dealerTotal: 14 },
    });
    expect(view.image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(view.filename).toBe('kiryu-casino-blackjack.png');
    expect(view.container.toJSON().type).toBe(17);
    expect(GAME_RULES.blackjack).toContain('21');
  });

  test('detalhe do mercado mostra vendedor, quantidade, preço e controle para comprar', async () => {
    const interaction = { user: { id: 'buyer' }, update: jest.fn().mockResolvedValue(undefined) };
    await showListing(interaction, {
      guildId: 'g', listingId: 'listing1', sellerId: 'seller', quantity: 3, unitPrice: 125, category: 'collectible', state: 'active',
      itemSnapshot: { name: 'Orbe lunar', emoji: '🔮', description: 'Uma peça rara.', thumbnailUrl: 'https://example.test/orbe.png' },
      expiresAt: new Date('2026-12-01T00:00:00Z'),
    }, true);
    const payload = interaction.update.mock.calls[0][0];
    expect(payload.components[0].toJSON().type).toBe(17);
    expect(containsText(payload.components[0].toJSON(), 'Vendedor')).toBe(true);
    expect(containsText(payload.components[0].toJSON(), '375')).toBe(true);
    expect(containsText(payload.components[0].toJSON(), 'Comprar por')).toBe(true);
  });

  test('detalhe do leilão serializa o item e o estado do lance em Components V2', async () => {
    const interaction = { user: { id: 'member' }, update: jest.fn().mockResolvedValue(undefined) };
    await showAuction(interaction, {
      auctionId: 'auction1', sellerId: 'seller', quantity: 2, startingBid: 100, currentBid: 160, minIncrement: 20, buyNow: 300,
      highBidderId: 'bidder', state: 'open', expiresAt: new Date('2026-12-01T00:00:00Z'), bids: [{ bidderId: 'bidder', amount: 160 }],
      itemSnapshot: { name: 'Lâmina antiga', emoji: '⚔️', thumbnailUrl: 'https://example.test/blade.png' },
    }, true);
    const serialized = interaction.update.mock.calls[0][0].components[0].toJSON();
    expect(serialized.type).toBe(17);
    expect(containsText(serialized, 'Próximo lance mínimo')).toBe(true);
    expect(containsText(serialized, '180')).toBe(true);
    expect(containsText(serialized, 'Lâmina antiga')).toBe(true);
  });

  test('painel da troca mostra ambas as ofertas e controles de confirmação bilateral', async () => {
    const interaction = { user: { id: 'a' }, update: jest.fn().mockResolvedValue(undefined) };
    await showTrade(interaction, {
      tradeId: 'trade1', participants: ['a', 'b'], state: 'open', revision: 3, confirmed: ['a'],
      offers: { a: { fragments: 250, orbs: { blue: 2 }, items: [{ sku: 'moon-blade', quantity: 1 }] }, b: { fragments: 80, orbs: {}, items: [] } },
    }, true);
    const serialized = interaction.update.mock.calls[0][0].components[0].toJSON();
    expect(serialized.type).toBe(17);
    expect(containsText(serialized, '250')).toBe(true);
    expect(containsText(serialized, 'moon-blade')).toBe(true);
    expect(containsText(serialized, 'Confirmar oferta atual')).toBe(true);
    expect(containsText(serialized, 'Toda alteração invalida')).toBe(true);
  });

  test('sala de Quatro em linha mostra tabuleiro, jogadores, prazo e ações', () => {
    const room = roomContainer({
      sessionId: 'game-room', game: 'connect4', ownerId: 'a', playerIds: ['a', 'b'], status: 'active', expiresAt: new Date(Date.now() + 60_000),
      state: { game: 'connect4', board: Array.from({ length: 6 }, () => Array(7).fill(null)), status: 'active', players: ['a', 'b'], maxPlayers: 2, turn: 1, moves: 0, turnExpiresAt: new Date(Date.now() + 20_000) },
    }).toJSON();
    expect(room.type).toBe(17);
    expect(containsText(room, 'Prazo desta jogada')).toBe(true);
    expect(room.components.some((component) => component.type === 1)).toBe(true);
  });
});
