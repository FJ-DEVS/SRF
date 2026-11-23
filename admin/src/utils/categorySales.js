// Shared by the dashboard's Category Sales chart and the category page

// Items with no category travel as this id — '' is the "nothing picked"
// value of a <select>
export const NO_CATEGORY_ID = '__none__';
export const categoryId = (name) => name || NO_CATEGORY_ID;
export const categoryName = (id) => (id === NO_CATEGORY_ID ? '' : id);
export const categoryLabel = (name) => name || 'Uncategorised';

// How far back the charts reach; the server accepts the same choices
export const RANGE_LABELS = { 3: '3 months', 6: '6 months', 12: '12 months', 24: '24 months' };
