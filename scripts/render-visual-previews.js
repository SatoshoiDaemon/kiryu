const fs = require('node:fs/promises');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { renderMemberCard } = require('../src/modules/memberProfiles');
const { storeContainer, storeItemContainer, inventoryContainer, orbsContainer, walletContainer } = require('../src/modules/economyViews');
const { createContainer } = require('../src/modules/components');
const { editorPreview, giveawayEmbed } = require('../src/modules/adminCommands');
const { giveawayComponents } = require('../src/modules/persistentTasks');
const { createEmbed } = require('../src/modules/communityCommands');

function roundedRect(context, x, y, width, height, radius, color, stroke = null) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
  context.fillStyle = color; context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
}

function drawText(context, text, x, y, size, color, weight = 400) {
  context.font = weight + ' ' + size + 'px sans-serif'; context.fillStyle = color; context.fillText(text, x, y);
}

function drawPhase23Demo(outputPath) {
  const canvas = createCanvas(1920, 1180);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1920, 1180);
  gradient.addColorStop(0, '#10111a'); gradient.addColorStop(.55, '#181722'); gradient.addColorStop(1, '#21131f');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1920, 1180);
  drawText(ctx, 'KIRYU 2.3', 92, 82, 18, '#f19bb6', 700);
  drawText(ctx, 'Storage & Utilities', 92, 148, 48, '#fff7fb', 700);
  drawText(ctx, 'Demonstração visual das interfaces de gestão e comunidade', 94, 188, 20, '#aaa3b3');
  roundedRect(ctx, 1600, 58, 222, 48, 24, '#32202d', '#704459');
  drawText(ctx, 'COMPONENTS V2', 1632, 88, 16, '#f6c6d4', 700);

  const cards = [{ x: 84, w: 552 }, { x: 684, w: 552 }, { x: 1284, w: 552 }];
  for (const card of cards) roundedRect(ctx, card.x, 244, card.w, 850, 28, '#1a1a24', '#33313d');

  // Storage panel
  let x = cards[0].x + 30;
  drawText(ctx, 'Armazenamento', x, 292, 27, '#fff7fb', 700);
  drawText(ctx, 'Square Cloud Blob · 8 objetos · 14,2 MB', x, 324, 16, '#aaa3b3');
  roundedRect(ctx, x, 350, 492, 72, 18, '#24232f');
  drawText(ctx, 'Uso deste servidor', x + 18, 378, 14, '#aaa3b3');
  drawText(ctx, '14,2 MB', x + 18, 406, 22, '#f8d0dc', 700);
  drawText(ctx, '2 órfãos · 6 referências', x + 334, 400, 14, '#c9c3cf');
  const assets = [
    ['▧', 'profile-1482.png', 'Perfil · 2,4 MB', '#d9467c'],
    ['◇', 'frame-royal.png', 'Moldura · 1,8 MB', '#e3ad60'],
    ['✦', 'crystal-ball.png', 'Produto · 980 KB', '#65c7b3'],
    ['▤', 'welcome-loop.gif', 'Gatilho · 6,1 MB', '#b79be8'],
  ];
  assets.forEach((asset, index) => {
    const rowY = 444 + index * 105;
    roundedRect(ctx, x, rowY, 492, 86, 16, '#22212c');
    roundedRect(ctx, x + 13, rowY + 13, 58, 58, 12, asset[3] + '2b');
    drawText(ctx, asset[0], x + 32, rowY + 50, 24, asset[3], 700);
    drawText(ctx, asset[1], x + 86, rowY + 34, 16, '#f6eff5', 600);
    drawText(ctx, asset[2], x + 86, rowY + 60, 13, '#aaa3b3');
    drawText(ctx, index === 1 ? '2 refs' : index === 3 ? 'órfão' : '1 ref', x + 408, rowY + 49, 13, '#c9c3cf');
  });
  roundedRect(ctx, x, 882, 235, 54, 16, '#65334b');
  drawText(ctx, 'Enviar imagem', x + 54, 916, 16, '#fff7fb', 700);
  roundedRect(ctx, x + 250, 882, 242, 54, 16, '#292833', '#494552');
  drawText(ctx, 'Filtrar categoria  ⌄', x + 276, 916, 15, '#d8d1dc');
  drawText(ctx, 'Prévia · referências · limites · exclusão protegida', x, 982, 13, '#8f8997');

  // Message editor panel
  x = cards[1].x + 30;
  drawText(ctx, 'Editor de mensagens', x, 292, 27, '#fff7fb', 700);
  drawText(ctx, 'Components V2 · canal #anuncios', x, 324, 16, '#aaa3b3');
  roundedRect(ctx, x, 350, 492, 374, 18, '#20202b', '#3b3845');
  roundedRect(ctx, x + 1, 350, 6, 374, 4, '#d9467c');
  drawText(ctx, 'ETERNITY REALMS · KIRYU', x + 24, 388, 12, '#d59aaa', 700);
  drawText(ctx, 'Uma nova jornada começa', x + 24, 430, 24, '#fff7fb', 700);
  drawText(ctx, 'A expedição para o Vale da Lua', x + 24, 466, 17, '#e4dfe7');
  drawText(ctx, 'abre hoje às 19h. Reúna seu grupo,', x + 24, 494, 17, '#e4dfe7');
  drawText(ctx, 'prepare seus equipamentos e venha', x + 24, 522, 17, '#e4dfe7');
  drawText(ctx, 'descobrir os segredos da região.', x + 24, 550, 17, '#e4dfe7');
  roundedRect(ctx, x + 24, 582, 436, 102, 16, '#2b2531');
  drawText(ctx, '◇  Imagem · armazenada no Blob', x + 42, 619, 14, '#cbb9d4', 600);
  roundedRect(ctx, x + 24, 638, 156, 32, 12, '#6d3650');
  drawText(ctx, 'Ver detalhes  ↗', x + 45, 660, 13, '#fff7fb', 600);
  drawText(ctx, 'Título · texto · cor · Section · galeria · links', x, 756, 13, '#8f8997');
  const actions = [['Editar texto', 95], ['Adicionar', 126], ['Prévia', 86], ['Salvar edição', 126]];
  let bx = x;
  for (const [label, width] of actions) { roundedRect(ctx, bx, 788, width, 48, 14, label === 'Salvar edição' ? '#236c58' : '#292833', '#494552'); drawText(ctx, label, bx + 11, 818, 13, '#e9e2eb', 600); bx += width + 8; }
  const order = ['1 · Text Display', '2 · Section', '3 · Separador', '4 · Galeria'];
  order.forEach((label, index) => { roundedRect(ctx, x + index * 122, 858, 114, 44, 13, index === 1 ? '#392b3b' : '#24232f'); drawText(ctx, label, x + index * 122 + 8, 885, 11, '#c9c3cf', 600); });
  drawText(ctx, '/embed create · edit · template import/export', x, 982, 13, '#8f8997');

  // Community panel
  x = cards[2].x + 30;
  drawText(ctx, 'Ferramentas comunitárias', x, 292, 27, '#fff7fb', 700);
  drawText(ctx, 'Ações rápidas para a comunidade', x, 324, 16, '#aaa3b3');
  roundedRect(ctx, x, 350, 492, 132, 18, '#22212c');
  drawText(ctx, 'Central de ajuda', x + 18, 382, 18, '#fff7fb', 700);
  drawText(ctx, 'Informações  ·  Geral  ·  Economia', x + 18, 412, 14, '#c9c3cf');
  roundedRect(ctx, x + 18, 432, 280, 34, 11, '#2d2b38');
  drawText(ctx, 'Escolha uma categoria  ⌄', x + 34, 455, 13, '#d8d1dc');
  roundedRect(ctx, x, 502, 492, 256, 18, '#22212c');
  drawText(ctx, 'Enquete · Qual rota seguimos?', x + 18, 538, 18, '#fff7fb', 700);
  const pollRows = [['Rota do Norte', .64], ['Passagem Subterrânea', .41], ['Costa das Brumas', .23]];
  pollRows.forEach((item, index) => {
    const rowY = 564 + index * 55;
    drawText(ctx, item[0], x + 18, rowY + 16, 14, '#ddd6e2');
    roundedRect(ctx, x + 18, rowY + 25, 438, 12, 6, '#363440');
    roundedRect(ctx, x + 18, rowY + 25, Math.round(438 * item[1]), 12, 6, index === 0 ? '#7e55b4' : '#5d486e');
  });
  roundedRect(ctx, x, 778, 492, 144, 18, '#2c2230', '#553847');
  drawText(ctx, 'Sorteio · Mapa estelar', x + 18, 816, 18, '#ffe7f0', 700);
  drawText(ctx, '3 vencedores · encerra em 2 horas', x + 18, 846, 14, '#c9c3cf');
  roundedRect(ctx, x + 18, 864, 168, 40, 13, '#226a56');
  drawText(ctx, 'Participar', x + 70, 890, 14, '#f0fff8', 700);
  drawText(ctx, '/remind · /poll · /giveaway · /afk', x, 982, 13, '#8f8997');

  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.moveTo(84, 1044); ctx.lineTo(1836, 1044); ctx.stroke();
  drawText(ctx, 'Kiryu · Eternity Realms', 92, 1080, 14, '#bdb5c2', 600);
  drawText(ctx, 'Mockup conceitual · fixtures serializados em Components V2', 1256, 1080, 14, '#8f8997');
  return require('node:fs/promises').writeFile(outputPath, canvas.toBuffer('image/png'));
}

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
  const storageRows = [
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('config:storage:upload').setLabel('Enviar imagem').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('config:storage:limits').setLabel('Limites').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('config:storage:filter').setPlaceholder('Filtrar objetos').addOptions([{ label: 'Todos', value: 'all' }, { label: 'Perfis', value: 'profile' }, { label: 'Produtos', value: 'product' }, { label: 'Gatilhos', value: 'trigger' }])),
  ];
  const storageManager = createContainer('# Armazenamento · Square Cloud Blob\n8 objetos · 14,2 MB · 6 referências · 2 órfãos\n\n• `profile-1482.png` · Perfil · 2,4 MB · 1 referência\n• `frame-royal.png` · Moldura · 1,8 MB · 2 referências\n• `crystal-ball.png` · Produto · 980 KB · 1 referência\n• `welcome-loop.gif` · Gatilho · 6,1 MB · órfão\n\nObjetos referenciados não podem ser excluídos.', storageRows, 0x9D174D);
  const messageEditor = editorPreview({ mode: 'v2', title: 'Uma nova jornada começa', body: 'A expedição para o Vale da Lua abre hoje às 19h. Reúna seu grupo e prepare seus equipamentos.', color: '#9D174D', imageUrl: 'https://cdn.example.org/kiryu/expedition.png', imageObjectId: 'sample-object-id', elements: [
    { type: 'text', content: '📍 Vale da Lua · 19h BRT' },
    { type: 'section', content: 'Reúna seu grupo e descubra os segredos da região.', thumbnailUrl: 'https://cdn.example.org/kiryu/crest.png' },
    { type: 'separator' },
    { type: 'gallery', url: 'https://cdn.example.org/kiryu/expedition.png', description: 'Mapa da expedição' },
    { type: 'link', label: 'Ver detalhes', url: 'https://example.org/expedition' },
  ] });
  const helpMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help:category:preview-owner').setPlaceholder('Escolha uma categoria').addOptions([{ label: 'Informações', value: 'Informações' }, { label: 'Ferramentas gerais', value: 'Ferramentas gerais' }, { label: 'Administração', value: 'Administração' }]));
  const help = createContainer('# Central de ajuda\nEscolha uma categoria para ver os comandos disponíveis para você.', [helpMenu], 0x7654C9);
  const poll = {
    embeds: [createEmbed('📊 Qual rota seguimos?', '1. **Rota do Norte** · 12 votos\n2. **Passagem Subterrânea** · 7 votos\n3. **Costa das Brumas** · 4 votos').setColor(0x7654C9).toJSON()],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('poll:vote:123456789012345678:0').setLabel('Rota do Norte').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('poll:vote:123456789012345678:1').setLabel('Passagem Subterrânea').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('poll:vote:123456789012345678:2').setLabel('Costa das Brumas').setStyle(ButtonStyle.Secondary)).toJSON()],
  };
  const giveaway = { guildId: '123456789012345678', messageId: '123456789012345678', prize: 'Mapa estelar', winnerCount: 3, entrants: ['111111111111111111', '222222222222222222'], endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000), requiredRoleId: '' };
  const fixtures = {
    generatedAt: now.toISOString(),
    note: 'Payloads serializados por builders reais do Discord. phase-2.3-interfaces.png é um mockup conceitual; não é captura do cliente Discord.',
    store: storeContainer([item], 'fragments', 0, 1, now, '123456789012345678'),
    storeDetails: storeItemContainer(item, 'fragments', 0, '123456789012345678', 2, item.purchaseChoices[1]),
    inventory: inventoryContainer({ items: [{ _id: '675e100000000000000002', quantity: 2, itemSnapshot: { name: item.name, emoji: item.emoji, usable: false, consumeOnUse: false } }], total: 2, pages: 1 }, '123456789012345678', '123456789012345678', 0, 'all'),
    orbs: orbsContainer({ orbs: { green: 12, blue: 4, orange: 3, red: 1, black: 0, gold: 0 } }, '123456789012345678'),
    wallet: walletContainer({ username: 'Aventureira' }, { wallet: 4200, bank: 18000 }, '123456789012345678'),
    configuration: createContainer('# Painel de configuração\nEscolha uma oficina para ajustar o comportamento da Kiryu.', [], 0x6B4B94),
    storageManager,
    messageEditor: messageEditor.components[0],
    help,
    poll,
    giveaway: { embeds: [giveawayEmbed(giveaway).toJSON()], components: giveawayComponents(giveaway).map((component) => component.toJSON()) },
  };
  await fs.writeFile(path.join(outputDir, 'components-v2-fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
  await drawPhase23Demo(path.join(outputDir, 'phase-2.3-interfaces.png'));
  await fs.writeFile(path.join(outputDir, 'README.md'), '# Previews visuais\n\n- `profile-classic.png`, `profile-wide.png`, `profile-portrait.png`, `profile-folio.png` e `profile-orbital.png` são exemplos PNG renderizados pelo `renderMemberCard` com layouts, molduras, avatares, barras, paletas e badges diferentes. O cartão fólio inclui arte de fundo local gerada pelo script.\n- `profile-member.png` mantém uma prévia compatível com o cartão legado.\n- `phase-2.3-interfaces.png` demonstra visualmente a central de armazenamento, editor de mensagens e ferramentas comunitárias. É um mockup conceitual, não uma captura do cliente Discord.\n- `components-v2-fixtures.json` serializa builders Discord reais da loja, detalhe, inventário, Orbes, carteira, painel, armazenamento, editor, ajuda, enquete e sorteio. A renderização final dessas telas depende do cliente Discord.\n- Gere novamente com `node scripts/render-visual-previews.js`.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
