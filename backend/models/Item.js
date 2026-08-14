const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative'],
    default: 1
  },
  category: {
    type: String,
    trim: true,
    default: ''
  },
  // Safety stock line. Once quantity drops to or below it the item is flagged
  // for reordering. Optional — when unset the item falls back to the check
  // level of its category.
  checkLevel: {
    type: Number,
    default: null,
    min: [0, 'Check level cannot be negative']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Item', itemSchema);

