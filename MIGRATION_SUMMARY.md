# Migration Summary — Firestore to MongoDB

Record of the clean re-migration run on **26 August 2026** against
`srf-vennala`. Operating instructions live in
[`backend/MIGRATION_README.md`](backend/MIGRATION_README.md).

## What was done

The `items`, `customers`, `vendors`, `orders` and `placements` collections were
backed up, wiped, and rebuilt from the Firestore exports.

```bash
cd backend
node migrate.js --reset
```

## Before and after

| Collection | Before | After | Note |
| --- | --- | --- | --- |
| items | 870 | **841** | every item in `items.json`; 3 demo rows and 26 stray placeholders gone |
| customers | 193 | **208** | 204 from the export + 4 that only orders referenced |
| vendors | 8 | **7** | |
| orders | 50 | **2,797** | the 50 were all test data with no `firestoreId`; 2,797 of 2,833 export rows migrated |
| placements | 12 | **0** | cleared with the items they pointed at |

Untouched: `categories` (9), `raks` (7), `cargos` (8), `salesmen` (5),
`rollers` (2), `schemas` (2).

Snapshot of the previous state: `backend/backup/2026-08-26T06-10-52-663Z/`.

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

Re-running `node migrate.js` inserts **0** rows and leaves every count
unchanged, so the migration is idempotent.

## Bugs fixed in `migrate.js`

The previous script could not be re-run safely. Four defects:

1. **Items deduplicated on `rakNo`**, a field the `Item` model no longer has.
   Mongoose 9 (`strictQuery: false`) passed it straight to MongoDB, where it
   matched nothing — every run inserted a full duplicate set of 841 items.
2. **Contacts deduplicated on phone.** Six phone numbers in the export are
   shared by thirty different shops, so 24 real customers were silently
   dropped. That is why the database held 181 export customers, not 205.
   Identity is now the **name**, which is unique in the export.
3. **Purchase orders were never linked to a vendor.** Only
   `contact.type === 'customer'` was mapped, and `customerModel` was never set,
   so all 380 purchase orders would have landed with no supplier.
4. **`category` was never written**, leaving it to a separate backfill script.
   It is now derived from the item name during the migration.

`Order.firestoreId` is now `unique: true, sparse: true`, so the database itself
refuses a double-insert. App-created orders have no `firestoreId` and are
skipped by the sparse index.

## Data facts worth knowing

**Orders linked to salesman accounts — 2,397 of 2,797.** The export stores
creator emails; the salesman logins are the same string minus `.com`
(`faiz@srf.com` → `faiz@srf`). Matches for Faiz, Robin, Satheesh and Rahul are
linked as `createdByType: 'salesman'`. The remaining 400 orders belong to nine
emails with no account (`rahultvm@skydecor.com`, `mujmal@srf.com`,
`ibrahimkutty@skydecor.com`, `renish@srf.com`, and five one-off addresses) and
stay on `admin` with the email string. Create those salesmen and re-run to link
them.

**36 orders were not migrated.** They reference 20 item names that do not exist
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

**Order type does not always match contact type.** The export has 4 purchase
orders placed against a customer and 8 sell orders against a vendor.
`customerModel` is set from the contact's real kind so `refPath` populates all
of them; the app's own rule (purchase → Vendor) still applies to new orders.

**18 items have no category** (down from 22). Their size is one the
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

**Seven phone-number collisions survive on purpose.** `npm run find-duplicates`
reports 6 customer groups and 1 vendor group sharing a number. Every one is a
set of differently-named businesses that share a number in the source data —
real records, not duplicates. The vendor group (`Skydecor Laminates`,
`Skydecor - Banglore`, `Skydecor`, `Nahar Panel - Coimbatore`) may be worth
merging by hand; that is a business decision, not a migration one.

## Lost in the wipe

App-only fields are captured into `preserved.json` before the wipe and
re-applied by name, but these had no matching name in the export and were not
restored:

- **12 customer → salesman assignments.** Nine of them were on rows a user had
  hand-created because the old phone-based dedup had dropped the real customer
  (`ess ess plywoods-calicut`, `D A modular manufactures`, `matha glass house`,
  and others). Those customers now exist properly under their export names —
  reassign the salesmen in the admin UI.
- **1 GST certificate link** and **1 non-default payment rating** on demo rows.
- **12 placements** in rak A01. Re-place the stock from the raks screen.

## Rollback

```bash
cd backend
npm run restore-backup                                        # list snapshots
node restore-backup.js 2026-08-26T06-10-52-663Z --confirm     # put it back
```

Documents come back with their original `_id`s, so references line up again.
Restart the backend afterwards.
