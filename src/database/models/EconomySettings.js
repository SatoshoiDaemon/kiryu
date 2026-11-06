const mongoose = require('mongoose');

const orbRewardsSchema = new mongoose.Schema({
  green: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  blue: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  orange: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  red: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  black: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  gold: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
}, { _id: false });

const economySettingsSchema = new mongoose.Schema({
  _id: { type: String },
  work: {
    min: { type: Number, default: 100, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    max: { type: Number, default: 500, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 3600000, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  daily: {
    fragments: { type: Number, default: 500, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    orbs: { type: orbRewardsSchema, default: () => ({ green: 1 }) },
    orbsConfigured: { type: Boolean, default: false },
    cooldownMs: { type: Number, default: 86400000, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('EconomySettings', economySettingsSchema);
