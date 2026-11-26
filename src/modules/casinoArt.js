const { createCanvas } = require('@napi-rs/canvas');

const WIDTH = 960;
const HEIGHT = 520;
const PALETTE = { ink: '#130e1d', panel: '#21162d', rose: '#f472b6', gold: '#f5c86a', text: '#fff4fa', muted: '#c5b4cb', green: '#36c98f', red: '#f26878' };

function roundedRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function cardLabel(card) {
  const rank = ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[card.rank] || String(card.rank);
  return rank + ['♠', '♥', '♣', '♦'][card.suit];
}

function drawCard(ctx, x, y, card, hidden = false) {
  roundedRect(ctx, x, y, 112, 154, 12, hidden ? '#4c294b' : '#fff8f4', hidden ? PALETTE.rose : '#f0d9e5');
  if (hidden) {
    ctx.strokeStyle = '#d780b4'; ctx.lineWidth = 2;
    for (let offset = -60; offset < 130; offset += 22) { ctx.beginPath(); ctx.moveTo(x + 15, y + 15 + offset); ctx.lineTo(x + 97, y + 97 + offset); ctx.stroke(); }
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('K', x + 56, y + 92);
    return;
  }
  const label = cardLabel(card);
  const color = [1, 3].includes(card.suit) ? '#b72e56' : '#272136';
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.font = 'bold 27px sans-serif'; ctx.fillText(label.slice(0, -1), x + 12, y + 34);
  ctx.font = '30px sans-serif'; ctx.fillText(label.slice(-1), x + 12, y + 65);
  ctx.font = '58px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label.slice(-1), x + 56, y + 107);
}

function drawRoulette(ctx, pocket) {
  const centerX = 480; const centerY = 300; const radius = 150;
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  for (let index = 0; index < 37; index += 1) {
    const start = (index / 37) * Math.PI * 2 - Math.PI / 2;
    const end = ((index + 1) / 37) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.arc(centerX, centerY, radius, start, end); ctx.closePath();
    ctx.fillStyle = index === 0 ? '#177f60' : red.has(index) ? '#a6374f' : '#302b38'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(centerX, centerY, 80, 0, Math.PI * 2); ctx.fillStyle = '#201726'; ctx.fill();
  ctx.beginPath(); ctx.arc(centerX, centerY, 56, 0, Math.PI * 2); ctx.fillStyle = PALETTE.gold; ctx.fill();
  ctx.fillStyle = '#261525'; ctx.textAlign = 'center'; ctx.font = 'bold 42px sans-serif'; ctx.fillText(String(pocket ?? 'K'), centerX, centerY + 15);
  ctx.fillStyle = PALETTE.text; ctx.font = '20px sans-serif'; ctx.fillText('ROULETTE · 0–36', centerX, centerY + 118);
}

function drawDie(ctx, x, y, value) {
  roundedRect(ctx, x, y, 150, 150, 22, '#fff8f4', '#e9d5e1');
  const positions = {
    1: [[.5,.5]], 2: [[.25,.25],[.75,.75]], 3: [[.25,.25],[.5,.5],[.75,.75]],
    4: [[.25,.25],[.75,.25],[.25,.75],[.75,.75]],
    5: [[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],
    6: [[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]],
  }[Math.max(1, Math.min(6, Number(value) || 1))];
  ctx.fillStyle = '#6c2450';
  for (const [px, py] of positions) { ctx.beginPath(); ctx.arc(x + px * 150, y + py * 150, 10, 0, Math.PI * 2); ctx.fill(); }
}

function drawChest(ctx, x, y, selected, multiplier) {
  const fill = selected ? '#d99b3f' : '#8f5c2f';
  roundedRect(ctx, x, y + 38, 124, 78, 17, fill, selected ? PALETTE.gold : '#c18a4c');
  roundedRect(ctx, x - 4, y + 20, 132, 38, 16, selected ? '#f1bd5c' : '#b67a3f', '#e4b869');
  roundedRect(ctx, x + 51, y + 48, 22, 34, 8, '#f6dc8d');
  ctx.fillStyle = PALETTE.text; ctx.textAlign = 'center'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(multiplier == null ? '?' : multiplier + '×', x + 62, y + 150);
}

function drawWheel(ctx, multiplier) {
  const centerX = 480; const centerY = 310; const radius = 158;
  const sectors = [0,0,0,0,.5,.5,.5,1,1,1,1,1,1,1,1,3];
  sectors.forEach((value, index) => {
    const start = (index / sectors.length) * Math.PI * 2 - Math.PI / 2;
    const end = ((index + 1) / sectors.length) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.arc(centerX, centerY, radius, start, end); ctx.closePath();
    ctx.fillStyle = value === 0 ? '#493244' : value < 1 ? '#8a456c' : value === 1 ? '#397965' : '#c58a34'; ctx.fill();
    ctx.strokeStyle = '#f7d58c'; ctx.lineWidth = 2; ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(centerX, centerY, 76, 0, Math.PI * 2); ctx.fillStyle = '#211525'; ctx.fill();
  ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 42px sans-serif'; ctx.fillText(multiplier == null ? 'K' : multiplier + '×', centerX, centerY + 14);
  ctx.fillStyle = PALETTE.text; ctx.font = '20px sans-serif'; ctx.fillText('RODA DA FORTUNA', centerX, centerY + 118);
}

function renderCasinoImage({ game = 'lobby', outcome = null, details = {}, state = null, title = 'Salão da Kiryu' } = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, PALETTE.ink); gradient.addColorStop(0.55, '#28152c'); gradient.addColorStop(1, '#101922');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 0.2;
  for (let index = 0; index < 14; index += 1) {
    ctx.strokeStyle = index % 2 ? PALETTE.rose : PALETTE.gold; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(800, 60, 70 + index * 20, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  roundedRect(ctx, 30, 30, WIDTH - 60, HEIGHT - 60, 28, 'rgba(25,17,35,.82)', '#72516d');
  ctx.textAlign = 'left'; ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 22px sans-serif'; ctx.fillText('ETERNITY REALMS · KIRYU CASINO', 68, 78);
  ctx.fillStyle = PALETTE.text; ctx.font = 'bold 42px sans-serif'; ctx.fillText(title, 68, 132);
  ctx.fillStyle = PALETTE.muted; ctx.font = '18px sans-serif'; ctx.fillText('Moeda virtual da comunidade · regras públicas · sem valor monetário real', 68, 166);
  if (game === 'blackjack' && state) {
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 19px sans-serif'; ctx.fillText('DEALER', 92, 220); ctx.fillText('JOGADOR', 92, 430);
    (state.dealer || []).forEach((card, index) => drawCard(ctx, 225 + index * 124, 186, card, state.status === 'active' && index === 1));
    (state.player || []).forEach((card, index) => drawCard(ctx, 225 + index * 124, 344, card));
    ctx.fillStyle = PALETTE.text; ctx.font = 'bold 21px sans-serif'; ctx.fillText(state.status === 'active' ? 'Uma carta do dealer está oculta' : 'Dealer: ' + details.dealerTotal, 600, 248);
    ctx.fillText('Sua mão: ' + details.playerTotal, 600, 402);
  } else if (game === 'mines' && state) {
    const cols = 5; const cell = 58; const left = 310; const top = 185;
    for (let index = 0; index < state.size; index += 1) {
      const col = index % cols; const row = Math.floor(index / cols);
      const isRevealed = state.revealed.includes(index); const isMine = state.mines.includes(index) && state.status !== 'active';
      roundedRect(ctx, left + col * 68, top + row * 68, cell, cell, 10, isMine ? '#71324a' : isRevealed ? '#17674d' : '#35243c', isRevealed ? '#66e0ac' : '#75537a');
      ctx.fillStyle = isMine ? PALETTE.red : isRevealed ? PALETTE.green : '#f4d8ec'; ctx.textAlign = 'center'; ctx.font = 'bold 23px sans-serif';
      ctx.fillText(isMine ? '✹' : isRevealed ? '◆' : '?', left + col * 68 + 29, top + row * 68 + 38);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 22px sans-serif'; ctx.fillText('MINAS · ' + state.mineCount + ' riscos', 68, 233);
    ctx.fillStyle = PALETTE.text; ctx.font = '20px sans-serif'; ctx.fillText('Multiplicador atual: ' + Number(state.multiplier || 1).toFixed(2) + '×', 68, 275);
    ctx.fillStyle = PALETTE.muted; ctx.font = '17px sans-serif'; ctx.fillText('Escolha uma casa; você decide quando encerrar.', 68, 312);
  } else if (game === 'dice') {
    drawDie(ctx, 405, 218, outcome);
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('DADO · 1–6', 480, 420);
  } else if (game === 'coinflip') {
    ctx.beginPath(); ctx.arc(480, 300, 118, 0, Math.PI * 2); ctx.fillStyle = '#bb8136'; ctx.fill();
    ctx.beginPath(); ctx.arc(480, 300, 94, 0, Math.PI * 2); ctx.fillStyle = '#f2c65d'; ctx.fill();
    ctx.beginPath(); ctx.arc(480, 300, 74, 0, Math.PI * 2); ctx.strokeStyle = '#9b672b'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#4e2f25'; ctx.textAlign = 'center'; ctx.font = 'bold 36px sans-serif'; ctx.fillText(String(outcome || 'K').toUpperCase(), 480, 313);
    ctx.fillStyle = PALETTE.gold; ctx.font = 'bold 20px sans-serif'; ctx.fillText('CARA OU COROA', 480, 455);
  } else if (game === 'highlow') {
    const cards = [{ rank: outcome?.first || 7, suit: 1 }, { rank: outcome?.second || 9, suit: 0 }];
    drawCard(ctx, 330, 210, cards[0]); drawCard(ctx, 482, 210, cards[1]);
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('MAIOR OU MENOR · SEGUNDA CARTA', 480, 430);
  } else if (game === 'wheel') {
    drawWheel(ctx, outcome?.multiplier);
  } else if (game === 'keno') {
    const selected = new Set(details.selected || []); const drawn = new Set(outcome?.draw || []);
    for (let number = 1; number <= 40; number += 1) {
      const col = (number - 1) % 8; const row = Math.floor((number - 1) / 8);
      const x = 174 + col * 78; const y = 198 + row * 54;
      const hit = selected.has(number) && drawn.has(number);
      roundedRect(ctx, x, y, 64, 40, 11, hit ? '#237b5b' : selected.has(number) ? '#70436b' : '#302739', hit ? '#71e2ae' : '#5d465f');
      ctx.fillStyle = PALETTE.text; ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(String(number), x + 32, y + 26);
    }
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 19px sans-serif'; ctx.fillText('KENO · 5 ESCOLHAS · 10 SORTEADOS', 480, 500);
  } else if (game === 'treasure') {
    const chests = outcome?.chests || [];
    for (let index = 0; index < 5; index += 1) drawChest(ctx, 160 + index * 142, 225, outcome?.selected === index, chests[index]);
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('ESCOLHA UM BAÚ · RETORNO TOTAL', 480, 450);
  } else if (game === 'roulette') {
    drawRoulette(ctx, outcome?.pocket);
  } else if (game === 'slots') {
    const symbols = outcome || ['K', 'R', 'Y'];
    roundedRect(ctx, 165, 220, 630, 168, 24, '#2b1b31', '#ad6e9b');
    symbols.forEach((symbol, index) => {
      roundedRect(ctx, 205 + index * 190, 245, 150, 118, 20, '#fff1f7', '#e5c3d7');
      ctx.fillStyle = index === 1 ? '#a3255b' : '#30203a'; ctx.textAlign = 'center'; ctx.font = 'bold 46px sans-serif'; ctx.fillText(String(symbol), 280 + index * 190, 318);
    });
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 19px sans-serif'; ctx.fillText('SÍMBOLOS IGUAIS · 5×   |   PAR · APOSTA DE VOLTA', 480, 435);
  } else if (game === 'blackjack' && !state) {
    ['A♠', '10♥', 'K♣'].forEach((label, index) => drawCard(ctx, 260 + index * 150, 235, { rank: index === 0 ? 1 : index === 1 ? 10 : 13, suit: index }));
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('BLACKJACK · pare em 21', 480, 445);
  } else if (game === 'racing') {
    for (let lane = 0; lane < 4; lane += 1) {
      const y = 205 + lane * 58;
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([9, 8]); ctx.beginPath(); ctx.moveTo(120, y + 24); ctx.lineTo(830, y + 24); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = [PALETTE.rose, PALETTE.gold, PALETTE.green, '#ad95ef'][lane]; ctx.font = '38px sans-serif'; ctx.fillText(['🐉','🦊','🐺','🐎'][lane], 160 + lane * 115, y + 38);
    }
    ctx.fillStyle = PALETTE.text; ctx.textAlign = 'center'; ctx.font = 'bold 21px sans-serif'; ctx.fillText('CORRIDA COMUNITÁRIA · PARTIDA RECREATIVA', 480, 465);
  } else if (game === 'poker') {
    const cards = [{rank:1,suit:0},{rank:13,suit:1},{rank:10,suit:2},{rank:9,suit:3},{rank:4,suit:0}];
    cards.forEach((card, index) => drawCard(ctx, 190 + index * 118, 226, card));
    ctx.fillStyle = PALETTE.gold; ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('POKER RECREATIVO · TEXAS HOLD’EM', 480, 445);
  } else {
    const icons = ['♠', '♦', '✦', '♣', '◈'];
    icons.forEach((icon, index) => {
      ctx.fillStyle = index % 2 ? PALETTE.rose : PALETTE.gold; ctx.textAlign = 'center'; ctx.font = '62px sans-serif'; ctx.fillText(icon, 170 + index * 150, 312 + (index % 2) * 22);
      ctx.beginPath(); ctx.arc(170 + index * 150, 250, 54, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(245,200,106,.35)'; ctx.lineWidth = 3; ctx.stroke();
    });
    ctx.fillStyle = PALETTE.text; ctx.textAlign = 'center'; ctx.font = 'bold 21px sans-serif'; ctx.fillText('Escolha uma mesa e confira as regras antes de apostar.', 480, 420);
  }
  ctx.fillStyle = PALETTE.muted; ctx.textAlign = 'right'; ctx.font = '15px sans-serif'; ctx.fillText('Developer by Krieg.js', WIDTH - 68, HEIGHT - 55);
  return canvas.toBuffer('image/png');
}

module.exports = { renderCasinoImage, cardLabel, drawCard };
