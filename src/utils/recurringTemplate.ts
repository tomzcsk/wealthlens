import type { ExpenseItem, SavingsItem, WealthLensData } from '@/types';

const STEP_LIMIT = 36;
/** How many prior months (including the source) to inspect for amount stability. */
const STABILITY_LOOKBACK = 3;

interface RecurrableItem {
  name: string;
  amount: number;
  isRecurring: boolean;
}

const stepBack = (year: number, month: number): { year: number; month: number } =>
  month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

const expenseItemsForMonth = (
  data: WealthLensData,
  year: number,
  month: number,
): ExpenseItem[] => {
  const yr = data.years[String(year)];
  if (!yr) return [];
  return yr.expenses.find((e) => e.month === month)?.items ?? [];
};

const savingsItemsForMonth = (
  data: WealthLensData,
  year: number,
  month: number,
): SavingsItem[] => {
  const yr = data.years[String(year)];
  if (!yr) return [];
  return (yr.savings ?? []).find((s) => s.month === month)?.items ?? [];
};

/**
 * Walk backwards from (anchorYear, anchorMonth) up to STABILITY_LOOKBACK
 * months and collect every amount we've seen for the named item.
 *
 * If amounts are all identical across observations → return the value
 * (Tom can rely on it next month: Netflix ฿419, ChatGPT ฿720).
 * If they vary → return 0 (force user to type this month's actual:
 * ค่าไฟ, Net AIS, Claude AI promo months).
 *
 * Single observation = treat as stable (no contradicting signal).
 */
const inferStableAmount = <T extends RecurrableItem>(
  fetcher: (data: WealthLensData, year: number, month: number) => T[],
  data: WealthLensData,
  anchorYear: number,
  anchorMonth: number,
  nameKey: string,
): number => {
  const seen: number[] = [];
  let cursor = { year: anchorYear, month: anchorMonth };
  for (let i = 0; i < STABILITY_LOOKBACK; i += 1) {
    const items = fetcher(data, cursor.year, cursor.month);
    const match = items.find(
      (it) => it.isRecurring && it.name.trim().toLowerCase() === nameKey,
    );
    if (match) seen.push(match.amount);
    cursor = stepBack(cursor.year, cursor.month);
  }
  if (seen.length === 0) return 0;
  const allEqual = seen.every((v) => v === seen[0]);
  return allEqual ? seen[0] : 0;
};

interface FindOptions<T extends RecurrableItem, R> {
  fetcher: (data: WealthLensData, year: number, month: number) => T[];
  build: (item: T, amount: number) => R;
}

/**
 * Find the most recent month strictly BEFORE (year, month) that has at
 * least one `isRecurring` item, then return those items minus any whose
 * normalised name is already present in (year, month).
 *
 * Each item's amount is auto-decided per `inferStableAmount`:
 *   - stable across last 3 months → carry the value
 *   - varies                       → default to 0 (Tom fills in monthly)
 *
 * Returns `null` when no template can be found within STEP_LIMIT lookback
 * or when every template item is already in the current month.
 */
const findTemplate = <T extends RecurrableItem, R>(
  data: WealthLensData,
  year: number,
  month: number,
  opts: FindOptions<T, R>,
): { sourceYear: number; sourceMonth: number; items: ReadonlyArray<R> } | null => {
  const existingNames = new Set(
    opts.fetcher(data, year, month).map((it) => it.name.trim().toLowerCase()),
  );

  let cursor = stepBack(year, month);
  for (let i = 0; i < STEP_LIMIT; i += 1) {
    const items = opts.fetcher(data, cursor.year, cursor.month);
    const recurring = items.filter((it) => it.isRecurring);
    if (recurring.length > 0) {
      const fresh = recurring
        .filter((it) => !existingNames.has(it.name.trim().toLowerCase()))
        .map((it): R => {
          const nameKey = it.name.trim().toLowerCase();
          const amount = inferStableAmount(
            opts.fetcher,
            data,
            cursor.year,
            cursor.month,
            nameKey,
          );
          return opts.build(it, amount);
        });
      if (fresh.length === 0) return null;
      return {
        sourceYear: cursor.year,
        sourceMonth: cursor.month,
        items: fresh,
      };
    }
    cursor = stepBack(cursor.year, cursor.month);
  }
  return null;
};

export interface RecurringExpenseTemplate {
  sourceYear: number;
  sourceMonth: number;
  items: ReadonlyArray<Omit<ExpenseItem, 'id'>>;
}

export const findRecurringTemplate = (
  data: WealthLensData,
  year: number,
  month: number,
): RecurringExpenseTemplate | null =>
  findTemplate<ExpenseItem, Omit<ExpenseItem, 'id'>>(data, year, month, {
    fetcher: expenseItemsForMonth,
    build: (it, amount) => ({
      category: it.category,
      name: it.name,
      amount,
      isRecurring: true,
    }),
  });

export interface RecurringSavingsTemplate {
  sourceYear: number;
  sourceMonth: number;
  items: ReadonlyArray<Omit<SavingsItem, 'id'>>;
}

export const findRecurringSavingsTemplate = (
  data: WealthLensData,
  year: number,
  month: number,
): RecurringSavingsTemplate | null =>
  findTemplate<SavingsItem, Omit<SavingsItem, 'id'>>(data, year, month, {
    fetcher: savingsItemsForMonth,
    build: (it, amount) => ({
      category: it.category,
      name: it.name,
      amount,
      isRecurring: true,
    }),
  });
