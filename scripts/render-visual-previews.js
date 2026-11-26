const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { renderMemberCard } = require('../src/modules/memberProfiles');
const { storeContainer, storeItemContainer, inventoryContainer, orbsContainer, walletContainer } = require('../src/modules/economyViews');
const { createContainer } = require('../src/modules/components');

async function main() {
  const outputDir = path.join(__dirname, '..', 'artifacts', 'visual-previews');
  await fs.mkdir(outputDir, { recursive: true });
  const avatarCanvas = createCanvas(256, 256);
  const avatarContext = avatarCanvas.getContext('2d');
  const avatarGradient = avatarContext.createLinearGradient(0, 0, 256, 256);
  avatarGradient.addColorStop(0, '#f9a8d4'); avatarGradient.addColorStop(1, '#4c1d95');
  avatarContext.fillStyle = avatarGradient; avatarContext.fillRect(0, 0, 256, 256);
  avatarContext.fillStyle = '#fff1f2'; avatarContext.beginPath(); avatarContext.arc(128, 95, 48, 0, Math.PI * 2); avatarContext.fill();
  avatarContext.fillStyle = '#fce7f3'; avatarContext.beginPath(); avatarContext.roundRect(47, 155, 162, 120, 70); avatarContext.fill();
  const avatarUrl = 'data:image/png;base64,' + avatarCanvas.toBuffer('image/png').toString('base64');
  const user = { id: 'preview-member', username: 'Aventureira', globalName: 'Aventureira do Crepúsculo', displayAvatarURL: () => avatarUrl };
  const previewBackground = createCanvas(1000, 600);
  const bgContext = previewBackground.getContext('2d');
  const bgGradient = bgContext.createLinearGradient(0, 0, 1000, 600);
  bgGradient.addColorStop(0, '#051B2D'); bgGradient.addColorStop(.55, '#153A46'); bgGradient.addColorStop(1, '#3E244C');
  bgContext.fillStyle = bgGradient; bgContext.fillRect(0, 0, 1000, 600);
  bgContext.strokeStyle = 'rgba(230,245,255,.18)'; bgContext.lineWidth = 2;
  for (let index = 0; index < 18; index += 1) {
    const x = 45 + index * 58;
    bgContext.beginPath(); bgContext.arc(x, 110 + (index % 4) * 95, 14 + (index % 3) * 8, 0, Math.PI * 2); bgContext.stroke();
    bgContext.beginPath(); bgContext.moveTo(x - 18, 420); bgContext.lineTo(x, 386); bgContext.lineTo(x + 18, 420); bgContext.stroke();
  }
  const backgroundImage = previewBackground.toBuffer('image/png');
  const previews = [
    ['profile-classic.png', { accent: 'rose', background: 'crimson', frame: 'royal', badges: ['star', 'moon', 'comet'], bio: 'Colecionadora de histórias e Fragmentos.', title: 'Cronista do Crepúsculo' }],
    ['profile-wide.png', { layout: 'wide', frame: 'thorn', avatarStyle: 'square', xpBarStyle: 'segmented', gradient: true,
      colors: { primary: '#10B981', secondary: '#063D37', highlight: '#A7F3D0', text: '#F0FFF8', xpBar: '#34D399', frame: '#6EE7B7', background: '#061B18' },
      badges: ['dragon', 'sword', 'ruby', 'raven'], bio: 'Cartógrafa de ruínas e guardiã de trilhas secretas.', title: 'Vigília Esmeralda' }],
    ['profile-portrait.png', { layout: 'portrait', frame: 'ornate', avatarStyle: 'hex', xpBarStyle: 'orb', gradient: false,
      colors: { primary: '#F0ABFC', secondary: '#4A1D68', highlight: '#FAE8FF', text: '#FFF7FF', xpBar: '#E879F9', frame: '#F0ABFC', background: '#241032' },
      badges: ['phoenix', 'spellbook', 'amethyst'], bio: 'Entre feitiços e páginas antigas, encontrei meu lugar.', title: 'Arquivista Astral' }],
    ['profile-folio.png', { layout: 'folio', frame: 'gilded', avatarStyle: 'rounded', xpBarStyle: 'minimal', elementOpacity: 58,
      colors: { primary: '#F4C56A', secondary: '#57371E', highlight: '#FFE9AE', text: '#FFF7E8', xpBar: '#E8A83F', frame: '#F4C56A', background: '#21180F' },
      badges: ['crown', 'laurel', 'trophy'], bio: 'Faço da gentileza uma pequena tradição diária.', title: 'Mecenas do Bazar' }],
    ['profile-orbital.png', { layout: 'orbital', frame: 'neon', avatarStyle: 'diamond', xpBarStyle: 'minimal', gradient: true,
      backgroundImageUrl: '', colors: { primary: '#67E8F9', secondary: '#142C5A', highlight: '#C4F1FF', text: '#F2FCFF', xpBar: '#22D3EE', frame: '#67E8F9', background: '#0B1329' },
      badges: ['comet', 'eclipse', 'third-eye', 'infinity'], bio: 'Coleciono noites claras, enigmas e mapas do céu.', title: 'Viajante de Órbitas' }],
  ];
  for (const [filename, customization] of previews) {
    const card = await renderMemberCard(user, { level: 42, xp: 734 }, {
      bio: '', title: 'Membro do Eternity', accent: 'rose', background: 'dusk', frame: 'classic', badges: [],
      gradient: true, elementOpacity: 24, layout: 'classic', xpBarStyle: 'rounded', avatarStyle: 'circle',
      visibility: { level: true, xp: true, rank: true, title: true, bio: true, badges: true },
      colors: { primary: '#F9A8D4', secondary: '#831843', highlight: '#FCE7F3', text: '#FFFFFF', xpBar: '#F9A8D4', frame: '#F9A8D4', background: '#11121C' },
      ...customization,
    }, 7, filename === 'profile-folio.png' ? { backgroundImage } : {});
    await fs.writeFile(path.join(outputDir, filename), card);
  }
  const card = await renderMemberCard(user, { level: 42, xp: 734 }, { accent: 'rose', background: 'crimson', frame: 'royal', badges: ['star', 'moon', 'comet'], bio: 'Colecionadora de histórias e Fragmentos.', title: 'Cronista do Crepúsculo' }, 7);
  await fs.writeFile(path.join(outputDir, 'profile-member.png'), card);

  const now = new Date('2026-11-25T16:00:00Z');
  const item = { _id: '674e100000000000000001', sku: 'crystal-ball', name: 'Bola de Cristal', description: 'Uma peça de vidro arcano com opções preservadas no catálogo.', emoji: '🔮', currency: 'fragments', price: 120, purchaseQuantity: 1, stock: 12, delivery: 'inventory', usable: false, purchaseChoices: [{ value: 'blue', label: 'Cristal azul', description: 'Acabamento azul' }, { value: 'violet', label: 'Cristal violeta', description: 'Acabamento violeta' }] };
  const fixtures = {
    generatedAt: now.toISOString(),
    note: 'Payloads serializados dos builders usados na implementação. São componentes Discord V2 reais, não mockups renderizados.',
    store: storeContainer([item], 'fragments', 0, 1, now, '123456789012345678'),
    storeDetails: storeItemContainer(item, 'fragments', 0, '123456789012345678', 2, item.purchaseChoices[1]),
    inventory: inventoryContainer({ items: [{ _id: '675e100000000000000002', quantity: 2, itemSnapshot: { name: item.name, emoji: item.emoji, usable: false, consumeOnUse: false } }], total: 2, pages: 1 }, '123456789012345678', '123456789012345678', 0, 'all'),
    orbs: orbsContainer({ orbs: { green: 12, blue: 4, orange: 3, red: 1, black: 0, gold: 0 } }, '123456789012345678'),
    wallet: walletContainer({ username: 'Aventureira' }, { wallet: 4200, bank: 18000 }, '123456789012345678'),
    configuration: createContainer('# Painel de configuração\nEscolha uma oficina para ajustar o comportamento da Kiryu.', [], 0x6B4B94),
  };
  await fs.writeFile(path.join(outputDir, 'components-v2-fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'README.md'), '# Previews visuais\n\n- `profile-classic.png`, `profile-wide.png`, `profile-portrait.png`, `profile-folio.png` e `profile-orbital.png` são exemplos PNG renderizados pelo `renderMemberCard` com layouts, molduras, avatares, barras, paletas e badges diferentes. O cartão fólio inclui arte de fundo local gerada pelo script.\n- `profile-member.png` mantém uma prévia compatível com o cartão legado.\n- `components-v2-fixtures.json` serializa builders V2 reais de loja, detalhe, inventário, Orbes, carteira e painel. A renderização dessas telas é feita pelo cliente Discord; não há captura do app Discord neste ambiente.\n- Gere novamente com `node scripts/render-visual-previews.js`.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
