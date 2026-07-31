const jwt = require('jsonwebtoken');
const Salesman = require('../models/Salesman');

const salesmanAuthMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is salesman
    if (decoded.role !== 'salesman') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Salesman privileges required.' 
      });
    }

    // A token is only as valid as the account behind it — a salesman deleted by
    // the admin loses access on their very next request, even though the JWT
    // itself has not expired yet.
    const stillExists = await Salesman.exists({ _id: decoded.id });
    if (!stillExists) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_REVOKED',
        message: 'This account no longer exists. Please contact your administrator.'
      });
    }

    // Add user info to request object
    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please login again.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token.' 
      });
    }

    console.error('Salesman auth middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

module.exports = salesmanAuthMiddleware;

