const mongoose = require('mongoose');

const purchaseChoiceSchema = new mongoose.Schema({
  value: { type: String, required: true, trim: true, maxlength: 100 },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', trim: true, maxlength: 100 },
}, { _id: false });

const economyItemSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  sku: { type: String, required: true, trim: true, lowercase: true, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, maxlength: 1000 },
  emoji: { type: String, default: '📦', maxlength: 64 },
  currency: { type: String, enum: ['fragments', 'orbs'], required: true },
  orbType: { type: String, enum: ['green', 'blue', 'orange', 'red', 'black', 'gold'], default: null },
  price: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  stock: { type: Number, default: null, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  soldCount: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  availableFrom: { type: Date, default: null },
  availableUntil: { type: Date, default: null },
  inventoryVisible: { type: Boolean, default: true },
  stackable: { type: Boolean, default: true },
  usable: { type: Boolean, default: false },
  consumeOnUse: { type: Boolean, default: true },
  purchaseQuantity: { type: Number, default: 1, min: 1, max: 1000000, validate: (value) => value == null || Number.isSafeInteger(value) },
  purchaseChoices: { type: [purchaseChoiceSchema], default: [] },
  delivery: { type: String, enum: ['inventory', 'immediate'], default: 'inventory' },
  effectDescription: { type: String, default: '', maxlength: 1000 },
  useMessage: { type: String, default: '', maxlength: 1000 },
  action: { type: String, enum: ['none', 'grant_fragments', 'grant_orb'], default: 'none' },
  actionAmount: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  actionOrbType: { type: String, enum: ['green', 'blue', 'orange', 'red', 'black', 'gold'], default: null },
  active: { type: Boolean, default: true },
  visibleInStore: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, default: null },
}, { timestamps: true, versionKey: false });

economyItemSchema.index({ guildId: 1, sku: 1 }, { unique: true });
economyItemSchema.index({ guildId: 1, currency: 1, active: 1, deletedAt: 1 });

module.exports = mongoose.model('EconomyItem', economyItemSchema);
