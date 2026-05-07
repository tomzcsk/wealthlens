/**
 * WealthLens — standalone, store-agnostic numeric helpers.
 *
 * The bulk of year/month aggregation lives in `src/stores/selectors.ts`
 * because it needs the full state snapshot. This file is for pure, generic
 * primitives that any module can import without pulling in the store.
 *
 * All functions are pure: no mutation, no side-effects, no I/O.
 */

// ---------------------------------------------------------------------------
// Income canonical formula
// ---------------------------------------------------------------------------

export interface NetAllInputs {
  salary: number;
  bonus: number;
  commission: number;
  /** Pre-computed total of all deduction lines for the period. */
  totalDeductions: number;
}

/**
 * Canonical "Net All" formula — duplicated intentionally from selectors.ts
 * so any UI component can verify against this single source of truth.
 *
 *   Net All = (salary + bonus - totalDeductions) + commission
 *
 * Commission is added AFTER deductions because deductions
 * (tax/social-security/provident-fund/กยศ/Dime) are taken out of the salary
 * stream only — see prd.md §3 "Net. All".
 */
export const calculateNetAll = (input: NetAllInputs): number =>
  input.salary + input.bonus - input.totalDeductions + input.commission;

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

/**
 * Percent change from `previous` → `current`, expressed as a fraction
 * (0.123 = +12.3%). Returns `null` when `previous` is 0, null, or undefined
 * so callers can render "—" instead of `Infinity%` or NaN.
 *
 * Uses `Math.abs(previous)` as the denominator so a swing from -100 to +100
 * reads as +200% (not -200%) — matches the YoY behaviour in selectors.ts.
 */
export const calculatePercentChange = (
  current: number,
  previous: number | null | undefined,
): number | null => {
  if (previous === null || previous === undefined || previous === 0)
    return null;
  return (current - previous) / Math.abs(previous);
};

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

/**
 * Sum any numeric field projected from a list.
 *   sumBy(items, (i) => i.amount)
 */
export const sumBy = <T>(
  items: readonly T[],
  pick: (item: T) => number,
): number => items.reduce((acc, item) => acc + pick(item), 0);

/**
 * Average of a projected field. Skips null/undefined entries entirely
 * (they don't drag the mean toward zero). Returns `null` if every entry
 * is missing — caller decides whether to render "—" or "0".
 */
export const averageBy = <T>(
  items: readonly T[],
  pick: (item: T) => number | null | undefined,
): number | null => {
  let sum = 0;
  let count = 0;
  for (const item of items) {
    const v = pick(item);
    if (v === null || v === undefined) continue;
    sum += v;
    count += 1;
  }
  return count === 0 ? null : sum / count;
};

// ---------------------------------------------------------------------------
// Tiny utilities
// ---------------------------------------------------------------------------

/** Comparator for `Array#sort` — ascending by `month` (1-12). */
export const byMonthAsc = <T extends { month: number }>(a: T, b: T): number =>
  a.month - b.month;

/**
 * `[min, max]` of a numeric array, or `null` for an empty array.
 * Useful for chart Y-axis domains where you want to skip rendering when
 * there's nothing to plot rather than fall back to `[0, 0]`.
 */
export const minMax = (
  values: readonly number[],
): [number, number] | null => {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
};
