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
  economy: {
    initialWallet: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    initialBank: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    walletLimit: { type: Number, default: Number.MAX_SAFE_INTEGER, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    bankLimit: { type: Number, default: Number.MAX_SAFE_INTEGER, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    marketFeePercent: { type: Number, default: 5, min: 0, max: 50, validate: (value) => value == null || Number.isSafeInteger(value) },
    marketListingDays: { type: Number, default: 7, min: 1, max: 30, validate: (value) => value == null || Number.isSafeInteger(value) },
    maxListingsPerMember: { type: Number, default: 10, min: 1, max: 100, validate: (value) => value == null || Number.isSafeInteger(value) },
    auctionFeePercent: { type: Number, default: 5, min: 0, max: 50, validate: (value) => value == null || Number.isSafeInteger(value) },
    lotteryFeePercent: { type: Number, default: 0, min: 0, max: 50, validate: (value) => value == null || Number.isSafeInteger(value) },
    auctionMinIncrement: { type: Number, default: 10, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    tradeExpiryHours: { type: Number, default: 24, min: 1, max: 168, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  work: {
    enabled: { type: Boolean, default: true },
    min: { type: Number, default: 100, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    max: { type: Number, default: 500, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 3600000, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  adventure: {
    enabled: { type: Boolean, default: true },
    min: { type: Number, default: 80, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    max: { type: Number, default: 800, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 7200000, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  crime: {
    enabled: { type: Boolean, default: true },
    min: { type: Number, default: 100, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    max: { type: Number, default: 1200, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    fineMin: { type: Number, default: 50, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    fineMax: { type: Number, default: 400, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    failChancePercent: { type: Number, default: 35, min: 0, max: 100, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 10800000, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  passiveIncome: {
    enabled: { type: Boolean, default: false },
    amount: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
    intervalMs: { type: Number, default: 86400000, min: 3600000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  daily: {
    rewardRanges: { type: dailyRewardRangesSchema, default: () => ({}) },
    enabled: { type: Boolean, default: true },
    rangesConfigured: { type: Boolean, default: false },
    cooldownMs: { type: Number, default: 86400000, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  orbs: {
    conversionRate: { type: Number, default: 10, min: 2, max: 1000000, validate: (value) => value == null || Number.isSafeInteger(value) },
  },
  casino: {
    maxBet: { type: Number, default: 1000000000, min: 1, max: 1000000000, validate: (value) => value == null || Number.isSafeInteger(value) },
    cooldownMs: { type: Number, default: 0, min: 0, max: 86400000, validate: (value) => value == null || Number.isSafeInteger(value) },
    dailyLossLimit: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    sessionMinutes: { type: Number, default: 15, min: 1, max: 120, validate: (value) => value == null || Number.isSafeInteger(value) },
    turnTimeoutMinutes: { type: Number, default: 2, min: 1, max: 60, validate: (value) => value == null || Number.isSafeInteger(value) },
    allowedChannelIds: { type: [String], default: [] },
    lotteryTicketPrice: { type: Number, default: 100, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    maxLotteryTicketsPerMember: { type: Number, default: 100, min: 1, max: 1000, validate: (value) => value == null || Number.isSafeInteger(value) },
    multiplayerEntry: { type: Number, default: 100, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
    games: {
      blackjack: { enabled: { type: Boolean, default: true } },
      roulette: { enabled: { type: Boolean, default: true } },
      mines: { enabled: { type: Boolean, default: true } },
      highlow: { enabled: { type: Boolean, default: true } },
      wheel: { enabled: { type: Boolean, default: true } },
      keno: { enabled: { type: Boolean, default: true } },
      treasure: { enabled: { type: Boolean, default: true } },
      racing: { enabled: { type: Boolean, default: true } },
      lottery: { enabled: { type: Boolean, default: true } },
      poker: { enabled: { type: Boolean, default: true } },
    },
    flip: {
      enabled: { type: Boolean, default: true },
      multiplier: { type: Number, default: 2, min: 2, max: 100, validate: (value) => value == null || Number.isSafeInteger(value) },
    },
    dice: {
      enabled: { type: Boolean, default: true },
      multiplier: { type: Number, default: 2, min: 2, max: 100, validate: (value) => value == null || Number.isSafeInteger(value) },
    },
    slots: {
      enabled: { type: Boolean, default: true },
      multiplier: { type: Number, default: 5, min: 2, max: 100, validate: (value) => value == null || Number.isSafeInteger(value) },
    },
  },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('EconomySettings', economySettingsSchema);
