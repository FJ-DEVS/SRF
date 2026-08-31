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

const MODERN_COLOR_FN_SOURCE = '(?:oklch|oklab|lch|lab|color-mix|color)\\(';
const MODERN_COLOR_FN = new RegExp(MODERN_COLOR_FN_SOURCE, 'i');
const MODERN_COLOR_FN_SCAN = new RegExp(MODERN_COLOR_FN_SOURCE, 'gi');

// Plain colour properties: the whole value is one colour.
// The third entry is what to fall back to when the colour can't be resolved at
// all — anything left holding a modern colour function makes html2canvas throw.
const COLOR_PROPERTIES = [
  ['color', 'color', 'rgb(0, 0, 0)'],
  ['webkitTextFillColor', '-webkit-text-fill-color', 'rgb(0, 0, 0)'],
  ['backgroundColor', 'background-color', 'transparent'],
  ['borderTopColor', 'border-top-color', 'transparent'],
  ['borderRightColor', 'border-right-color', 'transparent'],
  ['borderBottomColor', 'border-bottom-color', 'transparent'],
  ['borderLeftColor', 'border-left-color', 'transparent'],
  ['outlineColor', 'outline-color', 'transparent'],
  ['textDecorationColor', 'text-decoration-color', 'transparent'],
  ['columnRuleColor', 'column-rule-color', 'transparent'],
  ['caretColor', 'caret-color', 'transparent'],
  ['fill', 'fill', 'transparent'],
  ['stroke', 'stroke', 'transparent'],
];

// Composite properties: colours sit inside a longer value, alongside offsets,
// gradient stops and so on, so each colour has to be swapped out in place.
// Tailwind v4 builds both `shadow-*` and `ring-*` out of box-shadow, and its
// `/opacity` modifiers expand to color-mix(in oklab, ...) — which is exactly
// what mobile browsers hand back unresolved.
const COMPOSITE_PROPERTIES = [
  ['boxShadow', 'box-shadow', 'none'],
  ['backgroundImage', 'background-image', 'none'],
  ['textShadow', 'text-shadow', 'none'],
];

// Index of the ')' matching the '(' at openIndex, or -1 if unbalanced.
// Colour functions nest — color-mix(in oklab, oklch(...) 50%, transparent) —
// so a plain search for the next ')' would cut the value in the wrong place.
const findClosingParen = (value, openIndex) => {
  let depth = 0;
  for (let i = openIndex; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

// Some browsers echo the oklch()/lab()/etc string back unchanged from the fillStyle
// getter instead of normalizing it, so round-tripping through fillStyle alone isn't
// reliable. Rasterize a single pixel and read back its true rgba bytes instead.
let sharedCanvasCtx = null;
const SENTINEL = '#010203';

const toRgbString = (colorValue) => {
  if (!sharedCanvasCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    sharedCanvasCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  // An assignment the canvas colour parser rejects is silently ignored, leaving
  // the previous fillStyle in place. Park a sentinel there first so we can tell
  // "browser can't parse this" apart from a successful conversion.
  sharedCanvasCtx.fillStyle = SENTINEL;
  sharedCanvasCtx.fillStyle = colorValue;
  if (sharedCanvasCtx.fillStyle === SENTINEL) return null;

  sharedCanvasCtx.clearRect(0, 0, 1, 1);
  sharedCanvasCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = sharedCanvasCtx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
};

// Canvas support for color-mix() arrived later than CSS support for it, so on
// the browsers this whole helper exists for, the canvas route above can fail on
// precisely the values Tailwind emits most. Every `/opacity` modifier has the
// same shape — one colour faded towards transparent — which is just an alpha,
// so resolve the base colour alone and apply the percentage ourselves.
const OPACITY_MIX = /^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i;

const approximateOpacityMix = (colorValue) => {
  const match = colorValue.match(OPACITY_MIX);
  if (!match) return null;

  const base = toRgbString(match[1].trim());
  if (!base) return null;

  const parts = base.match(/[\d.]+/g);
  if (!parts) return null;

  const [r, g, b, baseAlpha = '1'] = parts;
  const alpha = (Number(baseAlpha) * Number(match[2])) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
};

const resolveColor = (colorValue) =>
  toRgbString(colorValue) ?? approximateOpacityMix(colorValue);

/**
 * Replace every modern colour function inside a value with its rgb equivalent,
 * leaving the rest of the value (offsets, gradient stops, keywords) untouched.
 * @param {string} value - A CSS declaration value
 * @returns {string|null} The rewritten value, or null if any colour in it could
 *   not be resolved — in which case the caller must drop the declaration rather
 *   than hand html2canvas something it will throw on.
 */
const convertColorFunctions = (value) => {
  let out = '';
  let cursor = 0;

  for (;;) {
    MODERN_COLOR_FN_SCAN.lastIndex = cursor;
    const match = MODERN_COLOR_FN_SCAN.exec(value);
    if (!match) break;

    const closing = findClosingParen(value, match.index + match[0].length - 1);
    if (closing === -1) return null;

    const resolved = resolveColor(value.slice(match.index, closing + 1));
    if (!resolved) return null;

    out += value.slice(cursor, match.index) + resolved;
    cursor = closing + 1;
  }

  return out + value.slice(cursor);
};

/**
 * html2canvas can't parse modern CSS color functions (oklch, oklab, lch, color-mix, etc.),
 * which Tailwind v4 emits by default, and throws "unsupported color function" during capture.
 * Desktop Chrome resolves most of them to rgb() in computed styles so the problem stays
 * hidden there; mobile browsers hand them back as written, which is where capture fails.
 * Walk the cloned element tree and inline the resolved colors as rgb so html2canvas can read them.
 * Intended for use in html2canvas's `onclone` callback, before it renders the clone.
 * @param {HTMLElement} rootEl - Root of the cloned subtree being captured
 */
export const convertModernColorsToRgb = (rootEl) => {
  const elements = [rootEl, ...rootEl.querySelectorAll('*')];

  elements.forEach((el) => {
    const computed = window.getComputedStyle(el);

    [...COLOR_PROPERTIES, ...COMPOSITE_PROPERTIES].forEach(([camelProp, cssProp, fallback]) => {
      const value = computed[camelProp];
      if (!value || !MODERN_COLOR_FN.test(value)) return;

      try {
        el.style.setProperty(cssProp, convertColorFunctions(value) ?? fallback, 'important');
      } catch {
        // Dropping the declaration still beats leaving a value that throws
        try {
          el.style.setProperty(cssProp, fallback, 'important');
        } catch {
          // nothing else to try
        }
      }
    });
  });
};
