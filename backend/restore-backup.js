// Puts back a snapshot taken by `migrate.js --reset`.
//
//   node restore-backup.js                       list the snapshots on disk
//   node restore-backup.js <stamp>               dry run — report, change nothing
//   node restore-backup.js <stamp> --confirm     replace the collections
//
// Restoring is a straight replace: each collection in the snapshot is emptied
// and refilled with exactly the documents it held, original _ids included, so
// every reference between them lines up again.
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const BACKUP_ROOT = path.join(__dirname, 'backup');
const CONFIRM = process.argv.includes('--confirm');
const stamp = process.argv.slice(2).find((a) => !a.startsWith('--'));

// The backup files hold extended-JSON-ish values that JSON.parse flattens to
// strings; turn the ones we care about back into real BSON types.
const OID = /^[0-9a-f]{24}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const revive = (value, key) => {
  if (Array.isArray(value)) return value.map((v) => revive(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = revive(v, k);
    return out;
  }
  if (typeof value === 'string') {
    if (OID.test(value) && (key === '_id' || key === 'item' || key === 'rak' || key.endsWith('Id')
      || ['createdBy', 'customerName', 'cargo', 'assignedSalesman', 'placedBy'].includes(key))) {
      return new mongoose.Types.ObjectId(value);
    }
    if (ISO.test(value)) return new Date(value);
  }
  return value;
};

const listSnapshots = () => {
  if (!fs.existsSync(BACKUP_ROOT)) return [];
  return fs.readdirSync(BACKUP_ROOT)
    .filter((d) => fs.existsSync(path.join(BACKUP_ROOT, d, 'manifest.json')))
    .sort();
};

(async () => {
  const snapshots = listSnapshots();

  if (!stamp) {
    if (!snapshots.length) {
      console.log('No snapshots in backup/. One is written every time you run `node migrate.js --reset`.');
      return;
    }
    console.log('Snapshots available:\n');
    for (const s of snapshots) {
      const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_ROOT, s, 'manifest.json'), 'utf8'));
      const counts = Object.entries(manifest.counts).map(([k, v]) => `${k} ${v}`).join(', ');
      console.log(`  ${s}\n      ${counts}`);
    }
    console.log('\nRestore one with:  node restore-backup.js <stamp> --confirm');
    return;
  }

  const dir = path.join(BACKUP_ROOT, stamp);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    console.error(`No snapshot "${stamp}" in backup/. Run without arguments to list them.`);
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const collections = Object.keys(manifest.counts);

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Restoring ${stamp} into ${db.databaseName}${CONFIRM ? '' : '  [dry run]'}\n`);

  for (const name of collections) {
    const docs = revive(JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')));
    const current = await db.collection(name).countDocuments();

    if (!CONFIRM) {
      console.log(`  ${name.padEnd(12)} ${current} now  ->  ${docs.length} from snapshot`);
      continue;
    }

    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
    console.log(`  ${name.padEnd(12)} ${current} removed, ${docs.length} restored`);
  }

  await mongoose.disconnect();
  console.log(CONFIRM
    ? '\nRestored. Restart the backend so it reads the collections fresh.'
    : '\nNothing was written. Re-run with --confirm to replace the collections above.');
})().catch(async (error) => {
  console.error('\nRestore failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
