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

/**
 * Status of a recurring item relative to the target month:
 *   - 'present' → already in this month (show as "มีแล้ว", not re-added)
 *   - 'active'  → recurring in the most recent prior month (default-checked)
 *   - 'history' → recurring sometime earlier but not active (tick to add)
 */
export type RecurringLibraryStatus = 'present' | 'active' | 'history';

export interface RecurringLibraryEntry<C extends string = string> {
  category: C;
  name: string;
  amount: number;
  status: RecurringLibraryStatus;
}

const STATUS_WEIGHT: Record<RecurringLibraryStatus, number> = {
  active: 0,
  history: 1,
  present: 2,
};

/**
 * Build the full "library" of recurring items Tom has ever recorded, so the
 * fill modal can show them as a checklist instead of making him retype.
 *
 * Walks back up to STEP_LIMIT months, dedupes recurring items by normalised
 * name (keeping the most-recent occurrence's category + original casing), and
 * tags each with a `status`. Amount is inferred via the same stability rule as
 * the one-shot template (stable across last 3 months → carry; varies → 0).
 *
 * Sorted active → history → present; recency preserved within each bucket.
 */
const buildLibrary = <
  T extends RecurrableItem & { category: string },
  C extends string,
>(
  data: WealthLensData,
  year: number,
  month: number,
  fetcher: (data: WealthLensData, year: number, month: number) => T[],
): RecurringLibraryEntry<C>[] => {
  const presentNames = new Set(
    fetcher(data, year, month).map((it) => it.name.trim().toLowerCase()),
  );

  const activeNames = new Set<string>();
  const order: string[] = [];
  const meta = new Map<
    string,
    { category: string; name: string; anchorYear: number; anchorMonth: number }
  >();

  let cursor = stepBack(year, month);
  let activeCaptured = false;
  for (let i = 0; i < STEP_LIMIT; i += 1) {
    const recurring = fetcher(data, cursor.year, cursor.month).filter(
      (it) => it.isRecurring,
    );
    if (recurring.length > 0 && !activeCaptured) {
      activeCaptured = true;
      for (const it of recurring) activeNames.add(it.name.trim().toLowerCase());
    }
    for (const it of recurring) {
      const key = it.name.trim().toLowerCase();
      if (!meta.has(key)) {
        order.push(key);
        meta.set(key, {
          category: it.category,
          name: it.name,
          anchorYear: cursor.year,
          anchorMonth: cursor.month,
        });
      }
    }
    cursor = stepBack(cursor.year, cursor.month);
  }

  return order
    .map((key): RecurringLibraryEntry<C> => {
      const m = meta.get(key)!;
      const status: RecurringLibraryStatus = presentNames.has(key)
        ? 'present'
        : activeNames.has(key)
          ? 'active'
          : 'history';
      const amount = inferStableAmount(
        fetcher,
        data,
        m.anchorYear,
        m.anchorMonth,
        key,
      );
      return { category: m.category as C, name: m.name, amount, status };
    })
    .sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]);
};

export const buildRecurringExpenseLibrary = (
  data: WealthLensData,
  year: number,
  month: number,
): RecurringLibraryEntry[] =>
  buildLibrary<ExpenseItem, string>(data, year, month, expenseItemsForMonth);

export const buildRecurringSavingsLibrary = (
  data: WealthLensData,
  year: number,
  month: number,
): RecurringLibraryEntry[] =>
  buildLibrary<SavingsItem, string>(data, year, month, savingsItemsForMonth);
