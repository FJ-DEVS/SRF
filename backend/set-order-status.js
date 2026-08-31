// Bulk status change for orders, with an undo file.
//
//   node set-order-status.js completed              dry run — report only
//   node set-order-status.js completed --confirm    apply
//   node set-order-status.js --undo <snapshot>      put the old statuses back
//
// Writes straight to the collection, so none of the side effects the status
// endpoint carries are triggered: no stock is added for completed purchase
// orders, and no WhatsApp message goes out. That is deliberate — the stock
// figures already came from Firestore with these orders accounted for, and
// re-running the side effects would double-count every one of them.
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Order = require('./models/Order');

const BACKUP_ROOT = path.join(__dirname, 'backup');
const CONFIRM = process.argv.includes('--confirm');
const undoIndex = process.argv.indexOf('--undo');
const UNDO = undoIndex !== -1 ? process.argv[undoIndex + 1] : null;
const target = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== UNDO);

const ALLOWED = Order.schema.path('status').enumValues;

const summarise = async () => {
  const rows = await Order.aggregate([
    { $group: { _id: { status: '$status', type: '$type' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } }
  ]);
  for (const r of rows) {
    console.log(`  ${String(r._id.type).padEnd(16)} ${String(r._id.status).padEnd(24)} ${r.n}`);
  }
};

const undo = async () => {
  const file = path.isAbsolute(UNDO) ? UNDO : path.join(BACKUP_ROOT, UNDO);
  if (!fs.existsSync(file)) {
    console.error(`No snapshot at ${file}`);
    process.exitCode = 1;
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring ${snapshot.length} order status(es) from ${path.basename(file)}${CONFIRM ? '' : '  [dry run]'}\n`);

  const byStatus = new Map();
  for (const row of snapshot) {
    if (!byStatus.has(row.status)) byStatus.set(row.status, []);
    byStatus.get(row.status).push(new mongoose.Types.ObjectId(row._id));
  }

  for (const [status, ids] of byStatus) {
    if (CONFIRM) await Order.updateMany({ _id: { $in: ids } }, { $set: { status } });
    console.log(`  ${status.padEnd(24)} ${ids.length}`);
  }

  console.log(CONFIRM ? '\nRestored.' : '\nNothing written. Add --confirm to apply.');
};

const apply = async () => {
  if (!ALLOWED.includes(target)) {
    console.error(`"${target}" is not a valid status.\nAllowed: ${ALLOWED.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Current statuses:');
  await summarise();

  const affected = await Order.countDocuments({ status: { $ne: target } });
  const total = await Order.countDocuments();
  console.log(`\n${affected} of ${total} order(s) would change to "${target}".`);

  // Orders whose type has no route through this status can no longer be moved
  // on or reverted from the admin screens.
  const offFlow = {
    'sell order': ['pending', 'to roll', 'rolled', 'billed', 'delivered'],
    'purchase order': ['pending', 'completed']
  };
  for (const [type, flow] of Object.entries(offFlow)) {
    if (flow.includes(target)) continue;
    const n = await Order.countDocuments({ type });
    if (n) console.log(`  warning: "${target}" is not part of the ${type} flow — those ${n} order(s) will be stuck there`);
  }

  if (!CONFIRM) {
    console.log('\nNothing written. Add --confirm to apply.');
    return;
  }

  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_ROOT, `order-status-${stamp}.json`);
  const snapshot = (await Order.find().select('status').lean())
    .map((o) => ({ _id: String(o._id), status: o.status }));
  fs.writeFileSync(file, JSON.stringify(snapshot));
  console.log(`\nOld statuses saved to backup/${path.basename(file)}`);

  const result = await Order.updateMany({ status: { $ne: target } }, { $set: { status: target } });
  console.log(`${result.modifiedCount} order(s) set to "${target}".\n`);

  console.log('Statuses now:');
  await summarise();
  console.log(`\nUndo with:  node set-order-status.js --undo order-status-${stamp}.json --confirm`);
};

(async () => {
  if (!target && !UNDO) {
    console.log(`Usage:\n  node set-order-status.js <status> [--confirm]\n  node set-order-status.js --undo <snapshot> [--confirm]\n\nStatuses: ${ALLOWED.join(', ')}`);
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  await (UNDO ? undo() : apply());
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('\nFailed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
