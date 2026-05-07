/**
 * Budget Forecast — F16
 *
 * v1 baseline model: rolling 3-month average per expense category, with a
 * coefficient-of-variation (CV) confidence band. Intentionally simple — no
 * exponential smoothing, no seasonality, no per-category weighting. The point
 * is to give Tom a "this is roughly what next month should cost" anchor and
 * an honest range, not pretend to a forecasting precision the data doesn't
 * support (we have at most ~28 itemised months across all years).
 *
 * Algorithm (per category):
 *   1. Find the three months immediately PRIOR to the forecast month
 *      (anchor month, anchor-1, anchor-2). Anchor = most recent month with
 *      any expense items in any year.
 *   2. mean (μ) of the three values → point forecast.
 *   3. CV = stddev / mean (population stddev, n=3). If μ = 0 → CV = 0.
 *   4. Band = [max(0, μ × (1 - CV)), μ × (1 + CV)]. Floor at 0; expenses
 *      can't go negative.
 *
 * Categories where ALL three prior months are 0 are skipped — they have no
 * signal. A single 0 inside the window is treated as a real low value (Tom
 * may simply not have spent on that category that month).
 *
 * Total = sum of category point forecasts. Total band = sum of category bands
 * (this overstates uncertainty slightly vs. variance-of-sums but matches the
 * "sum of category ranges" mental model the UI shows row-by-row).
 *
 * Pure module — no React, no hooks, no side effects.
 */

import type { ExpenseCategory, WealthLensData } from '@/types';
import { CATEGORY_ORDER } from '@/types/expense-categories';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ForecastBasisMonth {
  year: number;
  /** 1-12 */
  month: number;
  amount: number;
}

export interface CategoryForecast {
  category: ExpenseCategory;
  pointForecast: number;
  rangeMin: number;
  rangeMax: number;
  /** Three prior months that fed this forecast, ordered oldest → newest. */
  basisMonths: ReadonlyArray<ForecastBasisMonth>;
}

export interface MonthForecast {
  /** The month being forecasted (year + month). */
  forYear: number;
  forMonth: number;
  /** Most-recent month with itemised expense data; forecast = anchor + 1. */
  anchorYear: number;
  anchorMonth: number;
  byCategory: ReadonlyArray<CategoryForecast>;
  totalPoint: number;
  totalMin: number;
  totalMax: number;
  /** True when the forecast month already has its own actual data. */
  hasActual: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk every year × month and return the latest (year, month) pair where the
 * expense list contains at least one item. Returns null when the dataset has
 * no itemised expenses at all.
 *
 * Iteration is bounded by `Object.keys(data.years).length × 12` — trivially
 * fast for our 4-year dataset and bounded forever (we'd have to grow ~30×
 * before this matters).
 */
const findAnchorMonth = (
  data: WealthLensData,
): { year: number; month: number } | null => {
  let bestYear = -Infinity;
  let bestMonth = -Infinity;
  for (const yearKey of Object.keys(data.years)) {
    const year = Number(yearKey);
    if (!Number.isFinite(year)) continue;
    const yr = data.years[yearKey];
    if (!yr) continue;
    for (const monthly of yr.expenses) {
      if (monthly.items.length === 0) continue;
      // Compare as a single integer YYYYMM so we don't have to nest checks.
      const ym = year * 100 + monthly.month;
      const bestYm = bestYear * 100 + bestMonth;
      if (ym > bestYm) {
        bestYear = year;
        bestMonth = monthly.month;
      }
    }
  }
  if (!Number.isFinite(bestYear) || !Number.isFinite(bestMonth)) return null;
  return { year: bestYear, month: bestMonth };
};

/**
 * Sum each ExpenseItem's amount into its category bucket for a single month.
 * Returns a fresh map every call — cheap (8 keys) and keeps the function
 * pure. Missing year or missing month → all zeros.
 */
const categoryMonthlyTotals = (
  data: WealthLensData,
  year: number,
  month: number,
): Record<ExpenseCategory, number> => {
  const totals = {} as Record<ExpenseCategory, number>;
  for (const cat of CATEGORY_ORDER) totals[cat] = 0;

  const yr = data.years[String(year)];
  if (!yr) return totals;
  const monthly = yr.expenses.find((e) => e.month === month);
  if (!monthly) return totals;
  for (const item of monthly.items) {
    totals[item.category] += item.amount;
  }
  return totals;
};

/**
 * Return the (year, month) pair immediately AFTER the given one.
 * December rolls into January of the next year. Works for any positive year.
 */
const nextMonth = (
  year: number,
  month: number,
): { year: number; month: number } => {
  if (month >= 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
};

/**
 * Mirror image of `nextMonth` — used to walk backwards three months from the
 * anchor without manually handling the Jan → Dec rollover everywhere.
 */
const previousMonth = (
  year: number,
  month: number,
): { year: number; month: number } => {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
};

/**
 * Population standard deviation for a tiny fixed-size sample (n=3 in our
 * usage). We use population (divide by n) rather than sample (n-1) because
 * the three months ARE the entire population we're modelling — we're not
 * inferring from a sample drawn from a larger distribution.
 */
const populationStddev = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Compute the budget forecast for the month following the most recently-seen
 * expense data. Returns null when the dataset has no itemised expenses
 * anywhere — there's no useful baseline to project from.
 */
export const computeForecast = (
  data: WealthLensData,
): MonthForecast | null => {
  const anchor = findAnchorMonth(data);
  if (anchor === null) return null;

  // The three months feeding the forecast are anchor, anchor-1, anchor-2 —
  // ordered oldest → newest so the UI can display them chronologically.
  const m1 = previousMonth(anchor.year, anchor.month);
  const m2 = previousMonth(m1.year, m1.month);
  const basisOrdered = [m2, m1, anchor];

  const totalsPerBasis = basisOrdered.map((b) =>
    categoryMonthlyTotals(data, b.year, b.month),
  );

  const byCategory: CategoryForecast[] = [];
  for (const cat of CATEGORY_ORDER) {
    const values = totalsPerBasis.map((t) => t[cat]);
    // Skip silent categories — all three months at zero means there's
    // nothing to project. Including them as ฿0 ± ฿0 forecasts would clutter
    // the UI with empty rows.
    if (values.every((v) => v === 0)) continue;

    const mean = (values[0] + values[1] + values[2]) / 3;
    const cv = mean > 0 ? populationStddev(values) / mean : 0;

    const rangeMinRaw = mean * (1 - cv);
    const rangeMaxRaw = mean * (1 + cv);

    byCategory.push({
      category: cat,
      pointForecast: mean,
      // Floor min at 0 — expenses can't go negative even if the band's math
      // says so (CV can exceed 1 when stddev > mean, which would push the
      // lower bound below zero).
      rangeMin: Math.max(0, rangeMinRaw),
      rangeMax: rangeMaxRaw,
      basisMonths: basisOrdered.map((b, idx) => ({
        year: b.year,
        month: b.month,
        amount: values[idx] ?? 0,
      })),
    });
  }

  const totalPoint = byCategory.reduce((acc, c) => acc + c.pointForecast, 0);
  const totalMin = byCategory.reduce((acc, c) => acc + c.rangeMin, 0);
  const totalMax = byCategory.reduce((acc, c) => acc + c.rangeMax, 0);

  const forecastMonth = nextMonth(anchor.year, anchor.month);

  // hasActual — if the user has already logged anything for the forecast
  // month (in any category) we flip into "actual vs forecast" mode.
  const forecastTotals = categoryMonthlyTotals(
    data,
    forecastMonth.year,
    forecastMonth.month,
  );
  const hasActual = CATEGORY_ORDER.some((c) => forecastTotals[c] > 0);

  return {
    forYear: forecastMonth.year,
    forMonth: forecastMonth.month,
    anchorYear: anchor.year,
    anchorMonth: anchor.month,
    byCategory,
    totalPoint,
    totalMin,
    totalMax,
    hasActual,
  };
};
