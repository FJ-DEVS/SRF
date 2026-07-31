const mongoose = require('mongoose');
const Placement = require('../models/Placement');

// $match inside an aggregation does not cast strings to ObjectIds the way a
// find() query does, so ids coming off req.params have to be converted here or
// they silently match nothing.
const toObjectIds = (ids) =>
  ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

// Quantity already sitting in each rak, keyed by rak id.
// Pass rakIds to scope the aggregation, or omit it for every rak.
const usageByRak = async (rakIds) => {
  const match = rakIds ? [{ $match: { rak: { $in: toObjectIds(rakIds) } } }] : [];
  const rows = await Placement.aggregate([
    ...match,
    { $group: { _id: '$rak', used: { $sum: '$quantity' } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.used]));
};

// Quantity of each item already placed somewhere, keyed by item id
const placedByItem = async (itemIds) => {
  const match = itemIds ? [{ $match: { item: { $in: toObjectIds(itemIds) } } }] : [];
  const rows = await Placement.aggregate([
    ...match,
    { $group: { _id: '$item', placed: { $sum: '$quantity' } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.placed]));
};

// How much of an item is still waiting to be put on a rak.
// Stock can fall below what is placed once orders ship, so this never goes
// negative.
const remainingForItem = async (item) => {
  const placed = (await placedByItem([item._id])).get(String(item._id)) || 0;
  return Math.max((item.quantity || 0) - placed, 0);
};

const freeSpace = (rak, used = 0) => Math.max((rak.capacity || 0) - used, 0);

// Relieves rak placements when a sell order takes stock out of inventory, so
// a rak never shows more sitting in it than physically remains. Oldest
// placement first (first placed, first sold) — mirrors how new stock fills
// raks in placement order. Runs inside the same transaction as the stock
// deduction so the two numbers can never drift apart, even under a crash.
const consumePlacedStock = async (itemId, quantity, session) => {
  let remaining = quantity;
  if (remaining <= 0) return;

  const placements = await Placement.find({ item: itemId }).sort({ createdAt: 1 }).session(session);

  for (const placement of placements) {
    if (remaining <= 0) break;

    const take = Math.min(placement.quantity, remaining);
    if (take <= 0) continue;

    if (take >= placement.quantity) {
      await Placement.deleteOne({ _id: placement._id }).session(session);
    } else {
      placement.quantity -= take;
      await placement.save({ session });
    }
    remaining -= take;
  }
  // Any `remaining` left over here means the order sold stock that was never
  // placed on a rak in the first place — nothing to relieve, which is correct.
};

module.exports = { usageByRak, placedByItem, remainingForItem, freeSpace, consumePlacedStock };
