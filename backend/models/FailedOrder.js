const mongoose = require('mongoose');

// A sell order someone tried to place that was turned away for want of
// stock. Kept so the admin can see what customers asked for and could not
// get. Names are copied in at the time, so the record still reads right after
// a customer, item or salesman is renamed or deleted.
const failedLineSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  requested: {
    type: Number,
    required: true
  },
  // Stock on hand when the order was tried
  available: {
    type: Number,
    default: 0
  },
  // Pieces missing; 0 for a line that could have been filled
  short: {
    type: Number,
    default: 0
  }
}, { _id: false });

const failedOrderSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  customerName: {
    type: String,
    trim: true,
    default: ''
  },
  cargo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cargo',
    default: null
  },
  cargoName: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salesman',
    default: null
  },
  createdByType: {
    type: String,
    enum: ['admin', 'salesman'],
    required: true
  },
  createdByName: {
    type: String,
    trim: true,
    default: ''
  },
  // Every line of the attempt; the short ones have short > 0
  items: [failedLineSchema],
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

failedOrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FailedOrder', failedOrderSchema);
