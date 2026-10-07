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
      values: ['sell order', 'purchase order', 'return order'],
      message: 'Type must be "sell order", "purchase order" or "return order"'
    }
  },
  // Return orders only: the sell order the goods came back from. Each line of
  // a return is capped at what that order sold (less earlier returns), and the
  // incentive points those lines earned are taken back on the leaderboard.
  returnOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },
  // Return orders only: whether the returned pieces were put back into item
  // stock when the return was recorded (damaged goods usually are not).
  restocked: {
    type: Boolean,
    default: false
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
  // The bill number typed in by whoever marks the order "billed" — required
  // for that move, and cleared again if the move is reverted. Kept as a string
  // so a leading zero survives.
  billNumber: {
    type: String,
    default: null,
    trim: true
  },
  // Set once the order is marked "rolled" and its stock has been taken off the
  // raks. Guards against a revert-then-advance deducting the same order twice.
  placementsConsumed: {
    type: Boolean,
    default: false
  },
  // Which rak gave up how much of which item when that happened, so a revert
  // or an approved cancellation can put the stock back where it came from.
  rakConsumption: [{
    _id: false,
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    rak: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rak'
    },
    quantity: Number
  }],
  // When a roller first opened the order in the "to roll" queue — drives the
  // seen / not-seen styling there. Shared by all rollers; cleared whenever the
  // order is queued for rolling again so it shows up as new.
  rollerSeenAt: {
    type: Date,
    default: null
  },
  // The roller who marked the order "rolled"; cleared if that is reverted.
  // Stays null when an admin or salesman rolls it.
  rolledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Roller',
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

