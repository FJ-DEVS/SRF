// Damaged-item controller regression tests. No database or live credentials.
// Run: node --test test-damaged-items.js
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
    session() { return q; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
  return q;
}

// In-memory stock and damaged counts behind the two models. Guarded
// decrements ({ quantity: { $gte } }) fail like the real ones would.
function setup({ stock = {}, damaged = {} } = {}) {
  const items = new Map(Object.entries(stock).map(([id, quantity]) => [id, { _id: id, name: `Item ${id}`, quantity }]));
  const damagedRows = new Map(Object.entries(damaged).map(([item, quantity]) => [`d-${item}`, { _id: `d-${item}`, item, quantity }]));
  const emitted = [];
  let committed = 0;
  let aborted = 0;

  const guarded = (row, filter, update) => {
    if (!row || (filter.quantity && row.quantity < filter.quantity.$gte)) return null;
    row.quantity += update.$inc.quantity;
    return { ...row };
  };

  const Item = {
    findById: (id) => query(items.get(id) ? { ...items.get(id) } : null),
    findOneAndUpdate: async (filter, update) => guarded(items.get(filter._id), filter, update),
    findByIdAndUpdate: async (id, update) => guarded(items.get(id), {}, update)
  };
  const DamagedItem = {
    findById: (id) => query(damagedRows.get(id) ? { ...damagedRows.get(id) } : null),
    findOneAndUpdate: async (filter, update, options) => {
      let row = filter._id
        ? damagedRows.get(filter._id)
        : [...damagedRows.values()].find((r) => r.item === filter.item);
      if (!row && options.upsert) {
        row = { _id: `d-${filter.item}`, item: filter.item, quantity: 0 };
        damagedRows.set(row._id, row);
      }
      return guarded(row, filter, update);
    }
  };

  const session = {
    startTransaction() {},
    async abortTransaction() { aborted++; },
    async commitTransaction() { committed++; },
    endSession() {}
  };
  const mongoose = {
    startSession: async () => session,
    Types: { ObjectId: { isValid: (v) => typeof v === 'string' && v.length > 0 } }
  };

  const controller = load('controllers/damagedItemController.js', {
    mongoose,
    '../models/Item': Item,
    '../models/DamagedItem': DamagedItem,
    '../socket': { getIO: () => ({ emit: (name) => emitted.push(name) }) }
  });

  async function call(handler, { body = {}, params = {} } = {}) {
    const req = { body, params, query: {}, user: { role: 'admin' } };
    const res = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = JSON.parse(JSON.stringify(payload)); return this; }
    };
    await handler(req, res);
    return res;
  }

  const stockOf = (id) => items.get(id)?.quantity;
  const damagedOf = (id) => [...damagedRows.values()].find((r) => r.item === id)?.quantity ?? 0;
  return { controller, call, stockOf, damagedOf, emitted, counts: () => ({ committed, aborted }) };
}

test('marking pieces damaged moves them off stock and onto the damaged count', async () => {
  const { controller, call, stockOf, damagedOf, emitted } = setup({ stock: { a: 10 } });
  const first = await call(controller.markDamaged, { body: { item: 'a', quantity: 3 } });
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(stockOf('a'), 7);
  assert.equal(damagedOf('a'), 3);

  // A second batch adds to the same row
  await call(controller.markDamaged, { body: { item: 'a', quantity: 2 } });
  assert.equal(stockOf('a'), 5);
  assert.equal(damagedOf('a'), 5);
  assert.ok(emitted.includes('items_updated'));
});

test('cannot mark more than is in stock, a bad quantity, or a missing item', async () => {
  const cases = [
    [{ item: 'a', quantity: 5 }, 400, /Only 4 of "Item a" in stock/],
    [{ item: 'a', quantity: 0 }, 400, /at least 1/],
    [{ item: 'a', quantity: 1.5 }, 400, /at least 1/],
    [{ item: 'a', quantity: 'x' }, 400, /at least 1/],
    [{ quantity: 1 }, 400, /Select the item/],
    [{ item: 'zz', quantity: 1 }, 404, /not found/]
  ];
  for (const [body, status, message] of cases) {
    const { controller, call, stockOf, damagedOf } = setup({ stock: { a: 4 } });
    const res = await call(controller.markDamaged, { body });
    assert.equal(res.statusCode, status, JSON.stringify(body));
    assert.match(res.body.message, message);
    assert.equal(stockOf('a'), 4);
    assert.equal(damagedOf('a'), 0);
  }
});

test('restoring damaged pieces puts them back into stock, never more than are damaged', async () => {
  const { controller, call, stockOf, damagedOf } = setup({ stock: { a: 1 }, damaged: { a: 4 } });
  const res = await call(controller.restoreDamaged, { params: { id: 'd-a' }, body: { quantity: 3 } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(stockOf('a'), 4);
  assert.equal(damagedOf('a'), 1);

  const tooMany = await call(controller.restoreDamaged, { params: { id: 'd-a' }, body: { quantity: 2 } });
  assert.equal(tooMany.statusCode, 400);
  assert.match(tooMany.body.message, /Only 1 damaged piece to restore/);
  assert.equal(stockOf('a'), 4);
  assert.equal(damagedOf('a'), 1);

  const missing = await call(controller.restoreDamaged, { params: { id: 'd-zz' }, body: { quantity: 1 } });
  assert.equal(missing.statusCode, 404);
});

test('restoring onto a deleted item rolls the damaged count back', async () => {
  const { controller, call, counts } = setup({ damaged: { gone: 2 } });
  const res = await call(controller.restoreDamaged, { params: { id: 'd-gone' }, body: { quantity: 1 } });
  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /no longer exists/);
  assert.deepEqual(counts(), { committed: 0, aborted: 1 });
});
