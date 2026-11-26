const mongoose = require('mongoose');

const managedMessageSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  imageObjectId: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

managedMessageSchema.index({ guildId: 1, channelId: 1, updatedAt: -1 });
module.exports = mongoose.model('ManagedMessage', managedMessageSchema);
