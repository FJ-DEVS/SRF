// Firestore export -> MongoDB migration.
//
//   node migrate.js --dry-run    report what would happen, write nothing
//   node migrate.js              migrate; safe to re-run, never duplicates
//   node migrate.js --reset      back up + wipe items/customers/vendors/orders/
//                                placements first, then migrate from scratch
//   --placeholder-items          also create the 20 item names that only orders
//                                mention (price 0, stock 0) so the 36 orders
//                                using them migrate instead of being skipped
//
// Identity keys (the same ones utils/duplicateCheck.js enforces on the admin
// screens, so a migrated row and a hand-typed one clash the same way):
//
//   item      name + category, trimmed and case-insensitive
//   contact   name — phone is NOT an identity here: six numbers in the export
//             are shared by thirty different shops, and keying on phone drops
//             24 real customers
//   order     firestoreId — the export's own document id, unique across all
//             2,833 rows, so re-running can never double-insert
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Item = require('./models/Item');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');
const Category = require('./models/Category');
const Salesman = require('./models/Salesman');

const RESET = process.argv.includes('--reset');
const DRY_RUN = process.argv.includes('--dry-run');
// A real --reset empties the collections before anything is read back, so the
// dry run has to pretend they are empty too — otherwise it reports against
// rows that would no longer be there.
const ASSUME_EMPTY = RESET && DRY_RUN;
// Twenty item names appear in orders.json but not in items.json. Off by
// default: an item with no price and no stock is worse than a missing order.
const PLACEHOLDER_ITEMS = process.argv.includes('--placeholder-items');

const EXPORT_DIR = path.join(__dirname, '../firestore-export/exports');
const BACKUP_ROOT = path.join(__dirname, 'backup');

// Collections this script owns. Placements are included because every one of
// them points at an item; wiping items without them leaves dangling rows.
const OWNED = ['items', 'customers', 'vendors', 'orders', 'placements'];

// Referenced by orders but absent from contacts.json — created as customers so
// those 48 orders keep a link instead of showing a blank buyer.
const MISSING_CONTACTS = [
  'Fabco Glass House - Alappuzha',
  'Sree Kailasam Traders - Kollam',
  'New Luxmat Glass - Mannarkad, Alappuzha',
  'Madeena Glass & Plywood - Kishattur, MLPRM'
];
const PLACEHOLDER_PHONE = '0000000000';

const ORDER_TYPES = {
  'OrderType.purchase': 'purchase order',
  'OrderType.sell': 'sell order'
};

const ORDER_STATUSES = {
  'OrderStatus.pending': 'pending',
  'OrderStatus.toRoll': 'to roll',
  'OrderStatus.rolled': 'rolled',
  'OrderStatus.billed': 'billed',
  'OrderStatus.delivered': 'delivered',
  'OrderStatus.completed': 'delivered',
  'OrderStatus.cancelled': 'cancelled'
};

// ---------------------------------------------------------------- helpers

// Lookup key: trimmed, inner runs of whitespace collapsed, lower-cased.
// "3011 SHG  - 0.8mm" and "3011 SHG - 0.8mm" are the same item.
const norm = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Looser key, used only to carry app-only fields (assigned salesman, check
// level) across the wipe. Never used to decide identity.
const fuzz = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'));

// Firestore writes "2025-11-06T15:31:27.485289" with no zone; Date reads it as
// local time, which is what the old system displayed.
const parseDate = (value) => {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const nonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const stats = {
  items: { read: 0, inserted: 0, existing: 0, failed: 0 },
  customers: { read: 0, inserted: 0, existing: 0, failed: 0, invented: 0 },
  vendors: { read: 0, inserted: 0, existing: 0, failed: 0 },
  placeholders: { created: 0 },
  orders: { read: 0, inserted: 0, existing: 0, failed: 0, skippedUnknownItem: 0, skippedBadType: 0, droppedLines: 0, linkedSalesman: 0 }
};
const notes = { itemNameCollisions: [], contactNameCollisions: [], unknownItemNames: new Set(), errors: [] };

// name -> _id, and name -> { id, model } for contacts
const itemIds = new Map();
const contactIds = new Map();

// ------------------------------------------------------------ backup/wipe

// Everything the export cannot give back: the category work already done on
// items, check levels, and the customer fields the admin screens fill in.
const capturePreserved = async (db) => {
  const items = await db.collection('items')
    .find({}, { projection: { name: 1, category: 1, checkLevel: 1 } }).toArray();
  const customers = await db.collection('customers')
    .find({}, { projection: { name: 1, paymentRating: 1, assignedSalesman: 1, gstCertificate: 1, locationLink: 1 } }).toArray();

  const pack = (rows, fields) => {
    const byName = {};
    for (const row of rows) {
      const kept = {};
      for (const field of fields) {
        const value = row[field];
        if (value === undefined || value === null || value === '') continue;
        kept[field] = field === 'assignedSalesman' ? String(value) : value;
      }
      if (Object.keys(kept).length) byName[norm(row.name)] = kept;
    }
    return byName;
  };

  return {
    items: pack(items, ['category', 'checkLevel']),
    customers: pack(customers, ['paymentRating', 'assignedSalesman', 'gstCertificate', 'locationLink'])
  };
};

const backupAndWipe = async (db) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const counts = {};
  for (const name of OWNED) {
    const rows = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 2));
    counts[name] = rows.length;
  }

  const preserved = await capturePreserved(db);
  fs.writeFileSync(path.join(dir, 'preserved.json'), JSON.stringify(preserved, null, 2));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ takenAt: stamp, counts }, null, 2));

  console.log(`\nBackup written to backup/${stamp}`);
  for (const name of OWNED) console.log(`  ${name.padEnd(12)} ${counts[name]}`);

  if (DRY_RUN) {
    console.log('\n[dry run] would now wipe those collections — nothing deleted');
    return preserved;
  }

  console.log('\nWiping...');
  for (const name of OWNED) {
    const result = await db.collection(name).deleteMany({});
    console.log(`  ${name.padEnd(12)} ${result.deletedCount} removed`);
  }
  return preserved;
};

// Most recent backup, so a plain `node migrate.js` after a `--reset` run still
// finds the preserved fields.
const readLatestPreserved = () => {
  if (!fs.existsSync(BACKUP_ROOT)) return { items: {}, customers: {} };
  const dirs = fs.readdirSync(BACKUP_ROOT)
    .filter((d) => fs.existsSync(path.join(BACKUP_ROOT, d, 'preserved.json')))
    .sort();
  if (!dirs.length) return { items: {}, customers: {} };
  return JSON.parse(fs.readFileSync(path.join(BACKUP_ROOT, dirs[dirs.length - 1], 'preserved.json'), 'utf8'));
};

// Exact key first, then the looser one — but only when it is unambiguous, so
// two old rows collapsing to the same fuzzy key never pick a winner at random.
const preservedLookup = (table) => {
  const fuzzy = new Map();
  for (const key of Object.keys(table)) {
    const f = fuzz(key);
    if (fuzzy.has(f)) fuzzy.set(f, null);
    else fuzzy.set(f, table[key]);
  }
  return (name) => table[norm(name)] || fuzzy.get(fuzz(name)) || null;
};

// ------------------------------------------------------------------ items

// Categories are carried in the item name ("3008 SHG - 0.8mm"). Longest first
// so "1.25mm PVC Laminate" wins over "1mm", and "1mm" never matches inside
// "0.71mm" or "11mm".
const buildCategoryMatchers = async () => {
  const categories = await Category.find().select('name').lean();
  return categories
    .map((c) => {
      const pattern = escapeRegex(c.name)
        .replace(/\s+/g, '\\s+')
        .replace(/(\d)(?=[a-zA-Z])/g, '$1\\s*');
      return { name: c.name, regex: new RegExp(`(?<![\\d.])${pattern}(?!\\d)`, 'i') };
    })
    .sort((a, b) => b.name.length - a.name.length);
};

const migrateItems = async (preserved) => {
  console.log('\n=== Items ===');
  const rows = readJson('items.json');
  stats.items.read = rows.length;

  const matchers = await buildCategoryMatchers();
  const lookupPreserved = preservedLookup(preserved.items);

  if (!ASSUME_EMPTY) {
    for (const existing of await Item.find().select('name category').lean()) {
      itemIds.set(norm(existing.name), existing._id);
    }
  }

  const seen = new Map();
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    if (!name) {
      stats.items.failed++;
      notes.errors.push(`item ${row._id}: blank name`);
      continue;
    }

    const key = norm(name);
    if (seen.has(key)) {
      notes.itemNameCollisions.push(`${seen.get(key)} / ${name}`);
      stats.items.existing++;
      continue;
    }
    seen.set(key, name);

    if (itemIds.has(key)) {
      stats.items.existing++;
      continue;
    }

    const kept = lookupPreserved(name) || {};
    const category = kept.category
      || (matchers.find((m) => m.regex.test(name)) || {}).name
      || '';

    if (DRY_RUN) {
      stats.items.inserted++;
      itemIds.set(key, new mongoose.Types.ObjectId());
      continue;
    }

    try {
      const saved = await Item.create({
        name,
        price: nonNegative(row.price),
        quantity: nonNegative(row.quantity),
        category,
        checkLevel: kept.checkLevel ?? null,
        createdAt: parseDate(row.createdAt)
      });
      itemIds.set(key, saved._id);
      stats.items.inserted++;
    } catch (error) {
      stats.items.failed++;
      notes.errors.push(`item "${name}": ${error.message}`);
    }
  }

  console.log(`  read ${stats.items.read}  inserted ${stats.items.inserted}  skipped-as-duplicate ${stats.items.existing}  failed ${stats.items.failed}`);
};

// --------------------------------------------------------------- contacts

const migrateContacts = async (preserved) => {
  console.log('\n=== Contacts ===');
  const rows = readJson('contacts.json');
  const lookupPreserved = preservedLookup(preserved.customers);

  if (!ASSUME_EMPTY) {
    for (const existing of await Customer.find().select('name').lean()) {
      contactIds.set(norm(existing.name), { id: existing._id, model: 'Customer' });
    }
    for (const existing of await Vendor.find().select('name').lean()) {
      contactIds.set(norm(existing.name), { id: existing._id, model: 'Vendor' });
    }
  }

  const seen = new Map();
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    const isVendor = row.type === 'ContactType.vendor';
    const bucket = isVendor ? stats.vendors : stats.customers;
    bucket.read++;

    if (!name) {
      bucket.failed++;
      notes.errors.push(`contact ${row._id}: blank name`);
      continue;
    }
    if (row.type !== 'ContactType.customer' && !isVendor) {
      bucket.failed++;
      notes.errors.push(`contact "${name}": unknown type ${row.type}`);
      continue;
    }

    const key = norm(name);
    if (seen.has(key)) {
      notes.contactNameCollisions.push(`${seen.get(key)} / ${name}`);
      bucket.existing++;
      continue;
    }
    seen.set(key, name);

    if (contactIds.has(key)) {
      bucket.existing++;
      continue;
    }

    const base = {
      name,
      phone: String(row.phone ?? '').trim() || PLACEHOLDER_PHONE,
      gstin: String(row.gstin ?? '').trim(),
      isBlocked: Boolean(row.isBlocked),
      createdAt: parseDate(row.createdAt)
    };

    if (DRY_RUN) {
      bucket.inserted++;
      contactIds.set(key, { id: new mongoose.Types.ObjectId(), model: isVendor ? 'Vendor' : 'Customer' });
      continue;
    }

    try {
      if (isVendor) {
        const saved = await Vendor.create(base);
        contactIds.set(key, { id: saved._id, model: 'Vendor' });
      } else {
        const saved = await Customer.create({ ...base, ...(lookupPreserved(name) || {}) });
        contactIds.set(key, { id: saved._id, model: 'Customer' });
      }
      bucket.inserted++;
    } catch (error) {
      bucket.failed++;
      notes.errors.push(`contact "${name}": ${error.message}`);
    }
  }

  // The four names only orders know about
  for (const name of MISSING_CONTACTS) {
    const key = norm(name);
    if (contactIds.has(key)) continue;
    if (DRY_RUN) {
      contactIds.set(key, { id: new mongoose.Types.ObjectId(), model: 'Customer' });
      stats.customers.invented++;
      continue;
    }
    try {
      const saved = await Customer.create({ name, phone: PLACEHOLDER_PHONE, gstin: '', isBlocked: false });
      contactIds.set(key, { id: saved._id, model: 'Customer' });
      stats.customers.invented++;
    } catch (error) {
      notes.errors.push(`invented contact "${name}": ${error.message}`);
    }
  }

  console.log(`  customers  read ${stats.customers.read}  inserted ${stats.customers.inserted}  skipped-as-duplicate ${stats.customers.existing}  failed ${stats.customers.failed}  created-from-orders ${stats.customers.invented}`);
  console.log(`  vendors    read ${stats.vendors.read}  inserted ${stats.vendors.inserted}  skipped-as-duplicate ${stats.vendors.existing}  failed ${stats.vendors.failed}`);
};

// ----------------------------------------------------------------- orders

// Order creators are stored as emails; the salesman logins are the same string
// without the ".com" (faiz@srf.com -> faiz@srf). The rest stay on admin.
const buildCreatorMap = async () => {
  const salesmen = await Salesman.find().select('name username').lean();
  const byUsername = new Map(salesmen.map((s) => [norm(s.username), s]));
  return (email) => byUsername.get(norm(String(email ?? '').replace(/\.com$/i, ''))) || null;
};

// Stand-ins for the item names only orders know about, so those orders keep a
// complete line list. They carry no price and no stock — they exist to hold the
// name, and show up in the items list for someone to fill in or merge.
const createPlaceholderItems = async (rows) => {
  const wanted = new Map();
  for (const row of rows) {
    for (const line of row.items || []) {
      const key = norm(line.itemName);
      if (key && !itemIds.has(key) && !wanted.has(key)) wanted.set(key, String(line.itemName).trim());
    }
  }
  if (!wanted.size) return;

  console.log(`  creating ${wanted.size} placeholder item(s) for names only orders mention`);
  for (const [key, name] of wanted) {
    if (DRY_RUN) {
      itemIds.set(key, new mongoose.Types.ObjectId());
      stats.placeholders.created++;
      continue;
    }
    try {
      const saved = await Item.create({ name, price: 0, quantity: 0, category: '', checkLevel: null });
      itemIds.set(key, saved._id);
      stats.placeholders.created++;
    } catch (error) {
      notes.errors.push(`placeholder item "${name}": ${error.message}`);
    }
  }
};

const migrateOrders = async () => {
  console.log('\n=== Orders ===');
  const rows = readJson('orders.json');
  stats.orders.read = rows.length;

  if (PLACEHOLDER_ITEMS) await createPlaceholderItems(rows);

  const creatorFor = await buildCreatorMap();
  const alreadyThere = new Set(
    ASSUME_EMPTY ? [] :
    (await Order.find({ firestoreId: { $ne: null } }).select('firestoreId').lean()).map((o) => o.firestoreId)
  );

  const pending = [];
  for (const row of rows) {
    if (row._id && alreadyThere.has(row._id)) {
      stats.orders.existing++;
      continue;
    }

    const type = ORDER_TYPES[row.type];
    if (!type) {
      stats.orders.skippedBadType++;
      notes.errors.push(`order ${row._id}: unknown type ${row.type}`);
      continue;
    }

    const lines = [];
    let unknownItem = false;
    for (const line of row.items || []) {
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        stats.orders.droppedLines++;
        continue;
      }
      const id = itemIds.get(norm(line.itemName));
      if (!id) {
        notes.unknownItemNames.add(line.itemName);
        unknownItem = true;
        continue;
      }
      lines.push({ item: id, quantity });
    }

    if (unknownItem || !lines.length) {
      stats.orders.skippedUnknownItem++;
      continue;
    }

    const contact = contactIds.get(norm(row.customerName));
    const creator = creatorFor(row.createdBy);
    if (creator) stats.orders.linkedSalesman++;

    pending.push({
      firestoreId: row._id,
      createdAt: parseDate(row.createdAt),
      createdBy: creator ? creator._id : String(row.createdBy ?? 'Admin'),
      createdByType: creator ? 'salesman' : 'admin',
      type,
      items: lines,
      // refPath follows the contact's own kind, so the 14 purchase orders
      // placed against a customer and the 4 sell orders against a vendor
      // still populate correctly
      customerName: contact ? contact.id : undefined,
      customerModel: contact ? contact.model : (type === 'purchase order' ? 'Vendor' : 'Customer'),
      status: ORDER_STATUSES[row.status] || 'pending',
      previousStatus: null,
      notes: null
    });
    alreadyThere.add(row._id);
  }

  if (DRY_RUN) {
    stats.orders.inserted = pending.length;
  } else {
    // insertMany in chunks — ordered:false so one bad row cannot abort the rest
    const CHUNK = 500;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      try {
        const saved = await Order.insertMany(chunk, { ordered: false });
        stats.orders.inserted += saved.length;
      } catch (error) {
        stats.orders.inserted += error.insertedDocs ? error.insertedDocs.length : 0;
        for (const err of error.writeErrors || []) {
          stats.orders.failed++;
          notes.errors.push(`order: ${err.err ? err.err.errmsg : err.message}`);
        }
        if (!error.writeErrors) {
          stats.orders.failed += chunk.length;
          notes.errors.push(`order chunk ${i}: ${error.message}`);
        }
      }
      console.log(`  ...${Math.min(i + CHUNK, pending.length)}/${pending.length}`);
    }
  }

  console.log(`  read ${stats.orders.read}  inserted ${stats.orders.inserted}  already present ${stats.orders.existing}  failed ${stats.orders.failed}`);
  console.log(`  skipped (unknown item) ${stats.orders.skippedUnknownItem}  skipped (bad type) ${stats.orders.skippedBadType}  dropped zero-qty lines ${stats.orders.droppedLines}`);
  console.log(`  linked to a salesman account ${stats.orders.linkedSalesman}`);
};

// ------------------------------------------------------------------ index

// firestoreId is the order dedup key, so make the database enforce it too.
// The collection ships with a non-unique sparse index of the same name, which
// would clash with the model's — drop it and let syncIndexes rebuild.
const ensureOrderIndex = async (db) => {
  if (DRY_RUN) return;
  const existing = await db.collection('orders').indexes();
  const current = existing.find((i) => i.name === 'firestoreId_1');
  if (current && !current.unique) {
    await db.collection('orders').dropIndex('firestoreId_1');
    console.log('  dropped non-unique firestoreId index');
  }
  await Order.syncIndexes();
};

// ------------------------------------------------------------------ check

const verify = async () => {
  console.log('\n=== Verification ===');
  const [items, customers, vendors, orders] = await Promise.all([
    Item.countDocuments(), Customer.countDocuments(), Vendor.countDocuments(), Order.countDocuments()
  ]);
  console.log(`  items ${items}  customers ${customers}  vendors ${vendors}  orders ${orders}`);

  const dupItems = await Item.aggregate([
    { $group: { _id: { name: { $toLower: '$name' }, category: { $toLower: { $ifNull: ['$category', ''] } } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);
  const dupOrders = await Order.aggregate([
    { $match: { firestoreId: { $ne: null } } },
    { $group: { _id: '$firestoreId', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);
  const dupContacts = await Customer.aggregate([
    { $group: { _id: { $toLower: '$name' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } }
  ]);

  console.log(`  duplicate items (name+category): ${dupItems.length}`);
  console.log(`  duplicate orders (firestoreId):  ${dupOrders.length}`);
  console.log(`  duplicate customers (name):      ${dupContacts.length}`);

  const validItems = new Set((await Item.find().select('_id').lean()).map((i) => String(i._id)));
  const validContacts = new Set([
    ...(await Customer.find().select('_id').lean()).map((c) => String(c._id)),
    ...(await Vendor.find().select('_id').lean()).map((v) => String(v._id))
  ]);
  const validSalesmen = new Set((await Salesman.find().select('_id').lean()).map((s) => String(s._id)));

  let danglingItem = 0, danglingContact = 0, noContact = 0, danglingSalesman = 0, badModel = 0;
  for (const order of await Order.find().select('items customerName customerModel createdBy createdByType').lean()) {
    if ((order.items || []).some((l) => !validItems.has(String(l.item)))) danglingItem++;
    if (!order.customerName) noContact++;
    else if (!validContacts.has(String(order.customerName))) danglingContact++;
    if (order.createdByType === 'salesman' && !validSalesmen.has(String(order.createdBy))) danglingSalesman++;
    if (!['Customer', 'Vendor'].includes(order.customerModel)) badModel++;
  }
  console.log(`  orders with a dangling item ref:     ${danglingItem}`);
  console.log(`  orders with a dangling contact ref:  ${danglingContact}`);
  console.log(`  orders with no contact at all:       ${noContact}`);
  console.log(`  orders with a dangling salesman ref: ${danglingSalesman}`);
  console.log(`  orders with a bad customerModel:     ${badModel}`);

  const uncategorised = await Item.countDocuments({ $or: [{ category: '' }, { category: null }, { category: { $exists: false } }] });
  console.log(`  items without a category:            ${uncategorised}`);

  const clean = !dupItems.length && !dupOrders.length && !dupContacts.length
    && !danglingItem && !danglingContact && !danglingSalesman && !badModel;
  console.log(clean ? '\n  ✓ no duplicates, no broken references' : '\n  ✗ issues above need a look');
};

const report = () => {
  console.log('\n' + '='.repeat(58));
  if (notes.itemNameCollisions.length) {
    console.log(`\nDuplicate names inside items.json (${notes.itemNameCollisions.length}, first kept):`);
    notes.itemNameCollisions.slice(0, 20).forEach((c) => console.log(`  ${c}`));
  }
  if (notes.contactNameCollisions.length) {
    console.log(`\nDuplicate names inside contacts.json (${notes.contactNameCollisions.length}, first kept):`);
    notes.contactNameCollisions.forEach((c) => console.log(`  ${c}`));
  }
  if (notes.unknownItemNames.size) {
    console.log(`\nItem names orders reference but items.json does not have (${notes.unknownItemNames.size}) —`);
    console.log(`those ${stats.orders.skippedUnknownItem} orders were skipped.`);
    console.log('Re-run with --placeholder-items to migrate them against stand-in items:');
    [...notes.unknownItemNames].forEach((n) => console.log(`  ${n}`));
  }
  if (stats.placeholders.created) {
    console.log(`\nPlaceholder items created (price 0, stock 0): ${stats.placeholders.created}`);
  }
  if (notes.errors.length) {
    console.log(`\nErrors (${notes.errors.length}):`);
    notes.errors.slice(0, 25).forEach((e) => console.log(`  ${e}`));
    if (notes.errors.length > 25) console.log(`  ...and ${notes.errors.length - 25} more`);
  }
  console.log('\n' + '='.repeat(58));
};

// ------------------------------------------------------------------- main

(async () => {
  console.log(`Firestore -> MongoDB migration${DRY_RUN ? '  [dry run]' : ''}${RESET ? '  [reset]' : ''}`);

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`Connected to ${db.databaseName}`);

  const preserved = RESET ? await backupAndWipe(db) : readLatestPreserved();

  await ensureOrderIndex(db);
  await migrateItems(preserved);
  await migrateContacts(preserved);
  await migrateOrders();

  if (!DRY_RUN) await verify();
  report();

  await mongoose.disconnect();
  console.log(DRY_RUN ? 'Dry run finished — nothing was written.\n' : 'Migration finished.\n');
})().catch(async (error) => {
  console.error('\nMigration failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
