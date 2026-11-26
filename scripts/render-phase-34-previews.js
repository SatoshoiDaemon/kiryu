const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { renderCasinoImage } = require('../src/modules/casinoArt');
const { casinoContainer } = require('../src/modules/casinoInteractions');
const { showListing } = require('../src/commands/economy/market');
const { showTrade } = require('../src/commands/economy/trade');
const { showAuction } = require('../src/commands/economy/auction');
const { roomContainer } = require('../src/commands/games/game');

const outputDir = path.join(__dirname, '..', 'artifacts', 'visual-previews', 'phase-3-4');
const date = new Date('2026-11-26T00:00:00.000Z');

function rounded(ctx, x, y, width, height, radius, fill, stroke = '#403147') {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
}

function text(ctx, value, x, y, size = 19, color = '#f7edf5', weight = 500) {
  ctx.font = weight + ' ' + size + 'px sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(value, x, y);
}

async function updatePayload(render, data) {
  let payload;
  await render({ user: { id: 'preview-member' }, update: async (value) => { payload = value; } }, data, true);
  return payload;
}

async function drawCommercePreview(outputPath) {
  const width = 1800; const height = 1030; const canvas = createCanvas(width, height); const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#11101a'); gradient.addColorStop(.52, '#211624'); gradient.addColorStop(1, '#101b22');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  text(ctx, 'KIRYU · ECONOMIA DA COMUNIDADE', 70, 74, 18, '#e9a8c3', 700);
  text(ctx, 'Mercado, trocas e leilões', 70, 132, 42, '#fff7fb', 700);
  text(ctx, 'Prévia dos dados e controles produzidos pelos builders Components V2 da Kiryu', 72, 169, 18, '#b8aebe');
  const columns = [70, 650, 1230]; const cardWidth = 500;
  for (const x of columns) rounded(ctx, x, 220, cardWidth, 690, 25, '#191720', '#4d394e');

  let x = columns[0] + 28;
  text(ctx, 'BAZAR · ANÚNCIO', x, 270, 14, '#de9cba', 700);
  text(ctx, '🔮  Orbe lunar', x, 322, 29, '#fff7fb', 700);
  text(ctx, 'Uma peça rara para colecionadores.', x, 358, 16, '#c9bfce');
  rounded(ctx, x, 398, 444, 162, 18, '#25212c');
  text(ctx, 'VENDEDOR', x + 20, 434, 13, '#a99bac', 700);
  text(ctx, '@Astral · Colecionável', x + 20, 463, 18);
  text(ctx, '3 unidades · 125 Fragmentos cada', x + 20, 503, 17);
  text(ctx, 'Total: 375 Fragmentos', x + 20, 535, 17, '#f4ca75', 700);
  rounded(ctx, x, 598, 444, 56, 15, '#28664e', '#4b9878');
  text(ctx, 'Comprar por 375 Fragmentos', x + 68, 634, 17, '#edfff5', 700);
  text(ctx, 'Estoque reservado até venda, cancelamento ou expiração.', x, 704, 14, '#a99eae');
  text(ctx, 'Busca · categoria · preço · vendedor · histórico', x, 746, 14, '#a99eae');

  x = columns[1] + 28;
  text(ctx, 'TROCA · VERSÃO 3', x, 270, 14, '#de9cba', 700);
  text(ctx, 'Oferta bilateral', x, 322, 29, '#fff7fb', 700);
  rounded(ctx, x, 354, 444, 170, 18, '#25212c');
  text(ctx, '@Aventureira oferece', x + 20, 391, 17, '#e5b5cb', 700);
  text(ctx, '250 Fragmentos · 2 Orbes azuis', x + 20, 428, 16);
  text(ctx, '1 × moon-blade', x + 20, 462, 16);
  rounded(ctx, x, 540, 444, 112, 18, '#25212c');
  text(ctx, '@Guardião oferece', x + 20, 578, 17, '#e5b5cb', 700);
  text(ctx, '80 Fragmentos', x + 20, 615, 16);
  rounded(ctx, x, 678, 212, 54, 15, '#28664e', '#4b9878');
  rounded(ctx, x + 230, 678, 214, 54, 15, '#542b3d', '#8a4563');
  text(ctx, 'Confirmar oferta', x + 28, 713, 16, '#edfff5', 700);
  text(ctx, 'Cancelar troca', x + 270, 713, 16, '#ffe9f0', 700);
  text(ctx, 'Uma edição invalida as duas confirmações.', x, 784, 15, '#c8b9cb');
  text(ctx, 'Os recursos só são reservados na liquidação bilateral.', x, 818, 14, '#a99eae');

  x = columns[2] + 28;
  text(ctx, 'LEILÃO · ATIVO', x, 270, 14, '#de9cba', 700);
  text(ctx, '⚔️  Lâmina antiga', x, 322, 28, '#fff7fb', 700);
  text(ctx, 'Unidades: 2 · Vendedor: @Colecionador', x, 358, 15, '#c9bfce');
  rounded(ctx, x, 398, 444, 228, 18, '#25212c');
  text(ctx, 'Lance inicial', x + 20, 438, 15, '#a99bac');
  text(ctx, '100 Fragmentos', x + 250, 438, 16);
  text(ctx, 'Próximo lance mínimo', x + 20, 486, 15, '#a99bac');
  text(ctx, '180 Fragmentos', x + 250, 486, 16, '#f4ca75', 700);
  text(ctx, 'Maior lance · @Guardião', x + 20, 534, 15, '#a99bac');
  text(ctx, '160 Fragmentos', x + 250, 534, 16);
  text(ctx, 'Compra imediata', x + 20, 582, 15, '#a99bac');
  text(ctx, '300 Fragmentos', x + 250, 582, 16);
  text(ctx, 'A cada lance novo, a reserva anterior volta ao membro superado.', x, 684, 14, '#c8b9cb');
  text(ctx, 'Vencedor recebe o item; vendedor recebe o lance menos taxa.', x, 722, 14, '#a99eae');
  rounded(ctx, x, 778, 444, 56, 15, '#30243a', '#5b4660');
  text(ctx, 'Liquidação e encerramento persistem após reinícios.', x + 28, 814, 14, '#e3d7e7');

  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(70, 954); ctx.lineTo(1730, 954); ctx.stroke();
  text(ctx, 'Kiryu · Eternity Realms', 72, 987, 14, '#b8aebe');
  text(ctx, 'Dados ilustrativos · payloads reais em components-v2.json · Developer by Krieg.js', 965, 987, 14, '#b8aebe');
  await fs.writeFile(outputPath, canvas.toBuffer('image/png'));
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const games = {
    slots: { outcome: ['🐉', '🐉', '🐉'] },
    blackjack: { state: { status: 'active', player: [{ rank: 1, suit: 0 }, { rank: 10, suit: 1 }], dealer: [{ rank: 9, suit: 2 }, { rank: 5, suit: 3 }] }, details: { playerTotal: 21, dealerTotal: null } },
    roulette: { outcome: { pocket: 0, color: 'green' } },
    dice: { outcome: 6 },
    coinflip: { outcome: 'cara' },
    highlow: { outcome: { first: 5, second: 12 } },
    wheel: { outcome: { index: 15, multiplier: 3 } },
    keno: { outcome: { draw: [1, 3, 8, 11, 16, 21, 25, 30, 34, 39], hits: 3 }, details: { selected: [1, 8, 11, 21, 30] } },
    treasure: { outcome: { selected: 4, chests: [1, 0, 3, 1, 0] } },
    mines: { state: { size: 24, mineCount: 5, mines: [4, 9, 13, 19, 22], revealed: [0, 1, 5], multiplier: 1.42, status: 'active' } },
    racing: {},
    poker: {},
  };
  for (const [game, sample] of Object.entries(games)) {
    const png = renderCasinoImage({ game, ...sample, title: game === 'lobby' ? 'Salão da Kiryu' : game });
    await fs.writeFile(path.join(outputDir, game + '.png'), png);
  }

  const listing = {
    guildId: 'preview', listingId: 'm-preview', sellerId: 'seller-preview', quantity: 3, unitPrice: 125, category: 'collectible', state: 'active',
    itemSnapshot: { name: 'Orbe lunar', emoji: '🔮', description: 'Uma peça rara para colecionadores.' },
    expiresAt: new Date(date.getTime() + 3 * 86400000),
  };
  const auction = {
    guildId: 'preview', auctionId: 'a-preview', sellerId: 'seller-preview', quantity: 2, startingBid: 100, currentBid: 160, minIncrement: 20,
    buyNow: 300, highBidderId: 'bidder-preview', state: 'open', expiresAt: new Date(date.getTime() + 2 * 3600000),
    bids: [{ bidderId: 'bidder-preview', amount: 160, placedAt: date }],
    itemSnapshot: { name: 'Lâmina antiga', emoji: '⚔️', description: 'Uma relíquia de aço.' },
  };
  const trade = {
    tradeId: 't-preview', participants: ['member-a', 'member-b'], state: 'open', revision: 3, confirmed: ['member-a'],
    offers: {
      'member-a': { fragments: 250, orbs: { blue: 2 }, items: [{ sku: 'moon-blade', quantity: 1 }] },
      'member-b': { fragments: 80, orbs: {}, items: [] },
    },
  };
  const listingPayload = await updatePayload(showListing, listing);
  const auctionPayload = await updatePayload(showAuction, auction);
  const tradePayload = await updatePayload(showTrade, trade);
  const casino = casinoContainer('# Blackjack · demonstração\nMesa virtual e controles próprios do jogo.', { game: 'blackjack', ...games.blackjack });
  const room = roomContainer({
    guildId: 'preview', sessionId: 'gm-preview', game: 'tictactoe', ownerId: 'member-a', playerIds: ['member-a', 'member-b'], status: 'active',
    expiresAt: new Date(date.getTime() + 600000), state: { game: 'tictactoe', board: ['X', 'O', null, null, 'X', null, 'O', null, null], status: 'active', players: ['member-a', 'member-b'], maxPlayers: 2, turn: 3, moves: 4, turnExpiresAt: new Date(date.getTime() + 60000) },
  });
  const fixtures = {
    generatedAt: date.toISOString(),
    note: 'Builders reais do Discord Components V2. A renderização final do Discord depende do cliente; as PNGs das mesas são produzidas pelo casinoArt usado nas respostas do bot.',
    marketListing: listingPayload.components[0].toJSON(),
    tradeSession: tradePayload.components[0].toJSON(),
    auction: auctionPayload.components[0].toJSON(),
    casinoBlackjack: casino.container.toJSON(),
    communityGame: room.toJSON(),
  };
  await fs.writeFile(path.join(outputDir, 'components-v2.json'), JSON.stringify(fixtures, null, 2) + '\n');
  await drawCommercePreview(path.join(outputDir, 'commerce-systems.png'));
  await fs.writeFile(path.join(outputDir, 'README.md'), '# Fases 3 e 4 · demonstrações visuais\n\n- `slots.png`, `blackjack.png`, `roulette.png`, `dice.png`, `coinflip.png`, `highlow.png`, `wheel.png`, `keno.png`, `treasure.png`, `mines.png`, `racing.png` e `poker.png` são PNGs gerados pelo renderer `casinoArt` usado nas respostas do cassino.\n- `commerce-systems.png` apresenta estados ilustrativos do mercado, troca bilateral e leilão; os dados de interface correspondem a fixtures serializadas nos builders reais em `components-v2.json`. Não é captura do cliente Discord.\n- `components-v2.json` contém payloads Components V2 serializados para detalhe de mercado, painel de troca, leilão, mesa de blackjack e sala de jogo comunitário.\n- Gere novamente com `node scripts/render-phase-34-previews.js`.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
