// One-off backfill for the change that moved the rak deduction off order
// creation and onto the "to roll" transition.
//
// Every sell order that existed before that change already had its stock taken
// off the raks the moment it was created. Without this flag those orders would
// be deducted a second time when they advance to "to roll", emptying raks that
// were relieved months ago. Marking them consumed leaves their raks alone.
//
//   node migrate-placement-consumption.js          # dry run — reports, changes nothing
//   node migrate-placement-consumption.js --apply  # writes the flag
//
// RUN THIS BEFORE THE NEW BACKEND GOES LIVE. Legacy orders are recognised by
// not carrying the field at all, and the first status change under the new code
// writes the field — so an order advanced to "to roll" before this runs is the
// one case the backfill cannot catch.
//
// Safe to re-run: orders that already carry the flag are skipped, so orders
// created after the change keep their real value.
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

const APPLY = process.argv.includes('--apply');

// Orders written before the change have no `placementsConsumed` field at all.
// Anything created since then has it set to true or false and is left alone.
const LEGACY = { type: 'sell order', placementsConsumed: { $exists: false } };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const total = await Order.countDocuments({ type: 'sell order' });
  const legacy = await Order.countDocuments(LEGACY);

  const byStatus = await Order.aggregate([
    { $match: LEGACY },
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);

  console.log(`${legacy} of ${total} sell order(s) predate the change:\n`);
  for (const row of byStatus) {
    console.log(`  ${String(row._id).padEnd(24)} ${row.n}`);
  }

  if (!legacy) {
    console.log('\nNothing to backfill.');
  } else if (!APPLY) {
    console.log('\nNothing written. Add --apply to mark these as already deducted.');
  } else {
    const result = await Order.updateMany(LEGACY, {
      $set: { placementsConsumed: true, rakConsumption: [] }
    });
    console.log(`\n${result.modifiedCount} order(s) marked as already deducted.`);
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('\nFailed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
