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
}, { timestamps: true, versionKey: false });

economyAccountSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('EconomyAccount', economyAccountSchema);
