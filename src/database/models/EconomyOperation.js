const mongoose = require('mongoose');

const economyOperationSchema = new mongoose.Schema({
  _id: { type: String, required: true, maxlength: 160 },
  guildId: { type: String, required: true, index: true },
  kind: { type: String, required: true, maxlength: 48 },
  state: { type: String, enum: ['pending', 'completed', 'cancelled', 'manual_review'], default: 'pending', index: true },
  step: { type: String, default: 'created', maxlength: 48 },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true, versionKey: false });

economyOperationSchema.index({ state: 1, updatedAt: 1 });

module.exports = mongoose.model('EconomyOperation', economyOperationSchema);
