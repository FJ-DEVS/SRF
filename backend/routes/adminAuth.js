const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

/**
 * Helper function to generate bcrypt hash for a plain text password
 * Use this to generate a hash for your ADMIN_PASSWORD in .env file
 * Example: hashPassword('admin123').then(hash => console.log(hash))
 */
async function hashPassword(plainTextPassword) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(plainTextPassword, saltRounds);
  return hash;
}

/**
 * Helper function to check if a string is already a bcrypt hash
 * Bcrypt hashes start with $2a$, $2b$, or $2y$
 */
function isBcryptHash(str) {
  return typeof str === 'string' && /^\$2[ayb]\$.{56}$/.test(str);
}

// Admin login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Get admin credentials from environment variables
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;

    // Check if environment variables are set
    if (!adminUsername || !adminPassword || !jwtSecret) {
      console.error('Missing required environment variables for admin authentication');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
    }

    // Verify username
    if (username !== adminUsername) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Verify password
    let isPasswordValid = false;
    
    // Check if ADMIN_PASSWORD is already a bcrypt hash
    if (isBcryptHash(adminPassword)) {
      // If it's a hash, use bcrypt.compare
      isPasswordValid = await bcrypt.compare(password, adminPassword);
    } else {
      // If it's plain text, do a direct string comparison
      // Note: For production, use a bcrypt hash in .env file
      // You can generate a hash using: hashPassword('your_password').then(hash => console.log(hash))
      isPasswordValid = password === adminPassword;
    }
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        username: adminUsername, 
        role: 'admin',
        id: 'admin' 
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // Send success response with token
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      token,
      user: {
        username: adminUsername,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Verify token route (optional - for frontend token validation)
router.get('/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: decoded
    });

  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
});

// Export hashPassword function for use in other files or to generate hash for .env
module.exports = router;
module.exports.hashPassword = hashPassword;