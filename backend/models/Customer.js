const mongoose = require('mongoose');

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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);

