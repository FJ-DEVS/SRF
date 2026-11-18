// Reads a Tally "Bills Receivable" XML export into bills. The export is a flat
// run of siblings under <ENVELOPE>, one group per bill:
//
//   <BILLFIXED>
//     <BILLDATE>27-May-25</BILLDATE>
//     <BILLREF>SKY/31/25-26</BILLREF>
//     <BILLPARTY>Muhammed Kunhi</BILLPARTY>
//   </BILLFIXED>
//   <BILLCL>-18118.00</BILLCL>        closing balance — negative is debit (receivable)
//   <BILLDUE>27-May-25</BILLDUE>
//   <BILLOVERDUE>522</BILLOVERDUE>    days, as of the export — recomputed live here
//
// Tally writes these files as UTF-16 with a byte-order mark.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Bytes → text, honouring a UTF-16 byte-order mark (or a BOM-less UTF-16
// file, recognisable by its zero bytes) and defaulting to UTF-8
const decode = (buffer) => {
  const b = new Uint8Array(buffer);
  let encoding = 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) encoding = 'utf-16le';
  else if (b[0] === 0xfe && b[1] === 0xff) encoding = 'utf-16be';
  else if (b.length > 1 && b[0] !== 0 && b[1] === 0) encoding = 'utf-16le';
  else if (b.length > 1 && b[0] === 0 && b[1] !== 0) encoding = 'utf-16be';
  return new TextDecoder(encoding).decode(buffer);
};

// Tally sprinkles control characters (&#4; and the like) that XML 1.0 forbids
// and the browser's parser refuses outright
const sanitize = (xml) =>
  xml
    .replace(/&#(0*(?:[0-8]|1[124-9]|2\d|3[01]));/g, '')
    .replace(/&#x0*(?:[0-8]|[bcef]|1[0-9a-f]);/gi, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

// "27-May-25" / "27-May-2025" / "2025-05-27" / "20250527" → "2025-05-27", or null
export const parseTallyDay = (value) => {
  const raw = clean(value);
  let year, month, day;
  let m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
  if (m) {
    [year, month, day] = [+m[1], +m[2], +m[3]];
  } else if ((m = /^(\d{1,2})-([a-z]{3})-(\d{2}|\d{4})$/i.exec(raw))) {
    day = +m[1];
    month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
};

const parseAmount = (value) => {
  const raw = clean(value).replace(/,/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const text = (parent, tag) => parent.getElementsByTagName(tag)[0]?.textContent ?? '';

// A File → { bills, problems, summary }. Throws with a readable message when
// the file is not a Tally bills export at all.
export const readTallyBillsXml = async (file) => {
  const xml = sanitize(decode(await file.arrayBuffer()));
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('This file is not valid XML. Export it again from Tally as XML (Data Interchange).');
  }

  // Walk the siblings in order: each BILLFIXED opens a bill, the tags after it
  // belong to it until the next one
  const groups = [];
  let current = null;
  for (const el of Array.from(doc.documentElement.children)) {
    const tag = el.tagName.toUpperCase();
    if (tag === 'BILLFIXED') {
      current = {
        date: text(el, 'BILLDATE'),
        ref: text(el, 'BILLREF'),
        party: text(el, 'BILLPARTY'),
        closing: '',
        due: ''
      };
      groups.push(current);
    } else if (current && tag === 'BILLCL') {
      current.closing = el.textContent;
    } else if (current && tag === 'BILLDUE') {
      current.due = el.textContent;
    }
  }
  if (!groups.length) {
    throw new Error('No bills found. Export "Bills Receivable" (or Outstandings → Receivables) from Tally as XML.');
  }

  const bills = [];
  const problems = [];
  const seen = new Map();

  groups.forEach((g, i) => {
    const row = i + 1;
    const party = clean(g.party);
    const ref = clean(g.ref);
    const billDate = parseTallyDay(g.date);
    const dueRaw = clean(g.due);
    const dueDate = dueRaw ? parseTallyDay(dueRaw) : null;
    const closing = parseAmount(g.closing);

    const issues = [];
    if (!party) issues.push('no party name');
    if (!ref) issues.push('no bill reference');
    if (!billDate) issues.push(`bill date "${clean(g.date)}" is not a date`);
    if (dueRaw && !dueDate) issues.push(`due date "${dueRaw}" is not a date`);
    if (closing === null) issues.push(`amount "${clean(g.closing)}" is not a number`);

    const key = `${party.toLowerCase()}|${ref.toLowerCase()}`;
    if (party && ref && seen.has(key)) issues.push(`same bill reference as row ${seen.get(key)} for this party`);

    if (issues.length) {
      problems.push({ row, party: party || '—', ref: ref || '—', message: issues.join('; ') });
      return;
    }
    seen.set(key, row);

    // Tally exports a debit balance as negative: flip it so money the party
    // owes is positive, as everywhere else here
    const pending = Math.round(-closing * 100) / 100;
    bills.push({ party, ref, billDate, dueDate: dueDate || billDate, pending });
  });

  const parties = new Set(bills.map((b) => b.party.toLowerCase()));
  const dates = bills.map((b) => b.billDate).sort();
  const summary = {
    bills: bills.length,
    parties: parties.size,
    pending: Math.round(bills.reduce((sum, b) => sum + b.pending, 0) * 100) / 100,
    creditBills: bills.filter((b) => b.pending < 0).length,
    settledBills: bills.filter((b) => b.pending === 0).length,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null
  };

  return { bills, problems, summary };
};

// Bills → the body the import endpoint (and the Tally push) takes
export const toImportPayload = (companyName, bills) => ({
  dealer_name: companyName,
  Bills: bills.map((b) => ({
    bill_number: b.ref,
    bill_date: b.billDate,
    due_date: b.dueDate,
    customer_name: b.party,
    pending_amount: b.pending
  }))
});
