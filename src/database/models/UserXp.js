const mongoose = require('mongoose');

const userXpSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  level: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

userXpSchema.index({ guildId: 1, userId: 1 }, { unique: true });
userXpSchema.index({ guildId: 1, level: -1, xp: -1 });

module.exports = mongoose.model('UserXp', userXpSchema);
