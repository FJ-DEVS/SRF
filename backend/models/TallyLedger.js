const mongoose = require('mongoose');

// A customer ledger as Tally knows it, and the customer here it stands for.
// Tally's GUID is the identity when it is sent; the name is the fallback.
const tallyLedgerSchema = new mongoose.Schema({
  companyGuid: {
    type: String,
    required: true,
    trim: true
  },
  ledgerGuid: {
    type: String,
    trim: true,
    default: ''
  },
  ledgerCode: {
    type: String,
    trim: true,
    default: ''
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  // The name lowercased with punctuation and spacing flattened — what two
  // spellings of the same ledger have in common
  nameKey: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  gstin: {
    type: String,
    trim: true,
    default: ''
  },
  // Closing balance in Tally (closing_amount) as of the last sync, in paise
  closingPaise: {
    type: Number,
    default: null
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  // 'auto' — matched by GSTIN or name during a sync; 'manual' — set (or
  // cleared) by the admin, which a later sync never overrides
  mappingSource: {
    type: String,
    enum: ['auto', 'manual', null],
    default: null
  },
  lastSeenAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

tallyLedgerSchema.index({ companyGuid: 1, nameKey: 1 });
tallyLedgerSchema.index({ customer: 1 });

module.exports = mongoose.model('TallyLedger', tallyLedgerSchema);
