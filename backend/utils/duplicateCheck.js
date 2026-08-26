// Duplicate guards for the admin CRUD screens.
//
// Values are matched trimmed and case-insensitively, so "Demo", "demo " and
// "DEMO" all count as the same entry. The checks live in the controllers
// rather than in unique indexes because the collections already hold
// duplicates from before this existed and an index would refuse to build.
const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches one exact value, ignoring case and surrounding whitespace
const exact = (value) => new RegExp(`^${escapeRegex(String(value ?? '').trim())}$`, 'i');

// The clashing document, or null when the value is free. `excludeId` keeps a
// record from clashing with itself while it is being edited.
const findDuplicate = async (Model, criteria, excludeId = null) => {
  const query = excludeId ? { ...criteria, _id: { $ne: excludeId } } : criteria;
  return Model.findOne(query).lean();
};

// Blank categories are stored as '' on new items but are missing altogether on
// ones migrated in from Firestore — both mean "no category"
const itemDuplicateQuery = (name, category) => {
  const cat = String(category ?? '').trim();
  return {
    name: exact(name),
    category: cat ? exact(cat) : { $in: [null, ''] }
  };
};

// "000000000", "00000" and friends get typed in when the real number is not
// known yet, so several customers/vendors legitimately share one. Only a real
// number identifies a party.
const isPlaceholderPhone = (phone) => /^0*$/.test(String(phone ?? '').replace(/\D/g, ''));

// Key used to spot two rows of the same Excel import clashing with each other
const itemDuplicateKey = (name, category) =>
  `${String(name ?? '').trim().toLowerCase()}|${String(category ?? '').trim().toLowerCase()}`;

// True when an edit leaves the item on the same name/category it already had.
// Those edits (a price or stock change) must stay possible even for the rows
// that were already duplicated before these checks existed.
const itemIdentityUnchanged = (name, category, current) =>
  itemDuplicateKey(name, category) === itemDuplicateKey(current.name, current.category);

const itemDuplicateMessage = (name, category) => {
  const cat = String(category ?? '').trim();
  return cat
    ? `An item named "${String(name).trim()}" already exists in category "${cat}"`
    : `An item named "${String(name).trim()}" already exists`;
};

module.exports = {
  escapeRegex,
  exact,
  findDuplicate,
  isPlaceholderPhone,
  itemDuplicateQuery,
  itemDuplicateKey,
  itemIdentityUnchanged,
  itemDuplicateMessage
};
