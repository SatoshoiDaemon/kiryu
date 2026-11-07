const mongoose = require('mongoose');

const selectedChoiceSchema = new mongoose.Schema({
  value: { type: String, default: null },
  label: { type: String, default: null },
  description: { type: String, default: '' },
}, { _id: false });

const economyInventorySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sku: { type: String, required: true },
  slot: { type: String, default: 'stack' },
  quantity: { type: Number, default: 1, min: 1, max: Number.MAX_SAFE_INTEGER, validate: (value) => value == null || Number.isSafeInteger(value) },
  itemSnapshot: {
    name: { type: String, required: true },
    emoji: { type: String, default: '📦' },
    description: { type: String, default: '' },
    usable: { type: Boolean, default: false },
    consumeOnUse: { type: Boolean, default: true },
    useMessage: { type: String, default: '' },
    effectDescription: { type: String, default: '' },
    inventoryVisible: { type: Boolean, default: true },
    action: { type: String, enum: ['none', 'grant_fragments', 'grant_orb'], default: 'none' },
    actionAmount: { type: Number, default: 0 },
    actionOrbType: { type: String, default: null },
    stackable: { type: Boolean, default: true },
    selectedChoice: { type: selectedChoiceSchema, default: null },
  },
}, { timestamps: true, versionKey: false });

economyInventorySchema.index({ guildId: 1, userId: 1, itemId: 1, slot: 1 }, { unique: true });
economyInventorySchema.index({ guildId: 1, userId: 1, updatedAt: -1 });

module.exports = mongoose.model('EconomyInventory', economyInventorySchema);
