// Return-order controller regression tests. No database or live credentials.
// Run: node --test test-return-orders.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module, exports: module.exports, console, process, Number, String, Boolean, Map, Set, Math, Date, Array, Promise, Object, JSON, Error, isNaN, parseInt,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  }, { filename: file });
  return module.exports;
}

// A thenable that swallows the chained query helpers mongoose exposes
function query(value) {
  const q = {
    populate() { return q; }, select() { return q; }, session() { return q; },
    sort() { return q; }, skip() { return q; }, limit() { return q; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
  return q;
}

function setup({ original, earlierReturns = [], damagedStock = {} } = {}) {
  const saved = [];
  const stockIncrements = [];
  const damagedIncrements = [];
  const emitted = [];
  const damaged = new Map(Object.entries(damagedStock));

  function Order(doc) {
    Object.assign(this, doc);
    this._id = 'ret1';
    this.save = async () => { saved.push({ ...doc }); return this; };
    this.populate = async () => this;
  }
  Order.findById = (id) => query(id === 'orig' ? original : null);
  Order.find = (filter) => query(filter.type === 'return order'
    ? earlierReturns.filter((r) => !filter.status?.$ne || r.status !== filter.status.$ne)
    : []);

  const session = {
    startTransaction() {}, async abortTransaction() {}, async commitTransaction() {}, endSession() {}
  };
  const mongoose = {
    startSession: async () => session,
    Types: { ObjectId: { isValid: (v) => typeof v === 'string' && v.length > 0 } }
  };

  const controller = load('controllers/orderController.js', {
    mongoose,
    '../models/Order': Order,
    '../models/Customer': {}, '../models/Vendor': {}, '../models/Salesman': {},
    '../models/Item': {
      findById: async (id) => ({ _id: id }),
      find: () => query([{ _id: 'itemA', name: 'SF 0.8mm' }, { _id: 'itemB', name: 'GMR 0.8mm' }]),
      findByIdAndUpdate: async (id, update) => { stockIncrements.push([id, update.$inc.quantity]); }
    },
    // Damaged pieces per item; a guarded decrement fails when too few are left
    '../models/DamagedItem': {
      findOneAndUpdate: async (filter, update) => {
        const have = damaged.get(filter.item) || 0;
        if (filter.quantity && have < filter.quantity.$gte) return null;
        damaged.set(filter.item, have + update.$inc.quantity);
        damagedIncrements.push([filter.item, update.$inc.quantity]);
        return { item: filter.item, quantity: have + update.$inc.quantity };
      }
    },
    '../models/Cargo': {}, '../models/Category': {},
    axios: { post: async () => {} },
    '../socket': { getIO: () => ({ emit: (name) => emitted.push(name) }) },
    '../models/Placement': {},
    '../utils/placementMath': {},
    '../utils/checkLevel': {}
  });

  async function call(handler, { body = {}, params = {}, role = 'admin' } = {}) {
    const req = { body, params, user: { role, id: 'admin', name: 'Admin' } };
    const res = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = JSON.parse(JSON.stringify(payload)); return this; }
    };
    await handler(req, res);
    return res;
  }
  return { controller, call, saved, stockIncrements, damagedIncrements, emitted };
}

const delivered = {
  _id: 'orig', type: 'sell order', status: 'delivered',
  customerName: { _id: 'cust1', name: 'Glass Point' },
  items: [
    { item: { _id: 'itemA', name: 'SF 0.8mm', price: 950 }, quantity: 5 },
    { item: { _id: 'itemB', name: 'GMR 0.8mm', price: 1000 }, quantity: 2 }
  ]
};

test('returnable view splits completed and pending returns and ignores cancelled ones', async () => {
  const { controller, call } = setup({
    original: delivered,
    earlierReturns: [
      { status: 'completed', items: [{ item: 'itemA', quantity: 2 }] },
      { status: 'pending', items: [{ item: 'itemA', quantity: 1 }] },
      { status: 'cancelled', items: [{ item: 'itemB', quantity: 2 }] }
    ]
  });
  const res = await call(controller.getReturnable, { params: { id: 'orig' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.data.items.map((l) => [l.item._id, l.ordered, l.returned, l.pending, l.remaining]),
    [['itemA', 5, 2, 1, 2], ['itemB', 2, 0, 0, 2]]
  );
});

test('returnable view refuses orders that have not left the shelf, and non-sell orders', async () => {
  for (const [status, type] of [['pending', 'sell order'], ['to roll', 'sell order'], ['cancelled', 'sell order'], ['completed', 'purchase order']]) {
    const { controller, call } = setup({ original: { ...delivered, status, type } });
    const res = await call(controller.getReturnable, { params: { id: 'orig' } });
    assert.equal(res.statusCode, 400, `${type} / ${status}`);
  }
  const { controller, call } = setup({ original: null });
  assert.equal((await call(controller.getReturnable, { params: { id: 'orig' } })).statusCode, 404);
});

test('a return is recorded pending, copies the customer, and touches no stock yet', async () => {
  for (const restock of [false, true]) {
    const { controller, call, saved, stockIncrements, emitted } = setup({ original: delivered });
    const res = await call(controller.createOrder, {
      body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemA', quantity: 3 }], notes: 'damaged', restock }
    });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'pending');
    assert.equal(saved[0].returnOf, 'orig');
    assert.equal(saved[0].customerName, 'cust1');
    assert.equal(saved[0].customerModel, 'Customer');
    assert.equal(saved[0].restocked, restock);
    // No per-line split sent: the restock flag decides for every piece
    assert.deepEqual(
      JSON.parse(JSON.stringify(saved[0].items)).map((l) => [l.item, l.quantity, l.restockQuantity, l.damagedQuantity]),
      [['itemA', 3, restock ? 3 : 0, restock ? 0 : 3]]
    );
    assert.deepEqual(stockIncrements, []);
    assert.ok(emitted.includes('orders_updated'));
  }
});

test('a return records the restock / damaged split of each line, which must add up', async () => {
  const { controller, call, saved, stockIncrements, damagedIncrements } = setup({ original: delivered });
  const res = await call(controller.createOrder, {
    body: {
      type: 'return order', returnOf: 'orig',
      items: [
        { item: 'itemA', quantity: 4, restockQuantity: 3, damagedQuantity: 1 },
        { item: 'itemB', quantity: 2, restockQuantity: 0, damagedQuantity: 2 }
      ]
    }
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.deepEqual(
    JSON.parse(JSON.stringify(saved[0].items)).map((l) => [l.item, l.quantity, l.restockQuantity, l.damagedQuantity]),
    [['itemA', 4, 3, 1], ['itemB', 2, 0, 2]]
  );
  assert.equal(saved[0].restocked, true);
  assert.deepEqual(stockIncrements, []);
  assert.deepEqual(damagedIncrements, []);

  for (const [restockQuantity, damagedQuantity, message] of [
    [3, 0, /3 restocked \+ 0 damaged = 3, but 4 came back/],
    [3, 2, /= 5, but 4 came back/],
    [-1, 5, /whole numbers/],
    [1.5, 2.5, /whole numbers/],
    [undefined, 4, /whole numbers/]
  ]) {
    const bad = setup({ original: delivered });
    const rejected = await bad.call(bad.controller.createOrder, {
      body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemA', quantity: 4, restockQuantity, damagedQuantity }] }
    });
    assert.equal(rejected.statusCode, 400, `${restockQuantity} / ${damagedQuantity}`);
    assert.match(rejected.body.message, message);
    assert.equal(bad.saved.length, 0);
  }
});

// A stored return order as updateOrderStatus / revertOrderStatus see it
const storedReturn = (overrides = {}) => {
  const doc = {
    _id: 'orig', type: 'return order', status: 'pending', restocked: false,
    createdByType: 'admin', customerName: { _id: 'cust1', name: 'Glass Point' },
    items: [{ item: 'itemA', quantity: 3 }],
    ...overrides
  };
  doc.save = async () => doc;
  doc.populate = async () => doc;
  return doc;
};

test('completing a return puts the confirmed split into stock and onto the damaged list', async () => {
  const doc = storedReturn({
    items: [
      { item: 'itemA', quantity: 3, restockQuantity: 3, damagedQuantity: 0 },
      { item: 'itemB', quantity: 2, restockQuantity: 2, damagedQuantity: 0 }
    ]
  });
  const { controller, call, stockIncrements, damagedIncrements, emitted } = setup({ original: doc });
  // The admin reconfirms a different split than the one proposed at recording
  const res = await call(controller.updateOrderStatus, {
    params: { id: 'orig' },
    body: {
      status: 'completed',
      split: [
        { item: 'itemA', restockQuantity: 1, damagedQuantity: 2 },
        { item: 'itemB', restockQuantity: 0, damagedQuantity: 2 }
      ]
    }
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.status, 'completed');
  assert.deepEqual(stockIncrements, [['itemA', 1]]);
  assert.deepEqual(damagedIncrements, [['itemA', 2], ['itemB', 2]]);
  assert.deepEqual(doc.items.map((l) => [l.restockQuantity, l.damagedQuantity]), [[1, 2], [0, 2]]);
  assert.equal(doc.restocked, true);
  assert.ok(emitted.includes('items_updated'));
});

test('a return only completes when every line\'s restocked + damaged equals what came back', async () => {
  const items = [{ item: 'itemA', quantity: 3 }, { item: 'itemB', quantity: 2 }];
  const cases = [
    [undefined, /Confirm how many pieces/],
    [[{ item: 'itemA', restockQuantity: 3, damagedQuantity: 0 }], /Confirm how many pieces/],
    [[{ item: 'itemA', restockQuantity: 3, damagedQuantity: 0 }, { item: 'itemA', restockQuantity: 3, damagedQuantity: 0 }], /Confirm how many pieces/],
    [[{ item: 'itemA', restockQuantity: 3, damagedQuantity: 0 }, { item: 'itemZ', restockQuantity: 2, damagedQuantity: 0 }], /not on this return/],
    [[{ item: 'itemA', restockQuantity: 2, damagedQuantity: 0 }, { item: 'itemB', restockQuantity: 2, damagedQuantity: 0 }], /"SF 0.8mm": 2 restocked \+ 0 damaged = 2, but 3 came back/],
    [[{ item: 'itemA', restockQuantity: 3, damagedQuantity: 0 }, { item: 'itemB', restockQuantity: 1, damagedQuantity: 2 }], /"GMR 0.8mm".*= 3, but 2 came back/],
    [[{ item: 'itemA', restockQuantity: '3', damagedQuantity: 0 }, { item: 'itemB', restockQuantity: 2, damagedQuantity: 0 }], /whole numbers/]
  ];
  for (const [split, message] of cases) {
    const doc = storedReturn({ items: items.map((l) => ({ ...l })) });
    const { controller, call, stockIncrements, damagedIncrements } = setup({ original: doc });
    const res = await call(controller.updateOrderStatus, { params: { id: 'orig' }, body: { status: 'completed', split } });
    assert.equal(res.statusCode, 400, JSON.stringify(split));
    assert.match(res.body.message, message);
    assert.equal(doc.status, 'pending');
    assert.deepEqual(stockIncrements, []);
    assert.deepEqual(damagedIncrements, []);
  }
});

test('cancelling a pending return changes no stock; a settled return cannot move again', async () => {
  const doc = storedReturn({ restocked: true });
  const { controller, call, stockIncrements } = setup({ original: doc });
  const res = await call(controller.updateOrderStatus, { params: { id: 'orig' }, body: { status: 'cancelled' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.status, 'cancelled');
  assert.deepEqual(stockIncrements, []);

  for (const [from, to] of [['cancelled', 'completed'], ['completed', 'cancelled'], ['pending', 'to roll']]) {
    const settled = setup({ original: storedReturn({ status: from }) });
    const moved = await settled.call(settled.controller.updateOrderStatus, { params: { id: 'orig' }, body: { status: to } });
    assert.equal(moved.statusCode, 400, `${from} -> ${to}`);
  }
});

test('only the admin settles a return', async () => {
  for (const role of ['accounts', 'salesman', 'roller', 'crm']) {
    const { controller, call } = setup({ original: storedReturn() });
    const res = await call(controller.updateOrderStatus, { role, params: { id: 'orig' }, body: { status: 'completed' } });
    assert.equal(res.statusCode, 403, role);
  }
});

test('reverting a completed return takes its restocked and damaged pieces back out', async () => {
  const doc = storedReturn({
    status: 'completed', restocked: true,
    items: [{ item: 'itemA', quantity: 3, restockQuantity: 1, damagedQuantity: 2 }]
  });
  const { controller, call, stockIncrements, damagedIncrements, emitted } = setup({ original: doc, damagedStock: { itemA: 2 } });
  const res = await call(controller.revertOrderStatus, { params: { id: 'orig' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.status, 'pending');
  assert.deepEqual(stockIncrements, [['itemA', -1]]);
  assert.deepEqual(damagedIncrements, [['itemA', -2]]);
  // The split stays, ready to be reconfirmed
  assert.deepEqual([doc.items[0].restockQuantity, doc.items[0].damagedQuantity], [1, 2]);
  assert.ok(emitted.includes('items_updated'));
});

test('a return whose damaged pieces were restored since cannot be reverted', async () => {
  const doc = storedReturn({
    status: 'completed',
    items: [{ item: 'itemA', quantity: 3, restockQuantity: 0, damagedQuantity: 3 }]
  });
  const { controller, call, damagedIncrements } = setup({ original: doc, damagedStock: { itemA: 1 } });
  const res = await call(controller.revertOrderStatus, { params: { id: 'orig' } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /cannot be reverted/);
  assert.equal(doc.status, 'completed');
  assert.deepEqual(damagedIncrements, []);
});

test('reverting a return recorded before the split existed follows its restock flag', async () => {
  for (const restocked of [true, false]) {
    const doc = storedReturn({ status: 'completed', restocked });
    const { controller, call, stockIncrements, damagedIncrements } = setup({ original: doc });
    const res = await call(controller.revertOrderStatus, { params: { id: 'orig' } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(doc.status, 'pending');
    assert.deepEqual(stockIncrements, restocked ? [['itemA', -3]] : []);
    // Its unrestocked pieces were written off, never put on the damaged list
    assert.deepEqual(damagedIncrements, []);
  }
});

test('a return cannot exceed what is left, list a foreign item, or repeat a line', async () => {
  const base = { type: 'return order', returnOf: 'orig' };
  const cases = [
    [{ ...base, items: [{ item: 'itemA', quantity: 6 }] }, /Only 5 of "SF 0.8mm"/],
    [{ ...base, items: [{ item: 'itemZ', quantity: 1 }] }, /not on the original order/],
    [{ ...base, items: [{ item: 'itemA', quantity: 1 }, { item: 'itemA', quantity: 1 }] }, /listed twice/],
    [{ type: 'return order', items: [{ item: 'itemA', quantity: 1 }] }, /Select the sell order/]
  ];
  for (const [body, message] of cases) {
    const { controller, call, saved } = setup({ original: delivered, earlierReturns: [] });
    const res = await call(controller.createOrder, { body });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.match(res.body.message, message);
    assert.equal(saved.length, 0);
  }

  // Earlier completed and pending returns eat into the cap; cancelled ones do not
  const { controller, call } = setup({
    original: delivered,
    earlierReturns: [
      { status: 'completed', items: [{ item: 'itemA', quantity: 2 }] },
      { status: 'pending', items: [{ item: 'itemA', quantity: 2 }] },
      { status: 'cancelled', items: [{ item: 'itemA', quantity: 5 }] }
    ]
  });
  const res = await call(controller.createOrder, { body: { ...base, items: [{ item: 'itemA', quantity: 2 }] } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Only 1 of/);
});

test('salesmen cannot record returns; return orders cannot be re-itemised', async () => {
  const { controller, call } = setup({ original: delivered });
  const asSalesman = await call(controller.createOrder, {
    role: 'salesman', body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemA', quantity: 1 }] }
  });
  assert.equal(asSalesman.statusCode, 403);

  const locked = setup({ original: storedReturn() });
  const edit = await locked.call(locked.controller.updateOrder, { params: { id: 'orig' }, body: { notes: 'x', items: [{ item: 'itemA', quantity: 1 }] } });
  assert.equal(edit.statusCode, 400);
  assert.match(edit.body.message, /cannot be changed/);
});
