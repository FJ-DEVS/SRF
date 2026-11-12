const mongoose = require('mongoose');

// The one API key the Tally side signs its requests with. Only its SHA-256 is
// kept — the key itself is shown to the admin once, when it is generated.
const tallyConfigSchema = new mongoose.Schema({
  // Single row, always 'main'
  key: {
    type: String,
    default: 'main',
    unique: true
  },
  apiKeyHash: {
    type: String,
    default: null
  },
  // Last four characters, so the admin can tell which key is live
  apiKeyHint: {
    type: String,
    default: ''
  },
  apiKeyCreatedAt: {
    type: Date,
    default: null
  },
  apiKeyLastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TallyConfig', tallyConfigSchema);
