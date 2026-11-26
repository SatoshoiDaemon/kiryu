const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  hostId: { type: String, required: true },
  prize: { type: String, required: true, maxlength: 180 },
  winnerCount: { type: Number, required: true, min: 1, max: 25 },
  entrants: { type: [String], default: [] },
  endsAt: { type: Date, required: true, index: true },
  requiredRoleId: { type: String, default: '' },
  status: { type: String, enum: ['active', 'ending', 'ended', 'cancelled'], default: 'active', index: true },
  endingLeaseUntil: { type: Date, default: null },
  winners: { type: [String], default: [] },
  endedAt: { type: Date, default: null },
  announcementSentAt: { type: Date, default: null },
  rerolls: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

giveawaySchema.index({ guildId: 1, status: 1, endsAt: 1 });
module.exports = mongoose.model('Giveaway', giveawaySchema);
