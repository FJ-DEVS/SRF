const mongoose = require('mongoose');

// One synchronisation pushed by Tally, from its first batch to its last. Kept
// for good as the history of what arrived and when.
const tallySyncSchema = new mongoose.Schema({
  companyGuid: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    trim: true,
    default: ''
  },
  syncId: {
    type: String,
    required: true,
    trim: true
  },
  syncType: {
    type: String,
    enum: ['FULL', 'INCREMENTAL'],
    default: 'FULL'
  },
  asOfDate: {
    type: Date,
    default: null
  },
  // receiving — batches still coming; completed — live; failed — given up on
  status: {
    type: String,
    enum: ['receiving', 'completed', 'failed'],
    default: 'receiving'
  },
  // Records per batch number. A batch sent twice replaces its own count, so a
  // retry never inflates the total.
  batches: [{
    _id: false,
    number: Number,
    records: Number,
    receivedAt: Date
  }],
  receivedRecords: {
    type: Number,
    default: 0
  },
  // What Tally said the whole sync holds, when it said so
  expectedRecords: {
    type: Number,
    default: null
  },
  // The live picture once this sync completed. Amounts in paise.
  totals: {
    bills: { type: Number, default: 0 },
    ledgers: { type: Number, default: 0 },
    pendingPaise: { type: Number, default: 0 }
  },
  unmappedLedgers: {
    type: Number,
    default: 0
  },
  error: {
    type: String,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tallySyncSchema.index({ companyGuid: 1, syncId: 1 }, { unique: true });
tallySyncSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TallySync', tallySyncSchema);
