const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Customer relation managers look after the customer list (block / unblock,
// call) and confirm delivery of billed orders. Same account shape as a roller
// and an accounts manager so the admin manages all three from identical screens.
const crmManagerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  // Kept alongside the hash so the admin can hand the credentials back out,
  // mirroring how salesman, roller and accounts accounts are managed
  plainPassword: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
crmManagerSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
crmManagerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('CrmManager', crmManagerSchema);
