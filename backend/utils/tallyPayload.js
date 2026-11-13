// Reads and checks the JSON the Tally side posts to the outstandings sync.
// Pure — nothing here touches the database — so the contract can be tested on
// its own. The shape is the one the Tally team fixed, documented in
// TALLY_API.md:
//
//   { api_key, dealer_name, Bills: [{ bill_number, bill_date, customer_name,
//                                     pending_amount, closing_amount }] }
//
// Every request is the dealer's complete outstanding list — it replaces what
// was held before.

const MAX_RECORDS_PER_REQUEST = 50000;
const MAX_ERRORS_REPORTED = 50;

const text = (value, max = 200) =>
  value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim().slice(0, max);

// What two spellings of one name share: case, punctuation and spacing
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

// One entry of Bills → the row to store, or the field errors it has
const parseRecord = (raw, index) => {
  const errors = [];
  const bad = (field, message) => errors.push({ index, field, message });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    bad('', 'Each bill must be an object');
    return { errors };
  }

  const customerName = text(raw.customer_name);
  if (!customerName) bad('customer_name', 'customer_name is required');

  const billNumber = text(raw.bill_number, 100);
  if (!billNumber) bad('bill_number', 'bill_number is required');

  const billDate = parseDay(raw.bill_date);
  if (billDate === undefined) bad('bill_date', 'bill_date is required');
  if (billDate === null) bad('bill_date', 'bill_date must be YYYY-MM-DD');

  const pendingPaise = parsePaise(raw.pending_amount);
  if (pendingPaise === undefined) bad('pending_amount', 'pending_amount is required');
  if (pendingPaise === null) bad('pending_amount', 'pending_amount must be a number');

  const closingPaise = parsePaise(raw.closing_amount);
  if (closingPaise === null) bad('closing_amount', 'closing_amount must be a number');

  if (errors.length) return { errors };

  return {
    record: {
      // The customer's Tally ledger. The Tally side sends only its name, so
      // the name is its identity.
      ledger: {
        guid: '',
        code: '',
        name: customerName,
        nameKey: nameKey(customerName),
        phone: '',
        gstin: '',
        closingPaise: closingPaise ?? null
      },
      // Unique within its customer; the ledger id is put in front when stored
      billRef: billNumber.toLowerCase(),
      entryType: 'BILL',
      voucherNumber: '',
      voucherType: '',
      billReference: billNumber,
      voucherDate: billDate,
      // No credit period is sent, and Tally then treats a bill as due on its date
      dueDate: billDate,
      originalPaise: null,
      paidPaise: null,
      pendingPaise,
      closingPaise: closingPaise ?? null,
      billStatus: 'PENDING',
      narration: ''
    }
  };
};

// The whole request body → { dealer, records } or { error }
const parseSyncPayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail(400, 'INVALID_PAYLOAD', 'Request body must be a JSON object');
  }
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });

  const dealerName = text(body.dealer_name);
  if (!dealerName) bad('dealer_name', 'dealer_name is required');

  const bills = body.Bills !== undefined ? body.Bills : body.bills;
  if (!Array.isArray(bills)) {
    bad('Bills', 'Bills must be an array (empty when nothing is pending)');
  } else if (bills.length > MAX_RECORDS_PER_REQUEST) {
    bad('Bills', `At most ${MAX_RECORDS_PER_REQUEST} bills per request`);
  }

  if (errors.length) return fail(400, 'VALIDATION_FAILED', errors[0].message, errors);

  // A bad bill rejects the request whole: half a customer's bills is worse than none
  const records = [];
  const seen = new Map();
  for (let i = 0; i < bills.length; i++) {
    const { record, errors: recordErrors } = parseRecord(bills[i], i);
    if (recordErrors) {
      errors.push(...recordErrors);
      continue;
    }
    const identity = `${record.ledger.nameKey}|${record.billRef}`;
    if (seen.has(identity)) {
      errors.push({
        index: i,
        field: 'bill_number',
        message: `Same bill_number as Bills[${seen.get(identity)}] for this customer — each bill may be sent once per request`
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
      `${errors.length} problem(s) in Bills — nothing from this request was stored`,
      errors.slice(0, MAX_ERRORS_REPORTED)
    );
  }

  return {
    // The dealer stands in for the Tally company; its flattened name is the key
    dealer: { key: nameKey(dealerName), name: dealerName },
    records
  };
};

module.exports = { parseSyncPayload, nameKey, parseDay, parsePaise, MAX_RECORDS_PER_REQUEST };
