const mongoose = require('mongoose');

const aiQuotaCounterSchema = new mongoose.Schema({
  _id: { type: String },
  requests: { type: Number, default: 0, min: 0 },
  tokens: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

aiQuotaCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AIQuotaCounter', aiQuotaCounterSchema);
