const mongoose = require('mongoose');

// App-wide switches the admin sets from Admin → Settings. There is only ever
// one of these documents — read and write it through Settings.getSingleton().
const orderRestrictionSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  // The window during which salesmen and customers cannot place orders,
  // e.g. today 6 PM → tomorrow 8 AM. Stored as absolute instants.
  from: { type: Date, default: null },
  to: { type: Date, default: null },
  // Optional extra line shown after the times, e.g. "Stock count in progress"
  note: { type: String, trim: true, default: '', maxlength: 300 },
  // The admin's time zone when they saved — the server runs in UTC, so the
  // times in the message are written in this zone (e.g. "Asia/Kolkata")
  timeZone: { type: String, default: 'Asia/Kolkata' }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'app', unique: true },
  orderRestriction: { type: orderRestrictionSchema, default: () => ({}) }
}, {
  timestamps: true
});

settingsSchema.statics.getSingleton = async function () {
  return this.findOneAndUpdate(
    { key: 'app' },
    { $setOnInsert: { key: 'app' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('Settings', settingsSchema);
