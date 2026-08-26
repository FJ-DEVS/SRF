const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // The document id this order carried in the Firestore export. Unique so a
  // re-run of migrate.js can never insert the same order twice; sparse so
  // orders created inside the app (which have none) are simply not indexed.
  firestoreId: {
    type: String,
    default: undefined,
    index: true,
    unique: true,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Creator is required']
  },
  createdByType: {
    type: String,
    enum: ['admin', 'salesman'],
    required: true
  },
  type: {
    type: String,
    required: [true, 'Order type is required'],
    enum: {
      values: ['sell order', 'purchase order'],
      message: 'Type must be either "sell order" or "purchase order"'
    }
  },
  items: [{
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1']
    }
  }],
  customerName: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'customerModel'
  },
  // Sell orders reference a Customer, purchase orders reference a Vendor
  customerModel: {
    type: String,
    enum: ['Customer', 'Vendor'],
    default: 'Customer'
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'to roll', 'rolled', 'billed', 'delivered', 'completed', 'cancellation_requested', 'cancelled'],
      message: 'Invalid status'
    },
    default: 'pending'
  },
  previousStatus: {
    type: String,
    default: null
  },
  cargo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cargo'
  },
  notes: {
    type: String,
    default: null,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);

