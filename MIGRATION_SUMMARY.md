# Migration Summary — Firestore to MongoDB

Record of the clean re-migration run on **26 August 2026** against
`srf-vennala`. Operating instructions live in
[`backend/MIGRATION_README.md`](backend/MIGRATION_README.md).

## Read this before migrating again

**The JSON files in `firestore-export/exports/` are a snapshot, not a live
feed.** The set committed to the repo had gone badly stale — the mobile app had
kept writing to Firestore for months after it was taken:

| | old export | live Firestore |
| --- | --- | --- |
| contacts | 214 | **387** |
| items | 841 | **899** |
| orders | 2,833 | **8,029** |

Item `3011 SHG - 0.8mm` read `quantity: 8` in the file and `19` in Firestore.
The migration was copying the file faithfully; the file was simply old.

Always re-dump before migrating:

```bash
cd firestore-export && node server.js     # ~2 minutes
cd ../backend && node migrate.js --sync   # or --reset for a clean rebuild
```

## What was done

The `items`, `customers`, `vendors`, `orders` and `placements` collections were
backed up, wiped, and rebuilt from a **freshly dumped** Firestore export.

```bash
cd firestore-export && node server.js
cd ../backend && node migrate.js --reset
```

## Result

| Collection | Live Firestore | MongoDB | Note |
| --- | --- | --- | --- |
| items | 899 | **899** | every item, exact price and stock |
| customers | 376 | **383** | 375 from the export (1 duplicate name) + 8 that only orders referenced |
| vendors | 11 | **9** | 2 duplicate names collapsed |
| orders | 8,029 | **7,991** | 38 skipped for referencing unknown items |
| placements | — | **0** | cleared with the items they pointed at |

Untouched: `categories` (9), `raks` (7), `cargos` (8), `salesmen` (5),
`rollers` (2), `schemas` (2).

Orders span **12 May 2025 → 24 Aug 2026**: 7,230 sell / 761 purchase,
6,587 pending / 1,404 delivered, 6,612 by a linked salesman / 1,379 by admin.

## Stock reconciled item by item

Every one of the 899 items was compared against the export:

```
missing in mongo   : 0
extra in mongo     : 0
quantity mismatches: 0
price mismatches   : 0
total stock  firestore 11444  mongo 11444  MATCH
```

## Verification

Run automatically at the end of `migrate.js`:

```
duplicate items (name+category): 0
duplicate orders (firestoreId):  0
duplicate customers (name):      0
orders with a dangling item ref:     0
orders with a dangling contact ref:  0
orders with no contact at all:       0
orders with a dangling salesman ref: 0
orders with a bad customerModel:     0
```

Re-running `node migrate.js --sync` inserts **0** rows and updates **0** rows,
so the migration is idempotent in both modes.

## Bugs fixed in `migrate.js`

The previous script could not be re-run safely. Four defects:

1. **Items deduplicated on `rakNo`**, a field the `Item` model no longer has.
   Mongoose 9 (`strictQuery: false`) passed it straight to MongoDB, where it
   matched nothing — every run inserted a full duplicate set of items.
2. **Contacts deduplicated on phone.** Nine phone numbers in the export are
   shared by different shops, so dozens of real customers were silently
   dropped. Identity is now the **name**, which is unique in the export.
3. **Purchase orders were never linked to a vendor.** Only
   `contact.type === 'customer'` was mapped, and `customerModel` was never set,
   so all 761 purchase orders would have landed with no supplier.
4. **`category` was never written**, leaving it to a separate backfill script.
   It is now derived from the item name during the migration.
5. **Existing rows were never refreshed.** A re-run skipped anything already
   present, so a newer export could not correct a stale price or stock.
   `--sync` now does that.

The list of buyers named only by `orders.json` is also worked out from the
export each run instead of being hard-coded — it grew from 4 to 8 between the
two dumps.

`Order.firestoreId` is now `unique: true, sparse: true`, so the database itself
refuses a double-insert. App-created orders have no `firestoreId` and are
skipped by the sparse index.

## Data facts worth knowing

**Orders linked to salesman accounts — 6,612 of 7,991.** The export stores
creator emails; the salesman logins are the same string minus `.com`
(`faiz@srf.com` → `faiz@srf`). All five accounts match — Faiz, Satheesh, Robin,
Rahul and Sumeer — and those orders get `createdByType: 'salesman'` with the
real `_id`, so the UI shows a name. The remaining 1,379 belong to ten emails
with no account (`rahultvm@skydecor.com` 916, `ibrahimkutty@skydecor.com` 199,
`mujmal@srf.com` 161, `renish@srf.com` 69, and six one-off addresses) and stay
on `admin` with the email string. Create those salesmen and re-run to link them.

**38 orders were not migrated.** They reference 21 item names that do not exist
in `items.json`:

```
10201 SHG - 1mm     0.8mm 1002 SF      10201 SUD - 1mm    10203 SSR - 1mm
10205 SSR - 1mm     10205 SHG - 1mm    1027 HG SDE - 50mtr  10202 SSR - 1mm
40403 SKR - 1mm     10206 SHG - 1mm    1010 HGS - 0.8mm   10204 SHG - 1mm
1022 SDE - 25mtr    10121 SF - 1mm     10123 SF - 1mm     30320 SF - 1mm
115 SDE             SDE 1021 HG - 25mtr  10204 FBT - 1mm  30312 SUD - 1mm
```

To bring them in against stand-in items (price 0, stock 0):

```bash
node migrate.js --placeholder-items
```

**Order type does not always match contact type.** The export has purchase
orders placed against a customer and sell orders against a vendor.
`customerModel` is set from the contact's real kind so `refPath` populates all
of them; the app's own rule (purchase → Vendor) still applies to new orders.

**76 items have no category.** Their size is one the
`categories` collection does not list yet — `0.62mm`, `0.82mm`, `0.92mm`,
`1.2mm`, `0.8x22mm`, `2mm` — plus non-size stock like `1kg Jar - Adhesive`.
Add the missing categories in the admin UI, then:

```bash
node migrate-item-categories.js           # dry run
node migrate-item-categories.js --apply
```

**Three duplicate names inside `contacts.json`**, first kept:
`Factory mismach` / `Factory Mismach`, `Marudhar Laminates - Chennai` twice,
`demo` twice.

**Ten phone-number collisions survive on purpose.** `npm run find-duplicates`
reports 9 customer groups and 1 vendor group sharing a number. Every one is a
set of differently-named businesses that share a number in the source data —
real records, not duplicates. The vendor group (`Skydecor Laminates`,
`Skydecor - Banglore`, `Skydecor`, `Nahar Panel - Coimbatore`) may be worth
merging by hand; that is a business decision, not a migration one.

## Lost in the wipe

App-only fields are captured into `preserved.json` before the wipe and
re-applied by name. These had no matching name in the export and were not
restored:

- **12 customer → salesman assignments.** Nine were on rows a user had
  hand-created because the old phone-based dedup had dropped the real customer
  (`ess ess plywoods-calicut`, `D A modular manufactures`, `matha glass house`,
  and others). Those customers now exist properly under their export names —
  reassign the salesmen in the admin UI.
- **1 GST certificate link** and **1 non-default payment rating**, both on demo
  rows that no longer exist.
- **12 placements** in rak A01. Re-place the stock from the raks screen.

Separately: the `orders` collection was found **empty** before this second run
(2,797 → 0) by something outside the backend — there is no `deleteMany`
anywhere in the API. Nothing was lost, since orders rebuild from the export,
but it is worth knowing something else has write access to the database.

## All orders marked completed

Every one of the 7,991 orders was set to `completed` on 26 Aug 2026:

```
purchase order   completed   761
sell order       completed   7230
```

Done with `node set-order-status.js completed --confirm`, which writes straight
to the collection so no stock was added and no WhatsApp messages went out.
Stock stayed at 11,419 across the change. The previous statuses (6,587 pending
/ 1,404 delivered) are saved in
`backend/backup/order-status-2026-08-26T09-23-53-696Z.json`.

Two consequences of parking sell orders on a purchase-order status:

- **7,230 sell orders are frozen.** `completed` is not part of the sell flow
  (`pending → to roll → rolled → billed → delivered`), so they cannot be
  advanced or reverted from the admin screens.
- **Do not revert a migrated purchase order.** Reverting `completed → pending`
  deducts the order's quantities from stock, but that stock was never added,
  so a revert would take stock the system never credited.

`node migrate.js --all-completed --sync` keeps this state after a future
re-migration.

## Rollback

```bash
cd backend
npm run restore-backup                                        # list snapshots
node restore-backup.js <stamp> --confirm                      # put it back
```

Documents come back with their original `_id`s, so references line up again.
Restart the backend afterwards.
