const mongoose = require('mongoose');

// A rak is a physical slot on the floor where items get stored
const rakSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Rak name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Rak code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  // How much stock this slot can hold in total. Items fill it up to this
  // number and whatever is left over stays unplaced.
  capacity: {
    type: Number,
    required: [true, 'Rak space is required'],
    min: [1, 'Rak space must be at least 1']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Rak', rakSchema);
