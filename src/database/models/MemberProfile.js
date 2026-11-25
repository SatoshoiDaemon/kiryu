const mongoose = require('mongoose');

const memberProfileSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  bio: { type: String, default: '', maxlength: 160 },
  title: { type: String, default: 'Membro do Eternity', maxlength: 40 },
  accent: { type: String, enum: ['rose', 'violet', 'gold', 'emerald', 'ice'], default: 'rose' },
  background: { type: String, enum: ['dusk', 'crimson', 'aurora', 'parchment'], default: 'dusk' },
  frame: { type: String, enum: ['classic', 'royal', 'neon', 'rune'], default: 'classic' },
  badges: { type: [{ type: String, enum: ['star', 'moon', 'flame', 'comet', 'laurel'] }], default: [] },
}, { timestamps: true, versionKey: false });

memberProfileSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('MemberProfile', memberProfileSchema);
