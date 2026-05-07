/**
 * WealthLens — F15 Expense Anomaly Detection.
 *
 * Pure module. No React, no stores, no formatting — just statistics over
 * `WealthLensData`. The hook layer (`useAnomalies`) wraps the result for
 * UI consumption; the toast effect (`useAnomalyAlertEffect`) reacts to
 * deltas in this list.
 *
 * Algorithm (intentionally a transparent heuristic, not formal stats):
 *   For each (year, month, category) cell we look at THAT category's
 *   monthly totals across the prior rolling 12 months (excluding the cell
 *   itself, and excluding zero-spend months — those would crush σ down to
 *   near-zero and cause every typical month to look anomalous). We need
 *   ≥ 6 baseline samples; otherwise we skip — there isn't enough history
 *   to call anything "unusual" yet.
 *
 *   We then compute mean μ and sample-stddev σ (n-1 divisor) and flag the
 *   cell when:
 *     • amount > μ + 2σ          ← the standard 2-sigma rule
 *     • amount > 1.5 × μ          ← guard against tiny-σ false alarms
 *
 *   Severity:
 *     • 'high'   when amount > μ + 3σ
 *     • 'medium' otherwise
 *
 *   Direction: SPIKES ONLY. Under-spending isn't an alert worth raising.
 *
 * Tom's seed data contains legitimate one-off spikes (iPhone 15pm, ทำฟัน,
 * เครื่องซักผ้า, keychron/dyson). Those WILL trigger anomalies — that's the
 * correct behaviour. The Dismiss action in the UI is the user's lever, not
 * an algorithmic suppression.
 */

import type {
  ExpenseCategory,
  WealthLensData,
} from '@/types';
import { CATEGORY_ORDER } from '@/types/expense-categories';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Anomaly {
  year: number;
  /** 1-12 */
  month: number;
  category: ExpenseCategory;
  /** Raw category total for this month — the "cell value" being flagged. */
  amount: number;
  /** Mean μ of the prior rolling 12-month baseline window. */
  baseline: number;
  /** Sample standard deviation σ of that same baseline window. */
  stddev: number;
  /** (amount − μ) / σ — for headline display. Always > 2 for medium, > 3 for high. */
  zScore: number;
  severity: 'medium' | 'high';
  /** Sample size of the baseline — surfaced for transparency in the UI. */
  monthsOfHistory: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sum a category across one MonthlyExpense row. */
const sumCategoryForMonth = (
  data: WealthLensData,
  year: number,
  month: number,
  category: ExpenseCategory,
): number => {
  const yr = data.years[String(year)];
  if (!yr) return 0;
  const row = yr.expenses.find((e) => e.month === month);
  if (!row) return 0;
  let total = 0;
  for (const item of row.items) {
    if (item.category === category) total += item.amount;
  }
  return total;
};

/** Arithmetic mean. Returns 0 on empty input — caller should gate on length. */
const mean = (arr: readonly number[]): number => {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
};

/**
 * Sample standard deviation (n-1 divisor, "Bessel-corrected").
 * Returns 0 when n < 2 since the formula divides by (n-1).
 */
const stddev = (arr: readonly number[]): number => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (const v of arr) {
    const d = v - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (arr.length - 1));
};

interface MonthlyCategoryTotal {
  year: number;
  month: number;
  category: ExpenseCategory;
  amount: number;
}

/**
 * Walk every (year, month, category) tuple in chronological order. Yields
 * EVERY category for every month present in `data.years`, including zero
 * totals — the baseline filter happens at consumption time.
 */
function* iterMonthlyCategoryTotals(
  data: WealthLensData,
): Generator<MonthlyCategoryTotal> {
  const years = Object.keys(data.years)
    .map((y) => Number(y))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);

  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) {
      for (const category of CATEGORY_ORDER) {
        yield {
          year,
          month,
          category,
          amount: sumCategoryForMonth(data, year, month, category),
        };
      }
    }
  }
}

/** Convert (year, month) to a monotonically increasing integer for windowing. */
const monthIndex = (year: number, month: number): number => year * 12 + (month - 1);

// ---------------------------------------------------------------------------
// Tunables — surfaced as named constants so the heuristic is self-documenting.
// ---------------------------------------------------------------------------

const BASELINE_WINDOW_MONTHS = 12;
const MIN_BASELINE_SAMPLES = 6;
const MEDIUM_SIGMA = 2;
const HIGH_SIGMA = 3;
/** Multiplicative floor — guards against tiny-σ false alarms on stable lines. */
const MIN_RATIO_OVER_MEAN = 1.5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect anomalies across the entire dataset.
 *
 * Returns the list sorted newest → oldest (so the UI shows the most
 * recent spikes first). Within the same month, ordering is by category
 * iteration order from `CATEGORY_ORDER` for stability.
 */
export const detectAnomalies = (data: WealthLensData): Anomaly[] => {
  // Bucket every category's monthly totals into a single chronological
  // array per category — lets us slice a rolling 12-month window cheaply.
  const series = new Map<ExpenseCategory, MonthlyCategoryTotal[]>();
  for (const point of iterMonthlyCategoryTotals(data)) {
    const arr = series.get(point.category);
    if (arr) arr.push(point);
    else series.set(point.category, [point]);
  }

  const anomalies: Anomaly[] = [];

  for (const [category, points] of series) {
    for (let i = 0; i < points.length; i += 1) {
      const cell = points[i];
      // Skip cells with zero spend — there's nothing to flag.
      if (cell.amount <= 0) continue;

      // Build baseline = prior 12 months (by index, not by data presence)
      // BEFORE this cell, dropping zeros so σ reflects real variability.
      const cellIdx = monthIndex(cell.year, cell.month);
      const baseline: number[] = [];
      for (let j = i - 1; j >= 0; j -= 1) {
        const prev = points[j];
        const distance = cellIdx - monthIndex(prev.year, prev.month);
        if (distance > BASELINE_WINDOW_MONTHS) break;
        if (prev.amount > 0) baseline.push(prev.amount);
      }

      if (baseline.length < MIN_BASELINE_SAMPLES) continue;

      const mu = mean(baseline);
      const sigma = stddev(baseline);

      // σ can legitimately be 0 if every sample is identical (rent that
      // never changes). If the cell matches that constant, no anomaly;
      // if it diverges, the ratio guard below handles it.
      if (sigma === 0) {
        if (cell.amount > mu * MIN_RATIO_OVER_MEAN && mu > 0) {
          anomalies.push({
            year: cell.year,
            month: cell.month,
            category,
            amount: cell.amount,
            baseline: mu,
            stddev: 0,
            zScore: Number.POSITIVE_INFINITY,
            severity: 'high',
            monthsOfHistory: baseline.length,
          });
        }
        continue;
      }

      const z = (cell.amount - mu) / sigma;
      const overMeanRatio = mu > 0 ? cell.amount / mu : Number.POSITIVE_INFINITY;
      const passesSigma = z > MEDIUM_SIGMA;
      const passesRatio = overMeanRatio > MIN_RATIO_OVER_MEAN;

      if (!passesSigma || !passesRatio) continue;

      const severity: Anomaly['severity'] = z > HIGH_SIGMA ? 'high' : 'medium';
      anomalies.push({
        year: cell.year,
        month: cell.month,
        category,
        amount: cell.amount,
        baseline: mu,
        stddev: sigma,
        zScore: z,
        severity,
        monthsOfHistory: baseline.length,
      });
    }
  }

  // Newest first: sort descending by (year, month). Ties broken by
  // CATEGORY_ORDER position to keep output deterministic across runs.
  const categoryRank = new Map<ExpenseCategory, number>();
  CATEGORY_ORDER.forEach((c, idx) => categoryRank.set(c, idx));

  anomalies.sort((a, b) => {
    const idxA = monthIndex(a.year, a.month);
    const idxB = monthIndex(b.year, b.month);
    if (idxA !== idxB) return idxB - idxA;
    return (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0);
  });

  return anomalies;
};

/**
 * Stable string identifier for a single anomaly cell. Used by the toast
 * effect (to dedupe alerts) and the dismissal store (persistence key).
 */
export const anomalyFingerprint = (a: Pick<Anomaly, 'year' | 'month' | 'category'>): string =>
  `${a.year}-${a.month}-${a.category}`;
