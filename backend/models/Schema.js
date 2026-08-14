const mongoose = require('mongoose');

// Points are earned per unit sold of any item inside the category
const pointsAllocationSchema = new mongoose.Schema({
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required']
  },
  categoryName: {
    type: String,
    trim: true,
    default: ''
  },
  points: {
    type: Number,
    required: [true, 'Points are required'],
    min: [0, 'Points cannot be negative']
  }
}, { _id: false });

const tierSchema = new mongoose.Schema({
  pointsRequired: {
    type: Number,
    required: [true, 'Points required is required'],
    min: [0, 'Points required cannot be negative']
  },
  reward: {
    type: String,
    required: [true, 'Tier / gift is required'],
    trim: true
  }
}, { _id: false });

const schemaDef = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Schema name is required'],
    trim: true
  },
  runBy: {
    type: String,
    trim: true,
    default: ''
  },
  fromDate: {
    type: Date,
    required: [true, 'From date is required']
  },
  toDate: {
    type: Date,
    required: [true, 'To date is required']
  },
  pointsAllocations: [pointsAllocationSchema],
  tiers: [tierSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('Schema', schemaDef);
