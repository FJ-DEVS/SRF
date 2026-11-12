// The admin's side of the Tally integration: the outstanding reports, the
// ledger → customer mapping, the sync history and the API key.
const crypto = require('crypto');
const mongoose = require('mongoose');
const TallyCompany = require('../models/TallyCompany');
const TallyConfig = require('../models/TallyConfig');
const TallySync = require('../models/TallySync');
const TallyLedger = require('../models/TallyLedger');
const TallyOutstanding = require('../models/TallyOutstanding');
const Customer = require('../models/Customer');
const { getIO } = require('../socket');
const { hashKey } = require('../middleware/tallyAuth');
const { escapeRegex } = require('../utils/duplicateCheck');
const { parseDay, parsePaise } = require('../utils/tallyPayload');

const rupees = (paise) => (paise === null || paise === undefined ? null : Math.round(paise) / 100);
const isId = (value) => mongoose.Types.ObjectId.isValid(value);
const NAME_COLLATION = { locale: 'en', strength: 2 };

// Today in India as UTC midnight — the same shape bill dates are stored in,
// so the two subtract to whole days
const todayIST = () => {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new Date(`${ymd}T00:00:00Z`);
};

// Ageing periods the way Tally asks for them: the upper day of each slab.
// "30,60,90,180" reads as 0–30, 31–60, 61–90, 91–180 and over 180.
const DEFAULT_BUCKETS = [30, 60, 90, 180];
const parseBuckets = (raw) => {
  const days = String(raw || '').split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0);
  const sorted = [...new Set(days)].sort((a, b) => a - b).slice(0, 8);
  return sorted.length ? sorted : DEFAULT_BUCKETS;
};

// Slab labels, in the order of their index: -1 (not yet due, when ageing by
// due date) is listed first under key "notDue", then 0…n
const bucketLabels = (buckets, basis) => {
  const labels = buckets.map((upper, i) => ({ index: i, label: `${i === 0 ? 0 : buckets[i - 1] + 1}–${upper} days` }));
  labels.push({ index: buckets.length, label: `Over ${buckets[buckets.length - 1]} days` });
  return basis === 'due' ? [{ index: -1, label: 'Not due' }, ...labels] : labels;
};

// The rows the reports may read: each company's live snapshot
const liveScope = async () => {
  const companies = await TallyCompany.find({ currentSnapshotId: { $ne: null } }).lean();
  return {
    companies,
    match: companies.length
      ? { $or: companies.map((c) => ({ companyGuid: c.guid, snapshotId: c.currentSnapshotId })) }
      : null
  };
};

// Filters that are about the customer behind a ledger rather than the bill —
// salesman, payment rating, blocked, mapped or not — narrowed down to the
// ledger ids they leave. null when none of them is in play.
const ledgerScope = async ({ ledger, customer, salesman, rating, blocked, mapped }) => {
  const filter = {};
  let narrowed = false;

  if (isId(ledger)) { filter._id = ledger; narrowed = true; }
  if (mapped === 'yes') { filter.customer = { $ne: null }; narrowed = true; }
  if (mapped === 'no') { filter.customer = null; narrowed = true; }

  const customerFilter = {};
  if (isId(customer)) customerFilter._id = customer;
  if (isId(salesman)) customerFilter.assignedSalesman = salesman;
  if (['good', 'average', 'bad'].includes(rating)) customerFilter.paymentRating = rating;
  if (blocked === 'yes') customerFilter.isBlocked = true;
  if (blocked === 'no') customerFilter.isBlocked = { $ne: true };
  if (Object.keys(customerFilter).length) {
    const ids = await Customer.find(customerFilter).distinct('_id');
    // "mapped: no" together with a customer filter can match nothing
    filter.customer = mapped === 'no' ? { $in: [] } : { $in: ids };
    narrowed = true;
  }

  return narrowed ? TallyLedger.find(filter).distinct('_id') : null;
};

// The pipeline both reports start with: the live rows the filters keep, each
// with its age, its overdue days and the ageing slab it falls in.
//
//   basis  'bill' — age counted from the bill date (Tally's default)
//          'due'  — age counted from the due date, i.e. days overdue
const filteredRows = async (query) => {
  const { match: live } = await liveScope();
  if (!live) return null;

  const basis = query.basis === 'due' ? 'due' : 'bill';
  const buckets = parseBuckets(query.buckets);
  const today = todayIST();
  const conditions = [live];

  const ledgerIds = await ledgerScope(query);
  if (ledgerIds) conditions.push({ ledger: { $in: ledgerIds } });

  if (query.search && String(query.search).trim()) {
    const pattern = { $regex: escapeRegex(String(query.search).trim()), $options: 'i' };
    conditions.push({ $or: [{ ledgerName: pattern }, { billReference: pattern }, { voucherNumber: pattern }] });
  }
  if (['BILL', 'ON_ACCOUNT'].includes(query.entryType)) conditions.push({ entryType: query.entryType });
  if (query.voucherType) conditions.push({ voucherType: new RegExp(`^${escapeRegex(String(query.voucherType).trim())}$`, 'i') });
  if (query.side === 'debit') conditions.push({ pendingPaise: { $gt: 0 } });
  if (query.side === 'credit') conditions.push({ pendingPaise: { $lt: 0 } });

  const dayRange = (field, from, to) => {
    const range = {};
    const start = parseDay(from);
    const end = parseDay(to);
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    if (Object.keys(range).length) conditions.push({ [field]: range });
  };
  dayRange('voucherDate', query.dateFrom, query.dateTo);
  dayRange('dueDate', query.dueFrom, query.dueTo);

  const daysSince = (field) => ({
    $cond: [{ $ifNull: [field, false] }, { $dateDiff: { startDate: field, endDate: today, unit: 'day' } }, 0]
  });
  const basisDays = basis === 'due' ? '$overdueDays' : '$ageDays';

  const pipeline = [
    { $match: { $and: conditions } },
    { $addFields: { ageDays: daysSince('$voucherDate'), overdueDays: daysSince('$dueDate') } },
    {
      $addFields: {
        basisDays,
        bucket: {
          $switch: {
            branches: [
              ...(basis === 'due' ? [{ case: { $lte: [basisDays, 0] }, then: -1 }] : []),
              ...buckets.map((upper, i) => ({ case: { $lte: [basisDays, upper] }, then: i }))
            ],
            default: buckets.length
          }
        }
      }
    }
  ];

  // Filters on the computed columns
  const computed = {};
  if (query.overdue === 'yes') computed.overdueDays = { $gt: 0 };
  if (query.overdue === 'no') computed.overdueDays = { $lte: 0 };
  const ageMin = parseInt(query.ageMin, 10);
  const ageMax = parseInt(query.ageMax, 10);
  if (Number.isInteger(ageMin) || Number.isInteger(ageMax)) {
    computed.basisDays = {
      ...(Number.isInteger(ageMin) ? { $gte: ageMin } : {}),
      ...(Number.isInteger(ageMax) ? { $lte: ageMax } : {})
    };
  }
  const bucket = parseInt(query.bucket, 10);
  if (Number.isInteger(bucket)) computed.bucket = bucket;
  if (Object.keys(computed).length) pipeline.push({ $match: computed });

  return { pipeline, basis, buckets };
};

// A pending-amount range in rupees → a condition on a paise field
const amountRange = (min, max) => {
  const range = {};
  const low = parsePaise(min);
  const high = parsePaise(max);
  if (Number.isInteger(low)) range.$gte = low;
  if (Number.isInteger(high)) range.$lte = high;
  return Object.keys(range).length ? range : null;
};

const paging = (query, defaultLimit = 25) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), 1000);
  return { page, limit, skip: (page - 1) * limit };
};

// Per-slab sums of the pending amount, as $group accumulators: b_notDue, b0…bn
const bucketSums = (buckets, basis) => {
  const sums = {};
  for (const { index } of bucketLabels(buckets, basis)) {
    sums[index === -1 ? 'b_notDue' : `b${index}`] = {
      $sum: { $cond: [{ $eq: ['$bucket', index] }, '$pendingPaise', 0] }
    };
  }
  return sums;
};

// { label, amount } per slab, out of a row carrying those sums
const readBuckets = (row, buckets, basis) =>
  bucketLabels(buckets, basis).map(({ index, label }) => ({
    index,
    label,
    amount: rupees(row?.[index === -1 ? 'b_notDue' : `b${index}`] || 0)
  }));

// The ledger (and the customer it is mapped to) behind a page of rows
const ledgersById = async (ids) => {
  const ledgers = await TallyLedger.find({ _id: { $in: ids } })
    .populate({
      path: 'customer',
      select: 'name phone isBlocked paymentRating assignedSalesman',
      populate: { path: 'assignedSalesman', select: 'name' }
    })
    .lean();
  return new Map(ledgers.map((l) => [String(l._id), l]));
};

const describeLedger = (ledger) => ledger && {
  _id: ledger._id,
  name: ledger.name,
  ledgerGuid: ledger.ledgerGuid,
  ledgerCode: ledger.ledgerCode,
  phone: ledger.phone,
  gstin: ledger.gstin,
  mappingSource: ledger.mappingSource,
  customer: ledger.customer ? {
    _id: ledger.customer._id,
    name: ledger.customer.name,
    phone: ledger.customer.phone,
    isBlocked: ledger.customer.isBlocked,
    paymentRating: ledger.customer.paymentRating,
    salesman: ledger.customer.assignedSalesman?.name || null
  } : null
};

const EMPTY_PAGE = { total: 0, page: 1, pages: 0 };

const BILL_SORTS = {
  party_asc: { ledgerName: 1, voucherDate: 1 },
  party_desc: { ledgerName: -1, voucherDate: 1 },
  date_desc: { voucherDate: -1 },
  date_asc: { voucherDate: 1 },
  due_asc: { dueDate: 1 },
  due_desc: { dueDate: -1 },
  amount_desc: { pendingPaise: -1 },
  amount_asc: { pendingPaise: 1 },
  age_desc: { basisDays: -1 },
  age_asc: { basisDays: 1 }
};

// Bill-wise outstandings — Tally's "Bills Receivable" (Admin only)
exports.getBills = async (req, res) => {
  try {
    const rows = await filteredRows(req.query);
    const { page, limit, skip } = paging(req.query);
    if (!rows) {
      return res.status(200).json({ success: true, data: [], pagination: EMPTY_PAGE, totals: null, buckets: [] });
    }
    const { pipeline, basis, buckets } = rows;

    const amount = amountRange(req.query.amountMin, req.query.amountMax);
    if (amount) pipeline.push({ $match: { pendingPaise: amount } });

    const sort = BILL_SORTS[req.query.sort] || BILL_SORTS.party_asc;
    pipeline.push({
      $facet: {
        data: [{ $sort: { ...sort, _id: 1 } }, { $skip: skip }, { $limit: limit }],
        totals: [{
          $group: {
            _id: null,
            bills: { $sum: 1 },
            pendingPaise: { $sum: '$pendingPaise' },
            overduePaise: { $sum: { $cond: [{ $gt: ['$overdueDays', 0] }, '$pendingPaise', 0] } },
            overdueBills: { $sum: { $cond: [{ $gt: ['$overdueDays', 0] }, 1, 0] } },
            ledgers: { $addToSet: '$ledger' },
            ...bucketSums(buckets, basis)
          }
        }]
      }
    });

    const [result] = await TallyOutstanding.aggregate(pipeline).collation(NAME_COLLATION);
    const totals = result.totals[0];
    const ledgers = await ledgersById(result.data.map((r) => r.ledger));

    res.status(200).json({
      success: true,
      data: result.data.map((row) => ({
        _id: row._id,
        ledger: describeLedger(ledgers.get(String(row.ledger))) || { _id: row.ledger, name: row.ledgerName },
        entryType: row.entryType,
        voucherNumber: row.voucherNumber,
        voucherType: row.voucherType,
        billReference: row.billReference,
        voucherDate: row.voucherDate,
        dueDate: row.dueDate,
        originalAmount: rupees(row.originalPaise),
        paidAmount: rupees(row.paidPaise),
        pendingAmount: rupees(row.pendingPaise),
        billStatus: row.billStatus,
        narration: row.narration,
        ageDays: row.ageDays,
        overdueDays: row.overdueDays,
        bucket: row.bucket
      })),
      pagination: { total: totals?.bills || 0, page, pages: Math.ceil((totals?.bills || 0) / limit) },
      totals: {
        bills: totals?.bills || 0,
        parties: totals?.ledgers?.length || 0,
        pendingAmount: rupees(totals?.pendingPaise || 0),
        overdueAmount: rupees(totals?.overduePaise || 0),
        overdueBills: totals?.overdueBills || 0
      },
      basis,
      buckets: readBuckets(totals, buckets, basis)
    });
  } catch (error) {
    console.error('Get tally bills error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const PARTY_SORTS = {
  name_asc: { ledgerName: 1 },
  name_desc: { ledgerName: -1 },
  amount_desc: { pendingPaise: -1 },
  amount_asc: { pendingPaise: 1 },
  overdue_desc: { overduePaise: -1 },
  age_desc: { maxDays: -1 },
  bills_desc: { bills: -1 }
};

// Party-wise outstandings with ageing — Tally's "Ledger Outstandings" /
// ageing analysis. The amount range here is on the party's total. (Admin only)
exports.getParties = async (req, res) => {
  try {
    const rows = await filteredRows(req.query);
    const { page, limit, skip } = paging(req.query);
    if (!rows) {
      return res.status(200).json({ success: true, data: [], pagination: EMPTY_PAGE, totals: null, buckets: [] });
    }
    const { pipeline, basis, buckets } = rows;
    const sums = bucketSums(buckets, basis);
    const sumKeys = Object.keys(sums);

    pipeline.push({
      $group: {
        _id: '$ledger',
        ledgerName: { $first: '$ledgerName' },
        bills: { $sum: 1 },
        pendingPaise: { $sum: '$pendingPaise' },
        overduePaise: { $sum: { $cond: [{ $gt: ['$overdueDays', 0] }, '$pendingPaise', 0] } },
        overdueBills: { $sum: { $cond: [{ $gt: ['$overdueDays', 0] }, 1, 0] } },
        onAccountPaise: { $sum: { $cond: [{ $eq: ['$entryType', 'ON_ACCOUNT'] }, '$pendingPaise', 0] } },
        oldestBill: { $min: '$voucherDate' },
        maxDays: { $max: '$basisDays' },
        ...sums
      }
    });

    const amount = amountRange(req.query.amountMin, req.query.amountMax);
    if (amount) pipeline.push({ $match: { pendingPaise: amount } });

    const sort = PARTY_SORTS[req.query.sort] || PARTY_SORTS.name_asc;
    pipeline.push({
      $facet: {
        data: [{ $sort: { ...sort, _id: 1 } }, { $skip: skip }, { $limit: limit }],
        totals: [{
          $group: {
            _id: null,
            parties: { $sum: 1 },
            bills: { $sum: '$bills' },
            pendingPaise: { $sum: '$pendingPaise' },
            overduePaise: { $sum: '$overduePaise' },
            overdueBills: { $sum: '$overdueBills' },
            overdueParties: { $sum: { $cond: [{ $gt: ['$overduePaise', 0] }, 1, 0] } },
            ...Object.fromEntries(sumKeys.map((key) => [key, { $sum: `$${key}` }]))
          }
        }]
      }
    });

    const [result] = await TallyOutstanding.aggregate(pipeline).collation(NAME_COLLATION);
    const totals = result.totals[0];
    const ledgers = await ledgersById(result.data.map((r) => r._id));

    res.status(200).json({
      success: true,
      data: result.data.map((row) => ({
        ledger: describeLedger(ledgers.get(String(row._id))) || { _id: row._id, name: row.ledgerName },
        bills: row.bills,
        pendingAmount: rupees(row.pendingPaise),
        overdueAmount: rupees(row.overduePaise),
        overdueBills: row.overdueBills,
        onAccountAmount: rupees(row.onAccountPaise),
        oldestBill: row.oldestBill,
        maxDays: row.maxDays,
        buckets: readBuckets(row, buckets, basis)
      })),
      pagination: { total: totals?.parties || 0, page, pages: Math.ceil((totals?.parties || 0) / limit) },
      totals: {
        parties: totals?.parties || 0,
        bills: totals?.bills || 0,
        pendingAmount: rupees(totals?.pendingPaise || 0),
        overdueAmount: rupees(totals?.overduePaise || 0),
        overdueBills: totals?.overdueBills || 0,
        overdueParties: totals?.overdueParties || 0
      },
      basis,
      buckets: readBuckets(totals, buckets, basis)
    });
  } catch (error) {
    console.error('Get tally parties error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Where the integration stands: the companies syncing, the last sync, how
// many live ledgers still need a customer, and whether a key exists (Admin only)
exports.getStatus = async (req, res) => {
  try {
    const [{ companies, match }, lastSync, config] = await Promise.all([
      liveScope(),
      TallySync.findOne().sort({ createdAt: -1 }).lean(),
      TallyConfig.findOne({ key: 'main' }).lean()
    ]);

    let unmappedLedgers = 0;
    let voucherTypes = [];
    if (match) {
      const [liveLedgers, types] = await Promise.all([
        TallyOutstanding.distinct('ledger', match),
        TallyOutstanding.distinct('voucherType', match)
      ]);
      unmappedLedgers = await TallyLedger.countDocuments({ _id: { $in: liveLedgers }, customer: null });
      voucherTypes = types.filter(Boolean).sort();
    }

    res.status(200).json({
      success: true,
      data: {
        companies: companies.map((c) => ({
          guid: c.guid,
          name: c.name,
          financialYear: c.financialYear,
          asOfDate: c.asOfDate,
          lastSyncedAt: c.lastSyncedAt
        })),
        lastSync,
        unmappedLedgers,
        voucherTypes,
        apiKey: {
          exists: Boolean(config?.apiKeyHash),
          hint: config?.apiKeyHint || '',
          createdAt: config?.apiKeyCreatedAt || null,
          lastUsedAt: config?.apiKeyLastUsedAt || null
        }
      }
    });
  } catch (error) {
    console.error('Get tally status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Sync history, newest first (Admin only)
exports.getSyncs = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query, 10);
    const [syncs, total] = await Promise.all([
      TallySync.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      TallySync.countDocuments()
    ]);
    res.status(200).json({
      success: true,
      data: syncs.map((s) => ({ ...s, totals: { ...s.totals, pendingAmount: rupees(s.totals?.pendingPaise || 0) } })),
      pagination: { total, page, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get tally syncs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Tally ledgers and the customers they are mapped to, each with its live
// pending total (Admin only)
exports.getLedgers = async (req, res) => {
  try {
    const { search, mapped, sort } = req.query;
    const { page, limit, skip } = paging(req.query);

    const filter = {};
    if (search && String(search).trim()) {
      const pattern = { $regex: escapeRegex(String(search).trim()), $options: 'i' };
      filter.$or = [{ name: pattern }, { gstin: pattern }, { ledgerCode: pattern }];
    }
    if (mapped === 'yes') filter.customer = { $ne: null };
    if (mapped === 'no') filter.customer = null;

    const [ledgers, total, unmapped] = await Promise.all([
      TallyLedger.find(filter)
        .populate('customer', 'name phone gstin')
        .sort(sort === 'name_desc' ? { nameKey: -1, _id: 1 } : { nameKey: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TallyLedger.countDocuments(filter),
      TallyLedger.countDocuments({ customer: null })
    ]);

    const { match } = await liveScope();
    const pending = match && ledgers.length
      ? await TallyOutstanding.aggregate([
          { $match: { $and: [match, { ledger: { $in: ledgers.map((l) => l._id) } }] } },
          { $group: { _id: '$ledger', pendingPaise: { $sum: '$pendingPaise' }, bills: { $sum: 1 } } }
        ])
      : [];
    const pendingByLedger = new Map(pending.map((p) => [String(p._id), p]));

    res.status(200).json({
      success: true,
      data: ledgers.map((ledger) => {
        const live = pendingByLedger.get(String(ledger._id));
        return { ...ledger, pendingAmount: rupees(live?.pendingPaise || 0), bills: live?.bills || 0 };
      }),
      pagination: { total, page, pages: Math.ceil(total / limit) },
      unmapped
    });
  } catch (error) {
    console.error('Get tally ledgers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Map a ledger to a customer, or clear the mapping with { customer: null }.
// Either way it becomes a manual mapping that a later sync leaves alone. (Admin only)
exports.setLedgerCustomer = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Ledger not found' });

    const customerId = req.body.customer || null;
    if (customerId) {
      if (!isId(customerId) || !(await Customer.exists({ _id: customerId }))) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
    }

    const ledger = await TallyLedger.findByIdAndUpdate(
      req.params.id,
      { $set: { customer: customerId, mappingSource: 'manual' } },
      { new: true }
    ).populate('customer', 'name phone gstin');
    if (!ledger) return res.status(404).json({ success: false, message: 'Ledger not found' });

    getIO().emit('tally_updated');
    res.status(200).json({
      success: true,
      message: customerId ? 'Ledger mapped to customer' : 'Ledger mapping cleared',
      data: ledger
    });
  } catch (error) {
    console.error('Set tally ledger customer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Generate the API key the Tally side signs with — replacing the old one,
// which stops working at once. The key is in this response and nowhere else. (Admin only)
exports.generateApiKey = async (req, res) => {
  try {
    const apiKey = `srf_tally_${crypto.randomBytes(24).toString('hex')}`;
    const createdAt = new Date();
    await TallyConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: { apiKeyHash: hashKey(apiKey), apiKeyHint: apiKey.slice(-4), apiKeyCreatedAt: createdAt, apiKeyLastUsedAt: null } },
      { upsert: true }
    );
    res.status(201).json({
      success: true,
      message: 'API key generated — copy it now, it will not be shown again',
      data: { apiKey, hint: apiKey.slice(-4), createdAt }
    });
  } catch (error) {
    console.error('Generate tally API key error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Revoke the API key; every Tally request is refused until a new one is made (Admin only)
exports.revokeApiKey = async (req, res) => {
  try {
    await TallyConfig.updateOne(
      { key: 'main' },
      { $set: { apiKeyHash: null, apiKeyHint: '', apiKeyCreatedAt: null, apiKeyLastUsedAt: null } }
    );
    res.status(200).json({ success: true, message: 'API key revoked' });
  } catch (error) {
    console.error('Revoke tally API key error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
