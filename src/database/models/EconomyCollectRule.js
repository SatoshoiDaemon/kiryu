const mongoose = require('mongoose');

const economyCollectRuleSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  roleId: { type: String, required: true },
  name: { type: String, required: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 500 },
  fragments: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  orbType: { type: String, enum: ['green', 'blue', 'orange', 'red', 'black', 'gold'], default: null },
  orbAmount: { type: Number, default: 0, min: 0, validate: (value) => value == null || Number.isSafeInteger(value) },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'interval', 'calendar'], required: true },
  intervalMs: { type: Number, default: null, min: 60000, validate: (value) => value == null || Number.isSafeInteger(value) },
  calendarUnit: { type: String, enum: ['week', 'month', null], default: null },
  calendarValue: { type: Number, default: null, min: 0, max: 31, validate: (value) => value == null || Number.isSafeInteger(value) },
  stackable: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  createdBy: { type: String, required: true },
}, { timestamps: true, versionKey: false });

economyCollectRuleSchema.index({ guildId: 1, roleId: 1, active: 1 });

module.exports = mongoose.model('EconomyCollectRule', economyCollectRuleSchema);
