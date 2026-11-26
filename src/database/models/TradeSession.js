const mongoose = require('mongoose');

const tradeSessionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  tradeId: { type: String, required: true, unique: true, maxlength: 32 },
  participants: { type: [String], required: true, validate: (value) => value.length === 2 },
  inviteeId: { type: String, required: true },
  state: { type: String, enum: ['invited', 'open', 'settling', 'completed', 'cancelled', 'expired', 'manual_review'], default: 'invited', index: true },
  offers: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  confirmed: { type: [String], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  settlementAttempts: { type: Number, default: 0, min: 0 },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  operationId: { type: String, default: null },
  channelId: { type: String, default: null },
  messageId: { type: String, default: null },
  lastError: { type: String, default: null, maxlength: 500 },
  completedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, versionKey: false });

tradeSessionSchema.index({ guildId: 1, participants: 1, state: 1 });
tradeSessionSchema.index({ state: 1, expiresAt: 1 });

module.exports = mongoose.model('TradeSession', tradeSessionSchema);
