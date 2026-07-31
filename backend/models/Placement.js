const mongoose = require('mongoose');

// A quantity of one item sitting in one rak.
// A rak holds several items as long as their quantities fit inside its
// capacity, and one item may be spread across as many raks as it needs.
const placementSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Item is required']
  },
  rak: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rak',
    required: [true, 'Rak is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  placedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Roller',
    default: null
  },
  placedByName: {
    type: String,
    default: 'Admin',
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// One row per item-in-rak; placing more of the same item into the same rak
// tops up the existing row instead of creating a second one
placementSchema.index({ item: 1, rak: 1 }, { unique: true });
placementSchema.index({ rak: 1 });

module.exports = mongoose.model('Placement', placementSchema);
