// Shared sort options for the admin listing pages.
// Keep the keys in step with SORT_OPTIONS in the frontend pages.
const SORT_SPECS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  qty_asc: { quantity: 1 },
  qty_desc: { quantity: -1 }
};

// Case-insensitive A–Z, so "apple" and "Apple" sort together
const NAME_COLLATION = { locale: 'en', strength: 2 };

// Applies ?sort= to a mongoose query, falling back to newest-first
const applySort = (query, sort) => {
  const spec = SORT_SPECS[sort] || SORT_SPECS.newest;
  query.sort(spec);
  if (spec.name !== undefined) query.collation(NAME_COLLATION);
  return query;
};

module.exports = { applySort, SORT_SPECS };
