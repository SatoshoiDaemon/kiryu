const EconomyItem = require('../models/EconomyItem');
const EconomyInventory = require('../models/EconomyInventory');

const SEED_ACTOR = 'system:store-seed-v1';

const products = [
  {
    sku: 'antidoto', name: 'Antídoto', emoji: '🧪', currency: 'fragments', price: 500,
    description: 'Permite curar venenos que uma pessoa possui.',
    usable: true, consumeOnUse: true,
    useMessage: 'Permite curar venenos que uma pessoa possui.',
  },
  {
    sku: 'pocao-energia-menor', name: 'Poção de Energia Menor', emoji: '🧪', currency: 'fragments', price: 500,
    description: 'Quando usado, recupera 5% da energia do usuário e concede carga 4 / 3.',
    usable: true, consumeOnUse: true,
    useMessage: 'Quando usado, recupera 5% da energia do usuário e concede carga 4 / 3.',
  },
  {
    sku: 'pocao-vida-menor', name: 'Poção de Vida Menor', emoji: '💊', currency: 'fragments', price: 500,
    description: 'Recupera 5% do seu hp quando usada e concede Escudo 5 / 2.',
    usable: true, consumeOnUse: true,
    useMessage: 'Recupera 5% do seu hp quando usada e concede Escudo 5 / 2.',
  },
  {
    sku: 'tocha-sentinela', name: 'Tocha do Sentinela', emoji: '🔥', currency: 'fragments', price: 600,
    description: 'Esta tocha, enquanto estiver acesa, permite revelar passagens ocultas e inimigos invisíveis próximos.',
    usable: true, consumeOnUse: false,
    useMessage: 'Esta tocha, enquanto estiver acesa, permite revelar passagens ocultas e inimigos invisíveis próximos.',
  },
  {
    sku: 'bola-de-cristal', name: 'Bola de Cristal', emoji: '🔮', currency: 'fragments', price: 900,
    description: 'O item ideal para conjuradores. Ao comprar, escolha seu modelo:',
    purchaseChoices: [
      { value: 'increase-cost-damage', label: '1. Aumenta o custo da magia e o dano em 20%.', description: 'Modelo 1' },
      { value: 'decrease-cost-damage', label: '2. Diminui o custo da magia e o dano em 20%.', description: 'Modelo 2' },
    ],
  },
  {
    sku: 'dados-normais', name: 'Dados Completamente Normais', emoji: '🎲', currency: 'fragments', price: 999,
    description: 'Um par de dados possuídos por um demônio. Ao usar, role 1d6:\n1 - Você fica com Atordoamento 1 / 1.\n2 - Você fica com Frágil 2 / 2.\n3, 4 - Nada acontece.\n5 - Recebe 5.000 Fragmentos.\n6 - O oponente fica com Atordoamento 1 / 1.',
    usable: true, consumeOnUse: true,
    useMessage: 'Um par de dados possuídos por um demônio. Ao usar, role 1d6:\n1 - Você fica com Atordoamento 1 / 1.\n2 - Você fica com Frágil 2 / 2.\n3, 4 - Nada acontece.\n5 - Recebe 5.000 Fragmentos.\n6 - O oponente fica com Atordoamento 1 / 1.',
  },
  {
    sku: 'totem', name: 'Totem', emoji: '♟️', currency: 'fragments', price: 1200,
    description: 'Este totem pode atrair espíritos malignos e intensificar as trevas ao seu redor. Enquanto ele estiver ativo, todos os debuffs tem +3 de potência e duração.',
    usable: true, consumeOnUse: false,
    useMessage: 'Este totem pode atrair espíritos malignos e intensificar as trevas ao seu redor. Enquanto ele estiver ativo, todos os debuffs tem +3 de potência e duração.',
  },
  {
    sku: 'selo-monstros', name: 'Selo para Monstros', emoji: '🧧', currency: 'fragments', price: 1333,
    description: 'Um item excepcional criado por monges que permite afastar espíritos Malignos. Enquanto usado, reduz a duração de todos os debuffs e efeitos de DoT em 5 e além disso, se você juntar o suficiente, pode ser uma área boa contra invasões. Ele é similar a um papel com orações escritas.',
    usable: true, consumeOnUse: false,
    useMessage: 'Um item excepcional criado por monges que permite afastar espíritos Malignos. Enquanto usado, reduz a duração de todos os debuffs e efeitos de DoT em 5 e além disso, se você juntar o suficiente, pode ser uma área boa contra invasões. Ele é similar a um papel com orações escritas.',
  },
  {
    sku: 'picareta', name: 'Picareta', emoji: '⛏️', currency: 'fragments', price: 1500,
    description: 'É uma picareta convencional usada para mineração, ela quebra após 5 usos.',
    usable: true, consumeOnUse: false,
  },
  {
    sku: 'fragmento-diamantita', name: 'Fragmento de Diamantita', emoji: '🔻', currency: 'fragments', price: 2400,
    description: 'Um fragmento pequeno de um cristal de formatos variados que ao ser jogado e atingir alguém, inflige Atordoado 1 / 1 e Proteção 7 / 1 nesta pessoa.',
    usable: true, consumeOnUse: true,
    useMessage: 'Um fragmento pequeno de um cristal de formatos variados que ao ser jogado e atingir alguém, inflige Atordoado 1 / 1 e Proteção 7 / 1 nesta pessoa.',
  },
  {
    sku: 'boneco-palha', name: 'Boneco de Palha', emoji: '☃️', currency: 'fragments', price: 3000,
    description: 'Um boneco de palha criado por clérigos. Este boneco absorve até 4 efeitos negativos e depois quebra.',
    usable: true, consumeOnUse: false,
    useMessage: 'Um boneco de palha criado por clérigos. Este boneco absorve até 4 efeitos negativos e depois quebra.',
  },
  {
    sku: 'coracao-pedra', name: 'Coração de Pedra', emoji: '🪨', currency: 'fragments', price: 4500,
    description: 'Uma pedra no formato de coração, que ao ser jogada no chão, forma um golem com 30% dos seus atributos máximos. Este golem dura 4 turnos.',
    usable: true, consumeOnUse: true,
    useMessage: 'Uma pedra no formato de coração, que ao ser jogada no chão, forma um golem com 30% dos seus atributos máximos. Este golem dura 4 turnos.',
  },
  {
    sku: 'pesos-treino', name: 'Pesos para Treino', emoji: '🏋️', currency: 'fragments', price: 5000,
    description: 'Pesos usados para colocar no corpo durante treinos. Aumenta em 50% o ganho de atributos e duram durante 5 seções de treino.',
    usable: true, consumeOnUse: false,
    useMessage: 'Pesos usados para colocar no corpo durante treinos. Aumenta em 50% o ganho de atributos e duram durante 5 seções de treino.',
  },
  {
    sku: 'bokken', name: 'Bokken', emoji: '🦴', currency: 'fragments', price: 7000,
    description: 'Uma espada de madeira usada por guerreiros para praticar, aumenta em 2x o ganho de treinos físicos. Dura por 3 seções.',
    usable: true, consumeOnUse: false,
    useMessage: 'Uma espada de madeira usada por guerreiros para praticar, aumenta em 2x o ganho de treinos físicos. Dura por 3 seções.',
  },
  {
    sku: 'teoria-magia', name: 'Teoria da Magia', emoji: '📚', currency: 'fragments', price: 7000,
    description: 'Uma série de livros com conteúdos e exercícios avançados sobre magia e energias. Aumentam em 2x os ganhos de atributos para treinos focados em energia. Dura 3 seções.',
    usable: true, consumeOnUse: false,
    useMessage: 'Uma série de livros com conteúdos e exercícios avançados sobre magia e energias. Aumentam em 2x os ganhos de atributos para treinos focados em energia. Dura 3 seções.',
  },
  {
    sku: 'minerio-tier-1', name: 'Minério Tier 1', emoji: '☁️', currency: 'fragments', price: 10000,
    description: 'Permite escolher entre 1kg de Oricalco, Adamantita, Mithril ou Obsidiano.',
    purchaseChoices: [
      { value: 'oricalco', label: '1kg de Oricalco' },
      { value: 'adamantita', label: '1kg de Adamantita' },
      { value: 'mithril', label: '1kg de Mithril' },
      { value: 'obsidiano', label: '1kg de Obsidiano' },
    ],
  },
  {
    sku: 'algemas-nulificadoras', name: 'Algemas Nulificadoras', emoji: '⛓️', currency: 'fragments', price: 12500,
    description: 'Um par de algemas feitas com um material extremamente nocivo a energia. Quando usadas em alguém, enquanto ele as usar, o alvo não pode manifestar energias.',
    usable: true, consumeOnUse: false,
    useMessage: 'Um par de algemas feitas com um material extremamente nocivo a energia. Quando usadas em alguém, enquanto ele as usar, o alvo não pode manifestar energias.',
  },
  {
    sku: 'manto-invisibilidade', name: 'Manto de Invisibilidade', emoji: '🧢', currency: 'fragments', price: 15000,
    description: 'Quem vestir este manto, se torna completamente invisível a olho nu. Além disso formas de detecção mágica são menos eficazes.',
    usable: true, consumeOnUse: false,
    useMessage: 'Quem vestir este manto, se torna completamente invisível a olho nu. Além disso formas de detecção mágica são menos eficazes.',
  },
  {
    sku: 'minerio-tier-2', name: 'Minério Tier 2', emoji: '💎', currency: 'fragments', price: 15000,
    description: 'Permite escolher entre 1kg de Vibrânio, Dlithio e Clorofita.',
    purchaseChoices: [
      { value: 'vibranio', label: '1kg de Vibrânio' },
      { value: 'dlithio', label: '1kg de Dlithio' },
      { value: 'clorofita', label: '1kg de Clorofita' },
    ],
  },
  {
    sku: 'cronometro-encantado', name: 'Cronômetro Encantado', emoji: '⏱️', currency: 'fragments', price: 15777,
    description: 'Um cronômetro criado por bruxas encantado com magia temporal. Quando usado, ele suspende seu usuário no tempo. Tornando ele incapaz de se mexer, conjurar magias, atacar, de ser atacado, ferido, induzido efeitos ou afetado pelo próximo turno. Após o uso, ele se quebra.',
    usable: true, consumeOnUse: true,
    useMessage: 'Um cronômetro criado por bruxas encantado com magia temporal. Quando usado, ele suspende seu usuário no tempo. Tornando ele incapaz de se mexer, conjurar magias, atacar, de ser atacado, ferido, induzido efeitos ou afetado pelo próximo turno. Após o uso, ele se quebra.',
  },
  {
    sku: 'bolsa-sem-fundo', name: 'Bolsa sem Fundo', emoji: '💼', currency: 'fragments', price: 20000,
    description: 'Apenas uma bolsa normal...que pode suportar uma quantidade ilimitada de itens dentro dela e misteriosamente você sempre consegue usar o que você quer.',
  },
  {
    sku: 'minerio-tier-3', name: 'Minério Tier 3', emoji: '🟠', currency: 'fragments', price: 25000,
    description: 'Obtém 1kg de Sacrito.',
  },
  {
    sku: 'casa', name: 'Uma Casa', emoji: '🌍', currency: 'fragments', price: 100000,
    description: 'Um chat para criar sua casa ou oque você quiser no rp. Me marca quando você usar.',
    usable: true, consumeOnUse: false,
    useMessage: 'Um chat para criar sua casa ou oque você quiser no rp. Me marca quando você usar.',
  },
  {
    sku: 'tomo-esquecimento', name: 'Tomo do Esquecimento', emoji: '📖', currency: 'orbs', orbType: 'orange', price: 10,
    description: 'Um livro extremamente peculiar e raro, capaz de roubar o conhecimento de quem o lê. Permite ao personagem resetar suas classes.',
    usable: true, consumeOnUse: false,
    useMessage: 'Você utilizou o Tomo do Esquecimento! Para realizar o reset de suas classes, dirija-se à staff do servidor.',
  },
  {
    sku: 'lagrima-larval', name: 'Lágrima Larval', emoji: '🪱', currency: 'orbs', orbType: 'orange', price: 20,
    description: 'Um fragmento do que parece ser um pequeno ser em estado larval. Permite ao personagem redistribuir todos os seus atributos.',
    usable: true, consumeOnUse: false,
    useMessage: 'Você utilizou a Lágrima Larval! Para realizar a redistribuição dos seus atributos, dirija-se à staff do servidor.',
  },
  {
    sku: 'manual-guerra', name: 'Manual da Guerra', emoji: '📕', currency: 'orbs', orbType: 'red', price: 10,
    description: 'Um manual que reúne ensinamentos, estratégias e conhecimentos avançados de combate. Permite realizar a evolução de classe do personagem, desde que cumpra seus requisitos.',
    usable: true, consumeOnUse: false,
    useMessage: 'Você utilizou o Manual da Guerra! Para realizar sua evolução de classe, certifique-se de cumprir os requisitos necessários e dirija-se à staff do servidor.',
  },
].map((product) => ({
  inventoryVisible: true,
  stackable: true,
  usable: false,
  consumeOnUse: true,
  purchaseQuantity: 1,
  delivery: 'inventory',
  effectDescription: product.description,
  useMessage: '',
  orbType: null,
  purchaseChoices: [],
  action: 'none',
  actionAmount: 0,
  actionOrbType: null,
  active: true,
  visibleInStore: true,
  deletedAt: null,
  availableFrom: null,
  availableUntil: null,
  stock: null,
  ...product,
}));

async function upsertProduct(guildId, product) {
  const filter = { guildId, sku: product.sku };
  const update = {
    $set: { ...product, guildId, updatedBy: SEED_ACTOR },
    $setOnInsert: { createdBy: SEED_ACTOR },
  };
  const options = { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true };
  try {
    return await EconomyItem.findOneAndUpdate(filter, update, options);
  } catch (error) {
    // A second bot process can win the unique (guildId, sku) insert race.
    if (error?.code !== 11000) throw error;
    return EconomyItem.findOneAndUpdate(filter, update, { ...options, upsert: false });
  }
}

async function refreshPendingStaffItems(guildId) {
  const staffItems = products.filter((product) => ['tomo-esquecimento', 'lagrima-larval', 'manual-guerra'].includes(product.sku));
  await Promise.all(staffItems.map((item) => EconomyInventory.updateMany(
    { guildId, sku: item.sku },
    { $set: {
      'itemSnapshot.name': item.name,
      'itemSnapshot.emoji': item.emoji,
      'itemSnapshot.description': item.description,
      'itemSnapshot.usable': true,
      'itemSnapshot.consumeOnUse': false,
      'itemSnapshot.useMessage': item.useMessage,
      'itemSnapshot.effectDescription': item.effectDescription,
      'itemSnapshot.inventoryVisible': true,
      'itemSnapshot.action': 'none',
      'itemSnapshot.actionAmount': 0,
    } },
  )));
}

async function seedEconomyStores(guildId) {
  if (!guildId) throw new TypeError('É necessário informar o ID do servidor para cadastrar as lojas.');
  for (const product of products) await upsertProduct(guildId, product);
  await refreshPendingStaffItems(guildId);
  return {
    fragments: products.filter((product) => product.currency === 'fragments').length,
    orbs: products.filter((product) => product.currency === 'orbs').length,
  };
}

module.exports = { products, seedEconomyStores };
