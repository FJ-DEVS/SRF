# Firestore to MongoDB Migration Guide

This document explains how to migrate your Firestore data to MongoDB.

## Overview

The migration script (`migrate.js`) transfers data from Firestore JSON exports to your MongoDB database:

- **Items**: `firestore-export/exports/items.json` → `Item` model
- **Contacts**: `firestore-export/exports/contacts.json` → `Customer` and `Vendor` models
- **Orders**: `firestore-export/exports/orders.json` → `Order` model

## Data Transformations

### Items
- Direct mapping of name, rakNo, price, and quantity
- Items with quantity < 1 are skipped
- Creates a mapping for order item references

### Contacts
- **ContactType.customer** → Customer model
- **ContactType.vendor** → Vendor model
- Preserves phone, name, gstin, isBlocked, and createdAt

### Orders
- **OrderType.purchase** → "purchase order"
- **OrderType.sell** → "sell order"
- **Status Mapping**:
  - OrderStatus.pending → "pending"
  - OrderStatus.completed → "delivered"
  - OrderStatus.toRoll → "to roll"
  - OrderStatus.rolled → "rolled"
  - OrderStatus.billed → "billed"
  - OrderStatus.delivered → "delivered"
- Maps item names to Item ObjectIds
- Maps customer names to Customer ObjectIds
- Sets createdByType to "admin" (default)

## Prerequisites

1. MongoDB should be running
2. `.env` file should contain valid `MONGODB_URI`
3. JSON export files should be in `../firestore-export/exports/` directory

## Running the Migration

### Step 1: Backup (Recommended)

Before running the migration, backup your current MongoDB database:

```bash
# Backup command (adjust connection string as needed)
mongodump --uri="mongodb://localhost:27017/your_database" --out=./backup
```

### Step 2: Run Migration

```bash
cd backend
node migrate.js
```

### Step 3: Review Results

The script will display:
- Progress updates during migration
- Final summary with success/skip/failure counts
- Any errors encountered
- Missing item or customer references

## What to Expect

### Statistics
The script tracks and reports:
- Total records processed
- Successfully migrated records
- Skipped records (duplicates or invalid data)
- Failed records with error details

### Duplicate Handling
- **Items**: Skipped if name + rakNo combination exists
- **Customers**: Skipped if phone number exists
- **Vendors**: Skipped if phone number exists
- **Orders**: Always creates new orders (no duplicate check)

### Data Validation
- Items with quantity < 1 are skipped
- Orders without valid items are skipped
- Orders with missing customer references are created but noted in the report

## Sample Output

```
🚀 Starting Firestore to MongoDB Migration
============================================================

🔌 Connecting to MongoDB...
✓ Connected to MongoDB successfully

=== Starting Items Migration ===
Found 5889 items to migrate
✓ Migrated 100 items...
✓ Migrated 200 items...
...

📊 MIGRATION SUMMARY REPORT
============================================================

📦 ITEMS:
  ✓ Successfully migrated: 5500
  ⚠️  Skipped: 389
  ✗ Failed: 0
  📝 Total processed: 5889

👥 CUSTOMERS:
  ✓ Successfully migrated: 190
  ⚠️  Skipped: 5
  ✗ Failed: 0
  📝 Total processed: 195

🏢 VENDORS:
  ✓ Successfully migrated: 19
  ⚠️  Skipped: 0
  ✗ Failed: 0
  📝 Total processed: 19

📋 ORDERS:
  ✓ Successfully migrated: 54000
  ⚠️  Skipped: 667
  ✗ Failed: 0
  📝 Total processed: 54667

✅ Migration process completed!
```

## Troubleshooting

### Connection Error
**Error**: `MongoDB connection error`
**Solution**: Verify `MONGODB_URI` in `.env` file and ensure MongoDB is running

### Missing Items Error
**Error**: Items not found for orders
**Solution**: Run items migration first, as orders depend on item references

### Duplicate Key Error
**Error**: E11000 duplicate key error
**Solution**: The script already handles duplicates, but if you see this, you may have unique indexes on unexpected fields

### File Not Found
**Error**: `Error reading file`
**Solution**: Verify the JSON files exist at `../firestore-export/exports/`

## Post-Migration Verification

After migration, verify the data:

```bash
# Connect to MongoDB shell
mongosh "mongodb://localhost:27017/your_database"

# Check counts
db.items.countDocuments()
db.customers.countDocuments()
db.vendors.countDocuments()
db.orders.countDocuments()

# Sample some records
db.items.find().limit(5)
db.customers.find().limit(5)
db.orders.find().limit(5)
```

## Rolling Back

If you need to rollback:

```bash
# Clear collections
mongosh "mongodb://localhost:27017/your_database"
db.items.deleteMany({})
db.customers.deleteMany({})
db.vendors.deleteMany({})
db.orders.deleteMany({})

# Or restore from backup
mongorestore --uri="mongodb://localhost:27017/your_database" ./backup
```

## Notes

- The migration can be run multiple times - duplicates will be skipped
- Orders are NOT checked for duplicates, so running multiple times will create duplicate orders
- The script preserves original Firestore IDs in some mappings but MongoDB assigns new ObjectIds
- CreatedAt dates from Firestore are preserved
- All orders are attributed to "admin" as createdByType (salesman references are not preserved from the export)

## Support

If you encounter issues:
1. Check the error logs in the console output
2. Verify your .env configuration
3. Ensure MongoDB is running and accessible
4. Check that JSON files are valid and properly formatted



