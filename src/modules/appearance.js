const config = require('../config');

const PALETTES = {
  kiryu: { brand: 0x9D174D, xp: 0xC0265A, fragments: 0xE8A317, orbs: 0x7654C9, store: 0x168A68, casino: 0x7C3AED, profile: 0xD9467C, success: 0x168A68, error: 0xC83E4D, admin: 0x9D174D },
  eclipse: { brand: 0x465579, xp: 0x6276C7, fragments: 0xC89943, orbs: 0x7866B6, store: 0x3F8D8A, casino: 0x6752A5, profile: 0x687CB8, success: 0x39836D, error: 0xB84B58, admin: 0x465579 },
  jade: { brand: 0x176B57, xp: 0x24866B, fragments: 0xBB8B28, orbs: 0x6756A6, store: 0x24866B, casino: 0x4864A8, profile: 0x398C78, success: 0x24866B, error: 0xBD4854, admin: 0x176B57 },
  ember: { brand: 0x9C3B26, xp: 0xC05037, fragments: 0xD49A2F, orbs: 0x7452A4, store: 0xA34D32, casino: 0x774195, profile: 0xC45B45, success: 0x418465, error: 0xB83B45, admin: 0x9C3B26 },
};

function applyPalette(name = 'kiryu') {
  const palette = PALETTES[name] || PALETTES.kiryu;
  Object.assign(config.visual, palette);
  config.visual.palette = Object.hasOwn(PALETTES, name) ? name : 'kiryu';
  return config.visual.palette;
}

module.exports = { PALETTES, applyPalette };
