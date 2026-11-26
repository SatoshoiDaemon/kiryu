const mongoose = require('mongoose');

const referenceSchema = new mongoose.Schema({
  system: { type: String, required: true, maxlength: 40 },
  key: { type: String, required: true, maxlength: 160 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const blobObjectSchema = new mongoose.Schema({
  _id: { type: String },
  guildId: { type: String, required: true, index: true },
  category: { type: String, required: true, enum: ['profile', 'badge', 'frame', 'cosmetic', 'product', 'casino', 'banner', 'divider', 'design-system', 'trigger', 'other'] },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  filename: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, required: true, maxlength: 100 },
  size: { type: Number, required: true, min: 512 },
  url: { type: String, default: null, maxlength: 1000 },
  etag: { type: String, default: '' },
  sha256: { type: String, default: '' },
  createdBy: { type: String, required: true },
  references: { type: [referenceSchema], default: [] },
  deletedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

blobObjectSchema.index({ guildId: 1, category: 1, createdAt: -1 });
blobObjectSchema.index({ guildId: 1, name: 1 });

module.exports = mongoose.model('BlobObject', blobObjectSchema);
