const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Item = require('./models/Item');
const Order = require('./models/Order');
const Customer = require('./models/Customer');
const Vendor = require('./models/Vendor');

// Statistics tracking
const stats = {
  items: { total: 0, success: 0, failed: 0, skipped: 0 },
  orders: { total: 0, success: 0, failed: 0, skipped: 0 },
  customers: { total: 0, success: 0, failed: 0, skipped: 0 },
  vendors: { total: 0, success: 0, failed: 0, skipped: 0 }
};

const errors = {
  items: [],
  orders: [],
  customers: [],
  vendors: []
};

// Mapping storage
const itemNameToId = new Map();
const contactNameToId = new Map();

// Helper function to read JSON file
function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    throw error;
  }
}

// Helper function to parse Firestore timestamp
function parseFirestoreDate(dateString) {
  if (!dateString) return new Date();
  try {
    return new Date(dateString);
  } catch (error) {
    return new Date();
  }
}

// Migrate Items
async function migrateItems() {
  console.log('\n=== Starting Items Migration ===');
  const itemsPath = path.join(__dirname, '../firestore-export/exports/items.json');
  const itemsData = readJsonFile(itemsPath);
  
  stats.items.total = itemsData.length;
  console.log(`Found ${itemsData.length} items to migrate`);
  
  for (const itemData of itemsData) {
    try {
      // Check if item already exists
      const existingItem = await Item.findOne({ name: itemData.name, rakNo: itemData.rakNo || 'N/A' });
      if (existingItem) {
        console.log(`⚠️  Item "${itemData.name}" already exists, skipping`);
        stats.items.skipped++;
        itemNameToId.set(itemData.name, existingItem._id);
        continue;
      }

      // Skip items with negative prices (quantity 0 is valid - stock pending restock)
      if (itemData.price < 0) {
        console.log(`⚠️  Skipping item "${itemData.name}" (price: ${itemData.price})`);
        stats.items.skipped++;
        continue;
      }

      const item = new Item({
        name: itemData.name,
        rakNo: itemData.rakNo || 'N/A',
        price: itemData.price,
        quantity: Math.max(itemData.quantity, 0),
        createdAt: new Date()
      });

      const savedItem = await item.save();
      itemNameToId.set(itemData.name, savedItem._id);
      stats.items.success++;
      
      if (stats.items.success % 100 === 0) {
        console.log(`✓ Migrated ${stats.items.success} items...`);
      }
    } catch (error) {
      stats.items.failed++;
      errors.items.push({
        item: itemData.name,
        error: error.message
      });
      console.error(`✗ Failed to migrate item "${itemData.name}":`, error.message);
    }
  }
  
  console.log(`\n✓ Items Migration Complete:`);
  console.log(`  Total: ${stats.items.total}`);
  console.log(`  Success: ${stats.items.success}`);
  console.log(`  Skipped: ${stats.items.skipped}`);
  console.log(`  Failed: ${stats.items.failed}`);
}

// Migrate Contacts (Customers and Vendors)
async function migrateContacts() {
  console.log('\n=== Starting Contacts Migration ===');
  const contactsPath = path.join(__dirname, '../firestore-export/exports/contacts.json');
  const contactsData = readJsonFile(contactsPath);
  
  console.log(`Found ${contactsData.length} contacts to migrate`);
  
  for (const contactData of contactsData) {
    try {
      const contactType = contactData.type;
      const contactInfo = {
        phone: contactData.phone,
        name: contactData.name,
        gstin: contactData.gstin || '',
        isBlocked: contactData.isBlocked || false,
        createdAt: parseFirestoreDate(contactData.createdAt)
      };

      if (contactType === 'ContactType.customer') {
        // Check if customer already exists
        const existingCustomer = await Customer.findOne({ phone: contactData.phone });
        if (existingCustomer) {
          console.log(`⚠️  Customer "${contactData.name}" already exists, skipping`);
          stats.customers.skipped++;
          contactNameToId.set(contactData.name, { id: existingCustomer._id, type: 'customer' });
          continue;
        }

        const customer = new Customer(contactInfo);
        const savedCustomer = await customer.save();
        contactNameToId.set(contactData.name, { id: savedCustomer._id, type: 'customer' });
        stats.customers.total++;
        stats.customers.success++;
        
        if (stats.customers.success % 50 === 0) {
          console.log(`✓ Migrated ${stats.customers.success} customers...`);
        }
      } else if (contactType === 'ContactType.vendor') {
        // Check if vendor already exists
        const existingVendor = await Vendor.findOne({ phone: contactData.phone });
        if (existingVendor) {
          console.log(`⚠️  Vendor "${contactData.name}" already exists, skipping`);
          stats.vendors.skipped++;
          contactNameToId.set(contactData.name, { id: existingVendor._id, type: 'vendor' });
          continue;
        }

        const vendor = new Vendor(contactInfo);
        const savedVendor = await vendor.save();
        contactNameToId.set(contactData.name, { id: savedVendor._id, type: 'vendor' });
        stats.vendors.total++;
        stats.vendors.success++;
        
        if (stats.vendors.success % 50 === 0) {
          console.log(`✓ Migrated ${stats.vendors.success} vendors...`);
        }
      } else {
        console.log(`⚠️  Unknown contact type "${contactType}" for "${contactData.name}"`);
      }
    } catch (error) {
      if (contactData.type === 'ContactType.customer') {
        stats.customers.failed++;
        errors.customers.push({
          contact: contactData.name,
          error: error.message
        });
      } else {
        stats.vendors.failed++;
        errors.vendors.push({
          contact: contactData.name,
          error: error.message
        });
      }
      console.error(`✗ Failed to migrate contact "${contactData.name}":`, error.message);
    }
  }
  
  console.log(`\n✓ Contacts Migration Complete:`);
  console.log(`  Customers - Total: ${stats.customers.total}, Success: ${stats.customers.success}, Skipped: ${stats.customers.skipped}, Failed: ${stats.customers.failed}`);
  console.log(`  Vendors - Total: ${stats.vendors.total}, Success: ${stats.vendors.success}, Skipped: ${stats.vendors.skipped}, Failed: ${stats.vendors.failed}`);
}

// Migrate Orders
async function migrateOrders() {
  console.log('\n=== Starting Orders Migration ===');
  const ordersPath = path.join(__dirname, '../firestore-export/exports/orders.json');
  const ordersData = readJsonFile(ordersPath);
  
  stats.orders.total = ordersData.length;
  console.log(`Found ${ordersData.length} orders to migrate`);

  let orphanedOrders = 0;
  let missingItems = 0;

  // Build lookup sets to detect orders already migrated in previous runs.
  // Older records (migrated before firestoreId existed) are matched by a
  // content signature instead.
  const existingOrders = await Order.find({}, 'firestoreId createdAt createdBy type customerName items').lean();
  const existingFirestoreIds = new Set();
  const existingSignatures = new Set();

  const buildSignature = (createdAt, createdBy, type, customerName, items) => {
    const itemsKey = items.map(i => `${i.item}:${i.quantity}`).sort().join(',');
    return [
      new Date(createdAt).toISOString(),
      String(createdBy),
      type,
      customerName ? String(customerName) : '',
      itemsKey
    ].join('|');
  };

  for (const existing of existingOrders) {
    if (existing.firestoreId) {
      existingFirestoreIds.add(existing.firestoreId);
    } else {
      existingSignatures.add(buildSignature(
        existing.createdAt,
        existing.createdBy,
        existing.type,
        existing.customerName,
        existing.items || []
      ));
    }
  }

  // Create placeholder items for names referenced by orders but absent from items.json
  const missingItemNames = new Set();
  for (const orderData of ordersData) {
    for (const item of orderData.items || []) {
      if (!itemNameToId.has(item.itemName)) {
        missingItemNames.add(item.itemName);
      }
    }
  }

  if (missingItemNames.size > 0) {
    console.log(`\n⚠️  Creating ${missingItemNames.size} placeholder item(s) for names referenced by orders but missing from items.json`);
    for (const name of missingItemNames) {
      const existingItem = await Item.findOne({ name, rakNo: 'N/A' });
      if (existingItem) {
        itemNameToId.set(name, existingItem._id);
        continue;
      }
      const placeholder = new Item({
        name,
        rakNo: 'N/A',
        price: 0,
        quantity: 0,
        createdAt: new Date()
      });
      const saved = await placeholder.save();
      itemNameToId.set(name, saved._id);
      stats.items.success++;
      console.log(`  + Created placeholder item "${name}"`);
    }
  }

  for (const orderData of ordersData) {
    try {
      // Skip orders already migrated in a previous run
      if (orderData._id && existingFirestoreIds.has(orderData._id)) {
        console.log(`⚠️  Order ${orderData._id} already exists, skipping`);
        stats.orders.skipped++;
        continue;
      }

      // Map order type
      let orderType;
      if (orderData.type === 'OrderType.purchase') {
        orderType = 'purchase order';
      } else if (orderData.type === 'OrderType.sell') {
        orderType = 'sell order';
      } else {
        console.log(`⚠️  Unknown order type "${orderData.type}" for order ${orderData._id}`);
        stats.orders.skipped++;
        continue;
      }

      // Map order status
      let orderStatus = 'pending';
      if (orderData.status) {
        const statusMap = {
          'OrderStatus.pending': 'pending',
          'OrderStatus.toRoll': 'to roll',
          'OrderStatus.rolled': 'rolled',
          'OrderStatus.billed': 'billed',
          'OrderStatus.delivered': 'delivered',
          'OrderStatus.completed': 'delivered' // Map completed to delivered
        };
        orderStatus = statusMap[orderData.status] || 'pending';
      }

      // Map items
      const mappedItems = [];
      let hasAllItems = true;
      
      for (const item of orderData.items || []) {
        if (item.quantity < 1) {
          console.log(`⚠️  Dropping zero/negative-quantity line "${item.itemName}" from order ${orderData._id}`);
          continue;
        }
        const itemId = itemNameToId.get(item.itemName);
        if (itemId) {
          mappedItems.push({
            item: itemId,
            quantity: item.quantity
          });
        } else {
          console.log(`⚠️  Item "${item.itemName}" not found in database for order ${orderData._id}`);
          hasAllItems = false;
          missingItems++;
        }
      }

      if (!hasAllItems || mappedItems.length === 0) {
        console.log(`⚠️  Skipping order ${orderData._id} due to missing items`);
        stats.orders.skipped++;
        continue;
      }

      // Map customer/vendor
      let customerRef = null;
      if (orderData.customerName) {
        const contact = contactNameToId.get(orderData.customerName);
        if (contact && contact.type === 'customer') {
          customerRef = contact.id;
        } else if (!contact) {
          console.log(`⚠️  Customer/Vendor "${orderData.customerName}" not found for order ${orderData._id}`);
          orphanedOrders++;
          // We'll still create the order but without customer reference
        }
      }

      const createdAt = parseFirestoreDate(orderData.createdAt);
      const createdBy = orderData.createdBy || 'admin';

      // Skip orders migrated before firestoreId tracking existed, matched by content
      const signature = buildSignature(createdAt, createdBy, orderType, customerRef, mappedItems);
      if (existingSignatures.has(signature)) {
        console.log(`⚠️  Order ${orderData._id} matches an already-migrated order, skipping`);
        stats.orders.skipped++;
        continue;
      }

      // Create order
      const order = new Order({
        firestoreId: orderData._id,
        createdAt,
        createdBy,
        createdByType: 'admin', // Default to admin since we don't have salesman references
        type: orderType,
        items: mappedItems,
        customerName: customerRef,
        status: orderStatus
      });

      await order.save();
      existingFirestoreIds.add(orderData._id);
      existingSignatures.add(signature);
      stats.orders.success++;

      if (stats.orders.success % 100 === 0) {
        console.log(`✓ Migrated ${stats.orders.success} orders...`);
      }
    } catch (error) {
      stats.orders.failed++;
      errors.orders.push({
        order: orderData._id,
        error: error.message
      });
      console.error(`✗ Failed to migrate order "${orderData._id}":`, error.message);
    }
  }
  
  console.log(`\n✓ Orders Migration Complete:`);
  console.log(`  Total: ${stats.orders.total}`);
  console.log(`  Success: ${stats.orders.success}`);
  console.log(`  Skipped: ${stats.orders.skipped}`);
  console.log(`  Failed: ${stats.orders.failed}`);
  console.log(`  Orders with missing customer/vendor references: ${orphanedOrders}`);
  console.log(`  Total missing item references: ${missingItems}`);
}

// Generate detailed report
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY REPORT');
  console.log('='.repeat(60));
  
  console.log('\n📦 ITEMS:');
  console.log(`  ✓ Successfully migrated: ${stats.items.success}`);
  console.log(`  ⚠️  Skipped: ${stats.items.skipped}`);
  console.log(`  ✗ Failed: ${stats.items.failed}`);
  console.log(`  📝 Total processed: ${stats.items.total}`);
  
  console.log('\n👥 CUSTOMERS:');
  console.log(`  ✓ Successfully migrated: ${stats.customers.success}`);
  console.log(`  ⚠️  Skipped: ${stats.customers.skipped}`);
  console.log(`  ✗ Failed: ${stats.customers.failed}`);
  console.log(`  📝 Total processed: ${stats.customers.total}`);
  
  console.log('\n🏢 VENDORS:');
  console.log(`  ✓ Successfully migrated: ${stats.vendors.success}`);
  console.log(`  ⚠️  Skipped: ${stats.vendors.skipped}`);
  console.log(`  ✗ Failed: ${stats.vendors.failed}`);
  console.log(`  📝 Total processed: ${stats.vendors.total}`);
  
  console.log('\n📋 ORDERS:');
  console.log(`  ✓ Successfully migrated: ${stats.orders.success}`);
  console.log(`  ⚠️  Skipped: ${stats.orders.skipped}`);
  console.log(`  ✗ Failed: ${stats.orders.failed}`);
  console.log(`  📝 Total processed: ${stats.orders.total}`);
  
  console.log('\n' + '='.repeat(60));
  
  // Log errors if any
  if (errors.items.length > 0 || errors.orders.length > 0 || 
      errors.customers.length > 0 || errors.vendors.length > 0) {
    console.log('\n⚠️  ERRORS ENCOUNTERED:');
    
    if (errors.items.length > 0) {
      console.log(`\nItems (${errors.items.length} errors):`);
      errors.items.slice(0, 10).forEach(err => {
        console.log(`  - ${err.item}: ${err.error}`);
      });
      if (errors.items.length > 10) {
        console.log(`  ... and ${errors.items.length - 10} more`);
      }
    }
    
    if (errors.customers.length > 0) {
      console.log(`\nCustomers (${errors.customers.length} errors):`);
      errors.customers.slice(0, 10).forEach(err => {
        console.log(`  - ${err.contact}: ${err.error}`);
      });
      if (errors.customers.length > 10) {
        console.log(`  ... and ${errors.customers.length - 10} more`);
      }
    }
    
    if (errors.vendors.length > 0) {
      console.log(`\nVendors (${errors.vendors.length} errors):`);
      errors.vendors.slice(0, 10).forEach(err => {
        console.log(`  - ${err.contact}: ${err.error}`);
      });
      if (errors.vendors.length > 10) {
        console.log(`  ... and ${errors.vendors.length - 10} more`);
      }
    }
    
    if (errors.orders.length > 0) {
      console.log(`\nOrders (${errors.orders.length} errors):`);
      errors.orders.slice(0, 10).forEach(err => {
        console.log(`  - ${err.order}: ${err.error}`);
      });
      if (errors.orders.length > 10) {
        console.log(`  ... and ${errors.orders.length - 10} more`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration process completed!');
  console.log('='.repeat(60) + '\n');
}

// Main migration function
async function runMigration() {
  try {
    console.log('🚀 Starting Firestore to MongoDB Migration');
    console.log('='.repeat(60));
    
    // Connect to MongoDB
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB successfully');
    
    // Run migrations in order
    await migrateItems();
    await migrateContacts();
    await migrateOrders();
    
    // Generate final report
    generateReport();
    
    // Close connection
    console.log('\n🔌 Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('✓ Connection closed');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed with error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run the migration
runMigration();



