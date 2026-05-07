/**
 * Display metadata for each savings/investment category.
 * Mirrors the shape of `EXPENSE_CATEGORIES` so UI code (form dropdowns,
 * grouped lists, footer totals) can use the same patterns.
 *
 * `colorVar` references the same `--cat-savings` CSS variable as the
 * legacy expense `savings` category — keeps the visual identity consistent
 * across the refactor without bloating the palette.
 */
import type { SavingsCategory } from './index';

export interface SavingsCategoryMeta {
  /** Thai-first display label. */
  label: string;
  /** Single emoji used as visual prefix in lists. */
  icon: string;
  /** CSS custom property name (e.g. "--cat-savings"). */
  colorVar: string;
}

export const SAVINGS_CATEGORIES: Record<SavingsCategory, SavingsCategoryMeta> = {
  'investment-dime': {
    label: 'ลงทุน Dime',
    icon: '📈',
    colorVar: '--cat-savings',
  },
  travel: {
    label: 'ออมเที่ยว',
    icon: '✈️',
    colorVar: '--cat-savings',
  },
  emergency: {
    label: 'ออมฉุกเฉิน',
    icon: '🛟',
    colorVar: '--cat-savings',
  },
  retirement: {
    label: 'เกษียณ',
    icon: '🏖️',
    colorVar: '--cat-savings',
  },
  general: {
    label: 'ออมทั่วไป',
    icon: '💰',
    colorVar: '--cat-savings',
  },
};

/** Stable iteration order for grouped views. */
export const SAVINGS_CATEGORY_ORDER: ReadonlyArray<SavingsCategory> = [
  'investment-dime',
  'travel',
  'emergency',
  'retirement',
  'general',
] as const;
