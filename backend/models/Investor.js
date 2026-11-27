const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Investors sign into the admin web app's investor dashboard and only read
// reports — sales by category, salesman and customer, the consolidation
// report, the leaderboard and outstandings. They change nothing. Same account
// shape as a CRM manager, made and managed by the admin.
const investorSchema = new mongoose.Schema({
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
  // mirroring how every other staff account is managed
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
investorSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
investorSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Investor', investorSchema);
