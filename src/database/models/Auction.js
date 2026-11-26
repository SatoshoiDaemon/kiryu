const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  bidderId: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  operationId: { type: String, required: true },
  placedAt: { type: Date, default: Date.now },
  refundedAt: { type: Date, default: null },
}, { _id: false });

const auctionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  auctionId: { type: String, required: true, unique: true, maxlength: 32 },
  sellerId: { type: String, required: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  quantity: { type: Number, required: true, min: 1 },
  startingBid: { type: Number, required: true, min: 1 },
  minIncrement: { type: Number, required: true, min: 1 },
  buyNow: { type: Number, default: null, min: 1 },
  currentBid: { type: Number, default: 0, min: 0 },
  highBidderId: { type: String, default: null },
  state: { type: String, enum: ['reserving', 'open', 'settling', 'completed', 'cancelled', 'expired', 'manual_review'], default: 'reserving', index: true },
  bids: { type: [bidSchema], default: [] },
  expiresAt: { type: Date, required: true },
  operationId: { type: String, default: null },
  revision: { type: Number, default: 0 },
  pendingBid: { type: mongoose.Schema.Types.Mixed, default: null },
  settlementKind: { type: String, enum: ['close', 'cancel', null], default: null },
  settlementError: { type: String, default: null, maxlength: 500 },
  completedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

auctionSchema.index({ guildId: 1, state: 1, expiresAt: 1 });
auctionSchema.index({ guildId: 1, sellerId: 1, state: 1 });

module.exports = mongoose.model('Auction', auctionSchema);
