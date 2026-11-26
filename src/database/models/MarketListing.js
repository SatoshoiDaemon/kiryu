const mongoose = require('mongoose');

const marketListingSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  listingId: { type: String, required: true, unique: true, maxlength: 32 },
  sellerId: { type: String, required: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sku: { type: String, required: true, maxlength: 32 },
  itemSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  quantity: { type: Number, required: true, min: 1, validate: (value) => Number.isSafeInteger(value) },
  unitPrice: { type: Number, required: true, min: 1, validate: (value) => Number.isSafeInteger(value) },
  category: { type: String, default: 'other', maxlength: 32 },
  state: { type: String, enum: ['reserving', 'active', 'settling', 'sold', 'cancelled', 'expired', 'manual_review'], default: 'reserving', index: true },
  expiresAt: { type: Date, default: null },
  buyerId: { type: String, default: null },
  operationId: { type: String, default: null },
  settledAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

marketListingSchema.index({ guildId: 1, state: 1, category: 1, createdAt: -1 });
marketListingSchema.index({ guildId: 1, sellerId: 1, state: 1 });
marketListingSchema.index({ state: 1, expiresAt: 1 });

module.exports = mongoose.model('MarketListing', marketListingSchema);
