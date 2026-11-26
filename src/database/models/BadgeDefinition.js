const mongoose = require('mongoose');

const badgeDefinitionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 40 },
  description: { type: String, default: '', maxlength: 120 },
  symbol: { type: String, required: true, trim: true, maxlength: 8 },
  category: { type: String, required: true, maxlength: 30 },
}, { timestamps: true, versionKey: false });

badgeDefinitionSchema.index({ guildId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('BadgeDefinition', badgeDefinitionSchema);
