import { useMemo } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import {
  selectExpenseByCategory,
  selectMonthExpenses,
  selectMonthIncome,
  selectMonthSavings,
  selectMonthSummary,
  selectMonthlySummariesForYear,
  selectSavingsByCategory,
  selectYoYChange,
  selectYearSummary,
  type MonthSummary,
  type MonthlySummaryRow,
  type YearSummary,
  type YoYMetric,
} from '@/stores/selectors';
import type {
  ExpenseCategory,
  ExpenseItem,
  MonthlyIncome,
  SavingsCategory,
  SavingsItem,
} from '@/types';
import { CATEGORY_ORDER } from '@/types/expense-categories';
import { THAI_MONTHS_SHORT } from '@/utils/formatters';

/**
 * IMPORTANT — selector hooks below MUST NOT pass selector closures that
 * build fresh objects/arrays directly to `useFinanceStore`. Zustand's
 * default `Object.is` equality treats every fresh `{...}` / `[...]` as
 * "changed" and re-renders, which triggers the selector again — infinite
 * loop. Instead we subscribe to stable references (`s.data`,
 * `s.selectedYear`) and derive via `useMemo`.
 */

export const useSelectedYear = (): number =>
  useFinanceStore((s) => s.selectedYear);

export const useSelectedMonth = (): number | null =>
  useFinanceStore((s) => s.selectedMonth);

const useSnapshot = (): { data: ReturnType<typeof useFinanceStore.getState>['data']; selectedYear: number } => {
  const data = useFinanceStore((s) => s.data);
  const selectedYear = useFinanceStore((s) => s.selectedYear);
  return { data, selectedYear };
};

export const useYearSummary = (year?: number): YearSummary => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(() => selectYearSummary({ data }, target), [data, target]);
};

export const useMonthSummary = (
  month: number,
  year?: number,
): MonthSummary => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectMonthSummary({ data }, target, month),
    [data, target, month],
  );
};

export const useMonthIncome = (
  month: number,
  year?: number,
): MonthlyIncome | null => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectMonthIncome({ data }, target, month),
    [data, target, month],
  );
};

export const useMonthExpenses = (
  month: number,
  year?: number,
): ExpenseItem[] => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectMonthExpenses({ data }, target, month),
    [data, target, month],
  );
};

export const useExpenseByCategory = (
  month?: number,
  year?: number,
): Record<ExpenseCategory, number> => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectExpenseByCategory({ data }, target, month),
    [data, target, month],
  );
};

export const useMonthSavings = (
  month: number,
  year?: number,
): SavingsItem[] => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectMonthSavings({ data }, target, month),
    [data, target, month],
  );
};

export const useSavingsByCategory = (
  month?: number,
  year?: number,
): Record<SavingsCategory, number> => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectSavingsByCategory({ data }, target, month),
    [data, target, month],
  );
};

export const useYoYChange = (
  metric: YoYMetric,
  year?: number,
): number | null => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectYoYChange({ data }, target, metric),
    [data, target, metric],
  );
};

export const useMonthlySummariesForYear = (
  year?: number,
): MonthlySummaryRow[] => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => selectMonthlySummariesForYear({ data }, target),
    [data, target],
  );
};

/**
 * Sorted ascending list of years present in the persisted data — used by
 * the multi-year comparison view (F10) to drive year-toggle pills and
 * column ordering.
 *
 * Subscribes to `s.data` (stable ref) and derives via `useMemo` to comply
 * with the safety pattern at the top of this file: never return a fresh
 * array directly from `useFinanceStore`.
 */
export const useAvailableYears = (): number[] => {
  const data = useFinanceStore((s) => s.data);
  return useMemo(
    () =>
      Object.keys(data.years)
        .map((y) => Number(y))
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => a - b),
    [data],
  );
};

/**
 * Total amount saved into "ออมเที่ยว" (travel savings) for a given year.
 *
 * Reads from the dedicated `MonthlySavings` collection — items with
 * `category === 'travel'`. Replaces the old expense-scan hack that needed
 * a Thai-word substring match against the legacy `savings` expense category.
 *
 * Follows the safety pattern at the top of this file: subscribes to
 * `s.data` (stable ref) and derives via `useMemo`.
 */
export const useTravelSavingsTotal = (year?: number): number => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(() => {
    const yr = data.years[String(target)];
    if (!yr) return 0;
    let total = 0;
    for (const row of yr.savings ?? []) {
      for (const item of row.items) {
        if (item.category === 'travel') {
          total += item.amount;
        }
      }
    }
    return total;
  }, [data, target]);
};

// ---------------------------------------------------------------------------
// F12 — Subscriptions
// ---------------------------------------------------------------------------

/**
 * One row in the Subscription Manager — a single recurring expense rolled
 * up across every month of a year.
 *
 * "Subscription" here is defined operationally as `ExpenseItem.isRecurring
 * === true` regardless of `category`. The PRD's example list (Netflix,
 * ChatGPT, Claude AI, AIS, 3BB) intentionally straddles both the
 * `subscription` and `utilities` categories, so grouping by category alone
 * would miss half the items Tom thinks of as subs. The recurring flag is
 * the common property.
 */
export interface SubscriptionRow {
  /** Stable identity = lowercased trimmed `name`. */
  key: string;
  /** Canonical display name — taken from the most recent month's spelling. */
  name: string;
  /** Most-common category across the year (ties broken by first-seen). */
  category: ExpenseCategory;
  /** Number of distinct months in the year that contain this item. */
  monthsSeen: number;
  /** Sum of `amount` across every occurrence. */
  totalAmount: number;
  /** `totalAmount / monthsSeen` — the row's "per month" headline figure. */
  averageMonthlyAmount: number;
  /**
   * `true` when this item appears in the most-recent month with any
   * expense data. Acts as a heuristic for "is this still active" — useful
   * because cancelled subs (e.g. dropped Netflix) leave historical rows
   * but stop appearing in new months.
   */
  isActive: boolean;
}

/**
 * Aggregate every recurring expense for the given year (defaults to
 * `selectedYear`) into one row per item, sorted descending by average
 * monthly cost.
 *
 * Implemented with the safe `useMemo`-over-`s.data` pattern: subscribing
 * to a freshly-built array directly from `useFinanceStore` would trip the
 * default `Object.is` equality check on every render and infinite-loop.
 */
export const useSubscriptions = (year?: number): SubscriptionRow[] => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(
    () => computeSubscriptionRows(data, target),
    [data, target],
  );
};

/** Pure helper — extracted for testability and to keep the hook tiny. */
const computeSubscriptionRows = (
  data: ReturnType<typeof useFinanceStore.getState>['data'],
  year: number,
): SubscriptionRow[] => {
  const yearData = data.years[String(year)];
  if (!yearData) return [];

  // First pass: find the most-recent month that has *any* expense items at
  // all. Used downstream as the "is this sub still active" yardstick.
  let mostRecentMonthWithData = 0;
  for (const monthly of yearData.expenses) {
    if (monthly.items.length > 0 && monthly.month > mostRecentMonthWithData) {
      mostRecentMonthWithData = monthly.month;
    }
  }

  // Second pass: bucket recurring items by normalised name.
  interface Acc {
    key: string;
    displayName: string;
    /** Highest month-number we've seen this item in — drives display name. */
    latestNameMonth: number;
    /** Per-category occurrence counts for tie-breaking. */
    categoryCounts: Map<ExpenseCategory, number>;
    /** First category seen — tiebreaker when counts are equal. */
    firstCategory: ExpenseCategory;
    months: Set<number>;
    totalAmount: number;
  }

  const buckets = new Map<string, Acc>();

  for (const monthly of yearData.expenses) {
    for (const item of monthly.items) {
      if (!item.isRecurring) continue;
      const key = item.name.trim().toLowerCase();
      if (!key) continue;
      let acc = buckets.get(key);
      if (!acc) {
        acc = {
          key,
          displayName: item.name.trim(),
          latestNameMonth: monthly.month,
          categoryCounts: new Map(),
          firstCategory: item.category,
          months: new Set(),
          totalAmount: 0,
        };
        buckets.set(key, acc);
      }
      // Use the most recent month's spelling as the canonical name — so
      // "ChatGPT" overrides an earlier "Chat GPT" if Tom cleaned it up.
      if (monthly.month >= acc.latestNameMonth) {
        acc.displayName = item.name.trim();
        acc.latestNameMonth = monthly.month;
      }
      acc.categoryCounts.set(
        item.category,
        (acc.categoryCounts.get(item.category) ?? 0) + 1,
      );
      acc.months.add(monthly.month);
      acc.totalAmount += item.amount;
    }
  }

  const rows: SubscriptionRow[] = [];
  for (const acc of buckets.values()) {
    // Pick the most-common category; ties go to the first one we saw so
    // the result is deterministic across runs.
    let category = acc.firstCategory;
    let bestCount = -1;
    for (const [cat, count] of acc.categoryCounts) {
      if (count > bestCount) {
        bestCount = count;
        category = cat;
      }
    }
    const monthsSeen = acc.months.size;
    rows.push({
      key: acc.key,
      name: acc.displayName,
      category,
      monthsSeen,
      totalAmount: acc.totalAmount,
      averageMonthlyAmount:
        monthsSeen > 0 ? acc.totalAmount / monthsSeen : 0,
      isActive:
        mostRecentMonthWithData > 0 && acc.months.has(mostRecentMonthWithData),
    });
  }

  rows.sort((a, b) => b.averageMonthlyAmount - a.averageMonthlyAmount);
  return rows;
};

// ---------------------------------------------------------------------------
// F14 — 48-month Trend Analysis
// ---------------------------------------------------------------------------

/**
 * One row in the long-form trend dataset — one calendar month of a single
 * year, flattened so charts can plot N×12 points along a single X-axis.
 *
 * `byCategory` keys mirror `ExpenseCategory`, so a stacked `<BarChart>` can
 * read each category as its own `dataKey` without a per-render reshape.
 *
 * `hasData` distinguishes "empty month" (e.g. May 2026 hasn't happened yet)
 * from a genuine zero — letting consumers exclude empties from averages
 * without dropping them from the chart's time axis.
 */
export interface TrendPoint {
  year: number;
  /** 1-12 */
  month: number;
  /** Combined Thai short label, e.g. "ม.ค. '23". */
  label: string;
  netAll: number;
  totalExpenses: number;
  remaining: number;
  byCategory: Record<ExpenseCategory, number>;
  /** `false` only when income+expenses are all zero for this month. */
  hasData: boolean;
}

/**
 * Flat array spanning every available year × 12 months, oldest → newest.
 *
 * Subscribes to `s.data` (stable ref) and derives via `useMemo` per the
 * safety pattern at the top of this file: never return a fresh array
 * directly from `useFinanceStore` — the default `Object.is` equality
 * triggers an infinite render loop.
 */
export const use48MonthTrend = (): TrendPoint[] => {
  const data = useFinanceStore((s) => s.data);
  return useMemo(() => {
    const years = Object.keys(data.years)
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);

    const points: TrendPoint[] = [];
    for (const year of years) {
      const yearShort = String(year).slice(-2);
      for (let month = 1; month <= 12; month += 1) {
        const summary = selectMonthSummary({ data }, year, month);
        const byCategory = selectExpenseByCategory({ data }, year, month);
        // "hasData" guards against treating not-yet-recorded months as $0.
        // We check both income & expense sides because a month with only
        // expenses (or only income) is still a real data point.
        const income = selectMonthIncome({ data }, year, month);
        const hasIncome =
          income !== null &&
          (income.salary !== 0 ||
            income.bonus !== 0 ||
            income.commission !== 0);
        const hasExpense = CATEGORY_ORDER.some((c) => byCategory[c] !== 0);
        points.push({
          year,
          month,
          label: `${THAI_MONTHS_SHORT[month - 1]} '${yearShort}`,
          netAll: summary.netAll,
          totalExpenses: summary.totalExpenses,
          remaining: summary.remaining,
          byCategory,
          hasData: hasIncome || hasExpense,
        });
      }
    }
    return points;
  }, [data]);
};
