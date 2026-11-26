const mongoose = require('mongoose');

const memberProfileSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  bio: { type: String, default: '', maxlength: 160 },
  title: { type: String, default: 'Membro do Eternity', maxlength: 40 },
  accent: { type: String, enum: ['rose', 'violet', 'gold', 'emerald', 'ice'], default: 'rose' },
  background: { type: String, enum: ['dusk', 'crimson', 'aurora', 'parchment'], default: 'dusk' },
  frame: { type: String, enum: ['classic', 'royal', 'neon', 'rune', 'ornate', 'minimal', 'gilded', 'thorn'], default: 'classic' },
  colors: {
    primary: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    secondary: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    highlight: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    text: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    xpBar: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    frame: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    background: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
  },
  gradient: { type: Boolean },
  elementOpacity: { type: Number, min: 0, max: 100 },
  backgroundImageUrl: { type: String, default: '', maxlength: 500 },
  layout: { type: String, enum: ['classic', 'wide', 'portrait', 'folio', 'orbital'], default: 'classic' },
  xpBarStyle: { type: String, enum: ['rounded', 'segmented', 'orb', 'minimal', 'square'], default: 'rounded' },
  avatarStyle: { type: String, enum: ['circle', 'rounded', 'square', 'diamond', 'hex'], default: 'circle' },
  visibility: {
    level: { type: Boolean, default: true },
    xp: { type: Boolean, default: true },
    rank: { type: Boolean, default: true },
    title: { type: Boolean, default: true },
    bio: { type: Boolean, default: true },
    badges: { type: Boolean, default: true },
  },
  badges: { type: [String], default: [] },
  specialBadges: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });

memberProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('MemberProfile', memberProfileSchema);
