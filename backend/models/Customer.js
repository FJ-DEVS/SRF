const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One app login on a customer — a salesman working at the customer's own shop
// (not one of our salesmen). A shop can have several, each with their own
// username and password; `name` is shown as "Order by" on the orders they
// place. The password fields are never sent out unless asked for (the admin
// panel shows plainPassword, as it does for salesmen).
const appUserSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  username: {
    type: String,
    trim: true,
    lowercase: true,
    required: [true, 'Username is required']
  },
  password: {
    type: String,
    select: false
  },
  plainPassword: {
    type: String,
    select: false
  }
});

appUserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

const customerSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  gstin: {
    type: String,
    trim: true,
    default: ''
  },
  // GST certificate stored on DigitalOcean Spaces — url is the public CDN link,
  // key is the object path kept so the file can be replaced or removed later
  gstCertificate: {
    url: { type: String, trim: true, default: '' },
    key: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' }
  },
  // Google Maps (or any) link to the shop
  locationLink: {
    type: String,
    trim: true,
    default: ''
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  paymentRating: {
    type: String,
    enum: ['good', 'average', 'bad'],
    default: 'good'
  },
  assignedSalesman: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salesman',
    default: null
  },
  // Item categories that may be sold to this customer. Unset means every
  // category — see utils/permissions.js.
  allowedCategories: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    default: undefined
  },
  // Cargos this customer may send their own orders by. Unset means every
  // cargo — see utils/permissions.js.
  allowedCargos: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cargo' }],
    default: undefined
  },
  // App logins, created by the admin. Optional — a customer with none simply
  // cannot sign in.
  appUsers: {
    type: [appUserSchema],
    default: []
  },
  // LEGACY — the single app login a customer had before appUsers. server.js
  // moves any still found here into appUsers on start; kept in the schema so
  // the password stays hidden until then.
  username: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    default: undefined
  },
  password: {
    type: String,
    select: false,
    default: undefined
  },
  plainPassword: {
    type: String,
    select: false,
    default: undefined
  },
  // LEGACY — the one shop salesman name from before appUsers. Copied to the
  // migrated login's name; still read as "Order by" for orders placed before
  // orders carried placedByName.
  shopSalesmanName: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Usernames are unique across every customer's logins. Partial so customers
// with no logins are not indexed at all.
customerSchema.index(
  { 'appUsers.username': 1 },
  { unique: true, partialFilterExpression: { 'appUsers.username': { $type: 'string' } } }
);

module.exports = mongoose.model('Customer', customerSchema);

