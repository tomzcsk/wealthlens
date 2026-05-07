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

/** Public state shape exposed by the facade — identical to the old store. */
export interface GoalsState {
  yearlyGoals: { [year: string]: number };
  travelSavingsGoal: number;
  keptBalances: { [year: string]: number };
  incomeDefaults: IncomeDefaults | null;

  setYearlyGoal: (year: number, amount: number) => void;
  setTravelSavingsGoal: (amount: number) => void;
  setKeptBalance: (year: number, amount: number) => void;
  clearKeptBalance: (year: number) => void;
  setIncomeDefaults: (defaults: IncomeDefaults) => void;
  clearIncomeDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EMPTY_PREFS: UserPreferences = Object.freeze({
  yearlyGoals: Object.freeze({}) as Record<string, number>,
  travelSavingsGoal: 0,
  keptBalances: Object.freeze({}) as Record<string, number>,
  incomeDefaults: null,
}) as UserPreferences;

const readPrefs = (data: WealthLensData): UserPreferences =>
  data.preferences ?? EMPTY_PREFS;

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
    const current = state.data.preferences ?? EMPTY_PREFS;
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

  setKeptBalance: (year, amount) =>
    mutatePrefs((p) => ({
      ...p,
      keptBalances: {
        ...p.keptBalances,
        [String(year)]: Math.max(0, amount),
      },
    })),

  clearKeptBalance: (year) =>
    mutatePrefs((p) => {
      const next = { ...p.keptBalances };
      delete next[String(year)];
      return { ...p, keptBalances: next };
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
    keptBalances?: Record<string, number>;
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
      keptBalances: sanitizeNumberMap(legacy.keptBalances),
      incomeDefaults: sanitizeIncomeDefaults(legacy.incomeDefaults),
    };

    // Merge: never clobber preferences already set in financeStore.data
    // (e.g. if Drive already sent down a fresher payload before migration
    // ran). Legacy values fill in only where the canonical store is empty.
    useFinanceStore.setState((state) => {
      const existing = state.data.preferences ?? EMPTY_PREFS;
      const merged: UserPreferences = {
        yearlyGoals: { ...ported.yearlyGoals, ...existing.yearlyGoals },
        travelSavingsGoal:
          existing.travelSavingsGoal > 0
            ? existing.travelSavingsGoal
            : ported.travelSavingsGoal,
        keptBalances: { ...ported.keptBalances, ...existing.keptBalances },
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
