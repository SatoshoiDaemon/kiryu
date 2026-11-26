const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  channelId: { type: String, default: '' },
  model: { type: String, required: true, default: 'cubic' },
  kind: { type: String, enum: ['chat', 'connection-test', 'personality-test'], default: 'chat' },
  status: { type: String, enum: ['succeeded', 'failed', 'rate-limited', 'cancelled'], required: true },
  inputTokens: { type: Number, min: 0 },
  outputTokens: { type: Number, min: 0 },
  totalTokens: { type: Number, min: 0 },
  reasoningTokens: { type: Number, min: 0 },
  latencyMs: { type: Number, min: 0, required: true },
  errorCode: { type: String, maxlength: 80 },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

aiUsageSchema.index({ guildId: 1, createdAt: -1 });
aiUsageSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
aiUsageSchema.index({ guildId: 1, model: 1, createdAt: -1 });
aiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 34_560_000 });

module.exports = mongoose.model('AIUsage', aiUsageSchema);
