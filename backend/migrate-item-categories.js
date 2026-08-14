// One-off backfill: items carry their size in the name ("3008 SHG - 0.8mm")
// but their `category` field was never filled in, so the items list matched
// them through a name regex instead. This writes the real category onto each
// item so category, check level and consolidation all group correctly.
//
//   node migrate-item-categories.js          # dry run — reports, changes nothing
//   node migrate-item-categories.js --apply  # writes the changes
//
// Items that already have a category are never touched.
require('dotenv').config();
const mongoose = require('mongoose');
const Item = require('./models/Item');
const Category = require('./models/Category');

const APPLY = process.argv.includes('--apply');

const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "1mm" must not match inside "0.71mm" or "11mm", so the character before the
// match may not be a digit or a dot, and the one after may not be a digit.
// Item names are typed inconsistently ("25mtr", "25 mtr"), so allow optional
// spacing between the number and its unit.
const matcher = (name) => {
  const pattern = escapeRegex(name)
    .replace(/\s+/g, '\\s+')                  // spaces inside the name
    .replace(/(\d)(?=[a-zA-Z])/g, '$1\\s*');  // "25mtr" also matches "25 mtr"
  return new RegExp(`(?<![\\d.])${pattern}(?!\\d)`, 'i');
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const categories = await Category.find().select('name').lean();
  // Longest name first, so "1.25mm PVC Laminate" wins over "1mm"
  const ranked = categories
    .map((c) => ({ name: c.name, regex: matcher(c.name) }))
    .sort((a, b) => b.name.length - a.name.length);

  const items = await Item.find({ $or: [{ category: '' }, { category: null }, { category: { $exists: false } }] })
    .select('name category')
    .lean();

  const plan = new Map();   // category -> [item ids]
  const samples = new Map();
  const unmatched = [];

  for (const item of items) {
    const hit = ranked.find((c) => c.regex.test(item.name || ''));
    if (!hit) {
      unmatched.push(item.name);
      continue;
    }
    if (!plan.has(hit.name)) {
      plan.set(hit.name, []);
      samples.set(hit.name, []);
    }
    plan.get(hit.name).push(item._id);
    if (samples.get(hit.name).length < 3) samples.get(hit.name).push(item.name);
  }

  const withCategory = await Item.countDocuments({ category: { $nin: ['', null] } });
  console.log(`${items.length} item(s) without a category; ${withCategory} already categorised\n`);

  for (const [name, ids] of [...plan].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${name.padEnd(24)} ${String(ids.length).padStart(4)} item(s)   e.g. ${samples.get(name).join(', ')}`);
  }

  console.log(`\n  ${'(no match — left empty)'.padEnd(24)} ${String(unmatched.length).padStart(4)} item(s)`);
  if (unmatched.length) console.log(`      e.g. ${unmatched.slice(0, 8).join(' | ')}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to save.');
  } else {
    let updated = 0;
    for (const [name, ids] of plan) {
      const result = await Item.updateMany({ _id: { $in: ids } }, { $set: { category: name } });
      updated += result.modifiedCount;
    }
    console.log(`\nDone — ${updated} item(s) updated.`);
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('Migration failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
