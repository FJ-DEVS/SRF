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
  const captured = { status: 200, body: null };
  const res = {
    status(code) { captured.status = code; return this; },
    json(payload) { captured.body = payload; return this; }
  };
  await handler({ user, body, params }, res);
  return captured;
};

const ADMIN = { id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin' };
const ROLLER = { id: new mongoose.Types.ObjectId(), role: 'roller', name: 'Test Roller', username: 'roller1' };

const advance = (id, status, user = ADMIN, extra = {}) =>
  call(orders.updateOrderStatus, { user, params: { id }, body: { status, ...extra } });
const revert = (id) => call(orders.revertOrderStatus, { user: ADMIN, params: { id } });
const sell = async (item, quantity, customer) => {
  const r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'sell order', items: [{ item: String(item._id), quantity }], customerName: String(customer._id) }
  });
  return r.body.data._id;
};

// Rak contents keyed by code, in code order, so assertions read like the seat map
const snapshot = async () => {
  const rows = await Placement.find().populate('rak', 'code');
  const out = {};
  for (const r of rows.sort((a, b) => a.rak.code.localeCompare(b.rak.code))) {
    out[r.rak.code] = r.quantity;
  }
  return out;
};

const stock = async (id) => (await Item.findById(id)).quantity;
const inRak = async (item, rak) => (await Placement.findOne({ item: item._id, rak: rak._id }))?.quantity ?? null;

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
  const orderA = await sell(item, 30, customer);
  check('raks untouched', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  check('stock deducted', await stock(item._id), 70);

  // ---- admin queues it: raks STILL must not move ------------------------
  console.log('\n3. Admin moves it to "to roll" — raks still untouched');
  let r = await advance(orderA, 'to roll');
  check('http', r.status, 200);
  check('raks untouched', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  check('not yet consumed', (await Order.findById(orderA)).placementsConsumed, false);

  // ---- roller marks rolled: oldest rak gives it up ---------------------
  console.log('\n4. Roller marks it "rolled" with no picks — oldest rak (TA03) empties first');
  r = await advance(orderA, 'rolled', ROLLER);
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });
  let doc = await Order.findById(orderA);
  check('placementsConsumed', doc.placementsConsumed, true);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [30]);
  check('breakdown rak', String(doc.rakConsumption[0].rak), String(A03._id));

  console.log('\n5. Same tap replayed — refused, raks unchanged');
  r = await advance(orderA, 'rolled', ROLLER);
  check('http', r.status, 403);
  check('raks unchanged', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- revert puts it back where it came from --------------------------
  console.log('\n6. Admin reverts to "to roll" — stock goes back on TA03');
  r = await revert(orderA);
  check('http', r.status, 200);
  check('status', r.body.data.status, 'to roll');
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 40 });
  doc = await Order.findById(orderA);
  check('placementsConsumed', doc.placementsConsumed, false);
  check('breakdown cleared', doc.rakConsumption.length, 0);
  check('stock still deducted', await stock(item._id), 70);

  console.log('\n7. Admin marks it rolled from the Orders screen — falls back to oldest-first, deducts once');
  r = await advance(orderA, 'rolled');
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA01: 30, TA02: 30, TA03: 10 });

  // ---- an order that spans raks ----------------------------------------
  console.log('\n8. Second order for 50 — drains TA03, then TA01, then bites into TA02');
  const orderB = await sell(item, 50, customer);
  check('stock', await stock(item._id), 20);
  await advance(orderB, 'to roll');
  r = await advance(orderB, 'rolled', ROLLER);
  check('http', r.status, 200);
  check('raks', await snapshot(), { TA02: 20 });
  doc = await Order.findById(orderB);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [10, 30, 10]);
  check('breakdown order', doc.rakConsumption.map((c) => String(c.rak)),
    [String(A03._id), String(A01._id), String(A02._id)]);

  // ---- cancellation happens before any rak is touched -------------------
  console.log('\n9. Order cancelled from "to roll" — stock returns, raks never moved');
  const orderC = await sell(item, 10, customer);
  await advance(orderC, 'to roll');
  check('stock', await stock(item._id), 10);
  await call(orders.requestCancellation, { user: ADMIN, params: { id: orderC } });
  r = await call(orders.approveCancellation, { user: ADMIN, params: { id: orderC } });
  check('http', r.status, 200);
  check('stock restored', await stock(item._id), 20);
  check('raks untouched', await snapshot(), { TA02: 20 });

  // ---- billing on does not touch raks a second time --------------------
  console.log('\n10. Order A billed → delivered — raks stay put');
  for (const s of ['billed', 'delivered']) {
    r = await advance(orderA, s);
    check(`http ${s}`, r.status, 200);
  }
  check('raks', await snapshot(), { TA02: 20 });

  // ---- stock that was never placed -------------------------------------
  console.log('\n11. Item with nothing on a rak — rolled deducts nothing, no error');
  const loose = await Item.create({ name: 'TEST UNPLACED', quantity: 25, price: 5 });
  const orderD = await sell(loose, 25, customer);
  await advance(orderD, 'to roll');
  r = await advance(orderD, 'rolled', ROLLER);
  check('http', r.status, 200);
  check('breakdown empty', (await Order.findById(orderD)).rakConsumption.length, 0);
  check('raks', await snapshot(), { TA02: 20 });

  // ---- restore when the rak has been refilled meanwhile -----------------
  console.log('\n12. Revert when the rak filled up behind it — puts back what fits');
  const tight = await Item.create({ name: 'TEST TIGHT', quantity: 60, price: 5 });
  const A04 = await Rak.create({ name: 'Test A04', code: 'TA04', capacity: 40 });
  await place(tight, A04, 40, 60);
  const orderT = await sell(tight, 40, customer);
  await advance(orderT, 'to roll');
  await advance(orderT, 'rolled', ROLLER);
  check('TA04 emptied', await inRak(tight, A04), null);
  const filler = await Item.create({ name: 'TEST FILLER', quantity: 35, price: 5 });
  await place(filler, A04, 35, 0);
  r = await revert(orderT);
  check('http', r.status, 200);
  check('only what fits went back', await inRak(tight, A04), 5);
  check('TA04 not overfilled', (await Placement.find({ rak: A04._id })).reduce((n, p) => n + p.quantity, 0), 40);

  // ---- the roller picks the raks by hand -------------------------------
  console.log('\n13. Roller opens the picker — endpoint suggests oldest first');
  const manual = await Item.create({ name: 'TEST MANUAL', quantity: 100, price: 5 });
  const MB1 = await Rak.create({ name: 'Test MB1', code: 'TMB1', capacity: 60 });
  const MB2 = await Rak.create({ name: 'Test MB2', code: 'TMB2', capacity: 60 });
  const MB3 = await Rak.create({ name: 'Test MB3', code: 'TMB3', capacity: 60 });
  await place(manual, MB1, 50, 300);   // oldest
  await place(manual, MB2, 30, 200);
  await place(manual, MB3, 20, 100);   // newest

  const orderE = await sell(manual, 40, customer);
  await advance(orderE, 'to roll');

  r = await call(orders.getRakAllocation, { user: ROLLER, params: { id: orderE } });
  check('http', r.status, 200);
  const alloc = r.body.data.items[0];
  check('raks offered oldest first', alloc.raks.map((x) => x.rak.code), ['TMB1', 'TMB2', 'TMB3']);
  check('available per rak', alloc.raks.map((x) => x.available), [50, 30, 20]);
  check('suggestion is FIFO', alloc.raks.map((x) => x.suggested), [40, 0, 0]);
  check('no shortfall', alloc.shortfall, 0);
  check('placedQty', alloc.placedQty, 100);

  console.log('\n14. Roller overrides — takes 20 from TMB3 and 20 from TMB2, skipping the oldest');
  r = await advance(orderE, 'rolled', ROLLER, {
    rakAllocation: [
      { item: String(manual._id), rak: String(MB3._id), quantity: 20 },
      { item: String(manual._id), rak: String(MB2._id), quantity: 20 }
    ]
  });
  check('http', r.status, 200);
  check('TMB1 untouched', await inRak(manual, MB1), 50);
  check('TMB2 drawn down', await inRak(manual, MB2), 10);
  check('TMB3 emptied', await inRak(manual, MB3), null);
  doc = await Order.findById(orderE);
  check('breakdown follows the picks', doc.rakConsumption.map((c) => String(c.rak)),
    [String(MB3._id), String(MB2._id)]);

  console.log('\n15. Reverted — the hand-picked raks get their stock back');
  r = await revert(orderE);
  check('http', r.status, 200);
  check('TMB2 restored', await inRak(manual, MB2), 30);
  check('TMB3 restored', await inRak(manual, MB3), 20);

  console.log('\n16. Bad picks are refused and change nothing');
  const before = await snapshot();
  const badPicks = [
    ['more than was ordered', [
      { item: String(manual._id), rak: String(MB1._id), quantity: 30 },
      { item: String(manual._id), rak: String(MB2._id), quantity: 30 }
    ]],
    ['the same rak twice', [
      { item: String(manual._id), rak: String(MB1._id), quantity: 10 },
      { item: String(manual._id), rak: String(MB1._id), quantity: 10 }
    ]],
    ['an item not on the order', [{ item: String(item._id), rak: String(MB1._id), quantity: 5 }]],
    ['a fractional quantity', [{ item: String(manual._id), rak: String(MB1._id), quantity: 2.5 }]],
    ['a negative quantity', [{ item: String(manual._id), rak: String(MB1._id), quantity: -5 }]],
    ['a garbage rak id', [{ item: String(manual._id), rak: 'not-an-id', quantity: 5 }]]
  ];
  for (const [label, rakAllocation] of badPicks) {
    r = await advance(orderE, 'rolled', ROLLER, { rakAllocation });
    check(label, r.status, 400);
  }
  check('order still in the queue', (await Order.findById(orderE)).status, 'to roll');
  check('raks untouched', await snapshot(), before);

  console.log('\n17. Picking more than a rak actually holds is refused');
  r = await advance(orderE, 'rolled', ROLLER, {
    rakAllocation: [{ item: String(manual._id), rak: String(MB3._id), quantity: 40 }]
  });
  check('http', r.status, 409);
  check('order still in the queue', (await Order.findById(orderE)).status, 'to roll');
  check('raks untouched', await snapshot(), before);

  console.log('\n18. Taking less than ordered is allowed — the rest was never on a shelf');
  r = await advance(orderE, 'rolled', ROLLER, {
    rakAllocation: [{ item: String(manual._id), rak: String(MB2._id), quantity: 10 }]
  });
  check('http', r.status, 200);
  check('TMB2 drawn down by exactly 10', await inRak(manual, MB2), 20);
  doc = await Order.findById(orderE);
  check('breakdown', doc.rakConsumption.map((c) => c.quantity), [10]);
  check('consumed flag set', doc.placementsConsumed, true);

  console.log('\n19. Revert after a partial manual pick returns exactly what was taken');
  r = await revert(orderE);
  check('http', r.status, 200);
  check('TMB2 back to 30', await inRak(manual, MB2), 30);

  console.log('\n20. No picks sent — server still falls back to oldest-first');
  r = await advance(orderE, 'rolled', ROLLER);
  check('http', r.status, 200);
  check('oldest TMB1 drained', await inRak(manual, MB1), 10);
  check('TMB2 untouched', await inRak(manual, MB2), 30);

  console.log('\n21. Picker endpoint refuses a purchase order');
  r = await call(orders.createOrder, {
    user: ADMIN,
    body: { type: 'purchase order', items: [{ item: String(manual._id), quantity: 5 }] }
  });
  r = await call(orders.getRakAllocation, { user: ROLLER, params: { id: r.body.data._id } });
  check('http', r.status, 400);

  console.log('\n22. Roller cannot queue an order, even with picks attached');
  const orderF = await sell(manual, 5, customer);
  r = await advance(orderF, 'to roll', ROLLER, {
    rakAllocation: [{ item: String(manual._id), rak: String(MB2._id), quantity: 5 }]
  });
  check('http', r.status, 403);
  check('still pending', (await Order.findById(orderF)).status, 'pending');
  check('TMB2 untouched', await inRak(manual, MB2), 30);

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
