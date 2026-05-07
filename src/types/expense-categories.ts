/**
 * Display metadata for each expense category.
 * Consumed by the pie-chart legend, expense form dropdown, and item rows.
 *
 * `colorVar` references CSS custom properties defined in src/index.css
 * so the same hex appears in both Tailwind classes (`bg-cat-housing`)
 * and inline chart fills via `var(--cat-housing)`.
 */
import type { ExpenseCategory } from './index';

export interface CategoryMeta {
  /** Thai-first display label (UXUI.md Pie Chart legend). */
  label: string;
  /** Single emoji used as visual prefix in lists. */
  icon: string;
  /** Tailwind utility (e.g. "bg-cat-housing"). */
  tailwindClass: string;
  /** CSS custom property name (e.g. "--cat-housing"). */
  colorVar: string;
  /** Resolved hex — handy for Recharts `fill={...}` props. */
  hex: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, CategoryMeta> = {
  housing: {
    label: 'ที่อยู่อาศัย',
    icon: '🏠',
    tailwindClass: 'bg-cat-housing',
    colorVar: '--cat-housing',
    hex: '#6366F1',
  },
  vehicle: {
    label: 'ยานพาหนะ',
    icon: '🚗',
    tailwindClass: 'bg-cat-vehicle',
    colorVar: '--cat-vehicle',
    hex: '#8B5CF6',
  },
  utilities: {
    label: 'สาธารณูปโภค',
    icon: '💡',
    tailwindClass: 'bg-cat-utilities',
    colorVar: '--cat-utilities',
    hex: '#06B6D4',
  },
  subscription: {
    label: 'Subscription',
    icon: '📺',
    tailwindClass: 'bg-cat-subscription',
    colorVar: '--cat-subscription',
    hex: '#F59E0B',
  },
  finance: {
    label: 'การเงิน',
    icon: '💳',
    tailwindClass: 'bg-cat-finance',
    colorVar: '--cat-finance',
    hex: '#EF4444',
  },
  entertainment: {
    label: 'บันเทิง',
    icon: '🎲',
    tailwindClass: 'bg-cat-entertainment',
    colorVar: '--cat-entertainment',
    hex: '#EC4899',
  },
  savings: {
    label: 'ออม',
    icon: '🏦',
    tailwindClass: 'bg-cat-savings',
    colorVar: '--cat-savings',
    hex: '#10B981',
  },
  other: {
    label: 'อื่นๆ',
    icon: '📦',
    tailwindClass: 'bg-cat-other',
    colorVar: '--cat-other',
    hex: '#6B7280',
  },
};

/** Stable iteration order for charts/legends — matches UXUI.md spec. */
export const CATEGORY_ORDER: readonly ExpenseCategory[] = [
  'housing',
  'vehicle',
  'utilities',
  'subscription',
  'finance',
  'entertainment',
  'savings',
  'other',
] as const;
