// Read-only route/controller regression tests. No database or live credentials.
// Run: node --test test-schema-leaderboard.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module, exports: module.exports, console, process,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  }, { filename: file });
  return module.exports;
}

function query(value) {
  return {
    select() { return this; }, sort() { return this; },
    skip() { return this; }, limit() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function setup() {
  const scheme = {
    _id: 'september', name: 'Monthly scheme', runBy: 'SRF TRADES',
    fromDate: new Date('2026-09-01'), toDate: new Date('2026-09-30'),
    pointsAllocations: [{ category: 'category', points: 1 }],
    tiers: [{ pointsRequired: 100, reward: 'Discount - 1000/' }]
  };
  const schemaQueries = [];
  const salesmen = [
    { _id: 'rahul', name: 'Rahul' }, { _id: 'faiz', name: 'Faiz' }
  ];
  const Salesman = {
    exists: async ({ _id }) => _id !== 'deleted',
    find: () => query(salesmen)
  };
  const controller = load('controllers/schemaController.js', {
    '../models/Schema': {
      find: (filter) => { schemaQueries.push(filter); return query([scheme]); },
      countDocuments: async () => 1,
      findById: async (id) => id === scheme._id ? scheme : null
    },
    '../models/Order': { find: () => query([
      { customerName: 'c1', items: [{ item: 'item', quantity: 143 }], createdByType: 'salesman', createdBy: 'rahul' },
      { customerName: 'c2', items: [{ item: 'item', quantity: 128 }], createdByType: 'salesman', createdBy: 'faiz' },
      { customerName: 'c3', items: [{ item: 'item', quantity: 80 }], createdByType: 'admin' }
    ]) },
    '../models/Customer': { find: () => query([
      { _id: 'c1', name: 'Glass Point', assignedSalesman: 'rahul' },
      { _id: 'c2', name: 'S R INTERIO', assignedSalesman: 'faiz' },
      { _id: 'c3', name: 'Unassigned customer' }
    ]) },
    '../models/Salesman': Salesman,
    '../models/Category': { find: () => query([{ _id: 'category', name: 'Plywood' }]) },
    '../models/Item': { find: () => query([{ _id: 'item', category: 'Plywood' }]) },
    '../utils/duplicateCheck': {}
  });
  // Stub token verification only; exercise real role/account checks.
  const jwt = { verify: (token) => {
    if (!['rahul', 'deleted', 'admin'].includes(token)) {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      throw error;
    }
    return { id: token, role: token === 'admin' ? 'admin' : 'salesman' };
  } };
  const auth = load('middleware/auth.js', { jsonwebtoken: jwt });
  const salesmanAuth = load('middleware/salesmanAuth.js', {
    jsonwebtoken: jwt, '../models/Salesman': Salesman
  });
  const routes = [];
  const router = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    router[method] = (url, ...handlers) => routes.push({ method, url, handlers });
  }
  load('routes/schema.js', {
    express: { Router: () => router },
    '../controllers/schemaController': controller,
    '../middleware/auth': auth,
    '../middleware/salesmanAuth': salesmanAuth
  });
  async function request(url, { method = 'get', token = 'rahul', id = 'september', query = {} } = {}) {
    const route = routes.find((route) => route.method === method && route.url === url);
    assert.ok(route, `Route ${method} ${url} is registered`);
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, params: { id }, query };
    const res = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; }
    };
    for (const handler of route.handlers) {
      let next = false;
      await handler(req, res, () => { next = true; });
      if (!next) break;
    }
    return res;
  }
  return { request, schemaQueries };
}

test('sales app receives exactly the admin standings, including other salesmen and unassigned customers', async () => {
  const { request } = setup();
  const sales = await request('/salesman/:id/leaderboard');
  const admin = await request('/:id/leaderboard', { token: 'admin' });
  assert.equal(sales.statusCode, 200);
  assert.deepEqual(sales.body, admin.body);
  assert.deepEqual(sales.body.data.leaderboard.map((row) => row.customerId), ['c1', 'c2', 'c3']);
  assert.deepEqual(sales.body.data.leaderboard.map((row) => row.rank), [1, 2, 3]);
  assert.equal(sales.body.data.leaderboard[0].tier, 'Discount - 1000/');
});

test('scheme list includes historical periods without a current-date filter', async () => {
  const { request, schemaQueries } = setup();
  const result = await request('/salesman/list');
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.data[0]._id, 'september');
  assert.equal(Object.keys(schemaQueries[0]).length, 0);
});

test('optional salesman filter preserves global rank', async () => {
  const { request } = setup();
  const result = await request('/salesman/:id/leaderboard', { query: { salesman: 'faiz' } });
  assert.equal(result.body.data.leaderboard.length, 1);
  assert.equal(result.body.data.leaderboard[0].rank, 2);
});

test('read routes require a valid existing salesman account', async () => {
  const { request } = setup();
  for (const url of ['/salesman/list', '/salesman/:id/leaderboard']) {
    for (const token of [null, 'invalid', 'deleted']) {
      assert.equal((await request(url, { token })).statusCode, 401);
    }
  }
});

test('salesman remains unable to edit schemes and missing schemes return 404', async () => {
  const { request } = setup();
  assert.equal((await request('/', { method: 'post' })).statusCode, 403);
  assert.equal((await request('/:id', { method: 'put' })).statusCode, 403);
  assert.equal((await request('/:id', { method: 'delete' })).statusCode, 403);
  assert.equal((await request('/salesman/:id/leaderboard', { id: 'missing' })).statusCode, 404);
});
