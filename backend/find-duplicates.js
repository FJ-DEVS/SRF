// Read-only report of the duplicates already sitting in the database.
//
//   node find-duplicates.js            # every collection
//   node find-duplicates.js items      # one collection (items, categories,
//                                        cargo, customers, vendors, salesmen,
//                                        rollers, schemas)
//
// Raks are deliberately left out — several raks share a name ("VERTICAL -
// 0.8mm" spans A01..A07) and only their code has to be unique, which a unique
// index already guarantees.
//
// Deletes nothing and changes nothing — it only tells you what clashes, so you
// can merge or remove the extras by hand. New entries are blocked at the
// controllers (see utils/duplicateCheck.js); this covers the older rows that
// were saved before those checks existed.
require('dotenv').config();
const mongoose = require('mongoose');

const Item = require('./models/Item');
const Category = require('./models/Category');
const Cargo = require('./models/Cargo');
const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Salesman = require('./models/Salesman');
const Roller = require('./models/Roller');
const Schema = require('./models/Schema');

const { isPlaceholderPhone } = require('./utils/duplicateCheck');

// Same normalisation the controllers use: trimmed and case-insensitive
const norm = (value) => String(value ?? '').trim().toLowerCase();

// Each check: which collection, what makes two rows the same, and what to show
const CHECKS = [
  {
    key: 'items',
    label: 'Item (name + category)',
    Model: Item,
    select: 'name category price quantity',
    groupBy: (d) => `${norm(d.name)}|${norm(d.category)}`,
    describe: (d) => `"${d.name}" | ${d.category || 'no category'}`,
    detail: (d) => `price ₹${d.price ?? 0}, stock ${d.quantity ?? 0}`
  },
  {
    key: 'categories',
    label: 'Category (name)',
    Model: Category,
    select: 'name',
    groupBy: (d) => norm(d.name),
    describe: (d) => `"${d.name}"`
  },
  {
    key: 'cargo',
    label: 'Cargo (name)',
    Model: Cargo,
    select: 'name',
    groupBy: (d) => norm(d.name),
    describe: (d) => `"${d.name}"`
  },
  {
    key: 'customers',
    label: 'Customer (phone)',
    Model: Customer,
    select: 'name phone',
    groupBy: (d) => (isPlaceholderPhone(d.phone) ? null : norm(d.phone)),
    describe: (d) => `${d.phone}`,
    detail: (d) => d.name
  },
  {
    key: 'vendors',
    label: 'Vendor (phone)',
    Model: Vendor,
    select: 'name phone',
    groupBy: (d) => (isPlaceholderPhone(d.phone) ? null : norm(d.phone)),
    describe: (d) => `${d.phone}`,
    detail: (d) => d.name
  },
  {
    key: 'salesmen',
    label: 'Salesman (username)',
    Model: Salesman,
    select: 'name username',
    groupBy: (d) => norm(d.username),
    describe: (d) => `${d.username}`,
    detail: (d) => d.name
  },
  {
    key: 'rollers',
    label: 'Roller (username)',
    Model: Roller,
    select: 'name username',
    groupBy: (d) => norm(d.username),
    describe: (d) => `${d.username}`,
    detail: (d) => d.name
  },
  {
    key: 'schemas',
    label: 'Schema (name)',
    Model: Schema,
    select: 'name runBy',
    groupBy: (d) => norm(d.name),
    describe: (d) => `"${d.name}"`,
    detail: (d) => d.runBy
  }
];

// Groups of two or more rows sharing a key, largest first
const findGroups = async (check) => {
  const docs = await check.Model.find().select(check.select).lean();
  const groups = new Map();

  for (const doc of docs) {
    const key = check.groupBy(doc);
    if (key === null) continue;  // placeholder value — not an identity
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  return [...groups.values()]
    .filter((rows) => rows.length > 1)
    .sort((a, b) => b.length - a.length);
};

const run = async () => {
  const only = process.argv[2];
  const checks = only ? CHECKS.filter((c) => c.key === only) : CHECKS;

  if (checks.length === 0) {
    console.error(`Unknown collection "${only}". Use one of: ${CHECKS.map((c) => c.key).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let totalGroups = 0;
  let totalExtras = 0;

  for (const check of checks) {
    const groups = await findGroups(check);
    console.log(`\n${check.label}`);

    if (groups.length === 0) {
      console.log('  no duplicates');
      continue;
    }

    for (const rows of groups) {
      totalGroups++;
      totalExtras += rows.length - 1;
      console.log(`  ${check.describe(rows[0])}  ->  ${rows.length} records`);
      for (const row of rows) {
        const detail = check.detail ? check.detail(row) : '';
        console.log(`      ${row._id}${detail ? `  (${detail})` : ''}`);
      }
    }
  }

  console.log(
    `\n${totalGroups} duplicate group(s), ${totalExtras} extra record(s) that could be removed.`
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Duplicate scan failed:', error.message);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => {});
});
