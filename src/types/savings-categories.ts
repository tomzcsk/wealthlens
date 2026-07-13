/**
 * Display metadata for each savings/investment category.
 * Mirrors the shape of `EXPENSE_CATEGORIES` so UI code (form dropdowns,
 * grouped lists, footer totals) can use the same patterns.
 */
import type { SavingsCategory } from './index';

export interface SavingsCategoryMeta {
  /** Thai-first display label. */
  label: string;
  /** Single emoji used as visual prefix in lists. */
  icon: string;
  /** CSS custom property name (e.g. "--cat-savings"). */
}

export const SAVINGS_CATEGORIES: Record<SavingsCategory, SavingsCategoryMeta> = {
  'investment-dime': {
    label: 'ลงทุน Dime',
    icon: '📈',
  },
  travel: {
    label: 'ออมเที่ยว',
    icon: '✈️',
  },
  emergency: {
    label: 'ออมฉุกเฉิน',
    icon: '🛟',
  },
  retirement: {
    label: 'เกษียณ',
    icon: '🏖️',
  },
  gold: {
    label: 'ทองคำ',
    icon: '🪙',
  },
  general: {
    label: 'ออมทั่วไป',
    icon: '💰',
  },
};

/** Stable iteration order for grouped views. */
export const SAVINGS_CATEGORY_ORDER: ReadonlyArray<SavingsCategory> = [
  'investment-dime',
  'travel',
  'emergency',
  'retirement',
  'gold',
  'general',
] as const;
