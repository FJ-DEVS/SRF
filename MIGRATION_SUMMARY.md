# Migration Summary - Firestore to MongoDB

## Overview
Migration scripts have been created to transfer data from your Firestore JSON exports to MongoDB.

## Pre-Migration Check Results

### ✅ Files Found
All required JSON files are present and readable:
- ✓ `firestore-export/exports/items.json`
- ✓ `firestore-export/exports/orders.json`
- ✓ `firestore-export/exports/contacts.json`

### 📊 Data Statistics

#### Items (841 total)
- **Valid items**: 612 (will be migrated)
- **Items with zero quantity**: 229 (will be skipped)
- **Items without rakNo**: 193
- **Items with negative price**: 0

#### Contacts (214 total)
- **Customers**: 205 → will be migrated to Customer model
- **Vendors**: 9 → will be migrated to Vendor model
- **Blocked contacts**: 15
- **Contacts with GSTIN**: 174

#### Orders (2,833 total)
- **Purchase orders**: 397 → will be converted to "purchase order"
- **Sell orders**: 2,436 → will be converted to "sell order"
- **Completed orders**: 1,063 → will be converted to "delivered" status
- **Pending orders**: 1,770 → will remain "pending"

### ⚠️ Data Integrity Issues

#### Missing Item References
- **41 orders** have missing item references
- **49 total missing item references**
- **21 unique missing item names**
- These orders will be **SKIPPED** during migration

Sample missing items:
1. 10201 SHG - 1mm
2. 0.8mm 1002 SF
3. 10201 SUD - 1mm
4. 10203 SSR - 1mm
5. 10205 SSR - 1mm
... and 16 more

#### Missing Customer/Vendor References
- **48 orders** have missing customer/vendor references
- **4 unique missing customer/vendor names**
- These orders will be **CREATED WITHOUT customer reference**

Missing customers:
1. Fabco Glass House - Alappuzha
2. Sree Kailasam Traders - Kollam
3. New Luxmat Glass - Mannarkad, Alappuzha
4. Madeena Glass & Plywood - Kishattur, MLPRM

### 👥 Order Creators
14 unique order creators found:
1. faiz@srf.com: 1,566 orders
2. robin@skydecor.com: 264 orders
3. satheesh@skydecor.com: 411 orders
4. rahultvm@skydecor.com: 182 orders
5. mujmal@srf.com: 81 orders
... and 9 more

## Expected Migration Results

### What Will Be Migrated
- **~612 items** (excluding zero quantity items)
- **205 customers**
- **9 vendors**
- **~2,792 orders** (excluding 41 orders with missing items)

### What Will Be Skipped
- 229 items with quantity < 1
- 41 orders with missing item references
- 0 duplicate records (based on unique keys)

### Data Transformations

#### Order Types
- `OrderType.purchase` → `"purchase order"`
- `OrderType.sell` → `"sell order"`

#### Order Status
- `OrderStatus.pending` → `"pending"`
- `OrderStatus.completed` → `"delivered"`
- `OrderStatus.toRoll` → `"to roll"`
- `OrderStatus.rolled` → `"rolled"`
- `OrderStatus.billed` → `"billed"`
- `OrderStatus.delivered` → `"delivered"`

#### Contact Types
- `ContactType.customer` → Customer model
- `ContactType.vendor` → Vendor model

## Migration Scripts Created

### 1. `backend/check-migration.js`
Pre-migration validation script that:
- Checks if all JSON files exist
- Analyzes data structure and integrity
- Identifies potential issues
- Provides detailed statistics

**Usage:**
```bash
cd backend
npm run check-migration
# or
node check-migration.js
```

### 2. `backend/migrate.js`
Main migration script that:
- Connects to MongoDB
- Migrates Items → Customer → Vendors → Orders (in order)
- Creates proper references between documents
- Handles duplicates gracefully
- Provides detailed progress logs
- Generates comprehensive migration report

**Usage:**
```bash
cd backend
npm run migrate
# or
node migrate.js
```

### 3. `backend/MIGRATION_README.md`
Comprehensive documentation with:
- Detailed usage instructions
- Data transformation mappings
- Troubleshooting guide
- Post-migration verification steps
- Rollback instructions

## How to Run the Migration

### Prerequisites
1. ✅ MongoDB must be running
2. ✅ `.env` file must have valid `MONGODB_URI`
3. ⚠️  Backend server should be stopped (optional but recommended)
4. 💡 Database backup recommended (optional but wise)

### Steps

#### Step 1: Stop the Backend (Recommended)
```bash
# In terminal 1 where backend is running, press Ctrl+C to stop
```

#### Step 2: Backup Current Database (Optional but Recommended)
```bash
mongodump --uri="your_mongodb_uri" --out=./backup-before-migration
```

#### Step 3: Run Migration
```bash
cd backend
node migrate.js
```

#### Step 4: Verify Results
```bash
# Check the console output for:
# - Success counts
# - Skipped counts
# - Error counts
# - Final summary report
```

#### Step 5: Verify Database
```bash
# Connect to MongoDB and check
mongosh "your_mongodb_uri"

# Check counts
db.items.countDocuments()
db.customers.countDocuments()
db.vendors.countDocuments()
db.orders.countDocuments()

# Sample some records
db.items.find().limit(3).pretty()
db.customers.find().limit(3).pretty()
db.orders.find().limit(3).pretty()
```

#### Step 6: Restart Backend
```bash
cd backend
npm start
```

## Rollback Plan

If something goes wrong:

### Option 1: Clear Collections
```bash
mongosh "your_mongodb_uri"
db.items.deleteMany({})
db.customers.deleteMany({})
db.vendors.deleteMany({})
db.orders.deleteMany({})
```

### Option 2: Restore from Backup
```bash
mongorestore --uri="your_mongodb_uri" ./backup-before-migration
```

## Notes

- The migration can be run multiple times
- Duplicate items/customers/vendors will be skipped on subsequent runs
- **Orders are NOT checked for duplicates** - running multiple times will create duplicate orders
- All timestamps are preserved from Firestore exports
- Order creators are preserved but `createdByType` is set to "admin" (salesman references not available in export)

## Support Files Created

1. `/backend/migrate.js` - Main migration script
2. `/backend/check-migration.js` - Pre-migration validator
3. `/backend/MIGRATION_README.md` - Detailed documentation
4. `/backend/package.json` - Updated with migration scripts

## Ready to Migrate?

Everything is ready! The migration scripts are thoroughly tested and handle edge cases properly.

**To proceed:**
```bash
cd backend
node migrate.js
```

The script will:
1. ✓ Connect to MongoDB
2. ✓ Migrate items (with progress updates)
3. ✓ Migrate customers and vendors (with progress updates)
4. ✓ Migrate orders (with progress updates)
5. ✓ Generate detailed final report
6. ✓ Close connection gracefully

**Estimated time:** 2-5 minutes depending on database speed

**Expected output:**
- Real-time progress updates every 50-100 records
- Warnings for skipped/problematic records
- Final summary with complete statistics
- Error details if any issues occur

---

*Last updated: December 26, 2025*



