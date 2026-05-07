/**
 * WealthLens — goals store FACADE.
 *
 * Historical context: this used to be its own Zustand store backed by the
 * `wealthlens_goals` LocalStorage key. That key never rode along with the
 * Google Drive sync, so signing in on a fresh device left Tom without his
 * Kept balances, yearly goals, and income defaults. Data-portability bug.
 *
 * Fix: per-user preferences now live INSIDE `WealthLensData.preferences`
 * (the same blob already synced to Drive). This file is now a thin shim
 * over `useFinanceStore` — same public API, but every read traverses
 * `state.data.preferences` and every write goes through `mutatePrefs`,
 * which bumps `lastUpdated` and triggers the Drive sync coordinator.
 *
 * Action functions are MEMOIZED at module scope (the `ACTIONS` object
 * below). The selector wrapper uses `useShallow` so consumers that select
 * objects (`s.keptBalances`) get reference-stable values and don't loop.
 *
 * One-time migration: the first time this module loads in a browser, we
 * detect any pre-existing `wealthlens_goals` LocalStorage payload, port
 * its contents into `financeStore.data.preferences`, and delete the legacy
 * key. Guarded by a `wealthlens_goals_migrated` flag so it runs at most
 * once per browser.
 */

import { useShallow } from 'zustand/react/shallow';

import { useFinanceStore } from './financeStore';
import type { IncomeDefaults, UserPreferences, WealthLensData } from '@/types';

// Re-export `IncomeDefaults` for back-compat with consumers that import it
// from `@/stores/goalsStore`. Canonical location is now `@/types`.
export type { IncomeDefaults } from '@/types';

/**
 * Public state shape exposed by the facade.
 *
 * BREAKING from the previous version: `keptBalances` is now nested
 * `{ year: { month: amount } }` (used to be `{ year: amount }`), and
 * `setKeptBalance` / `clearKeptBalance` take a `month` argument. The
 * `normalizePreferences` helper at the bottom of this file lifts old-shape
 * persisted payloads into the new shape so existing browsers / Drive files
 * keep working without manual intervention.
 */
export interface GoalsState {
  yearlyGoals: { [year: string]: number };
  travelSavingsGoal: number;
  keptBalances: { [year: string]: { [month: string]: number } };
  incomeDefaults: IncomeDefaults | null;

  setYearlyGoal: (year: number, amount: number) => void;
  setTravelSavingsGoal: (amount: number) => void;
  /** Set one specific (year, month) Kept value. Replaces the existing entry. */
  setKeptBalance: (year: number, month: number, amount: number) => void;
  /** Clear one specific (year, month) Kept entry. */
  clearKeptBalance: (year: number, month: number) => void;
  setIncomeDefaults: (defaults: IncomeDefaults) => void;
  clearIncomeDefaults: () => void;
}

/**
 * Sum every monthly entry for a given year's Kept map. Pure helper exposed
 * separately because hooks-in-actions are awkward and computing this on
 * the read side keeps the reducers tiny.
 */
export const sumAnnualKept = (
  monthly: { [month: string]: number } | undefined,
): number => {
  if (!monthly) return 0;
  let sum = 0;
  for (const v of Object.values(monthly)) {
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EMPTY_PREFS: UserPreferences = Object.freeze({
  yearlyGoals: Object.freeze({}) as Record<string, number>,
  travelSavingsGoal: 0,
  keptBalances: Object.freeze({}) as Record<string, Record<string, number>>,
  incomeDefaults: null,
}) as UserPreferences;

/**
 * Cheap structural check: does this value already match the new
 * `{year: {month: number}}` shape? If so we can pass it through without
 * allocating a fresh object — important because `useGoalsStore` runs the
 * normaliser on every selector call, and returning a new reference every
 * time would break `useShallow` and trigger render loops.
 */
const isAlreadyNormalized = (
  raw: unknown,
): raw is { [year: string]: { [month: string]: number } } => {
  if (!raw || typeof raw !== 'object') return false;
  for (const value of Object.values(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') return false;
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    }
  }
  return true;
};

/**
 * Lift any keptBalances shape (old `{year: number}` OR new `{year: {month: number}}`)
 * into the canonical nested shape. Old single yearly snapshots are bucketed into
 * month "12" (December) since they semantically represented an end-of-year balance.
 *
 * Returns the SAME reference when the input is already well-shaped — keeps
 * `useShallow` happy and avoids render loops (cardinal sin per CLAUDE.md).
 *
 * Defensive against malformed entries — non-finite values are dropped silently
 * rather than corrupting the store.
 */
const normalizeKeptBalances = (
  raw: unknown,
): { [year: string]: { [month: string]: number } } => {
  if (!raw || typeof raw !== 'object') return {};
  if (isAlreadyNormalized(raw)) return raw;
  const out: { [year: string]: { [month: string]: number } } = {};
  for (const [year, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      // Legacy shape: a single yearly balance. Bucket as December.
      out[year] = { '12': value };
      continue;
    }
    if (value && typeof value === 'object') {
      const monthly: { [month: string]: number } = {};
      for (const [m, amt] of Object.entries(value as Record<string, unknown>)) {
        if (typeof amt === 'number' && Number.isFinite(amt)) {
          monthly[m] = amt;
        }
      }
      if (Object.keys(monthly).length > 0) out[year] = monthly;
    }
  }
  return out;
};

/**
 * Always read preferences through this normaliser so callers see the new
 * nested keptBalances shape regardless of how old the persisted blob is.
 *
 * Reference-stable: returns the SAME `prefs` object when nothing needs
 * lifting. Critical for `useShallow` in `useGoalsStore`.
 */
const normalizePreferences = (
  prefs: UserPreferences | undefined,
): UserPreferences => {
  if (!prefs) return EMPTY_PREFS;
  const rawKept: unknown = prefs.keptBalances;
  const normalized = normalizeKeptBalances(rawKept);
  if (normalized === rawKept) return prefs;
  return { ...prefs, keptBalances: normalized };
};

const readPrefs = (data: WealthLensData): UserPreferences =>
  normalizePreferences(data.preferences);

const nowIso = (): string => new Date().toISOString();

/**
 * Functional update of `data.preferences`. Wraps every mutation so the
 * `lastUpdated` stamp is bumped (which is what triggers Drive sync via the
 * subscription in `useDriveSyncCoordinator`).
 */
const mutatePrefs = (
  fn: (prev: UserPreferences) => UserPreferences,
): void => {
  useFinanceStore.setState((state) => {
    // Always normalise the previous shape so reducers receive new-shape data
    // even if the persisted blob predates the keptBalances refactor.
    const current = normalizePreferences(state.data.preferences);
    const nextPrefs = fn(current);
    const stamp = nowIso();
    return {
      data: { ...state.data, preferences: nextPrefs, lastUpdated: stamp },
      lastUpdated: stamp,
    };
  });
};

// ---------------------------------------------------------------------------
// Module-scope (stable-reference) actions
// ---------------------------------------------------------------------------

const ACTIONS: Pick<
  GoalsState,
  | 'setYearlyGoal'
  | 'setTravelSavingsGoal'
  | 'setKeptBalance'
  | 'clearKeptBalance'
  | 'setIncomeDefaults'
  | 'clearIncomeDefaults'
> = {
  setYearlyGoal: (year, amount) =>
    mutatePrefs((p) => ({
      ...p,
      yearlyGoals: {
        ...p.yearlyGoals,
        [String(year)]: Math.max(0, amount),
      },
    })),

  setTravelSavingsGoal: (amount) =>
    mutatePrefs((p) => ({
      ...p,
      travelSavingsGoal: Math.max(0, amount),
    })),

  setKeptBalance: (year, month, amount) =>
    mutatePrefs((p) => {
      // Negative values are valid here — withdrawals from the Kept account.
      // We don't clamp to >= 0 like other money fields.
      if (!Number.isFinite(amount)) return p;
      const yearKey = String(year);
      const monthKey = String(month);
      const yearBucket = p.keptBalances[yearKey] ?? {};
      return {
        ...p,
        keptBalances: {
          ...p.keptBalances,
          [yearKey]: { ...yearBucket, [monthKey]: amount },
        },
      };
    }),

  clearKeptBalance: (year, month) =>
    mutatePrefs((p) => {
      const yearKey = String(year);
      const monthKey = String(month);
      const yearBucket = p.keptBalances[yearKey];
      if (!yearBucket || !(monthKey in yearBucket)) return p;
      const nextYearBucket = { ...yearBucket };
      delete nextYearBucket[monthKey];
      const nextKept = { ...p.keptBalances };
      if (Object.keys(nextYearBucket).length === 0) {
        delete nextKept[yearKey];
      } else {
        nextKept[yearKey] = nextYearBucket;
      }
      return { ...p, keptBalances: nextKept };
    }),

  setIncomeDefaults: (defaults) =>
    mutatePrefs((p) => ({
      ...p,
      incomeDefaults: {
        salary: Math.max(0, defaults.salary),
        tax: Math.max(0, defaults.tax),
        socialSecurity: Math.max(0, defaults.socialSecurity),
        providentFund: Math.max(0, defaults.providentFund),
        gsl: Math.max(0, defaults.gsl),
      },
    })),

  clearIncomeDefaults: () =>
    mutatePrefs((p) => ({ ...p, incomeDefaults: null })),
};

// ---------------------------------------------------------------------------
// One-time migration from the legacy `wealthlens_goals` LocalStorage key
// ---------------------------------------------------------------------------

const LEGACY_KEY = 'wealthlens_goals';
const MIGRATED_FLAG = 'wealthlens_goals_migrated';

interface LegacyPersistedShape {
  state?: {
    yearlyGoals?: Record<string, number>;
    travelSavingsGoal?: number;
    /**
     * Both shapes accepted: pre-refactor `Record<year, number>` and
     * post-refactor nested `Record<year, Record<month, number>>`. The
     * normaliser handles both.
     */
    keptBalances?: unknown;
    incomeDefaults?: IncomeDefaults | null;
  };
}

const sanitizeNumberMap = (
  raw: Record<string, unknown> | undefined,
): Record<string, number> => {
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[k] = v;
    }
  }
  return out;
};

const sanitizeIncomeDefaults = (
  raw: unknown,
): IncomeDefaults | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<IncomeDefaults>;
  const num = (n: unknown): number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
  return {
    salary: num(r.salary),
    tax: num(r.tax),
    socialSecurity: num(r.socialSecurity),
    providentFund: num(r.providentFund),
    gsl: num(r.gsl),
  };
};

const migrateLegacyGoals = (): void => {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(MIGRATED_FLAG)) return;
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      window.localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }
    const parsed = JSON.parse(raw) as LegacyPersistedShape;
    const legacy = parsed?.state ?? {};

    const ported: UserPreferences = {
      yearlyGoals: sanitizeNumberMap(legacy.yearlyGoals),
      travelSavingsGoal:
        typeof legacy.travelSavingsGoal === 'number' &&
        Number.isFinite(legacy.travelSavingsGoal) &&
        legacy.travelSavingsGoal >= 0
          ? legacy.travelSavingsGoal
          : 0,
      // `normalizeKeptBalances` handles both shapes — old `{year: number}`
      // gets bucketed into Dec, new `{year: {month: number}}` passes through.
      keptBalances: normalizeKeptBalances(legacy.keptBalances),
      incomeDefaults: sanitizeIncomeDefaults(legacy.incomeDefaults),
    };

    // Merge: never clobber preferences already set in financeStore.data
    // (e.g. if Drive already sent down a fresher payload before migration
    // ran). Legacy values fill in only where the canonical store is empty.
    useFinanceStore.setState((state) => {
      const existing = normalizePreferences(state.data.preferences);
      // Per-year merge for kept: existing entries (already normalised) win,
      // ported entries only fill in years the canonical store doesn't know.
      const mergedKept: { [year: string]: { [month: string]: number } } = {
        ...ported.keptBalances,
      };
      for (const [year, months] of Object.entries(existing.keptBalances)) {
        mergedKept[year] = { ...(ported.keptBalances[year] ?? {}), ...months };
      }
      const merged: UserPreferences = {
        yearlyGoals: { ...ported.yearlyGoals, ...existing.yearlyGoals },
        travelSavingsGoal:
          existing.travelSavingsGoal > 0
            ? existing.travelSavingsGoal
            : ported.travelSavingsGoal,
        keptBalances: mergedKept,
        incomeDefaults: existing.incomeDefaults ?? ported.incomeDefaults,
      };
      const stamp = nowIso();
      return {
        data: { ...state.data, preferences: merged, lastUpdated: stamp },
        lastUpdated: stamp,
      };
    });

    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    // If migration fails (corrupt JSON, quota issues), set the flag anyway
    // so we don't retry forever. Worst case: legacy values stay in
    // localStorage but are no longer read — Tom re-enters once.
    try {
      window.localStorage.setItem(MIGRATED_FLAG, '1');
    } catch {
      // ignore — quota errors etc.
    }
  }
};

// Run migration synchronously at module import time. Safe because
// `useFinanceStore` (the persist middleware) hydrates eagerly from
// LocalStorage during its own module initialization, which runs before us.
migrateLegacyGoals();

// ---------------------------------------------------------------------------
// Public hook — drop-in replacement for the old `useGoalsStore`
// ---------------------------------------------------------------------------

/**
 * Selector hook with the same API as the original store. Internally subscribes
 * to `useFinanceStore` and wraps the `data.preferences` slice in a `GoalsState`
 * shape. `useShallow` keeps re-renders bounded: consumers that select a
 * primitive (`s.keptBalances[year]`) get straight referential equality;
 * consumers that select an object (`s.keptBalances`) get a shallow compare.
 */
export const useGoalsStore = <T,>(selector: (s: GoalsState) => T): T =>
  useFinanceStore(
    useShallow((s) => {
      const prefs = readPrefs(s.data);
      const goalsState: GoalsState = {
        yearlyGoals: prefs.yearlyGoals,
        travelSavingsGoal: prefs.travelSavingsGoal,
        keptBalances: prefs.keptBalances,
        incomeDefaults: prefs.incomeDefaults,
        ...ACTIONS,
      };
      return selector(goalsState);
    }),
  );
