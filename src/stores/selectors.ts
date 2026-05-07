/**
 * WealthLens — pure derived selectors.
 *
 * These functions take state (or a snapshot) and compute the views the UI
 * needs. They are intentionally NOT inside the Zustand store so:
 *  - The store stays a clean, serializable source of truth.
 *  - Selectors are trivially unit-testable in isolation.
 *  - CLAUDE.md's rule "ทุก calculation ต้อง derive จาก store" is enforced
 *    by construction — no number is hard-coded; everything flows from state.
 *
 * All numeric returns are RAW numbers; formatting (฿, comma, etc.) is the
 * responsibility of `utils/formatters.ts`. Selectors must never throw on
 * missing data — they degrade to zeros instead.
 */

import type {
  ExpenseCategory,
  ExpenseItem,
  MonthlyDeductions,
  MonthlyIncome,
  MonthlySavings,
  SavingsCategory,
  SavingsItem,
  WealthLensData,
  YearData,
} from '@/types';
import { CATEGORY_ORDER } from '@/types/expense-categories';
import { SAVINGS_CATEGORY_ORDER } from '@/types/savings-categories';
import type { FinanceState } from './financeStore';

/**
 * Anything from which we can derive — accept either the full Zustand state
 * or just the persisted blob, so selectors compose with snapshots too.
 */
export type Snapshot = Pick<FinanceState, 'data'> | { data: WealthLensData };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const sumDeductions = (d: MonthlyDeductions): number =>
  d.tax + d.socialSecurity + d.providentFund + d.gsl;

const sumExpenseItems = (items: readonly ExpenseItem[]): number =>
  items.reduce((acc, it) => acc + it.amount, 0);

const sumSavingsItems = (items: readonly SavingsItem[]): number =>
  items.reduce((acc, it) => acc + it.amount, 0);

const getYear = (state: Snapshot, year: number): YearData | undefined =>
  state.data.years[String(year)];

/**
 * Defensive accessor for the savings list — older persisted snapshots may
 * not have the `savings` field at all. Treat as empty array.
 */
const yearSavings = (yr: YearData | undefined): MonthlySavings[] =>
  yr?.savings ?? [];

// ---------------------------------------------------------------------------
// Per-month selectors
// ---------------------------------------------------------------------------

export const selectMonthIncome = (
  state: Snapshot,
  year: number,
  month: number,
): MonthlyIncome | null => {
  const yr = getYear(state, year);
  if (!yr) return null;
  return yr.income.find((i) => i.month === month) ?? null;
};

export const selectMonthExpenses = (
  state: Snapshot,
  year: number,
  month: number,
): ExpenseItem[] => {
  const yr = getYear(state, year);
  if (!yr) return [];
  return yr.expenses.find((e) => e.month === month)?.items ?? [];
};

export const selectMonthSavings = (
  state: Snapshot,
  year: number,
  month: number,
): SavingsItem[] => {
  const yr = getYear(state, year);
  if (!yr) return [];
  return yearSavings(yr).find((s) => s.month === month)?.items ?? [];
};

export interface MonthSummary {
  /** salary + bonus + commission */
  gross: number;
  /** sum of all deduction lines (Dime is no longer a deduction). */
  totalDeductions: number;
  /** "Net." — take-home from salary+bonus only, after deductions */
  netSalary: number;
  /** "Net. All" — netSalary + commission (the headline KPI) */
  netAll: number;
  /** Sum of itemized expenses for the month (consumption only). */
  totalExpenses: number;
  /** Sum of savings/investments for the month (Dime, ออมเที่ยว, ...). */
  totalSavings: number;
  /** "เหลือจริง" — netAll − totalExpenses (consumption-only). */
  remaining: number;
  /** "ใช้ได้จริง" — remaining − totalSavings (after both consumption + savings). */
  cashFree: number;
}

const ZERO_MONTH_SUMMARY: MonthSummary = {
  gross: 0,
  totalDeductions: 0,
  netSalary: 0,
  netAll: 0,
  totalExpenses: 0,
  totalSavings: 0,
  remaining: 0,
  cashFree: 0,
};

export const selectMonthSummary = (
  state: Snapshot,
  year: number,
  month: number,
): MonthSummary => {
  const income = selectMonthIncome(state, year, month);
  const items = selectMonthExpenses(state, year, month);
  const savings = selectMonthSavings(state, year, month);
  const totalSavings = sumSavingsItems(savings);

  if (!income) {
    const totalExpenses = sumExpenseItems(items);
    const remaining = -totalExpenses;
    return {
      ...ZERO_MONTH_SUMMARY,
      totalExpenses,
      totalSavings,
      remaining,
      cashFree: remaining - totalSavings,
    };
  }

  const gross = income.salary + income.bonus + income.commission;
  const totalDeductions = sumDeductions(income.deductions);
  const netSalary = income.salary + income.bonus - totalDeductions;
  const netAll = netSalary + income.commission;
  const totalExpenses = sumExpenseItems(items);
  const remaining = netAll - totalExpenses;

  return {
    gross,
    totalDeductions,
    netSalary,
    netAll,
    totalExpenses,
    totalSavings,
    remaining,
    cashFree: remaining - totalSavings,
  };
};

// ---------------------------------------------------------------------------
// Per-year selectors
// ---------------------------------------------------------------------------

export interface YearSummary {
  salary: number;
  bonus: number;
  commission: number;
  totalDeductions: number;
  /** Sum of monthly netSalary across the year */
  netSalary: number;
  /** Sum of monthly netAll across the year — matches Dashboard "Net All" */
  netAll: number;
  totalExpenses: number;
  /** Sum of savings/investments across the year. */
  totalSavings: number;
  remaining: number;
  /** Count of distinct months that have either income or expense data */
  monthsWithData: number;
}

const ZERO_YEAR_SUMMARY: YearSummary = {
  salary: 0,
  bonus: 0,
  commission: 0,
  totalDeductions: 0,
  netSalary: 0,
  netAll: 0,
  totalExpenses: 0,
  totalSavings: 0,
  remaining: 0,
  monthsWithData: 0,
};

export const selectYearSummary = (
  state: Snapshot,
  year: number,
): YearSummary => {
  const yr = getYear(state, year);
  if (!yr) return ZERO_YEAR_SUMMARY;

  const monthsTouched = new Set<number>();
  for (const i of yr.income) monthsTouched.add(i.month);
  for (const e of yr.expenses) monthsTouched.add(e.month);
  for (const s of yearSavings(yr)) monthsTouched.add(s.month);

  let salary = 0;
  let bonus = 0;
  let commission = 0;
  let totalDeductions = 0;
  let netSalary = 0;
  let netAll = 0;
  let totalExpenses = 0;
  let totalSavings = 0;
  let remaining = 0;

  for (const month of monthsTouched) {
    const income = selectMonthIncome(state, year, month);
    if (income) {
      salary += income.salary;
      bonus += income.bonus;
      commission += income.commission;
    }
    const summary = selectMonthSummary(state, year, month);
    totalDeductions += summary.totalDeductions;
    netSalary += summary.netSalary;
    netAll += summary.netAll;
    totalExpenses += summary.totalExpenses;
    totalSavings += summary.totalSavings;
    remaining += summary.remaining;
  }

  return {
    salary,
    bonus,
    commission,
    totalDeductions,
    netSalary,
    netAll,
    totalExpenses,
    totalSavings,
    remaining,
    monthsWithData: monthsTouched.size,
  };
};

// ---------------------------------------------------------------------------
// Cross-year — YoY KPI deltas
// ---------------------------------------------------------------------------

/** YoY-comparable numeric metrics on YearSummary. */
export type YoYMetric =
  | 'salary'
  | 'bonus'
  | 'commission'
  | 'totalDeductions'
  | 'netSalary'
  | 'netAll'
  | 'totalExpenses'
  | 'totalSavings'
  | 'remaining';

/**
 * Percentage change vs previous year. Returns `null` if the prior year has
 * no data (so callers can render "—" instead of a misleading ∞%).
 */
export const selectYoYChange = (
  state: Snapshot,
  year: number,
  metric: YoYMetric,
): number | null => {
  const prior = getYear(state, year - 1);
  if (!prior) return null;
  const prev = selectYearSummary(state, year - 1)[metric];
  if (prev === 0) return null;
  const curr = selectYearSummary(state, year)[metric];
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// ---------------------------------------------------------------------------
// Expense breakdown by category
// ---------------------------------------------------------------------------

const emptyCategoryMap = (): Record<ExpenseCategory, number> =>
  CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<ExpenseCategory, number>,
  );

/**
 * Sum expenses by category, either for a specific month (when `month` given)
 * or aggregated across the entire year.
 */
export const selectExpenseByCategory = (
  state: Snapshot,
  year: number,
  month?: number,
): Record<ExpenseCategory, number> => {
  const yr = getYear(state, year);
  const totals = emptyCategoryMap();
  if (!yr) return totals;

  const rows =
    month === undefined
      ? yr.expenses
      : yr.expenses.filter((e) => e.month === month);

  for (const row of rows) {
    for (const item of row.items) {
      totals[item.category] += item.amount;
    }
  }
  return totals;
};

// ---------------------------------------------------------------------------
// Savings breakdown by category
// ---------------------------------------------------------------------------

const emptySavingsCategoryMap = (): Record<SavingsCategory, number> =>
  SAVINGS_CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<SavingsCategory, number>,
  );

/**
 * Sum savings/investment items by category, either for a specific month
 * (when `month` is given) or aggregated across the entire year.
 */
export const selectSavingsByCategory = (
  state: Snapshot,
  year: number,
  month?: number,
): Record<SavingsCategory, number> => {
  const yr = getYear(state, year);
  const totals = emptySavingsCategoryMap();
  if (!yr) return totals;

  const rows =
    month === undefined
      ? yearSavings(yr)
      : yearSavings(yr).filter((s) => s.month === month);

  for (const row of rows) {
    for (const item of row.items) {
      totals[item.category] += item.amount;
    }
  }
  return totals;
};

// ---------------------------------------------------------------------------
// Monthly summaries for table/chart rendering
// ---------------------------------------------------------------------------

export interface MonthlySummaryRow extends MonthSummary {
  month: number;
}

/**
 * All 12 calendar months (1-12) for the given year, each with its computed
 * summary. Months with no data return zeros — UI decides whether to render
 * empty rows or skip them.
 */
export const selectMonthlySummariesForYear = (
  state: Snapshot,
  year: number,
): MonthlySummaryRow[] => {
  const rows: MonthlySummaryRow[] = [];
  for (let month = 1; month <= 12; month += 1) {
    rows.push({ month, ...selectMonthSummary({ data: state.data }, year, month) });
  }
  return rows;
};
