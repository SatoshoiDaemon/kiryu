const mongoose = require('mongoose');

const economyTransactionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  actorId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  operation: { type: String, required: true, maxlength: 48 },
  currency: { type: String, enum: ['fragments', 'orbs', 'item', 'mixed', 'none'], default: 'none' },
  orbType: { type: String, default: null },
  amount: { type: Number, default: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  walletDelta: { type: Number, default: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  bankDelta: { type: Number, default: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  orbDelta: { type: mongoose.Schema.Types.Mixed, default: null },
  itemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  itemSku: { type: String, default: null },
  itemSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  idempotencyKey: { type: String, default: null },
}, { timestamps: true, versionKey: false });

economyTransactionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
economyTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

module.exports = mongoose.model('EconomyTransaction', economyTransactionSchema);
