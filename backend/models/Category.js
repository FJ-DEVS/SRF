const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true
  },
  // Safety stock line for the category as a whole (compared against the total
  // stock of every item in it), and the default check level for items that
  // don't carry one of their own. Optional.
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

module.exports = mongoose.model('Category', categorySchema);
