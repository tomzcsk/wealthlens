/**
 * Display metadata for each expense category.
 * Consumed by the pie-chart legend, expense form dropdown, and item rows.
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
  /** Resolved hex — handy for Recharts `fill={...}` props. */
  hex: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, CategoryMeta> = {
  housing: {
    label: 'ที่อยู่อาศัย',
    icon: '🏠',
    tailwindClass: 'bg-cat-housing',
    hex: '#6366F1',
  },
  vehicle: {
    label: 'ยานพาหนะ',
    icon: '🚗',
    tailwindClass: 'bg-cat-vehicle',
    hex: '#8B5CF6',
  },
  utilities: {
    label: 'สาธารณูปโภค',
    icon: '💡',
    tailwindClass: 'bg-cat-utilities',
    hex: '#06B6D4',
  },
  subscription: {
    label: 'Subscription',
    icon: '📺',
    tailwindClass: 'bg-cat-subscription',
    hex: '#F59E0B',
  },
  finance: {
    label: 'การเงิน',
    icon: '💳',
    tailwindClass: 'bg-cat-finance',
    hex: '#EF4444',
  },
  entertainment: {
    label: 'บันเทิง',
    icon: '🎲',
    tailwindClass: 'bg-cat-entertainment',
    hex: '#EC4899',
  },
  savings: {
    label: 'ออม',
    icon: '🏦',
    tailwindClass: 'bg-cat-savings',
    hex: '#10B981',
  },
  other: {
    label: 'อื่นๆ',
    icon: '📦',
    tailwindClass: 'bg-cat-other',
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
