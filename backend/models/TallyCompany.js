const mongoose = require('mongoose');

// A Tally company that pushes its outstandings here, and which of its syncs is
// the one the reports read. Rows of a full sync are staged under their own
// snapshot id and only become "current" when this pointer is moved to it — one
// atomic write, so a sync that dies half-way never shows up as half a report.
const tallyCompanySchema = new mongoose.Schema({
  guid: {
    type: String,
    required: [true, 'Tally company GUID is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    trim: true,
    default: ''
  },
  financialYear: {
    type: String,
    trim: true,
    default: ''
  },
  // The sync id whose rows are live; null until the first sync completes
  currentSnapshotId: {
    type: String,
    default: null
  },
  // The day the live figures are "as of" in Tally, kept as that day's UTC midnight
  asOfDate: {
    type: Date,
    default: null
  },
  lastSyncedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TallyCompany', tallyCompanySchema);
