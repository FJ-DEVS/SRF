// The endpoints the Tally side calls — see TALLY_API.md for the contract.
// Everything here answers in snake_case, as that document promises.
const crypto = require('crypto');
const mongoose = require('mongoose');
const TallyCompany = require('../models/TallyCompany');
const TallySync = require('../models/TallySync');
const TallyLedger = require('../models/TallyLedger');
const TallyOutstanding = require('../models/TallyOutstanding');
const Customer = require('../models/Customer');
const { getIO } = require('../socket');
const { parseSyncPayload, nameKey } = require('../utils/tallyPayload');

const rupees = (paise) => Math.round(paise || 0) / 100;
const dayString = (date) => (date ? date.toISOString().slice(0, 10) : null);

const sendError = (res, status, code, message, extra = {}) =>
  res.status(status).json({ success: false, error_code: code, message, ...extra });

// Finds the customer a new ledger stands for: the one customer with its GSTIN,
// failing that the one customer with its name. Two candidates is no match —
// the admin picks by hand rather than the sync guessing.
const customerMatcher = async () => {
  const customers = await Customer.find().select('name gstin').lean();
  const index = (keyOf) => {
    const map = new Map();
    for (const customer of customers) {
      const key = keyOf(customer);
      if (key) map.set(key, map.has(key) ? null : customer._id);
    }
    return map;
  };
  const byGstin = index((c) => String(c.gstin || '').trim().toUpperCase());
  const byName = index((c) => nameKey(c.name));
  return (ledger) => (ledger.gstin && byGstin.get(ledger.gstin)) || byName.get(ledger.nameKey) || null;
};

// The TallyLedger behind each record's ledger, created or refreshed as needed.
// Returns a lookup from the record's ledger to { _id, name }.
const resolveLedgers = async (companyGuid, records) => {
  const existing = await TallyLedger.find({ companyGuid }).lean();
  const byGuid = new Map(existing.filter((l) => l.ledgerGuid).map((l) => [l.ledgerGuid, l]));
  const byName = new Map(existing.map((l) => [l.nameKey, l]));

  const identityOf = (ledger) => ledger.guid || ledger.nameKey;
  const resolved = new Map();
  const ops = [];
  let matchCustomer = null;
  const now = new Date();

  for (const { ledger } of records) {
    const identity = identityOf(ledger);
    if (resolved.has(identity)) continue;

    // The GUID is the identity when Tally sends one — it survives a rename.
    // The name only stands in while either side has no GUID to compare.
    let found = ledger.guid ? byGuid.get(ledger.guid) : null;
    if (!found) {
      const sameName = byName.get(ledger.nameKey);
      if (sameName && (!ledger.guid || !sameName.ledgerGuid)) found = sameName;
    }

    const fields = { name: ledger.name, nameKey: ledger.nameKey, lastSeenAt: now };
    if (ledger.guid) fields.ledgerGuid = ledger.guid;
    if (ledger.code) fields.ledgerCode = ledger.code;
    if (ledger.phone) fields.phone = ledger.phone;
    if (ledger.gstin) fields.gstin = ledger.gstin;
    if (ledger.closingPaise !== null && ledger.closingPaise !== undefined) fields.closingPaise = ledger.closingPaise;

    // A ledger nobody has mapped yet gets one try per sync. A mapping the
    // admin set or cleared by hand is left exactly as they left it.
    if (!found?.customer && found?.mappingSource !== 'manual') {
      matchCustomer = matchCustomer || await customerMatcher();
      const customer = matchCustomer({ ...ledger, gstin: ledger.gstin || found?.gstin || '' });
      if (customer) {
        fields.customer = customer;
        fields.mappingSource = 'auto';
      }
    }

    if (found) {
      ops.push({ updateOne: { filter: { _id: found._id }, update: { $set: fields } } });
      resolved.set(identity, { _id: found._id, name: ledger.name });
    } else {
      const _id = new mongoose.Types.ObjectId();
      ops.push({ insertOne: { document: { _id, companyGuid, ...fields } } });
      resolved.set(identity, { _id, name: ledger.name });
    }
  }

  if (ops.length) await TallyLedger.bulkWrite(ops);
  return (ledger) => resolved.get(identityOf(ledger));
};

// Bills, ledgers and pending total of one snapshot, plus how many of its
// ledgers still have no customer here
const snapshotTotals = async (companyGuid, snapshotId) => {
  const [row] = await TallyOutstanding.aggregate([
    { $match: { companyGuid, snapshotId } },
    { $group: { _id: null, bills: { $sum: 1 }, pendingPaise: { $sum: '$pendingPaise' }, ledgers: { $addToSet: '$ledger' } } }
  ]);
  const ledgerIds = row?.ledgers || [];
  const unmappedLedgers = ledgerIds.length
    ? await TallyLedger.countDocuments({ _id: { $in: ledgerIds }, customer: null })
    : 0;
  return {
    totals: { bills: row?.bills || 0, ledgers: ledgerIds.length, pendingPaise: row?.pendingPaise || 0 },
    unmappedLedgers
  };
};

// A sync id for a request: the Tally side sends none, and every request is a
// whole sync of its own
const newSyncId = () => {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `SYNC-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

// Today in India as UTC midnight — the day the figures are "as of"
const todayIST = () => {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new Date(`${ymd}T00:00:00Z`);
};

// POST /api/v1/tally/outstandings/sync
//
// The body is the dealer's complete outstanding list (see TALLY_API.md). It is
// staged under a snapshot of its own and swapped in with one write at the end,
// so a request that dies half-way leaves the previous figures live.
exports.syncOutstandings = async (req, res) => {
  let log = null;
  try {
    const parsed = parseSyncPayload(req.body);
    if (parsed.error) {
      const { status, code, message, errors } = parsed.error;
      console.warn(`Tally sync rejected (${code}): ${message}`, errors ? JSON.stringify(errors.slice(0, 5)) : '');
      return sendError(res, status, code, message, errors ? { errors } : {});
    }
    const { dealer, records } = parsed;
    const syncId = newSyncId();
    const asOfDate = todayIST();

    log = await TallySync.create({
      companyGuid: dealer.key,
      companyName: dealer.name,
      syncId,
      syncType: 'FULL',
      asOfDate,
      batches: [{ number: 1, records: records.length, receivedAt: new Date() }],
      receivedRecords: records.length,
      expectedRecords: records.length
    });

    await TallyCompany.findOneAndUpdate(
      { guid: dealer.key },
      { $set: { name: dealer.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const ledgerOf = await resolveLedgers(dealer.key, records);

    // A bill with nothing left pending is settled and not stored
    const ops = records
      .filter((record) => record.pendingPaise !== 0)
      .map((record) => {
        const ledger = ledgerOf(record.ledger);
        const { ledger: _ledger, billRef, ...fields } = record;
        return {
          insertOne: {
            document: {
              companyGuid: dealer.key,
              snapshotId: syncId,
              billKey: `${ledger._id}|${billRef}`,
              ...fields,
              ledger: ledger._id,
              ledgerName: ledger.name
            }
          }
        };
      });
    if (ops.length) await TallyOutstanding.bulkWrite(ops, { ordered: false });

    // Go live: move the dealer's pointer to this snapshot — the one write that
    // swaps the whole report — then clear out what it replaced
    await TallyCompany.updateOne(
      { guid: dealer.key },
      { $set: { currentSnapshotId: syncId, asOfDate, lastSyncedAt: new Date() } }
    );
    await TallyOutstanding.deleteMany({ companyGuid: dealer.key, snapshotId: { $ne: syncId } });

    const { totals, unmappedLedgers } = await snapshotTotals(dealer.key, syncId);
    log.status = 'completed';
    log.completedAt = new Date();
    log.totals = totals;
    log.unmappedLedgers = unmappedLedgers;
    await log.save();

    getIO().emit('tally_updated');

    res.status(200).json({
      success: true,
      message: 'Outstanding data synchronized',
      sync_id: syncId,
      dealer_name: dealer.name,
      received_bills: records.length,
      stored_bills: totals.bills,
      settled_bills: records.length - ops.length,
      customers: totals.ledgers,
      outstanding_amount: rupees(totals.pendingPaise),
      unmapped_customers: unmappedLedgers
    });
  } catch (error) {
    console.error('Tally sync error:', error);
    // Leave nothing half-written behind: the old snapshot is still the live one
    if (log) {
      await TallyOutstanding.deleteMany({ companyGuid: log.companyGuid, snapshotId: log.syncId }).catch(() => {});
      await TallySync.updateOne({ _id: log._id }, { $set: { status: 'failed', error: error.message } }).catch(() => {});
    }
    sendError(res, 500, 'SERVER_ERROR', 'Internal server error — nothing was changed, the request can be sent again safely');
  }
};

const describeSync = (log) => ({
  sync_id: log.syncId,
  status: log.status.toUpperCase(),
  dealer_name: log.companyName,
  as_of_date: dayString(log.asOfDate),
  received_bills: log.receivedRecords,
  stored_bills: log.totals?.bills || 0,
  customers: log.totals?.ledgers || 0,
  outstanding_amount: rupees(log.totals?.pendingPaise),
  unmapped_customers: log.unmappedLedgers,
  error: log.error,
  started_at: log.createdAt,
  completed_at: log.completedAt
});

// GET /api/v1/tally/outstandings/sync-status[?sync_id=&dealer_name=]
// One sync by id, or the most recent one
exports.getSyncStatus = async (req, res) => {
  try {
    const filter = {};
    if (req.query.sync_id) filter.syncId = String(req.query.sync_id);
    if (req.query.dealer_name) filter.companyGuid = nameKey(req.query.dealer_name);

    const log = await TallySync.findOne(filter).sort({ createdAt: -1 }).lean();
    if (!log) {
      return req.query.sync_id
        ? sendError(res, 404, 'SYNC_NOT_FOUND', `No sync with sync_id "${req.query.sync_id}"`)
        : res.status(200).json({ success: true, message: 'No sync has been received yet', sync: null });
    }
    res.status(200).json({ success: true, sync: describeSync(log) });
  } catch (error) {
    console.error('Tally sync status error:', error);
    sendError(res, 500, 'SERVER_ERROR', 'Internal server error');
  }
};

// GET /api/v1/tally/outstandings/customers[?dealer_name=&page=&limit=]
// The live balance of every customer, for the Tally side to check against its
// own totals
exports.getCustomerBalances = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 1000);

    const companyFilter = req.query.dealer_name ? { guid: nameKey(req.query.dealer_name) } : {};
    const companies = await TallyCompany.find({ ...companyFilter, currentSnapshotId: { $ne: null } }).lean();
    if (!companies.length) {
      return res.status(200).json({
        success: true, total_outstanding: 0, customers: [], pagination: { total: 0, page, pages: 0 }
      });
    }

    const [result] = await TallyOutstanding.aggregate([
      { $match: { $or: companies.map((c) => ({ companyGuid: c.guid, snapshotId: c.currentSnapshotId })) } },
      { $group: { _id: '$ledger', pendingPaise: { $sum: '$pendingPaise' }, bills: { $sum: 1 } } },
      { $lookup: { from: 'tallyledgers', localField: '_id', foreignField: '_id', as: 'ledger' } },
      { $unwind: '$ledger' },
      { $sort: { 'ledger.nameKey': 1, _id: 1 } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          meta: [{ $group: { _id: null, total: { $sum: 1 }, pendingPaise: { $sum: '$pendingPaise' } } }]
        }
      }
    ]);
    const meta = result.meta[0] || { total: 0, pendingPaise: 0 };

    res.status(200).json({
      success: true,
      as_of_date: dayString(companies[0].asOfDate),
      total_outstanding: rupees(meta.pendingPaise),
      customers: result.data.map((row) => ({
        customer_name: row.ledger.name,
        pending_amount: rupees(row.pendingPaise),
        closing_amount: row.ledger.closingPaise === null || row.ledger.closingPaise === undefined
          ? null
          : rupees(row.ledger.closingPaise),
        bill_count: row.bills,
        mapped_to_customer: Boolean(row.ledger.customer)
      })),
      pagination: { total: meta.total, page, pages: Math.ceil(meta.total / limit) }
    });
  } catch (error) {
    console.error('Tally customer balances error:', error);
    sendError(res, 500, 'SERVER_ERROR', 'Internal server error');
  }
};

// GET /api/v1/tally/ping — lets the Tally side check the URL and key
exports.ping = (req, res) => {
  res.status(200).json({ success: true, message: 'API key accepted', server_time: new Date().toISOString() });
};
