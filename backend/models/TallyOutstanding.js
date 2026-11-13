const mongoose = require('mongoose');

// One pending bill (or on-account balance) of one Tally ledger. Tally is the
// source of truth — rows are only ever written by a sync, never edited here.
//
// Amounts are whole paise, so sums are exact; a positive pending amount is
// money the party owes, a negative one is credit in their favour.
const tallyOutstandingSchema = new mongoose.Schema({
  companyGuid: {
    type: String,
    required: true
  },
  // The sync these rows belong to. Reports read only the snapshot the company
  // currently points at — see TallyCompany.
  snapshotId: {
    type: String,
    required: true
  },
  ledger: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TallyLedger',
    required: true
  },
  // Copied from the ledger so the bill list can search and sort on it
  ledgerName: {
    type: String,
    trim: true,
    default: ''
  },
  // "<ledger id>|<bill reference>" — what makes a re-sent bill the same bill
  billKey: {
    type: String,
    required: true
  },
  entryType: {
    type: String,
    enum: ['BILL', 'ON_ACCOUNT'],
    default: 'BILL'
  },
  voucherNumber: { type: String, trim: true, default: '' },
  voucherType: { type: String, trim: true, default: '' },
  billReference: { type: String, trim: true, default: '' },
  // Days, kept as that day's UTC midnight
  voucherDate: { type: Date, default: null },
  dueDate: { type: Date, default: null },
  originalPaise: { type: Number, default: null },
  paidPaise: { type: Number, default: null },
  pendingPaise: { type: Number, required: true },
  // The customer's closing balance in Tally, as sent with this bill
  // (closing_amount) — the same for every bill of one customer
  closingPaise: { type: Number, default: null },
  billStatus: { type: String, trim: true, default: '' },
  narration: { type: String, trim: true, default: '' }
}, {
  timestamps: true
});

tallyOutstandingSchema.index({ companyGuid: 1, snapshotId: 1, billKey: 1 }, { unique: true });
tallyOutstandingSchema.index({ snapshotId: 1, ledger: 1 });

module.exports = mongoose.model('TallyOutstanding', tallyOutstandingSchema);
