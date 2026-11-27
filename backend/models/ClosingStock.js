const mongoose = require('mongoose');

// A category's stock at the end of a month — set against that month's sales
// for the sale : stock ratio graph on the investor dashboard.
//
// `auto` is written by the server itself: every half hour it records the
// category's stock on hand (the sum of its items' quantity) against the
// current month, so when a month ends the last figure taken stays as that
// month's closing stock (see utils/closingStock.js). `manual` is a figure the
// admin typed in — for months before the server kept them, or to correct one
// — and wins over `auto` while it is set.
const closingStockSchema = new mongoose.Schema(
  {
    // Category name, as items carry it; '' for items with no category
    category: { type: String, default: '', trim: true },
    // "YYYY-MM", in Indian time
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    auto: { type: Number, default: null },
    autoAt: { type: Date, default: null },
    manual: { type: Number, default: null },
    manualAt: { type: Date, default: null },
    // The sum of the category's item reorder levels, taken with `auto` — the
    // levels follow sales, so this floats month to month
    reorderAuto: { type: Number, default: null }
  },
  { timestamps: true }
);

closingStockSchema.index({ category: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ClosingStock', closingStockSchema);
