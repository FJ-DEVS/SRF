// End-to-end check of the rak deduction flow, run against a throwaway database.
//
//   node test-rak-flow.js
//
// Connects to the cluster in .env but swaps the database name for a scratch
// one, seeds its own raks/items/orders, drives the real controllers, and drops
// the database on the way out. Never opens the live data.
require('dotenv').config();
const mongoose = require('mongoose');

const SCRATCH_DB = 'srf-rak-test';
const uri = process.env.MONGODB_URI.replace(/\/[^/?]+(\?|$)/, `/${SCRATCH_DB}$1`);

// getIO is destructured at require time, so the stub has to land first
const socket = require('./socket');
socket.getIO = () => ({ emit: () => {} });

const Item = require('./models/Item');
const Rak = require('./models/Rak');
const Placement = require('./models/Placement');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const orders = require('./controllers/orderController');

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? ` = ${a}` : `\n          expected ${e}\n          actual   ${a}`}`);
};

// Minimal express doubles — capture status + body from the controller
const call = async (handler, { user, body = {}, params = {} }) => {
  let captured = { status: 200, body: null };
  const res = {
    status(code) { captured.status = code; return this; },
    json(payload) { captured.body = payload; return this; }
  };
  await handler({ user, body, params }, res);
  return captured;
};

const ADMIN = { id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin' };

// Rak contents keyed by code, so assertions read like the seat map does
const snapshot = async () => {
  const rows = await Placement.find().populate('rak', 'code');
  const out = {};
  for (const r of rows.sort((a, b) => a.rak.code.localeCompare(b.rak.code))) {
    out[r.rak.code] = r.quantity;
  }
  return out;
};

const stock = async (id) => (await Item.findById(id)).quantity;

// Placements are ordered by createdAt, so seeding needs distinct timestamps
const place = async (item, rak, quantity, minutesAgo) =>
  Placement.collection.insertOne({
    item: item._id,
    rak: rak._id,
    quantity,
    placedBy: null,
    placedByName: 'Admin',
    createdAt: new Date(Date.now() - minutesAgo * 60000),
    updatedAt: new Date(Date.now() - minutesAgo * 60000)
  });

(async () => {
  await mongoose.connect(uri);
  if (mongoose.connection.name !== SCRATCH_DB) {
    throw new Error(`Refusing to run against "${mongoose.connection.name}"`);
  }
  await mongoose.connection.dropDatabase();
  console.log(`Scratch database: ${mongoose.connection.name}\n`);

  // ---- seed -------------------------------------------------------------
  const item = await Item.create({ name: 'TEST FILM - 0.8mm', quantity: 100, price: 10 });
  const A01 = await Rak.create({ name: 'Test A01', code: 'TA01', capacity: 50 });
  const A02 = await Rak.create({ name: 'Test A02', code: 'TA02', capacity: 50 });
  const A03 = await Rak.create({ name: 'Test A03', code: 'TA03', capacity: 50 });
  const customer = await Customer.create({ name: 'Test Customer', phone: '9999999999' });

  // Oldest first: TA03 was filled 3h ago, TA01 2h ago, TA02 just now.
  // Deliberately the reverse of both code order and insertion order, so
  // "oldest rak" can't be confused with "first rak" or "lowest code".
  await place(item, A03, 40, 180);
  await place(item, A01, 30, 120);
  await place(item, A02, 30, 1);

  console.log('1. Seed — 100 in stock, all on raks');
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  check('stock', await stock(item._id), 100);

  // ---- order placed: raks must NOT move --------------------------------
  console.log('\n2. Sell order for 30 created (pending)');
  let r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(item._id), quantity: 30 }], customerName: String(customer._id) }
  });
  check('http', r.status, 201);
  const orderA = r.body.data._id;
  check('raks untouched', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  check('stock deducted', await stock(item._id), 70);

  // ---- to roll: oldest rak gives it up ---------------------------------
  console.log('\n3. Advanced to "to roll" — oldest rak (TA03) empties first');
  r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderA } });
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });
  let doc = await Order.findById(orderA);
  check('placementsConsumed', doc.placementsConsumed, true);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [30]);
  check('breakdown rak', String(doc.rakConsumption[0].rak), String(A03._id));

  // ---- second advance must be refused, not deducted again --------------
  console.log('\n4. Same advance replayed (double-tap / two admins)');
  r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderA } });
  check('http', r.status, 400);
  check('raks unchanged', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- revert puts it back where it came from --------------------------
  console.log('\n5. Reverted to "pending" — stock goes back on TA03');
  r = await call(orders.revertOrderStatus, { user: ADMIN, params: { id: orderA } });
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  doc = await Order.findById(orderA);
  check('placementsConsumed', doc.placementsConsumed, false);
  check('breakdown cleared', doc.rakConsumption.length, 0);
  check('stock still deducted', await stock(item._id), 70);

  // ---- advancing again deducts once more, correctly --------------------
  console.log('\n6. Advanced to "to roll" again — deducts once, not twice');
  r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderA } });
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- an order that spans raks ----------------------------------------
  console.log('\n7. Second order for 50 — drains TA03, then TA01, then bites into TA02');
  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(item._id), quantity: 50 }], customerName: String(customer._id) }
  });
  const orderB = r.body.data._id;
  check('stock', await stock(item._id), 20);
  r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderB } });
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA02: 20 });
  doc = await Order.findById(orderB);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [10, 30, 10]);
  check('breakdown order', doc.rakConsumption.map((c) => String(c.rak)),
    [String(A03._id), String(A01._id), String(A02._id)]);

  // ---- cancellation hands the raks back --------------------------------
  console.log('\n8. Order B cancelled — all 50 go back to the raks they came off');
  await call(orders.requestCancellation, { user: ADMIN, params: { id: orderB } });
  r = await call(orders.approveCancellation, { user: ADMIN, params: { id: orderB } });
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });
  check('stock restored', await stock(item._id), 70);

  // ---- rolling on does not touch raks a second time --------------------
  console.log('\n9. Order A rolled → billed → delivered — raks stay put');
  for (const s of ['rolled', 'billed', 'delivered']) {
    r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: s }, params: { id: orderA } });
    check(`http ${s}`, r.status, 200);
  }
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- stock that was never placed -------------------------------------
  console.log('\n10. Item with nothing on a rak — to roll deducts nothing, no error');
  const loose = await Item.create({ name: 'TEST UNPLACED', quantity: 25, price: 5 });
  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(loose._id), quantity: 25 }], customerName: String(customer._id) }
  });
  const orderC = r.body.data._id;
  r = await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderC } });
  check('http', r.status, 200);
  check('breakdown empty', (await Order.findById(orderC)).rakConsumption.length, 0);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- restore when the rak has been refilled meanwhile -----------------
  console.log('\n11. Revert when the rak filled up behind it — puts back what fits');
  const tight = await Item.create({ name: 'TEST TIGHT', quantity: 60, price: 5 });
  const A04 = await Rak.create({ name: 'Test A04', code: 'TA04', capacity: 40 });
  await place(tight, A04, 40, 60);
  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(tight._id), quantity: 40 }], customerName: String(customer._id) }
  });
  const orderD = r.body.data._id;
  await call(orders.updateOrderStatus, { user: ADMIN, body: { status: 'to roll' }, params: { id: orderD } });
  check('TA04 emptied', (await Placement.findOne({ item: tight._id, rak: A04._id })), null);
  // somebody else fills TA04 right back up
  const filler = await Item.create({ name: 'TEST FILLER', quantity: 35, price: 5 });
  await place(filler, A04, 35, 0);
  r = await call(orders.revertOrderStatus, { user: ADMIN, params: { id: orderD } });
  check('http', r.status, 200);
  const back = await Placement.findOne({ item: tight._id, rak: A04._id });
  check('only what fits went back', back.quantity, 5);
  check('TA04 not overfilled', (await Placement.find({ rak: A04._id })).reduce((n, p) => n + p.quantity, 0), 40);

  // ---- the admin picks the raks by hand -------------------------------
  console.log('\n12. Manual pick — the rak-allocation endpoint suggests oldest first');
  const manual = await Item.create({ name: 'TEST MANUAL', quantity: 100, price: 5 });
  const MB1 = await Rak.create({ name: 'Test MB1', code: 'TMB1', capacity: 60 });
  const MB2 = await Rak.create({ name: 'Test MB2', code: 'TMB2', capacity: 60 });
  const MB3 = await Rak.create({ name: 'Test MB3', code: 'TMB3', capacity: 60 });
  await place(manual, MB1, 50, 300);   // oldest
  await place(manual, MB2, 30, 200);
  await place(manual, MB3, 20, 100);   // newest

  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(manual._id), quantity: 40 }], customerName: String(customer._id) }
  });
  const orderE = r.body.data._id;

  r = await call(orders.getRakAllocation, { user: ADMIN, params: { id: orderE } });
  check('http', r.status, 200);
  let alloc = r.body.data.items[0];
  check('raks offered oldest first', alloc.raks.map((x) => x.rak.code), ['TMB1', 'TMB2', 'TMB3']);
  check('available per rak', alloc.raks.map((x) => x.available), [50, 30, 20]);
  check('suggestion is FIFO', alloc.raks.map((x) => x.suggested), [40, 0, 0]);
  check('no shortfall', alloc.shortfall, 0);
  check('placedQty', alloc.placedQty, 100);

  console.log('\n13. Admin overrides — takes 20 from TMB3 and 20 from TMB2, skipping the oldest');
  r = await call(orders.updateOrderStatus, {
    user: ADMIN,
    params: { id: orderE },
    body: {
      status: 'to roll',
      rakAllocation: [
        { item: String(manual._id), rak: String(MB3._id), quantity: 20 },
        { item: String(manual._id), rak: String(MB2._id), quantity: 20 }
      ]
    }
  });
  check('http', r.status, 200);
  check('TMB1 untouched', (await Placement.findOne({ item: manual._id, rak: MB1._id })).quantity, 50);
  check('TMB2 drawn down', (await Placement.findOne({ item: manual._id, rak: MB2._id })).quantity, 10);
  check('TMB3 emptied', await Placement.findOne({ item: manual._id, rak: MB3._id }), null);
  doc = await Order.findById(orderE);
  check('breakdown follows the picks', doc.rakConsumption.map((c) => String(c.rak)),
    [String(MB3._id), String(MB2._id)]);

  console.log('\n14. Reverted — the hand-picked raks get their stock back');
  r = await call(orders.revertOrderStatus, { user: ADMIN, params: { id: orderE } });
  check('http', r.status, 200);
  check('TMB2 restored', (await Placement.findOne({ item: manual._id, rak: MB2._id })).quantity, 30);
  check('TMB3 restored', (await Placement.findOne({ item: manual._id, rak: MB3._id })).quantity, 20);

  console.log('\n15. Bad picks are refused and change nothing');
  const before = await snapshot();
  const badPicks = [
    ['more than was ordered', [
      { item: String(manual._id), rak: String(MB1._id), quantity: 30 },
      { item: String(manual._id), rak: String(MB2._id), quantity: 30 }
    ], 400],
    ['the same rak twice', [
      { item: String(manual._id), rak: String(MB1._id), quantity: 10 },
      { item: String(manual._id), rak: String(MB1._id), quantity: 10 }
    ], 400],
    ['an item not on the order', [
      { item: String(item._id), rak: String(MB1._id), quantity: 5 }
    ], 400],
    ['a fractional quantity', [
      { item: String(manual._id), rak: String(MB1._id), quantity: 2.5 }
    ], 400],
    ['a negative quantity', [
      { item: String(manual._id), rak: String(MB1._id), quantity: -5 }
    ], 400],
    ['a garbage rak id', [
      { item: String(manual._id), rak: 'not-an-id', quantity: 5 }
    ], 400]
  ];
  for (const [label, rakAllocation, expected] of badPicks) {
    r = await call(orders.updateOrderStatus, {
      user: ADMIN, params: { id: orderE }, body: { status: 'to roll', rakAllocation }
    });
    check(label, r.status, expected);
  }
  check('order still pending', (await Order.findById(orderE)).status, 'pending');
  check('raks untouched', await snapshot(), before);

  console.log('\n16. Picking more than a rak actually holds is refused');
  r = await call(orders.updateOrderStatus, {
    user: ADMIN,
    params: { id: orderE },
    body: {
      status: 'to roll',
      rakAllocation: [{ item: String(manual._id), rak: String(MB3._id), quantity: 40 }]
    }
  });
  check('http', r.status, 409);
  check('order still pending', (await Order.findById(orderE)).status, 'pending');
  check('raks untouched', await snapshot(), before);

  console.log('\n17. Taking less than ordered is allowed — the rest was never on a shelf');
  r = await call(orders.updateOrderStatus, {
    user: ADMIN,
    params: { id: orderE },
    body: {
      status: 'to roll',
      rakAllocation: [{ item: String(manual._id), rak: String(MB2._id), quantity: 10 }]
    }
  });
  check('http', r.status, 200);
  check('TMB2 drawn down by exactly 10', (await Placement.findOne({ item: manual._id, rak: MB2._id })).quantity, 20);
  doc = await Order.findById(orderE);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [10]);
  check('consumed flag set', doc.placementsConsumed, true);

  console.log('\n18. Revert after a partial manual pick returns exactly what was taken');
  r = await call(orders.revertOrderStatus, { user: ADMIN, params: { id: orderE } });
  check('revert http', r.status, 200);
  check('TMB2 back to 30', (await Placement.findOne({ item: manual._id, rak: MB2._id })).quantity, 30);

  console.log('\n19. No allocation sent — server still falls back to oldest-first');
  r = await call(orders.updateOrderStatus, { user: ADMIN, params: { id: orderE }, body: { status: 'to roll' } });
  check('http', r.status, 200);
  check('oldest TMB1 drained', (await Placement.findOne({ item: manual._id, rak: MB1._id })).quantity, 10);
  check('TMB2 untouched', (await Placement.findOne({ item: manual._id, rak: MB2._id })).quantity, 30);

  console.log('\n20. Allocation endpoint rejects a purchase order');
  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'purchase order', items: [{ item: String(manual._id), quantity: 5 }] }
  });
  r = await call(orders.getRakAllocation, { user: ADMIN, params: { id: r.body.data._id } });
  check('http', r.status, 400);

  console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All checks passed'}`);
  await mongoose.connection.dropDatabase();
  console.log(`Dropped ${SCRATCH_DB}.`);
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
})().catch(async (error) => {
  console.error('\nFailed:', error);
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
