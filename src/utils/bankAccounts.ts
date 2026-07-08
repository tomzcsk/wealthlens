/**
 * WealthLens — pure helpers for Bank Accounts (F33).
 * Migration from the legacy per-month `keptBalances` map + aggregate sums.
 * Pure/total: no throws, no Date.now, no mutation of inputs.
 */
import type { BankAccount, ExpenseSideEffectRefs, WealthLensData } from '@/types';

/** Stable id for the account migrated from Tom's Kept (กรุงศรี). */
export const KRUNGSRI_ACCOUNT_ID = 'acct-krungsri';

/** Deep-copy a year→month→number map. */
const cloneBalances = (
  src: { [year: string]: { [month: string]: number } } | undefined,
): BankAccount['balances'] => {
  const out: BankAccount['balances'] = {};
  for (const [y, months] of Object.entries(src ?? {})) {
    out[y] = { ...months };
  }
  return out;
};

/**
 * One-time migration: if legacy `preferences.keptBalances` has data, produce a
 * single "กรุงศรี" account carrying those balances (deep-copied). Returns
 * `undefined` when there's nothing to migrate (new users).
 */
export const migrateKeptToBankAccounts = (
  data: Pick<WealthLensData, 'preferences'>,
): BankAccount[] | undefined => {
  const kept = data.preferences?.keptBalances;
  if (!kept || Object.keys(kept).length === 0) return undefined;
  return [
    { id: KRUNGSRI_ACCOUNT_ID, name: 'กรุงศรี', balances: cloneBalances(kept) },
  ];
};

/** Sum one month across every account. */
export const sumBankMonth = (
  accounts: readonly BankAccount[],
  year: number,
  month: number,
): number =>
  accounts.reduce(
    (acc, a) => acc + (a.balances[String(year)]?.[String(month)] ?? 0),
    0,
  );

/** Sum a whole year (all 12 months) across every account. */
export const sumBankYear = (
  accounts: readonly BankAccount[],
  year: number,
): number =>
  accounts.reduce((acc, a) => {
    const yr = a.balances[String(year)] ?? {};
    return acc + Object.values(yr).reduce((s, v) => s + v, 0);
  }, 0);

/** Sum a single account's year (for its card / detail totals). */
export const accountYearTotal = (account: BankAccount, year: number): number => {
  const yr = account.balances[String(year)] ?? {};
  return Object.values(yr).reduce((s, v) => s + v, 0);
};

/** Latest month (1-12) in `year` that has a value, or null. */
export const latestMonthWithValue = (
  account: BankAccount,
  year: number,
): number | null => {
  const yr = account.balances[String(year)] ?? {};
  let latest: number | null = null;
  for (const k of Object.keys(yr)) {
    const m = Number(k);
    if (Number.isFinite(m) && (latest === null || m > latest)) latest = m;
  }
  return latest;
};

/**
 * The account's "current" balance for `year`: the value of the latest month
 * that has one, else the year total (0 when the year is empty). This is the
 * headline figure on cards and the summable input for a grand total.
 */
export const accountLatestBalance = (
  account: BankAccount,
  year: number,
): number => {
  const m = latestMonthWithValue(account, year);
  return m !== null
    ? account.balances[String(year)]?.[String(m)] ?? 0
    : accountYearTotal(account, year);
};

/** Sum of every account's current balance for `year` (grand total). */
export const sumBankLatest = (
  accounts: readonly BankAccount[],
  year: number,
): number => accounts.reduce((s, a) => s + accountLatestBalance(a, year), 0);

/** Accumulated balance across EVERY year+month of one account. */
export const accountAllTimeTotal = (account: BankAccount): number => {
  let sum = 0;
  for (const yr of Object.values(account.balances)) {
    for (const v of Object.values(yr)) sum += v;
  }
  return sum;
};

/** Accumulated balance across every account, all years (grand total). */
export const sumBankAllTime = (accounts: readonly BankAccount[]): number =>
  accounts.reduce((s, a) => s + accountAllTimeTotal(a), 0);

// ---------------------------------------------------------------------------
// Expense payment-source deduction (F34)
// ---------------------------------------------------------------------------

/**
 * Immutably add `delta` to `accounts[accountId].balances[year][month]`.
 * Creates the year/month entry if missing. Returns a NEW array (a shallow
 * copy when the account isn't found — silent no-op, matching gold's revert).
 */
export const applyBankDelta = (
  accounts: readonly BankAccount[],
  accountId: string,
  year: number,
  month: number,
  delta: number,
): BankAccount[] => {
  const yKey = String(year);
  const mKey = String(month);
  let found = false;
  const next = accounts.map((a) => {
    if (a.id !== accountId) return a;
    found = true;
    return {
      ...a,
      balances: {
        ...a.balances,
        [yKey]: {
          ...(a.balances[yKey] ?? {}),
          [mKey]: (a.balances[yKey]?.[mKey] ?? 0) + delta,
        },
      },
    };
  });
  return found ? next : accounts.slice();
};

/**
 * Reconcile a per-expense account deduction: revert `oldDed` (add its amount
 * back) then apply `newDed` (subtract its amount). Either may be undefined —
 * add = (undefined, new), delete = (old, undefined), edit = (old, new).
 * Correct even when old and new hit the same account/month (chained deltas).
 */
export const reconcileBankDeduction = (
  accounts: readonly BankAccount[],
  oldDed: ExpenseSideEffectRefs | undefined,
  newDed: ExpenseSideEffectRefs | undefined,
): BankAccount[] => {
  let next: BankAccount[] = accounts.slice();
  if (oldDed) {
    next = applyBankDelta(
      next,
      oldDed.accountId,
      oldDed.deductYear,
      oldDed.deductMonth,
      +oldDed.deductAmount,
    );
  }
  if (newDed) {
    next = applyBankDelta(
      next,
      newDed.accountId,
      newDed.deductYear,
      newDed.deductMonth,
      -newDed.deductAmount,
    );
  }
  return next;
};
