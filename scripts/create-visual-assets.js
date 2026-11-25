const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const themes = {
  crest: ['#321022', '#d94c7d', 'crest'],
  xp: ['#29102a', '#d084f2', 'xp'],
  fragments: ['#392511', '#f4bd54', 'coin'],
  orbs: ['#1b203c', '#a9a4ff', 'gem'],
  store: ['#102e2b', '#65d8ad', 'shop'],
  casino: ['#291322', '#ffd166', 'dice'],
  profile: ['#2b1737', '#efa4ce', 'profile'],
  admin: ['#202033', '#a8b5d0', 'sigil'],
};
const orbColors = {
  'orb-green': ['#063c2b', '#61ed9d', 6], 'orb-blue': ['#092a4a', '#55c3ff', 5],
  'orb-orange': ['#51250b', '#ffb15d', 8], 'orb-red': ['#510f20', '#ff627d', 7],
  'orb-black': ['#151525', '#b5a8ef', 4], 'orb-gold': ['#4b3910', '#ffe279', 10],
};

function drawGlyph(ctx, type, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (type === 'coin') {
    ctx.beginPath(); ctx.arc(64, 64, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 38); ctx.lineTo(64, 90); ctx.moveTo(79, 48); ctx.quadraticCurveTo(61, 37, 51, 50); ctx.quadraticCurveTo(42, 61, 70, 66); ctx.quadraticCurveTo(91, 74, 76, 88); ctx.quadraticCurveTo(62, 98, 48, 85); ctx.stroke();
  } else if (type === 'gem') {
    ctx.beginPath(); ctx.moveTo(64, 23); ctx.lineTo(99, 46); ctx.lineTo(87, 91); ctx.lineTo(64, 106); ctx.lineTo(40, 91); ctx.lineTo(29, 46); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(29, 46); ctx.lineTo(99, 46); ctx.moveTo(46, 47); ctx.lineTo(64, 105); ctx.moveTo(82, 47); ctx.lineTo(64, 105); ctx.stroke();
  } else if (type === 'dice') {
    ctx.save(); ctx.translate(63, 64); ctx.rotate(-0.12); ctx.strokeRect(-33, -33, 66, 66); ctx.restore();
    for (const [x, y] of [[48,48],[80,48],[64,64],[48,80],[80,80]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
  } else if (type === 'shop') {
    ctx.beginPath(); ctx.moveTo(28, 47); ctx.lineTo(39, 28); ctx.lineTo(89, 28); ctx.lineTo(100, 47); ctx.lineTo(94, 57); ctx.lineTo(34, 57); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(35, 59); ctx.lineTo(35, 98); ctx.lineTo(93, 98); ctx.lineTo(93, 59); ctx.stroke(); ctx.beginPath(); ctx.moveTo(56, 98); ctx.lineTo(56, 74); ctx.lineTo(73, 74); ctx.lineTo(73, 98); ctx.stroke();
  } else if (type === 'profile') {
    ctx.beginPath(); ctx.arc(64, 47, 19, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(31, 102); ctx.quadraticCurveTo(35, 68, 64, 68); ctx.quadraticCurveTo(93, 68, 97, 102); ctx.quadraticCurveTo(64, 115, 31, 102); ctx.fill();
    ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI * 2); ctx.stroke();
  } else if (type === 'xp') {
    ctx.beginPath(); ctx.moveTo(39, 30); ctx.lineTo(85, 30); ctx.lineTo(92, 39); ctx.lineTo(92, 98); ctx.lineTo(36, 98); ctx.lineTo(36, 39); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(48, 49); ctx.lineTo(80, 49); ctx.moveTo(48, 64); ctx.lineTo(68, 64); ctx.moveTo(48, 80); ctx.lineTo(78, 80); ctx.stroke();
    ctx.beginPath(); ctx.arc(89, 34, 12, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(64, 64, 40, -Math.PI * .82, Math.PI * .82); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 64, 40, Math.PI * .18, Math.PI * 1.82); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, 56); ctx.quadraticCurveTo(64, 38, 85, 56); ctx.quadraticCurveTo(76, 61, 85, 67); ctx.quadraticCurveTo(64, 87, 42, 67); ctx.quadraticCurveTo(52, 62, 42, 56); ctx.fill();
    ctx.beginPath(); ctx.arc(64, 64, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const root = path.join(__dirname, '..', 'assets', 'systems');
fs.mkdirSync(root, { recursive: true });
for (const [name, [dark, light, glyph]] of Object.entries(themes)) {
  const canvas = createCanvas(160, 160);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 160, 160);
  gradient.addColorStop(0, dark); gradient.addColorStop(1, '#0d101a');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(0, 0, 160, 160, 38); ctx.fill();
  ctx.globalAlpha = 0.16; ctx.strokeStyle = light; ctx.lineWidth = 1;
  for (let i = -160; i < 240; i += 18) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 160, 160); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = light; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(7, 7, 146, 146, 32); ctx.stroke();
  ctx.shadowColor = light; ctx.shadowBlur = 14; drawGlyph(ctx, glyph, light); ctx.shadowBlur = 0;
  fs.writeFileSync(path.join(root, name + '.png'), canvas.toBuffer('image/png'));
}
for (const [name, [dark, light, points]] of Object.entries(orbColors)) {
  const canvas = createCanvas(160, 160);
  const ctx = canvas.getContext('2d');
  const bg = ctx.createRadialGradient(60, 48, 5, 80, 80, 110);
  bg.addColorStop(0, dark); bg.addColorStop(1, '#0d101a');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, 160, 160, 38); ctx.fill();
  ctx.strokeStyle = light; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(7, 7, 146, 146, 32); ctx.stroke();
  ctx.save(); ctx.translate(80, 80); ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const radius = i % 2 === 0 ? 42 : (name === 'orb-black' ? 31 : 37);
    const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = dark; ctx.fill(); ctx.strokeStyle = light; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, name === 'orb-black' ? 18 : 13, 0, Math.PI * 2); ctx.fillStyle = light; ctx.fill();
  ctx.restore();
  fs.writeFileSync(path.join(root, name + '.png'), canvas.toBuffer('image/png'));
}
