const mongoose = require('mongoose');

// Pieces of one item that are damaged and so no longer count as stock. They
// get here when the admin marks them off an item's stock, or when a completed
// return order sends them here instead of back onto the shelf. Name, price and
// category are read from the item itself, so a rename shows up here too.
const damagedItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Item is required'],
    unique: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative'],
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DamagedItem', damagedItemSchema);
