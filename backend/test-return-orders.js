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

function setup({ original, earlierReturns = [] } = {}) {
  const saved = [];
  const stockIncrements = [];
  const emitted = [];

  function Order(doc) {
    Object.assign(this, doc);
    this._id = 'ret1';
    this.save = async () => { saved.push({ ...doc }); return this; };
    this.populate = async () => this;
  }
  Order.findById = (id) => query(id === 'orig' ? original : null);
  Order.find = (filter) => query(filter.type === 'return order' ? earlierReturns : []);

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
      findByIdAndUpdate: async (id, update) => { stockIncrements.push([id, update.$inc.quantity]); }
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
  return { controller, call, saved, stockIncrements, emitted };
}

const delivered = {
  _id: 'orig', type: 'sell order', status: 'delivered',
  customerName: { _id: 'cust1', name: 'Glass Point' },
  items: [
    { item: { _id: 'itemA', name: 'SF 0.8mm', price: 950 }, quantity: 5 },
    { item: { _id: 'itemB', name: 'GMR 0.8mm', price: 1000 }, quantity: 2 }
  ]
};

test('returnable view reports sold / returned / remaining per item', async () => {
  const { controller, call } = setup({
    original: delivered,
    earlierReturns: [{ items: [{ item: 'itemA', quantity: 2 }] }]
  });
  const res = await call(controller.getReturnable, { params: { id: 'orig' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.data.items.map((l) => [l.item._id, l.ordered, l.returned, l.remaining]),
    [['itemA', 5, 2, 3], ['itemB', 2, 0, 2]]
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

test('a return is recorded complete, copies the customer, and restocks only when asked', async () => {
  const { controller, call, saved, stockIncrements, emitted } = setup({ original: delivered });
  const res = await call(controller.createOrder, {
    body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemA', quantity: 3 }], notes: 'damaged' }
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'completed');
  assert.equal(saved[0].returnOf, 'orig');
  assert.equal(saved[0].customerName, 'cust1');
  assert.equal(saved[0].customerModel, 'Customer');
  assert.equal(saved[0].restocked, false);
  assert.deepEqual(stockIncrements, []);
  assert.ok(emitted.includes('orders_updated'));
  assert.ok(!emitted.includes('items_updated'));

  const restocking = setup({ original: delivered });
  const res2 = await restocking.call(restocking.controller.createOrder, {
    body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemB', quantity: 2 }], restock: true }
  });
  assert.equal(res2.statusCode, 201);
  assert.deepEqual(restocking.stockIncrements, [['itemB', 2]]);
  assert.equal(restocking.saved[0].restocked, true);
  assert.ok(restocking.emitted.includes('items_updated'));
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

  // Earlier returns eat into the cap
  const { controller, call } = setup({
    original: delivered, earlierReturns: [{ items: [{ item: 'itemA', quantity: 4 }] }]
  });
  const res = await call(controller.createOrder, { body: { ...base, items: [{ item: 'itemA', quantity: 2 }] } });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Only 1 of/);
});

test('salesmen cannot record returns; return orders cannot advance, revert or be re-itemised', async () => {
  const { controller, call } = setup({ original: delivered });
  const asSalesman = await call(controller.createOrder, {
    role: 'salesman', body: { type: 'return order', returnOf: 'orig', items: [{ item: 'itemA', quantity: 1 }] }
  });
  assert.equal(asSalesman.statusCode, 403);

  const ret = { _id: 'orig', type: 'return order', status: 'completed', items: [], customerName: null };
  const locked = setup({ original: ret });
  const advance = await locked.call(locked.controller.updateOrderStatus, { params: { id: 'orig' }, body: { status: 'delivered' } });
  assert.equal(advance.statusCode, 400);
  assert.match(advance.body.message, /Cannot transition/);
  const edit = await locked.call(locked.controller.updateOrder, { params: { id: 'orig' }, body: { notes: 'x', items: [{ item: 'itemA', quantity: 1 }] } });
  assert.equal(edit.statusCode, 400);
  assert.match(edit.body.message, /cannot be changed/);
});
