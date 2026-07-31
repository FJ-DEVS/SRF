const mongoose = require('mongoose');

const cargoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Cargo name is required'],
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cargo', cargoSchema);

