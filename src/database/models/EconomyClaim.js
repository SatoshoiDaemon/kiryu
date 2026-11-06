const mongoose = require('mongoose');

const economyClaimSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  periodKey: { type: String, required: true },
  collectedAt: { type: Date, default: Date.now },
}, { versionKey: false });

economyClaimSchema.index({ guildId: 1, userId: 1, ruleId: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('EconomyClaim', economyClaimSchema);
