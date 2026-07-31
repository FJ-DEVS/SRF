const bcrypt = require('bcryptjs');

/**
 * Utility script to generate bcrypt hash for admin password
 * Usage: node generateHash.js <your-password>
 * Example: node generateHash.js admin123
 */

async function generateHash() {
  const password = process.argv[2];
  
  if (!password) {
    console.error('Usage: node generateHash.js <your-password>');
    console.error('Example: node generateHash.js admin123');
    process.exit(1);
  }
  
  try {
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    console.log('\n✅ Hash generated successfully!\n');
    console.log('Copy this hash to your .env file:');
    console.log(`ADMIN_PASSWORD=${hash}\n`);
  } catch (error) {
    console.error('Error generating hash:', error);
    process.exit(1);
  }
}

generateHash();

