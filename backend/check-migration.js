const fs = require('fs');
const path = require('path');

console.log('🔍 Pre-Migration Data Check\n');
console.log('='.repeat(60));

// Helper function to read JSON file
function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
    return null;
  }
}

// Check if file exists
function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✓ ${description}: Found`);
    return true;
  } else {
    console.log(`✗ ${description}: NOT FOUND`);
    return false;
  }
}

// Analyze items data
function analyzeItems(itemsData) {
  console.log('\n📦 ITEMS ANALYSIS:');
  console.log('-'.repeat(60));
  
  const totalItems = itemsData.length;
  const itemsWithZeroQuantity = itemsData.filter(item => item.quantity === 0 || item.quantity < 1).length;
  const itemsWithNegativePrice = itemsData.filter(item => item.price < 0).length;
  const itemsWithoutRakNo = itemsData.filter(item => !item.rakNo || item.rakNo.trim() === '').length;
  const validItems = itemsData.filter(item => item.quantity >= 1 && item.price >= 0).length;
  
  console.log(`  Total items: ${totalItems}`);
  console.log(`  Valid items (quantity ≥ 1, price ≥ 0): ${validItems}`);
  console.log(`  Items with zero/negative quantity: ${itemsWithZeroQuantity}`);
  console.log(`  Items with negative price: ${itemsWithNegativePrice}`);
  console.log(`  Items without rakNo: ${itemsWithoutRakNo}`);
  
  // Sample items
  console.log('\n  Sample items:');
  itemsData.slice(0, 3).forEach((item, index) => {
    console.log(`    ${index + 1}. ${item.name} (Rak: ${item.rakNo}, Price: ${item.price}, Qty: ${item.quantity})`);
  });
}

// Analyze contacts data
function analyzeContacts(contactsData) {
  console.log('\n👥 CONTACTS ANALYSIS:');
  console.log('-'.repeat(60));
  
  const customers = contactsData.filter(c => c.type === 'ContactType.customer');
  const vendors = contactsData.filter(c => c.type === 'ContactType.vendor');
  const blocked = contactsData.filter(c => c.isBlocked === true);
  const withGstin = contactsData.filter(c => c.gstin && c.gstin.trim() !== '').length;
  
  console.log(`  Total contacts: ${contactsData.length}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Vendors: ${vendors.length}`);
  console.log(`  Blocked contacts: ${blocked.length}`);
  console.log(`  Contacts with GSTIN: ${withGstin}`);
  
  // Sample contacts
  console.log('\n  Sample customers:');
  customers.slice(0, 3).forEach((contact, index) => {
    console.log(`    ${index + 1}. ${contact.name} (${contact.phone}) - ${contact.type}`);
  });
  
  if (vendors.length > 0) {
    console.log('\n  Sample vendors:');
    vendors.slice(0, 3).forEach((contact, index) => {
      console.log(`    ${index + 1}. ${contact.name} (${contact.phone}) - ${contact.type}`);
    });
  }
}

// Analyze orders data
function analyzeOrders(ordersData, itemsData, contactsData) {
  console.log('\n📋 ORDERS ANALYSIS:');
  console.log('-'.repeat(60));
  
  const purchaseOrders = ordersData.filter(o => o.type === 'OrderType.purchase');
  const sellOrders = ordersData.filter(o => o.type === 'OrderType.sell');
  const completedOrders = ordersData.filter(o => o.status === 'OrderStatus.completed');
  const pendingOrders = ordersData.filter(o => o.status === 'OrderStatus.pending');
  
  console.log(`  Total orders: ${ordersData.length}`);
  console.log(`  Purchase orders: ${purchaseOrders.length}`);
  console.log(`  Sell orders: ${sellOrders.length}`);
  console.log(`  Completed orders: ${completedOrders.length}`);
  console.log(`  Pending orders: ${pendingOrders.length}`);
  
  // Check for missing items
  const allItemNames = new Set(itemsData.map(item => item.name));
  const allContactNames = new Set(contactsData.map(contact => contact.name));
  
  let ordersWithMissingItems = 0;
  let totalMissingItems = 0;
  let ordersWithMissingCustomers = 0;
  let missingItemNames = new Set();
  let missingCustomerNames = new Set();
  
  ordersData.forEach(order => {
    let orderHasMissingItems = false;
    
    // Check items
    (order.items || []).forEach(item => {
      if (!allItemNames.has(item.itemName)) {
        orderHasMissingItems = true;
        totalMissingItems++;
        missingItemNames.add(item.itemName);
      }
    });
    
    if (orderHasMissingItems) {
      ordersWithMissingItems++;
    }
    
    // Check customer
    if (order.customerName && !allContactNames.has(order.customerName)) {
      ordersWithMissingCustomers++;
      missingCustomerNames.add(order.customerName);
    }
  });
  
  console.log(`\n  ⚠️  Data Integrity Checks:`);
  console.log(`  Orders with missing item references: ${ordersWithMissingItems}`);
  console.log(`  Total missing item references: ${totalMissingItems}`);
  console.log(`  Unique missing item names: ${missingItemNames.size}`);
  console.log(`  Orders with missing customer references: ${ordersWithMissingCustomers}`);
  console.log(`  Unique missing customer names: ${missingCustomerNames.size}`);
  
  if (missingItemNames.size > 0) {
    console.log(`\n  Sample missing items (will cause orders to be skipped):`);
    Array.from(missingItemNames).slice(0, 5).forEach((name, index) => {
      console.log(`    ${index + 1}. ${name}`);
    });
    if (missingItemNames.size > 5) {
      console.log(`    ... and ${missingItemNames.size - 5} more`);
    }
  }
  
  if (missingCustomerNames.size > 0) {
    console.log(`\n  Sample missing customers (orders will be created without customer reference):`);
    Array.from(missingCustomerNames).slice(0, 5).forEach((name, index) => {
      console.log(`    ${index + 1}. ${name}`);
    });
    if (missingCustomerNames.size > 5) {
      console.log(`    ... and ${missingCustomerNames.size - 5} more`);
    }
  }
  
  // Check unique order creators
  const uniqueCreators = new Set(ordersData.map(o => o.createdBy).filter(Boolean));
  console.log(`\n  Unique order creators: ${uniqueCreators.size}`);
  Array.from(uniqueCreators).slice(0, 5).forEach((creator, index) => {
    const count = ordersData.filter(o => o.createdBy === creator).length;
    console.log(`    ${index + 1}. ${creator}: ${count} orders`);
  });
  
  // Sample orders
  console.log('\n  Sample orders:');
  ordersData.slice(0, 2).forEach((order, index) => {
    console.log(`    ${index + 1}. Order ${order._id}`);
    console.log(`       Type: ${order.type}, Status: ${order.status}`);
    console.log(`       Items: ${order.items ? order.items.length : 0}, Customer: ${order.customerName || 'N/A'}`);
  });
}

// Main check function
function runChecks() {
  console.log('\n📁 Checking for JSON files...\n');
  
  const itemsPath = path.join(__dirname, '../firestore-export/exports/items.json');
  const ordersPath = path.join(__dirname, '../firestore-export/exports/orders.json');
  const contactsPath = path.join(__dirname, '../firestore-export/exports/contacts.json');
  
  const itemsExists = checkFileExists(itemsPath, 'Items file');
  const ordersExists = checkFileExists(ordersPath, 'Orders file');
  const contactsExists = checkFileExists(contactsPath, 'Contacts file');
  
  if (!itemsExists || !ordersExists || !contactsExists) {
    console.log('\n❌ Some required files are missing. Please ensure all files exist before migration.');
    process.exit(1);
  }
  
  console.log('\n📖 Reading and parsing JSON files...\n');
  
  const itemsData = readJsonFile(itemsPath);
  const ordersData = readJsonFile(ordersPath);
  const contactsData = readJsonFile(contactsPath);
  
  if (!itemsData || !ordersData || !contactsData) {
    console.log('\n❌ Failed to read one or more JSON files.');
    process.exit(1);
  }
  
  console.log('✓ All files read successfully\n');
  
  // Analyze each dataset
  analyzeItems(itemsData);
  analyzeContacts(contactsData);
  analyzeOrders(ordersData, itemsData, contactsData);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nData ready for migration:`);
  console.log(`  ✓ Items: ${itemsData.length} records`);
  console.log(`  ✓ Customers: ${contactsData.filter(c => c.type === 'ContactType.customer').length} records`);
  console.log(`  ✓ Vendors: ${contactsData.filter(c => c.type === 'ContactType.vendor').length} records`);
  console.log(`  ✓ Orders: ${ordersData.length} records`);
  
  console.log('\n✅ Pre-migration check complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Ensure MongoDB is running');
  console.log('   2. Verify .env file has correct MONGODB_URI');
  console.log('   3. (Optional) Backup your existing database');
  console.log('   4. Run: node migrate.js');
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run the checks
runChecks();



