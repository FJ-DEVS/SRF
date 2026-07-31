/**
 * Format a raw order status (e.g. "cancellation_requested") into a readable label
 * (e.g. "Cancellation Requested").
 * @param {string} status - The raw order status
 * @returns {string} Human-readable status label
 */
export const formatStatus = (status) => {
  if (!status) return '-';
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Generate text representation of order details for sharing
 * @param {Object} order - The order object to format
 * @returns {string} Formatted order details as text
 */
export const generateOrderText = (order) => {
  const orderType = order.type === 'sell order' ? 'Sell Order' : 'Purchase Order';
  const customerLabel = order.type === 'sell order' ? 'Customer' : 'Vendor';
  const customerName = order.customerName?.name || '-';
  const date = new Date(order.createdAt).toLocaleDateString();
  const status = formatStatus(order.status);
  const cargoName = order.cargo?.name || 'No Cargo Assigned';
  const createdBy = order.createdByType === 'admin' 
    ? 'Admin' 
    : (order.createdBy?.name || '-');
  
  const itemsList = order.items
    .map(item => `  • ${item.item?.name || 'Unknown'} - Qty: ${item.quantity}`)
    .join('\n');

  return `
SRF Trades - Order Details
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type: ${orderType}
${customerLabel}: ${customerName}
Date: ${date}
Order by: ${createdBy}
Status: ${status}
Cargo: ${cargoName}

Items:
${itemsList}

Order ID: ${order._id}
  `.trim();
};

const MODERN_COLOR_FN = /\b(oklch|oklab|lch|lab|color-mix|color)\(/;

const COLOR_PROPERTIES = [
  ['color', 'color'],
  ['backgroundColor', 'background-color'],
  ['borderTopColor', 'border-top-color'],
  ['borderRightColor', 'border-right-color'],
  ['borderBottomColor', 'border-bottom-color'],
  ['borderLeftColor', 'border-left-color'],
  ['outlineColor', 'outline-color'],
  ['textDecorationColor', 'text-decoration-color'],
];

// Some browsers echo the oklch()/lab()/etc string back unchanged from the fillStyle
// getter instead of normalizing it, so round-tripping through fillStyle alone isn't
// reliable. Rasterize a single pixel and read back its true rgba bytes instead.
let sharedCanvasCtx = null;
const toRgbString = (colorValue) => {
  if (!sharedCanvasCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    sharedCanvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  sharedCanvasCtx.clearRect(0, 0, 1, 1);
  sharedCanvasCtx.fillStyle = colorValue;
  sharedCanvasCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = sharedCanvasCtx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
};

/**
 * html2canvas can't parse modern CSS color functions (oklch, oklab, lch, color-mix, etc.),
 * which Tailwind v4 emits by default, and throws "unsupported color function" during capture.
 * Walk the cloned element tree and inline the resolved colors as rgb so html2canvas can read them.
 * Intended for use in html2canvas's `onclone` callback, before it renders the clone.
 * @param {HTMLElement} rootEl - Root of the cloned subtree being captured
 */
export const convertModernColorsToRgb = (rootEl) => {
  const elements = [rootEl, ...rootEl.querySelectorAll('*')];
  elements.forEach((el) => {
    const computed = window.getComputedStyle(el);
    COLOR_PROPERTIES.forEach(([camelProp, cssProp]) => {
      const value = computed[camelProp];
      if (value && MODERN_COLOR_FN.test(value)) {
        try {
          el.style.setProperty(cssProp, toRgbString(value), 'important');
        } catch {
          // leave original value if conversion fails
        }
      }
    });
  });
};
