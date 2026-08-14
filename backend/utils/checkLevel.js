// Check level = the safety stock line. Stock at or below it means the item (or
// the whole category) is running out and needs reordering.
//
// An item uses its own check level when it has one, otherwise it inherits the
// check level of its category. Items with neither are simply not tracked.
const Category = require('../models/Category');

// Blank / missing means "not tracked" — stored as null
const parseCheckLevel = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  return isNaN(num) || num < 0 ? null : num;
};

// { categoryName -> checkLevel } for every category that has one
const categoryCheckLevels = async () => {
  const categories = await Category.find({ checkLevel: { $ne: null } })
    .select('name checkLevel')
    .lean();
  return new Map(categories.map((c) => [c.name, c.checkLevel]));
};

// The level actually in force for an item, and whether it has been breached
const effectiveCheckLevel = (item, levelsByCategory) => {
  if (item.checkLevel !== null && item.checkLevel !== undefined) return item.checkLevel;
  const inherited = levelsByCategory.get(item.category);
  return inherited === undefined ? null : inherited;
};

// Adds effectiveCheckLevel / belowCheckLevel to a plain item object
const decorateCheckLevel = (item, levelsByCategory) => {
  const level = effectiveCheckLevel(item, levelsByCategory);
  return {
    ...item,
    effectiveCheckLevel: level,
    belowCheckLevel: level !== null && (item.quantity || 0) <= level
  };
};

// Mongo condition matching every item at or below its effective check level.
// `{ checkLevel: null }` also matches documents saved before the field existed.
const belowCheckLevelQuery = (levelsByCategory) => ({
  $or: [
    { checkLevel: { $ne: null }, $expr: { $lte: ['$quantity', '$checkLevel'] } },
    ...[...levelsByCategory].map(([category, level]) => ({
      checkLevel: null,
      category,
      quantity: { $lte: level }
    }))
  ]
});

module.exports = {
  parseCheckLevel,
  categoryCheckLevels,
  effectiveCheckLevel,
  decorateCheckLevel,
  belowCheckLevelQuery
};
