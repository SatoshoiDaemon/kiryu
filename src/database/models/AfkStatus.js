const mongoose = require('mongoose');

const afkStatusSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  message: { type: String, default: '', maxlength: 240 },
  since: { type: Date, default: Date.now },
}, { timestamps: true, versionKey: false });

afkStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('AfkStatus', afkStatusSchema);
