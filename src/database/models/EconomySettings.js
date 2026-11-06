const mongoose = require('mongoose');

const rewardRangeSchema = new mongoose.Schema({
  min: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  max: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
}, { _id: false });

const orbRewardRangesSchema = new mongoose.Schema({
  green: { type: rewardRangeSchema, default: () => ({ min: 10, max: 100 }) },
  blue: { type: rewardRangeSchema, default: () => ({ min: 10, max: 50 }) },
  orange: { type: rewardRangeSchema, default: () => ({ min: 5, max: 10 }) },
  red: { type: rewardRangeSchema, default: () => ({ min: 0, max: 0 }) },
  black: { type: rewardRangeSchema, default: () => ({ min: 0, max: 0 }) },
  gold: { type: rewardRangeSchema, default: () => ({ min: 0, max: 0 }) },
}, { _id: false });

const dailyRewardRangesSchema = new mongoose.Schema({
  fragments: { type: rewardRangeSchema, default: () => ({ min: 400, max: 1000 }) },
  orbs: { type: orbRewardRangesSchema, default: () => ({}) },
}, { _id: false });

const economySettingsSchema = new mongoose.Schema({
  _id: { type: String },
  work: {
    min: { type: Number, default: 100, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    max: { type: Number, default: 500, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 3600000, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  daily: {
    rewardRanges: { type: dailyRewardRangesSchema, default: () => ({}) },
    rangesConfigured: { type: Boolean, default: false },
    cooldownMs: { type: Number, default: 86400000, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('EconomySettings', economySettingsSchema);
