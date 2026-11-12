// Reads and checks the JSON the Tally side posts to the outstandings sync.
// Pure — nothing here touches the database — so the contract can be tested on
// its own. The field names are the ones documented in TALLY_API.md.

const MAX_RECORDS_PER_REQUEST = 5000;
const MAX_ERRORS_REPORTED = 50;

const text = (value, max = 200) =>
  value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim().slice(0, max);

// What two spellings of one ledger name share: case, punctuation and spacing
// flattened. "A.M. Glass House" and "AM GLASS HOUSE " differ; "A K Plywoods,"
// and "a k plywoods" do not.
const nameKey = (name) => text(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// A day as UTC midnight, from "YYYY-MM-DD" or Tally's own "YYYYMMDD".
// undefined when blank, null when it is not a real date.
const parseDay = (value) => {
  const raw = text(value, 20);
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) || /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const real = date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
  return real ? date : null;
};

// Rupees (a number, or a numeric string with or without thousands commas) to
// whole paise. undefined when blank, null when it is not a number.
const parsePaise = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

const fail = (status, code, message, errors) => ({ error: { status, code, message, errors } });

// One outstanding record → the row to store, or the field errors it has
const parseRecord = (raw, index) => {
  const errors = [];
  const bad = (field, message) => errors.push({ index, field, message });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    bad('', 'Each record must be an object');
    return { errors };
  }

  const ledgerName = text(raw.ledger_name);
  if (!ledgerName) bad('ledger_name', 'ledger_name is required');

  const billReference = text(raw.bill_reference, 100);
  const voucherNumber = text(raw.voucher_number, 100);

  // A record with no bill to point at is the ledger's on-account balance
  const given = text(raw.entry_type, 20).toUpperCase().replace(/[\s-]+/g, '_');
  const entryType = given || (billReference || voucherNumber ? 'BILL' : 'ON_ACCOUNT');
  if (!['BILL', 'ON_ACCOUNT'].includes(entryType)) bad('entry_type', 'entry_type must be BILL or ON_ACCOUNT');
  if (entryType === 'BILL' && !billReference && !voucherNumber) {
    bad('bill_reference', 'A BILL record needs bill_reference or voucher_number');
  }

  const voucherDate = parseDay(raw.voucher_date);
  if (voucherDate === null) bad('voucher_date', 'voucher_date must be YYYY-MM-DD');
  if (voucherDate === undefined && entryType === 'BILL') bad('voucher_date', 'voucher_date is required for a BILL record');

  const dueDate = parseDay(raw.due_date);
  if (dueDate === null) bad('due_date', 'due_date must be YYYY-MM-DD');

  const pendingPaise = parsePaise(raw.pending_amount);
  if (pendingPaise === undefined) bad('pending_amount', 'pending_amount is required');
  if (pendingPaise === null) bad('pending_amount', 'pending_amount must be a number');

  const originalPaise = parsePaise(raw.original_amount);
  if (originalPaise === null) bad('original_amount', 'original_amount must be a number');
  const paidPaise = parsePaise(raw.paid_amount);
  if (paidPaise === null) bad('paid_amount', 'paid_amount must be a number');

  if (errors.length) return { errors };

  const billStatus = text(raw.bill_status, 40).toUpperCase().replace(/[\s-]+/g, '_')
    || (paidPaise ? 'PARTIALLY_PAID' : 'PENDING');

  return {
    record: {
      ledger: {
        guid: text(raw.ledger_guid, 100),
        code: text(raw.ledger_code, 100),
        name: ledgerName,
        nameKey: nameKey(ledgerName),
        phone: text(raw.phone, 40),
        gstin: text(raw.gstin, 20).toUpperCase()
      },
      // Unique within its ledger; the ledger id is put in front when stored
      billRef: entryType === 'BILL'
        ? (billReference || voucherNumber).toLowerCase()
        : `on-account:${(billReference || voucherNumber).toLowerCase()}`,
      entryType,
      voucherNumber,
      voucherType: text(raw.voucher_type, 60),
      billReference,
      voucherDate: voucherDate || null,
      // Tally treats a bill with no credit period as due on the bill date
      dueDate: dueDate || voucherDate || null,
      originalPaise: originalPaise ?? null,
      paidPaise: paidPaise ?? null,
      pendingPaise,
      billStatus,
      narration: text(raw.narration, 500)
    }
  };
};

// The whole request body → { company, sync, records } or { error }
const parseSyncPayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'INVALID_PAYLOAD', 'Request body must be a JSON object');
  }
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });

  const companyIn = body.company || {};
  const syncIn = body.sync || {};

  const company = {
    guid: text(companyIn.tally_company_guid, 100),
    name: text(companyIn.company_name),
    financialYear: text(companyIn.financial_year, 20)
  };
  if (!company.guid) bad('company.tally_company_guid', 'tally_company_guid is required');
  if (!company.name) bad('company.company_name', 'company_name is required');

  const syncType = text(syncIn.sync_type, 20).toUpperCase() || 'FULL';
  if (!['FULL', 'INCREMENTAL'].includes(syncType)) bad('sync.sync_type', 'sync_type must be FULL or INCREMENTAL');

  const syncId = text(syncIn.sync_id, 100);
  if (!syncId) bad('sync.sync_id', 'sync_id is required');

  const asOfDate = parseDay(syncIn.as_of_date);
  if (!asOfDate) bad('sync.as_of_date', 'as_of_date is required, as YYYY-MM-DD');

  const batchNumber = syncIn.batch_number === undefined || syncIn.batch_number === null ? 1 : Number(syncIn.batch_number);
  if (!Number.isInteger(batchNumber) || batchNumber < 1) bad('sync.batch_number', 'batch_number must be a whole number from 1');

  const isLastBatch = syncIn.is_last_batch === undefined || syncIn.is_last_batch === null ? true : syncIn.is_last_batch;
  if (typeof isLastBatch !== 'boolean') bad('sync.is_last_batch', 'is_last_batch must be true or false');

  let totalRecords = null;
  if (syncIn.total_records !== undefined && syncIn.total_records !== null) {
    totalRecords = Number(syncIn.total_records);
    if (!Number.isInteger(totalRecords) || totalRecords < 0) bad('sync.total_records', 'total_records must be a whole number');
  }

  if (!Array.isArray(body.outstandings)) {
    bad('outstandings', 'outstandings must be an array (empty when nothing is pending)');
  } else if (body.outstandings.length > MAX_RECORDS_PER_REQUEST) {
    bad('outstandings', `At most ${MAX_RECORDS_PER_REQUEST} records per request — send the rest as further batches`);
  }

  if (errors.length) return fail(400, 'VALIDATION_FAILED', errors[0].message, errors);

  // A bad record rejects the batch whole: half a ledger's bills is worse than none
  const records = [];
  const seen = new Map();
  for (let i = 0; i < body.outstandings.length; i++) {
    const { record, errors: recordErrors } = parseRecord(body.outstandings[i], i);
    if (recordErrors) {
      errors.push(...recordErrors);
      continue;
    }
    const identity = `${record.ledger.guid || record.ledger.nameKey}|${record.billRef}`;
    if (seen.has(identity)) {
      errors.push({
        index: i,
        field: 'bill_reference',
        message: `Same bill as record ${seen.get(identity)} for this ledger — each bill may be sent once per request`
      });
      continue;
    }
    seen.set(identity, i);
    records.push(record);
  }

  if (errors.length) {
    return fail(
      400,
      'VALIDATION_FAILED',
      `${errors.length} problem(s) in the outstandings — nothing from this request was stored`,
      errors.slice(0, MAX_ERRORS_REPORTED)
    );
  }

  return {
    company,
    sync: { syncId, syncType, asOfDate, batchNumber, isLastBatch, totalRecords },
    records
  };
};

module.exports = { parseSyncPayload, nameKey, parseDay, parsePaise, MAX_RECORDS_PER_REQUEST };
