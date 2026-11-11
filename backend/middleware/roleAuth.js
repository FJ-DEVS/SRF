const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Salesman = require('../models/Salesman');
const Roller = require('../models/Roller');
const AccountsManager = require('../models/AccountsManager');
const CrmManager = require('../models/CrmManager');
const Customer = require('../models/Customer');

// Roles whose accounts live in the database. Their token is only honoured while
// the account is still there, so deleting a staff member from the admin panel
// kills every session that account has open.
const ACCOUNT_MODELS = {
  salesman: Salesman,
  roller: Roller,
  accounts: AccountsManager,
  crm: CrmManager,
  customer: Customer
};

// A customer record outlives its app logins — the admin can take one away and
// keep the customer — so for them it is the one login that has to be there.
// Tokens from before customers had several logins carry no userId; their
// login was moved into appUsers under the customer's own id (see server.js).
const ACCOUNT_FILTERS = {
  customer: (decoded) => ({ 'appUsers._id': decoded.userId || decoded.id })
};

const isAccountActive = async (decoded) => {
  const Model = ACCOUNT_MODELS[decoded.role];
  if (!Model) return true; // admin credentials live in .env — nothing to look up
  if (!decoded.id) return false;
  const filter = ACCOUNT_FILTERS[decoded.role]?.(decoded) || {};
  const ids = [decoded.id, ...Object.values(filter)];
  if (!ids.every((id) => mongoose.isValidObjectId(id))) return false;
  return Boolean(await Model.exists({ _id: decoded.id, ...filter }));
};

// roleAuth('admin', 'roller') -> middleware allowing either role
const roleAuth = (...allowedRoles) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.'
      });
    }

    if (!(await isAccountActive(decoded))) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_REVOKED',
        message: 'This account no longer exists. Please contact your administrator.'
      });
    }

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

    console.error('Role auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = { roleAuth, isAccountActive };
