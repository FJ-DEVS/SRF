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
  },
  // #rrggbb shown for this slab in the sales app. Empty falls back to the
  // default palette — see tiersWithColors.
  color: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: false });

// Slab colors handed out by rank (lowest slab first) to tiers with none set
const DEFAULT_TIER_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F97316',
  '#EF4444', '#EC4899', '#14B8A6', '#6366F1', '#84CC16'
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Plain tier objects, each with a usable color: its own, or the palette color
// for its rank among the tiers
const tiersWithColors = (tiers) => {
  const plain = (tiers || []).map((t) => (typeof t.toObject === 'function' ? t.toObject() : { ...t }));
  const byRank = [...plain].sort((a, b) => a.pointsRequired - b.pointsRequired);
  return plain.map((tier) => ({
    ...tier,
    color: HEX_COLOR.test(tier.color || '')
      ? tier.color
      : DEFAULT_TIER_COLORS[byRank.indexOf(tier) % DEFAULT_TIER_COLORS.length]
  }));
};

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
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.tiers = tiersWithColors(ret.tiers);
      return ret;
    }
  }
});

module.exports = mongoose.model('Schema', schemaDef);
module.exports.tiersWithColors = tiersWithColors;
module.exports.HEX_COLOR = HEX_COLOR;
