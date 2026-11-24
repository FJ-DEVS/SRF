const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// The number a viewer signs in with, reduced to compare equal however it is
// typed: digits only, and the last ten of them, so "+91 98470 12345",
// "098470 12345" and "9847012345" are the same login.
const phoneKey = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-10);

// A viewer reads the stock list in the mobile app and does nothing else — no
// orders, no edits. They sign in with their mobile number and a password the
// admin sets. What they see is narrowed by permissions (see
// utils/permissions.js): the item categories, and whether the stock count
// and / or the rate of each item is shown.
const viewerSchema = new mongoose.Schema({
  // Optional — shown in the admin panel and the app's header
  name: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    required: [true, 'Mobile number is required'],
    trim: true
  },
  // The login key — see phoneKey above. Kept in step with phone on save.
  phoneKey: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  // Kept so the admin can hand the login back out, as for every other account
  plainPassword: {
    type: String,
    default: ''
  },
  // Item categories this viewer may see. Unset means every category.
  allowedCategories: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    default: undefined
  },
  // Whether the stock count (quantity) and the rate (price) of each item are
  // shown. Either, both, or — though not much use — neither.
  canViewQuantity: {
    type: Boolean,
    default: true
  },
  canViewPrice: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

viewerSchema.pre('validate', function () {
  if (this.isModified('phone') || !this.phoneKey) this.phoneKey = phoneKey(this.phone);
});

viewerSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

viewerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Viewer = mongoose.model('Viewer', viewerSchema);
Viewer.phoneKey = phoneKey;

module.exports = Viewer;
