const Settings = require('../models/Settings');

// Roles the restriction applies to. The admin can always place orders.
const RESTRICTED_ROLES = ['salesman', 'customer'];

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const formatInstant = (date, timeZone) =>
  new Date(date).toLocaleString('en-IN', {
    timeZone: isValidTimeZone(timeZone) ? timeZone : 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());

// Where the window stands right now: 'off', 'scheduled', 'active' or 'expired'
const restrictionState = (r, now = new Date()) => {
  if (!r || !r.enabled || !r.from || !r.to) return 'off';
  if (now < r.from) return 'scheduled';
  if (now >= r.to) return 'expired';
  return 'active';
};

const restrictionMessage = (r) => {
  const from = formatInstant(r.from, r.timeZone);
  const to = formatInstant(r.to, r.timeZone);
  const base = `Orders cannot be placed from ${from} to ${to}. Please place your order after this time.`;
  return r.note ? `${base}\n\n${r.note}` : base;
};

// What the apps need to know about the window, shaped for JSON
const describeRestriction = (r, now = new Date()) => {
  const state = restrictionState(r, now);
  return {
    enabled: Boolean(r?.enabled),
    from: r?.from || null,
    to: r?.to || null,
    note: r?.note || '',
    timeZone: r?.timeZone || 'Asia/Kolkata',
    state,
    active: state === 'active',
    message: state === 'off' ? '' : restrictionMessage(r)
  };
};

// The live window for this user, or null when they may order. Only salesmen
// and customers are ever held back.
const activeRestrictionFor = async (user) => {
  if (!RESTRICTED_ROLES.includes(user?.role)) return null;
  const settings = await Settings.getSingleton();
  const r = settings.orderRestriction;
  return restrictionState(r) === 'active' ? describeRestriction(r) : null;
};

module.exports = {
  RESTRICTED_ROLES,
  isValidTimeZone,
  restrictionState,
  describeRestriction,
  activeRestrictionFor
};
