// Helpers for reaching a customer from the CRM screens.

// Two-letter avatar text for a name, "?" when there is nothing to use
export const initials = (name = '') =>
  name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// tel: link for a phone number, or null when there is nothing worth dialling.
// All-zero numbers are the placeholder typed in when the real one is unknown.
export const callHref = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`;
};

// wa.me link that opens a chat with the number, message typed in. wa.me wants
// the full international number, so a bare 10-digit (or 0-prefixed) Indian
// mobile gets 91 in front. Null when there is no real number.
export const whatsappHref = (phone, text = '') => {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
