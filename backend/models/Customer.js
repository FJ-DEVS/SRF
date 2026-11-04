const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  // App login, created by the admin. Optional — a customer without a username
  // simply cannot sign in. Sparse so the many customers with no login do not
  // collide on the unique index. The password fields are never sent out unless
  // asked for (the admin panel shows plainPassword, as it does for salesmen).
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
  // The salesman at the customer's own shop — typed in by the admin, not one
  // of our salesmen. Named as "Order by" on the order images the customer
  // shares from the app.
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

customerSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);

