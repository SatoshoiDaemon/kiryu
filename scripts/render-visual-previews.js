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
  await fs.writeFile(path.join(outputDir, 'README.md'), '# Previews visuais\n\n- `profile-member.png` foi renderizado pelo renderer de cartão real (`renderMemberCard`) com avatar de fixture.\n- `components-v2-fixtures.json` serializa builders V2 realmente utilizados para loja, detalhe, inventário, Orbes, carteira e painel. A renderização final é feita pelo cliente Discord; não há captura do app Discord neste ambiente.\n- Gere novamente com `node scripts/render-visual-previews.js`.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
