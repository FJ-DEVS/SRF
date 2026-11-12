// The endpoints the Tally side calls — see TALLY_API.md for the contract.
// Everything here answers in snake_case, as that document promises.
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

// POST /api/v1/tally/outstandings/sync
exports.syncOutstandings = async (req, res) => {
  try {
    const parsed = parseSyncPayload(req.body);
    if (parsed.error) {
      const { status, code, message, errors } = parsed.error;
      return sendError(res, status, code, message, errors ? { errors } : {});
    }
    const { company, sync, records } = parsed;

    // One log per sync id; the unique index settles two first batches racing
    let log = await TallySync.findOne({ companyGuid: company.guid, syncId: sync.syncId });
    if (!log) {
      try {
        log = await TallySync.create({
          companyGuid: company.guid,
          companyName: company.name,
          syncId: sync.syncId,
          syncType: sync.syncType,
          asOfDate: sync.asOfDate
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        log = await TallySync.findOne({ companyGuid: company.guid, syncId: sync.syncId });
      }
    }

    // The same sync sent again after it went live: nothing to do, and saying
    // so lets a retry on a dropped connection end cleanly
    if (log.status === 'completed') {
      return res.status(200).json({
        success: true,
        message: 'This sync was already completed — nothing was changed',
        sync_id: log.syncId,
        status: 'COMPLETED',
        already_processed: true,
        total_received: log.receivedRecords
      });
    }
    if (log.syncType !== sync.syncType) {
      return sendError(res, 409, 'SYNC_CONFLICT', `sync_id "${sync.syncId}" was started as a ${log.syncType} sync — use a new sync_id`);
    }

    const companyDoc = await TallyCompany.findOneAndUpdate(
      { guid: company.guid },
      { $set: { name: company.name, ...(company.financialYear ? { financialYear: company.financialYear } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // A full sync is staged under its own id and swapped in at the end. An
    // incremental one edits the live snapshot in place.
    const snapshotId = sync.syncType === 'FULL' ? sync.syncId : (companyDoc.currentSnapshotId || sync.syncId);

    const ledgerOf = await resolveLedgers(company.guid, records);

    // A bill with nothing left pending is settled — not stored on a full
    // sync, and taken off the live list on an incremental one
    const ops = records.map((record) => {
      const ledger = ledgerOf(record.ledger);
      const filter = { companyGuid: company.guid, snapshotId, billKey: `${ledger._id}|${record.billRef}` };
      if (record.pendingPaise === 0) return { deleteOne: { filter } };
      const { ledger: _ledger, billRef: _billRef, ...fields } = record;
      return {
        updateOne: {
          filter,
          update: { $set: { ...fields, ledger: ledger._id, ledgerName: ledger.name } },
          upsert: true
        }
      };
    });
    const written = ops.length
      ? await TallyOutstanding.bulkWrite(ops, { ordered: false })
      : { upsertedCount: 0, modifiedCount: 0, deletedCount: 0 };

    // Note the batch. Sent twice, it replaces its own count.
    log.batches = [
      ...log.batches.filter((b) => b.number !== sync.batchNumber),
      { number: sync.batchNumber, records: records.length, receivedAt: new Date() }
    ];
    log.receivedRecords = log.batches.reduce((sum, b) => sum + b.records, 0);
    if (sync.totalRecords !== null) log.expectedRecords = sync.totalRecords;
    log.asOfDate = sync.asOfDate;
    log.error = null;

    const answer = {
      sync_id: log.syncId,
      sync_type: log.syncType,
      batch_number: sync.batchNumber,
      received_records: records.length,
      created_records: written.upsertedCount || 0,
      updated_records: written.modifiedCount || 0,
      settled_records: written.deletedCount || 0,
      total_received: log.receivedRecords
    };

    if (!sync.isLastBatch) {
      await log.save();
      return res.status(200).json({
        success: true,
        message: `Batch ${sync.batchNumber} received — waiting for the rest`,
        status: 'RECEIVING',
        ...answer
      });
    }

    // Last batch. If Tally said how many records the sync holds and that is
    // not what arrived, a batch went missing: leave the old figures live and
    // let the missing batch (and this one) be sent again.
    if (log.expectedRecords !== null && log.expectedRecords !== log.receivedRecords) {
      log.error = `Expected ${log.expectedRecords} records, received ${log.receivedRecords}`;
      await log.save();
      return sendError(res, 422, 'RECORD_COUNT_MISMATCH',
        `total_records says ${log.expectedRecords} but ${log.receivedRecords} arrived across batches ` +
        `${log.batches.map((b) => b.number).sort((a, b) => a - b).join(', ')}. ` +
        'The previous outstandings are still live. Re-send the missing batch, then the last batch again.',
        { sync_id: log.syncId, expected_records: log.expectedRecords, total_received: log.receivedRecords });
    }

    // Go live: move the company's pointer to this snapshot — the one write
    // that swaps the whole report — then clear out what it replaced.
    await TallyCompany.updateOne(
      { guid: company.guid },
      { $set: { currentSnapshotId: snapshotId, asOfDate: sync.asOfDate, lastSyncedAt: new Date() } }
    );
    if (sync.syncType === 'FULL') {
      await TallyOutstanding.deleteMany({ companyGuid: company.guid, snapshotId: { $ne: snapshotId } });
      await TallySync.updateMany(
        { companyGuid: company.guid, status: 'receiving', _id: { $ne: log._id } },
        { $set: { status: 'failed', error: 'Never completed — superseded by a later full sync' } }
      );
    }

    const { totals, unmappedLedgers } = await snapshotTotals(company.guid, snapshotId);
    log.status = 'completed';
    log.completedAt = new Date();
    log.totals = totals;
    log.unmappedLedgers = unmappedLedgers;
    await log.save();

    getIO().emit('tally_updated');

    res.status(200).json({
      success: true,
      message: 'Outstanding data synchronized',
      status: 'COMPLETED',
      ...answer,
      outstanding_bills: totals.bills,
      outstanding_ledgers: totals.ledgers,
      outstanding_amount: rupees(totals.pendingPaise),
      unmapped_ledgers: unmappedLedgers
    });
  } catch (error) {
    console.error('Tally sync error:', error);
    sendError(res, 500, 'SERVER_ERROR', 'Internal server error — the request can be sent again safely');
  }
};

const describeSync = (log) => ({
  sync_id: log.syncId,
  sync_type: log.syncType,
  status: log.status.toUpperCase(),
  company_name: log.companyName,
  tally_company_guid: log.companyGuid,
  as_of_date: dayString(log.asOfDate),
  batches_received: log.batches.map((b) => b.number).sort((a, b) => a - b),
  total_received: log.receivedRecords,
  expected_records: log.expectedRecords,
  outstanding_bills: log.totals?.bills || 0,
  outstanding_ledgers: log.totals?.ledgers || 0,
  outstanding_amount: rupees(log.totals?.pendingPaise),
  unmapped_ledgers: log.unmappedLedgers,
  error: log.error,
  started_at: log.createdAt,
  completed_at: log.completedAt
});

// GET /api/v1/tally/outstandings/sync-status[?sync_id=&tally_company_guid=]
// One sync by id, or the most recent one
exports.getSyncStatus = async (req, res) => {
  try {
    const filter = {};
    if (req.query.sync_id) filter.syncId = String(req.query.sync_id);
    if (req.query.tally_company_guid) filter.companyGuid = String(req.query.tally_company_guid);

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

// GET /api/v1/tally/outstandings/customers[?tally_company_guid=&page=&limit=]
// The live balance of every ledger, for the Tally side to check against its
// own totals
exports.getCustomerBalances = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 1000);

    const companyFilter = req.query.tally_company_guid ? { guid: String(req.query.tally_company_guid) } : {};
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
        ledger_name: row.ledger.name,
        ledger_guid: row.ledger.ledgerGuid || null,
        ledger_code: row.ledger.ledgerCode || null,
        pending_amount: rupees(row.pendingPaise),
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
