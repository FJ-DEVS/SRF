const mongoose = require('mongoose');
const Placement = require('../models/Placement');
const Rak = require('../models/Rak');

// $match inside an aggregation does not cast strings to ObjectIds the way a
// find() query does, so ids coming off req.params have to be converted here or
// they silently match nothing.
const toObjectIds = (ids) =>
  ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

// Quantity already sitting in each rak, keyed by rak id.
// Pass rakIds to scope the aggregation, or omit it for every rak.
const usageByRak = async (rakIds, session) => {
  const match = rakIds ? [{ $match: { rak: { $in: toObjectIds(rakIds) } } }] : [];
  const pipeline = Placement.aggregate([
    ...match,
    { $group: { _id: '$rak', used: { $sum: '$quantity' } } }
  ]);
  if (session) pipeline.session(session);
  const rows = await pipeline;
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
// Stock can fall below what is placed — an order deducts stock the moment it
// is taken, but the goods only leave the rak at "to roll" — so this never goes
// negative.
const remainingForItem = async (item) => {
  const placed = (await placedByItem([item._id])).get(String(item._id)) || 0;
  return Math.max((item.quantity || 0) - placed, 0);
};

const freeSpace = (rak, used = 0) => Math.max((rak.capacity || 0) - used, 0);

// Takes stock of one item back off the raks — called when a sell order reaches
// "to roll", the point at which the material is physically pulled off the
// shelf. Strict FIFO: the rak the stock has been sitting in longest empties
// first, and _id breaks ties so two rows written in the same millisecond still
// come out in the order they were inserted.
//
// Returns the breakdown of what came out of which rak, so the caller can store
// it on the order and put it back exactly where it came from if the step is
// undone. Runs inside the caller's transaction so the rak figures can never
// drift away from the order status that triggered them.
const consumePlacedStock = async (itemId, quantity, session) => {
  const taken = [];
  let remaining = quantity;
  if (remaining <= 0) return taken;

  const placements = await Placement.find({ item: itemId })
    .sort({ createdAt: 1, _id: 1 })
    .session(session);

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
    taken.push({ item: placement.item, rak: placement.rak, quantity: take });
    remaining -= take;
  }
  // Any `remaining` left over here means the order sold stock that was never
  // placed on a rak in the first place — nothing to relieve, which is correct.
  return taken;
};

// Takes named quantities out of named raks — the manual counterpart to
// consumePlacedStock, used when the admin picks the raks by hand on the way to
// "to roll" instead of letting FIFO decide.
//
// Refuses outright if a rak does not hold what is being asked of it: the admin
// may have been looking at the screen for a while and someone else could have
// moved that stock in the meantime, and a silent partial deduction would leave
// the order's breakdown lying about where its goods came from.
const consumeFromRaks = async (entries = [], session) => {
  const taken = [];

  for (const entry of entries) {
    if (entry.quantity <= 0) continue;

    const placement = await Placement.findOne({ item: entry.item, rak: entry.rak }).session(session);
    if (!placement || placement.quantity < entry.quantity) {
      const rak = await Rak.findById(entry.rak).select('code').session(session);
      const held = placement ? placement.quantity : 0;
      const error = new Error(
        `Rak ${rak ? rak.code : 'that rak'} only holds ${held} of that item, not ${entry.quantity}. Refresh and pick again.`
      );
      error.status = 409;
      throw error;
    }

    if (placement.quantity === entry.quantity) {
      await Placement.deleteOne({ _id: placement._id }).session(session);
    } else {
      placement.quantity -= entry.quantity;
      await placement.save({ session });
    }
    taken.push({ item: placement.item, rak: placement.rak, quantity: entry.quantity });
  }

  return taken;
};

// The inverse of consumePlacedStock: puts an order's breakdown back into the
// very raks it was taken from. Used when a "to roll" order is reverted to
// pending or its cancellation is approved.
//
// A rak may have been refilled or shrunk in the meantime, so each row is capped
// at whatever space is actually free now; anything that does not fit simply
// shows up again in the roller's "items to place" list.
const restorePlacedStock = async (entries = [], session) => {
  if (!entries.length) return;

  const rakIds = [...new Set(entries.map((e) => String(e.rak)))];
  const raks = await Rak.find({ _id: { $in: toObjectIds(rakIds) } }).session(session);
  const rakById = new Map(raks.map((r) => [String(r._id), r]));
  const used = await usageByRak(rakIds, session);

  for (const entry of entries) {
    const rak = rakById.get(String(entry.rak));
    if (!rak) continue; // that rak has since been deleted

    const key = String(rak._id);
    const give = Math.min(freeSpace(rak, used.get(key) || 0), entry.quantity || 0);
    if (give <= 0) continue;

    const existing = await Placement.findOne({ item: entry.item, rak: rak._id }).session(session);
    if (existing) {
      existing.quantity += give;
      await existing.save({ session });
    } else {
      await Placement.create([{ item: entry.item, rak: rak._id, quantity: give }], { session });
    }
    used.set(key, (used.get(key) || 0) + give);
  }
};

module.exports = {
  usageByRak,
  placedByItem,
  remainingForItem,
  freeSpace,
  consumePlacedStock,
  consumeFromRaks,
  restorePlacedStock
};
