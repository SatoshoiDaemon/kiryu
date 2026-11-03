const mongoose = require('mongoose');

const userXpSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  level: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

userXpSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('UserXp', userXpSchema);
