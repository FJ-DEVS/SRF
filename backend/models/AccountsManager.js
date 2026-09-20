const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Desk-side staff who watch every order, queue fresh ones for rolling, bill
// the rolled ones and sign off cancellation requests. Same account shape as
// a roller so the admin manages both from identical screens.
const accountsManagerSchema = new mongoose.Schema({
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
  // mirroring how salesman and roller accounts are managed
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
accountsManagerSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
accountsManagerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('AccountsManager', accountsManagerSchema);
