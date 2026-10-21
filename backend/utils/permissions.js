// Who may see and order what. A salesman's permissions name the customers
// they may serve and the item categories they may sell; a customer's name the
// item categories that may be sold to them. A list left unset means
// "everything" — the default, so every salesman and customer starts with full
// access and picks up new customers and categories automatically.
//
// Categories are kept by id, since they can be renamed, and resolved to the
// names items carry when a query needs them.
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Salesman = require('../models/Salesman');
const Customer = require('../models/Customer');

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
  Salesman.findById(salesmanId).select('allowedCustomers allowedCategories').lean();

// The customer ids a salesman may serve, or null for every customer
const allowedCustomerIds = async (salesmanId) => {
  const salesman = await salesmanPermissions(salesmanId);
  return salesman?.allowedCustomers ?? null;
};

// The category names open to a salesman and / or a customer — both lists
// apply when both are given — or null when neither narrows them
const allowedCategoryNames = async ({ salesmanId, customerId } = {}) => {
  const lists = [];
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

module.exports = {
  parseIdList,
  allowedCustomerIds,
  allowedCategoryNames,
  firstForbiddenItem
};
