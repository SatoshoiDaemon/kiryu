const mongoose = require('mongoose');

const orbSchema = new mongoose.Schema({
  green: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  blue: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  orange: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  red: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  black: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  gold: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
}, { _id: false });

const economyAccountSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  wallet: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  bank: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  orbs: { type: orbSchema, default: () => ({}) },
  lastWorkAt: { type: Date, default: null },
  lastDailyAt: { type: Date, default: null },
  lastCrimeAt: { type: Date, default: null },
  lastAdventureAt: { type: Date, default: null },
  lastPassiveAt: { type: Date, default: null },
  lastCasinoAt: { type: Date, default: null },
  casinoLossDay: { type: String, default: null, maxlength: 10 },
  casinoLossToday: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  activeCasinoSessionId: { type: String, default: null, maxlength: 80 },
  casinoReservedPayout: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  // Calendar key is additive; lastDailyAt is retained for old records/history.
  dailyClaimDay: { type: String, default: null, maxlength: 10 },
  // Short idempotency window for account mutations performed without replica-set transactions.
  recentOperationKeys: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });

economyAccountSchema.index({ guildId: 1, userId: 1 }, { unique: true });
economyAccountSchema.index({ guildId: 1, wallet: -1 });
economyAccountSchema.index({ guildId: 1, bank: -1 });

module.exports = mongoose.model('EconomyAccount', economyAccountSchema);
