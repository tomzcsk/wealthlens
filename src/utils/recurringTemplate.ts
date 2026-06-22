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
 */
export type RecurringLibraryStatus = 'present' | 'active';

export interface RecurringLibraryEntry<C extends string = string> {
  category: C;
  name: string;
  amount: number;
  status: RecurringLibraryStatus;
}

const STATUS_WEIGHT: Record<RecurringLibraryStatus, number> = {
  active: 0,
  present: 1,
};

/**
 * Build the recurring-item checklist for the fill modal: the current month's
 * recurring items (status 'present', shown for context) plus the recurring
 * items from the most-recent prior month that aren't here yet (status 'active',
 * default-checked). No older "history" cruft — only the active recurring set.
 *
 * Active amounts use the same stability rule as the one-shot template (stable
 * across last 3 months → carry; varies → 0). Sorted active → present.
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
  const currentItems = fetcher(data, year, month);
  const presentNames = new Set(
    currentItems.map((it) => it.name.trim().toLowerCase()),
  );

  // 'present' — recurring items already in this month (read-only context).
  const entries: RecurringLibraryEntry<C>[] = currentItems
    .filter((it) => it.isRecurring)
    .map((it) => ({
      category: it.category as C,
      name: it.name,
      amount: it.amount,
      status: 'present' as const,
    }));

  // 'active' — recurring items from the most-recent prior month that has any,
  // minus anything already present. Only that one month (no deeper history).
  let cursor = stepBack(year, month);
  for (let i = 0; i < STEP_LIMIT; i += 1) {
    const recurring = fetcher(data, cursor.year, cursor.month).filter(
      (it) => it.isRecurring,
    );
    if (recurring.length > 0) {
      for (const it of recurring) {
        const key = it.name.trim().toLowerCase();
        if (!presentNames.has(key)) {
          entries.push({
            category: it.category as C,
            name: it.name,
            amount: inferStableAmount(fetcher, data, cursor.year, cursor.month, key),
            status: 'active',
          });
        }
      }
      break;
    }
    cursor = stepBack(cursor.year, cursor.month);
  }

  return entries.sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status]);
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
