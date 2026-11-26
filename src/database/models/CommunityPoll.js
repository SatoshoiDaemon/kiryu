const mongoose = require('mongoose');

const communityPollSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  creatorId: { type: String, required: true },
  question: { type: String, required: true, maxlength: 240 },
  options: { type: [String], required: true },
  votes: { type: [{ userId: String, option: Number }], default: [] },
  anonymous: { type: Boolean, default: false },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  closesAt: { type: Date, default: null },
  resultPostedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

communityPollSchema.index({ guildId:  1, status: 1, closesAt: 1 });
module.exports = mongoose.model('CommunityPoll', communityPollSchema);
