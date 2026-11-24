// Who may see and order what. A salesman's permissions name the customers
// they may serve, the item categories they may sell and the cargos they may
// send orders by; a customer's name the item categories that may be sold to
// them and the cargos they may send orders by. A list left unset means
// "everything" — the default, so every salesman and customer starts with full
// access and picks up new customers, categories and cargos automatically.
//
// Category and cargo permissions follow whoever places the order: a salesman
// ordering for a customer is held to the salesman's lists only, and a
// customer ordering in the app to the customer's lists only. Admins are not
// limited.
//
// A viewer orders nothing and only reads the stock list: their permissions
// name the item categories they see and whether the stock count and / or the
// rate of each item is shown (models/Viewer.js).
//
// Categories are kept by id, since they can be renamed, and resolved to the
// names items carry when a query needs them.
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Salesman = require('../models/Salesman');
const Customer = require('../models/Customer');
const Viewer = require('../models/Viewer');

// A permission list from a request body: { list } — null meaning "all" — or
// { error } when it is neither null nor an array of ids
const parseIdList = (value, label) => {
  if (value === null || value === undefined) return { list: null };
  if (!Array.isArray(value)) return { error: `${label} must be a list of IDs, or null for all` };
  const ids = [...new Set(value.map(String))];
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) return { error: `${label} holds an invalid ID` };
  return { list: ids };
};

const salesmanPermissions = (salesmanId) =>
  Salesman.findById(salesmanId).select('allowedCustomers allowedCategories allowedCargos').lean();

// The customer ids a salesman may serve, or null for every customer
const allowedCustomerIds = async (salesmanId) => {
  const salesman = await salesmanPermissions(salesmanId);
  return salesman?.allowedCustomers ?? null;
};

// The cargo ids a signed-in user may send orders by, or null for every cargo
// (admins and other staff)
const allowedCargoIds = async (user) => {
  if (user?.role === 'salesman') {
    const salesman = await salesmanPermissions(user.id);
    return salesman?.allowedCargos ?? null;
  }
  if (user?.role === 'customer' && mongoose.Types.ObjectId.isValid(user.id)) {
    const customer = await Customer.findById(user.id).select('allowedCargos').lean();
    return customer?.allowedCargos ?? null;
  }
  return null;
};

// The category names open to a salesman, a customer and / or a viewer — every
// list given applies — or null when none narrows them
const allowedCategoryNames = async ({ salesmanId, customerId, viewerId } = {}) => {
  const lists = [];
  if (viewerId && mongoose.Types.ObjectId.isValid(viewerId)) {
    const viewer = await Viewer.findById(viewerId).select('allowedCategories').lean();
    if (viewer?.allowedCategories) lists.push(viewer.allowedCategories.map(String));
  }
  if (salesmanId) {
    const salesman = await salesmanPermissions(salesmanId);
    if (salesman?.allowedCategories) lists.push(salesman.allowedCategories.map(String));
  }
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    const customer = await Customer.findById(customerId).select('allowedCategories').lean();
    if (customer?.allowedCategories) lists.push(customer.allowedCategories.map(String));
  }
  if (!lists.length) return null;

  const ids = lists.reduce((acc, list) => acc.filter((id) => list.includes(id)));
  const categories = await Category.find({ _id: { $in: ids } }).select('name').lean();
  return categories.map((c) => c.name);
};

// The first of `items` (each { name, category }) whose category is not in
// `names`, or undefined when every one is allowed
const firstForbiddenItem = (items, names) =>
  names === null ? undefined : items.find((item) => !names.includes(item.category || ''));

// Which of an item's stock fields a signed-in user may read: { quantity,
// price }. Only viewers are limited — everyone else sees both.
const visibleStockFields = async (user) => {
  if (user?.role !== 'viewer') return { quantity: true, price: true };
  const viewer = mongoose.Types.ObjectId.isValid(user.id)
    ? await Viewer.findById(user.id).select('canViewQuantity canViewPrice').lean()
    : null;
  return {
    quantity: viewer?.canViewQuantity !== false,
    price: viewer?.canViewPrice !== false
  };
};

// The category scope of a signed-in app user, for allowedCategoryNames — only
// their own list: a customer's list limits what the customer orders, not what
// a salesman orders for them
const ownCategoryScope = (user) => {
  if (user?.role === 'salesman') return { salesmanId: user.id };
  if (user?.role === 'customer') return { customerId: user.id };
  if (user?.role === 'viewer') return { viewerId: user.id };
  return null;
};

module.exports = {
  parseIdList,
  visibleStockFields,
  ownCategoryScope,
  allowedCustomerIds,
  allowedCargoIds,
  allowedCategoryNames,
  firstForbiddenItem
};
