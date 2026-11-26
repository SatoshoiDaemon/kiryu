const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true, maxlength: 80 },
  game: { type: String, required: true, maxlength: 32, index: true },
  ownerId: { type: String, required: true },
  playerIds: { type: [String], default: [] },
  state: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['open', 'active', 'settling', 'completed', 'cancelled', 'expired', 'manual_review'], default: 'open', index: true },
  revision: { type: Number, default: 0 },
  channelId: { type: String, default: null },
  messageId: { type: String, default: null },
  expiresAt: { type: Date, required: true, index: true },
  settledAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

gameSessionSchema.index({ guildId: 1, game: 1, status: 1, expiresAt: 1 });
gameSessionSchema.index({ guildId: 1, playerIds: 1, status: 1 });

module.exports = mongoose.model('GameSession', gameSessionSchema);
