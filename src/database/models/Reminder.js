const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  text: { type: String, required: true, maxlength: 1000 },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['queued', 'sending', 'sent', 'cancelled', 'failed'], default: 'queued', index: true },
  attempts: { type: Number, default: 0, min: 0 },
  leaseUntil: { type: Date, default: null, index: true },
  processedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

reminderSchema.index({ guildId: 1, userId: 1, status: 1, dueAt: 1 });
module.exports = mongoose.model('Reminder', reminderSchema);
