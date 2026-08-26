# Firestore to MongoDB Migration Guide

`migrate.js` loads the Firestore JSON exports in `firestore-export/exports/`
into MongoDB:

| Export | Model |
| --- | --- |
| `items.json` | `Item` |
| `contacts.json` | `Customer` and `Vendor`, split on `type` |
| `orders.json` | `Order` |

## Commands

```bash
cd backend

npm run migrate:dry        # report what would happen, write nothing
npm run migrate            # migrate; safe to re-run, never duplicates
npm run migrate:reset      # back up + wipe, then migrate from scratch
npm run find-duplicates    # scan the database for clashing rows
npm run restore-backup     # list snapshots / put one back
```

Extra flag:

```bash
node migrate.js --placeholder-items
```

Twenty item names appear in `orders.json` but not in `items.json`. Off by
default the 36 orders using them are skipped; with this flag those names are
created as stand-in items (price 0, stock 0) and the orders migrate.

## Duplicate handling

The migration keys on the same identities that `utils/duplicateCheck.js`
enforces on the admin screens, so a migrated row and a hand-typed one clash the
same way. All keys are trimmed, whitespace-collapsed and case-insensitive.

| Collection | Identity | Why |
| --- | --- | --- |
| Item | `name` + `category` | Matches the admin duplicate check. `rakNo` is gone from the model — keying on it silently created a duplicate on every run. |
| Customer / Vendor | `name` | **Not phone.** Six numbers in the export are shared by thirty different shops; keying on phone drops 24 real customers. Names are unique in the export. |
| Order | `firestoreId` | The export's own document id. Unique across all 2,833 rows, and now backed by a unique sparse index, so a re-run cannot double-insert. |

`Order.firestoreId` is `unique: true, sparse: true`. Orders created inside the
app carry no `firestoreId`, so the sparse index simply skips them.

Duplicate names found *inside* an export file are reported and the first one is
kept.

## Data transformations

### Items
- `name`, `price`, `quantity` carried over; negatives and non-numbers become 0.
- `rakNo` is **dropped** — the `Item` model no longer has the field and nothing
  in the app reads it.
- `category` is filled in from the item name (`"3008 SHG - 0.8mm"` → `0.8mm`),
  matching the longest category name first so `1.25mm PVC Laminate` wins over
  `1mm`, and `1mm` never matches inside `0.71mm` or `11mm`.
- Items with zero stock are kept — zero means awaiting restock, not invalid.

### Contacts
- `ContactType.customer` → `Customer`, `ContactType.vendor` → `Vendor`.
- `phone`, `name`, `gstin`, `isBlocked`, `createdAt` preserved.
- Four names that only `orders.json` mentions (Fabco Glass House - Alappuzha,
  Sree Kailasam Traders - Kollam, New Luxmat Glass - Mannarkad, Madeena Glass &
  Plywood - Kishattur) are created as customers with a placeholder phone, so
  those 48 orders keep a buyer.

### Orders
- `OrderType.purchase` → `"purchase order"`, `OrderType.sell` → `"sell order"`.
- Status: `pending`→`pending`, `completed`→`delivered`, `toRoll`→`to roll`,
  `rolled`→`rolled`, `billed`→`billed`, `delivered`→`delivered`,
  `cancelled`→`cancelled`.
- `createdAt` is preserved exactly (Mongoose `timestamps` does not overwrite an
  explicitly set value).
- **Creators are linked to real salesman accounts.** The export stores emails
  and the salesman logins are the same string without `.com`
  (`faiz@srf.com` → `faiz@srf`). On a match the order gets
  `createdByType: 'salesman'` and the salesman's `_id`, so the UI shows a name.
  The other emails stay `createdByType: 'admin'` with the raw string.
- **`customerModel` follows the contact's real kind, not the order type.** The
  export contains purchase orders placed against customers and sell orders
  against vendors; because `customerName` uses `refPath`, setting the model from
  the contact keeps every one of them populating correctly.
- Order lines with quantity below 1 are dropped. An order whose item name is not
  in `items.json` is skipped whole (see `--placeholder-items`).

## Backups and rollback

`npm run migrate:reset` writes a snapshot to `backend/backup/<timestamp>/`
*before* deleting anything:

```
backup/2026-08-26T06-10-52-663Z/
  items.json  customers.json  vendors.json  orders.json  placements.json
  preserved.json     # category, check level, payment rating, assigned salesman,
                     # GST certificate, location link — things the export cannot
                     # give back; re-applied by name on the next migrate
  manifest.json
```

`backup/` is gitignored.

Placements are wiped alongside items because every placement points at an item;
leaving them would strand them against ids that no longer exist.

To roll back:

```bash
npm run restore-backup                              # list snapshots
node restore-backup.js <stamp>                      # dry run
node restore-backup.js <stamp> --confirm            # replace the collections
```

The restore reinserts documents with their original `_id`s, so references
between collections line up again. Restart the backend afterwards.

## After migrating

`migrate.js` runs its own verification and prints it. It checks for duplicate
items, duplicate `firestoreId`s, duplicate customer names, orders pointing at
items/contacts/salesmen that do not exist, bad `customerModel` values, and
uncategorised items.

`npm run find-duplicates` scans the whole database separately. It reports
customers and vendors that **share a phone number** — after a clean migration
these are all differently-named businesses that genuinely share one number in
the source data, not migration duplicates. Compare the names before merging
anything.

## Troubleshooting

**`MongoDB connection error`** — check `MONGODB_URI` in `.env`.

**`E11000 duplicate key error` on `firestoreId`** — two orders in the export
share a document id. The export currently has none; if it happens, the second
one is reported and the rest continue (`insertMany` runs unordered).

**`IndexOptionsConflict` on `firestoreId_1`** — an older non-unique index is
still on the collection. `migrate.js` drops and rebuilds it automatically on any
non-dry run.

**`Error reading file`** — the exports must be at
`firestore-export/exports/{items,contacts,orders}.json`.
