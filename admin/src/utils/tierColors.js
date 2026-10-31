// Slab colors handed out by rank (lowest slab first) to tiers with none set.
// Matches DEFAULT_TIER_COLORS in the backend's models/Schema.js.
export const DEFAULT_TIER_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F97316',
  '#EF4444', '#EC4899', '#14B8A6', '#6366F1', '#84CC16'
];

export const defaultTierColor = (index) => DEFAULT_TIER_COLORS[index % DEFAULT_TIER_COLORS.length];
