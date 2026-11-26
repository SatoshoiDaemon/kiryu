const BADGE_CATEGORIES = [
  { value: 'elements', label: 'Elementos' },
  { value: 'creatures', label: 'Criaturas fantásticas' },
  { value: 'weapons', label: 'Armas' },
  { value: 'magic', label: 'Magia' },
  { value: 'arcane', label: 'Símbolos arcanos' },
  { value: 'crowns', label: 'Coroas e títulos' },
  { value: 'celestial', label: 'Símbolos celestiais' },
  { value: 'demonic', label: 'Símbolos demoníacos' },
  { value: 'gems', label: 'Gemas' },
  { value: 'animals', label: 'Animais' },
  { value: 'abstract', label: 'Símbolos abstratos' },
  { value: 'events', label: 'Eventos' },
  { value: 'achievements', label: 'Conquistas' },
  { value: 'commemorative', label: 'Comemorativas' },
  { value: 'special', label: 'Especiais da staff' },
];

const rows = [
  ['elements', [['ember', 'Brasa', '♨'], ['tide', 'Maré', '◈'], ['mountain', 'Montanha', '⬟'], ['gale', 'Rajada', '༄'], ['storm', 'Tempestade', 'ϟ']], 'diamond'],
  ['creatures', [['dragon', 'Dragão', '🐉'], ['phoenix', 'Fênix', '🜂'], ['griffin', 'Grifo', '♞'], ['unicorn', 'Unicórnio', '♘'], ['leviathan', 'Leviatã', '🐲']], 'shield'],
  ['weapons', [['sword', 'Espada', '⚔'], ['bow', 'Arco', '➶'], ['staff', 'Cajado', '⚚'], ['shield', 'Escudo', '⬢'], ['dagger', 'Adaga', '†']], 'shield'],
  ['magic', [['spellbook', 'Grimório', '▤'], ['crystal', 'Cristal arcano', '✧'], ['potion', 'Poção', '⚗'], ['wand', 'Varinha', '✣'], ['cauldron', 'Caldeirão', '♜']], 'circle'],
  ['arcane', [['sigil', 'Sigilo', '⌘'], ['third-eye', 'Terceiro olho', '◉'], ['rune', 'Runas', 'ᚱ'], ['spiral', 'Espiral', '꩜'], ['mandala', 'Mandala', '۞']], 'octagon'],
  ['crowns', [['crown', 'Coroa', '♛'], ['diadem', 'Diadema', '♕'], ['scepter', 'Cetro', '⚜'], ['royal-seal', 'Selo real', '✥'], ['crown-gold', 'Coroa dourada', '♔']], 'crown'],
  ['celestial', [['sun', 'Sol', '☼'], ['moon', 'Lua', '☾'], ['comet', 'Cometa', '☄'], ['constellation', 'Constelação', '✣'], ['eclipse', 'Eclipse', '◐']], 'star'],
  ['demonic', [['horns', 'Chifres', '⛧'], ['hellfire', 'Fogo infernal', '♨'], ['abyss', 'Abismo', '▼'], ['demon-eye', 'Olho do abismo', '⊗'], ['infernal-mark', 'Marca infernal', '⛥']], 'pentagon'],
  ['gems', [['ruby', 'Rubi', '♦'], ['sapphire', 'Safira', '◆'], ['emerald', 'Esmeralda', '❖'], ['opal', 'Opala', '◇'], ['amethyst', 'Ametista', '❈']], 'gem'],
  ['animals', [['owl', 'Coruja', '🦉'], ['fox', 'Raposa', '🦊'], ['raven', 'Corvo', '♟'], ['wolf', 'Lobo', '🐺'], ['cat', 'Gato', '🐈']], 'circle'],
  ['abstract', [['infinity', 'Infinito', '∞'], ['knot', 'Nó eterno', '⌘'], ['fractal', 'Fractal', '❋'], ['geometry', 'Geometria', '⬡'], ['paradox', 'Paradoxo', '⧖']], 'hex'],
  ['events', [['lantern', 'Lanterna', '🏮'], ['masquerade', 'Baile de máscaras', '🎭'], ['snowflake', 'Festival de inverno', '❄'], ['fireworks', 'Fogos', '✺'], ['harvest', 'Colheita', '❀']], 'ribbon'],
  ['achievements', [['medal', 'Medalha', '🎖'], ['trophy', 'Troféu', '🏆'], ['laurel', 'Loureiro', '❧'], ['summit', 'Cume', '▲'], ['champion', 'Campeão', '✪']], 'ribbon'],
  ['commemorative', [['anniversary', 'Aniversário', '🎂'], ['candles', 'Velas', '✷'], ['gift', 'Presente', '🎁'], ['founder', 'Fundador', '❂'], ['memory', 'Memória', '❀']], 'seal'],
].flatMap(([category, badges, shape]) => badges.map(([id, name, symbol]) => ({ id, name, symbol, category, shape })));

const LEGACY_BADGES = [
  { id: 'star', name: 'Estrela', symbol: '✦', category: 'celestial', shape: 'star' },
  { id: 'moon', name: 'Lua', symbol: '☾', category: 'celestial', shape: 'circle' },
  { id: 'flame', name: 'Chama', symbol: '♨', category: 'elements', shape: 'diamond' },
  { id: 'comet', name: 'Cometa', symbol: '☄', category: 'celestial', shape: 'star' },
  { id: 'laurel', name: 'Loureiro', symbol: '❧', category: 'achievements', shape: 'ribbon' },
];
const BADGES = [...LEGACY_BADGES, ...rows];
const BADGE_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]));
const COSMETIC_BADGE_IDS = BADGES.map((badge) => badge.id);

const PROFILE_DEFAULTS = Object.freeze({
  bio: '',
  title: 'Membro do Eternity',
  accent: 'rose',
  background: 'dusk',
  frame: 'classic',
  badges: [],
  colors: { primary: '#f9a8d4', secondary: '#831843', highlight: '#fce7f3', text: '#ffffff', xpBar: '#f9a8d4', frame: '#f9a8d4', background: '#11121c' },
  gradient: true,
  elementOpacity: 24,
  backgroundImageUrl: '',
  layout: 'classic',
  xpBarStyle: 'rounded',
  avatarStyle: 'circle',
  visibility: { level: true, xp: true, rank: true, title: true, bio: true, badges: true },
  specialBadges: [],
});

function withProfileDefaults(profile = {}) {
  return {
    ...PROFILE_DEFAULTS,
    ...profile,
    colors: { ...PROFILE_DEFAULTS.colors, ...(profile.colors || {}) },
    visibility: { ...PROFILE_DEFAULTS.visibility, ...(profile.visibility || {}) },
    badges: Array.isArray(profile.badges) ? profile.badges : [],
    specialBadges: Array.isArray(profile.specialBadges) ? profile.specialBadges : [],
  };
}

module.exports = { BADGE_CATEGORIES, BADGES, BADGE_BY_ID, COSMETIC_BADGE_IDS, PROFILE_DEFAULTS, withProfileDefaults };
