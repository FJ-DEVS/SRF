const mongoose = require('mongoose');

// One side of an item's reorder setup, the Tally way: a fixed quantity, the
// consumption over a trailing period ("the last 2 months"), or — when both are
// given — the higher or lower of the two. See utils/reorder.js.
const reorderRuleSchema = new mongoose.Schema({
  quantity: {
    type: Number,
    default: null,
    min: [0, 'Quantity cannot be negative']
  },
  periodValue: {
    type: Number,
    default: null,
    min: [1, 'Period must be at least 1']
  },
  periodUnit: {
    type: String,
    enum: ['days', 'weeks', 'months', 'years'],
    default: 'months'
  },
  // Which days "the last 2 months" covers: 'rolling' runs from the same day
  // two months back up to today, 'calendar' takes the two whole months
  // before this one, 'custom' is a fixed pair of dates picked on a calendar
  periodMode: {
    type: String,
    enum: ['rolling', 'calendar', 'custom'],
    default: 'rolling'
  },
  // Custom mode only — first and last day counted, as "YYYY-MM-DD"
  periodFrom: {
    type: String,
    default: null,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD']
  },
  periodTo: {
    type: String,
    default: null,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD']
  },
  criteria: {
    type: String,
    enum: ['higher', 'lower'],
    default: 'higher'
  }
}, { _id: false });

const reorderSchema = new mongoose.Schema({
  // What the stock should be brought back up to
  level: { type: reorderRuleSchema, default: null },
  // The least a purchase order for this item should hold
  minOrder: { type: reorderRuleSchema, default: null }
}, { _id: false });

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
  // Reorder level and minimum order quantity rules. Optional — an item
  // without one is not reordered. Independent of the check level.
  reorder: {
    type: reorderSchema,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Item', itemSchema);

