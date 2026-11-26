const mongoose = require('mongoose');

const buffSchema = new mongoose.Schema({
  roleId: { type: String, required: true },
  multiplier: { type: Number, required: true, min: 1, max: 100 },
}, { _id: false });

const triggerSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 100 },
  responses: { type: [String], default: [] },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

const guildConfigSchema = new mongoose.Schema({
  _id: { type: String },
  messageXp: {
    min: { type: Number, default: 20, min: 0, max: 10000 },
    max: { type: Number, default: 100, min: 0, max: 10000 },
    cooldownMs: { type: Number, default: 5000, min: 0, max: 86400000 },
    excludedChannelIds: { type: [String], default: [] },
  },
  voiceXp: {
    intervalMs: { type: Number, default: 300000, min: 60000, max: 86400000 },
    min: { type: Number, default: 20, min: 0, max: 10000 },
    max: { type: Number, default: 100, min: 0, max: 10000 },
    excludedChannelIds: { type: [String], default: [] },
  },
  buffs: { type: [buffSchema], default: [] },
  stackBuffs: { type: Boolean, default: false },
  levelUp: {
    enabled: { type: Boolean, default: true },
    message: { type: String, default: '', maxlength: 1800 },
    channelId: { type: String, default: '' },
  },
  ai: {
    enabled: { type: Boolean, default: false },
    model: { type: String, enum: ['cubic'], default: 'cubic' },
    systemPrompt: { type: String, default: '', maxlength: 32000 },
    lastHealthCheckAt: { type: Date, default: null },
    lastHealthStatus: { type: String, enum: ['unknown', 'available', 'unavailable'], default: 'unknown' },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    maxCompletionTokens: { type: Number, default: 800, min: 16, max: 6144 },
    reasoningEffort: { type: String, enum: ['none', 'minimal', 'low', 'medium', 'high'], default: 'none' },
    contextMessages: { type: Number, default: 24, min: 1, max: 100 },
    contextTokenBudget: { type: Number, default: 6000, min: 512, max: 32000 },
    timeoutMs: { type: Number, default: 30000, min: 5000, max: 90000 },
    maxConcurrent: { type: Number, default: 2, min: 1, max: 16 },
    memberCooldownSeconds: { type: Number, default: 30, min: 0, max: 86400 },
    maxRequestsPerMemberPerDay: { type: Number, default: 20, min: 1, max: 1000 },
    maxTokensPerMemberPerDay: { type: Number, default: 20000, min: 1000, max: 1000000 },
    maxRequestsPerDay: { type: Number, default: 500, min: 1, max: 10000 },
    maxTokensPerDay: { type: Number, default: 200000, min: 1000, max: 20000000 },
    allowedChannelIds: { type: [String], default: [] },
    blockedChannelIds: { type: [String], default: [] },
    allowedRoleIds: { type: [String], default: [] },
    blockedRoleIds: { type: [String], default: [] },
  },
  appearance: {
    palette: { type: String, enum: ['kiryu', 'eclipse', 'jade', 'ember'], default: 'kiryu' },
  },
  adminRoleIds: { type: [String], default: [] },
  triggers: { type: [triggerSchema], default: [] },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
