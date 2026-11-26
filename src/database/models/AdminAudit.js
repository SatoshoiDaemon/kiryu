const mongoose = require('mongoose');

const adminAuditSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  actorId: { type: String, required: true },
  targetId: { type: String, default: '' },
  operation: { type: String, required: true, maxlength: 40 },
  reason: { type: String, default: '', maxlength: 1000 },
  channelId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

adminAuditSchema.index({ guildId: 1, targetId: 1, operation: 1, createdAt: -1 });
module.exports = mongoose.model('AdminAudit', adminAuditSchema);
