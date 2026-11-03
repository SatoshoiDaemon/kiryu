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
  adminRoleIds: { type: [String], default: [] },
  triggers: { type: [triggerSchema], default: [] },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('GuildConfig', guildConfigSchema);
