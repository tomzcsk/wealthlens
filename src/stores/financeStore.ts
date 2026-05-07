/**
 * WealthLens — global finance store.
 *
 * Single source of truth for all years' income / expense / savings data.
 * Persisted to LocalStorage under key `wealthlens_data`. The Drive sync
 * layer reads/writes the same shape, so this store is the canonical model.
 *
 * Design notes:
 *  - Mutations REPLACE-by-month rather than append-then-dedupe; this keeps
 *    the persisted blob compact and avoids stale duplicates if the user
 *    re-saves an income row.
 *  - `lastUpdated` is bumped on EVERY write so the Drive sync layer can do
 *    timestamp-based conflict resolution without a separate dirty flag.
 *  - Selectors live in a sibling module; the store stays a clean state
 *    container with no derived calculations.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

import seedData from '@/data/seedData';
import type {
  ExpenseItem,
  MonthlyExpense,
  MonthlyIncome,
  MonthlySavings,
  SavingsItem,
  WealthLensData,
  YearData,
} from '@/types';

const STORAGE_KEY = 'wealthlens_data';
const STORAGE_VERSION = 1;
const DEFAULT_YEAR = new Date().getFullYear();

/**
 * Empty initial dataset — first run for any user gets a blank slate.
 * Tom's historical seed (`seedData`) is no longer auto-loaded so a brand-new
 * Google account (e.g. Tom's partner) doesn't accidentally pull Tom's data
 * onto their Drive. Loading the seed is now opt-in via the Danger Zone
 * "Reset & Push" button. Existing users on Tom's MacBook are unaffected
 * because persist middleware hydrates from LocalStorage on every run.
 */
const emptyData = (): WealthLensData => ({
  version: '1.0.0',
  lastUpdated: nowIso(),
  years: {
    [String(DEFAULT_YEAR)]: { income: [], expenses: [], savings: [] },
  },
});

/** ISO timestamp helper — extracted for test override. */
const nowIso = (): string => new Date().toISOString();

/** Empty year scaffold used when adding income/expenses to an unseen year. */
const emptyYear = (): YearData => ({ income: [], expenses: [], savings: [] });

/**
 * Defensive normaliser — rehydrates a YearData that may be missing the
 * `savings` field (older persisted snapshots). Returns the same object
 * when it's already well-formed to avoid unnecessary churn.
 */
const normalizeYear = (yr: YearData): YearData => {
  if (Array.isArray((yr as { savings?: unknown }).savings)) return yr;
  return { ...yr, savings: [] };
};

/** Returns a shallow clone of the years map with `year` ensured to exist. */
const ensureYear = (
  years: WealthLensData['years'],
  year: number,
): WealthLensData['years'] => {
  const key = String(year);
  if (years[key]) return years;
  return { ...years, [key]: emptyYear() };
};

export interface FinanceState {
  /** Persisted finance data — everything Drive cares about. */
  data: WealthLensData;
  /** Currently selected year for dashboards/forms. */
  selectedYear: number;
  /** Currently selected month (1-12) or `null` for "all months". */
  selectedMonth: number | null;
  /** Mirror of `data.lastUpdated` hoisted for cheap subscription. */
  lastUpdated: string;

  // --- Income mutations ---------------------------------------------------
  addIncome: (year: number, income: MonthlyIncome) => void;
  updateIncome: (
    year: number,
    month: number,
    patch: Partial<MonthlyIncome>,
  ) => void;
  deleteIncome: (year: number, month: number) => void;

  // --- Expense mutations --------------------------------------------------
  addExpense: (
    year: number,
    month: number,
    item: Omit<ExpenseItem, 'id'>,
  ) => void;
  updateExpense: (
    year: number,
    month: number,
    itemId: string,
    patch: Partial<ExpenseItem>,
  ) => void;
  deleteExpense: (year: number, month: number, itemId: string) => void;

  // --- Savings mutations --------------------------------------------------
  addSavings: (
    year: number,
    month: number,
    item: Omit<SavingsItem, 'id'>,
  ) => void;
  updateSavings: (
    year: number,
    month: number,
    itemId: string,
    patch: Partial<SavingsItem>,
  ) => void;
  deleteSavings: (year: number, month: number, itemId: string) => void;

  // --- Navigation ---------------------------------------------------------
  setSelectedYear: (year: number) => void;
  setSelectedMonth: (month: number | null) => void;

  // --- Bulk operations ----------------------------------------------------
  /** Wholesale replacement — used by import / restore-from-Drive. */
  replaceAllData: (data: WealthLensData) => void;
  /** Reload the bundled seed dataset (handy in dev / for "Reset"). */
  resetToSeed: () => void;
}

/**
 * Build the initial state object.
 * Persist middleware will overwrite `data`/`selectedYear`/`selectedMonth`
 * from LocalStorage on hydration; the seed only matters for first run.
 */
const buildInitialState = (): Pick<
  FinanceState,
  'data' | 'selectedYear' | 'selectedMonth' | 'lastUpdated'
> => {
  const empty = emptyData();
  return {
    data: empty,
    selectedYear: DEFAULT_YEAR,
    selectedMonth: null,
    lastUpdated: empty.lastUpdated,
  };
};

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set) => ({
      ...buildInitialState(),

      addIncome: (year, income) =>
        set((state) => {
          const years = ensureYear(state.data.years, year);
          const key = String(year);
          const current = years[key];
          // Replace by month if exists, otherwise append.
          const nextIncome = current.income.some((i) => i.month === income.month)
            ? current.income.map((i) =>
                i.month === income.month ? income : i,
              )
            : [...current.income, income];
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...years,
                [key]: { ...current, income: nextIncome },
              },
            },
            lastUpdated: stamp,
          };
        }),

      updateIncome: (year, month, patch) =>
        set((state) => {
          const key = String(year);
          const current = state.data.years[key];
          if (!current) return state;
          const nextIncome = current.income.map((i) =>
            i.month === month
              ? {
                  ...i,
                  ...patch,
                  // Merge nested deductions instead of clobbering.
                  deductions: patch.deductions
                    ? { ...i.deductions, ...patch.deductions }
                    : i.deductions,
                }
              : i,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, income: nextIncome },
              },
            },
            lastUpdated: stamp,
          };
        }),

      deleteIncome: (year, month) =>
        set((state) => {
          const key = String(year);
          const current = state.data.years[key];
          if (!current) return state;
          const nextIncome = current.income.filter((i) => i.month !== month);
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, income: nextIncome },
              },
            },
            lastUpdated: stamp,
          };
        }),

      addExpense: (year, month, item) =>
        set((state) => {
          const years = ensureYear(state.data.years, year);
          const key = String(year);
          const current = years[key];
          const newItem: ExpenseItem = { ...item, id: uuidv4() };
          const monthRow = current.expenses.find((e) => e.month === month);
          const nextExpenses: MonthlyExpense[] = monthRow
            ? current.expenses.map((e) =>
                e.month === month ? { ...e, items: [...e.items, newItem] } : e,
              )
            : [...current.expenses, { month, items: [newItem] }];
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...years,
                [key]: { ...current, expenses: nextExpenses },
              },
            },
            lastUpdated: stamp,
          };
        }),

      updateExpense: (year, month, itemId, patch) =>
        set((state) => {
          const key = String(year);
          const current = state.data.years[key];
          if (!current) return state;
          const nextExpenses = current.expenses.map((row) =>
            row.month === month
              ? {
                  ...row,
                  items: row.items.map((it) =>
                    it.id === itemId ? { ...it, ...patch, id: it.id } : it,
                  ),
                }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, expenses: nextExpenses },
              },
            },
            lastUpdated: stamp,
          };
        }),

      deleteExpense: (year, month, itemId) =>
        set((state) => {
          const key = String(year);
          const current = state.data.years[key];
          if (!current) return state;
          // Keep the (possibly empty) month row to preserve historical
          // intent that this month was tracked.
          const nextExpenses = current.expenses.map((row) =>
            row.month === month
              ? { ...row, items: row.items.filter((it) => it.id !== itemId) }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, expenses: nextExpenses },
              },
            },
            lastUpdated: stamp,
          };
        }),

      addSavings: (year, month, item) =>
        set((state) => {
          const years = ensureYear(state.data.years, year);
          const key = String(year);
          const current = normalizeYear(years[key]);
          const newItem: SavingsItem = { ...item, id: uuidv4() };
          const monthRow = current.savings.find((s) => s.month === month);
          const nextSavings: MonthlySavings[] = monthRow
            ? current.savings.map((s) =>
                s.month === month ? { ...s, items: [...s.items, newItem] } : s,
              )
            : [...current.savings, { month, items: [newItem] }];
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...years,
                [key]: { ...current, savings: nextSavings },
              },
            },
            lastUpdated: stamp,
          };
        }),

      updateSavings: (year, month, itemId, patch) =>
        set((state) => {
          const key = String(year);
          const raw = state.data.years[key];
          if (!raw) return state;
          const current = normalizeYear(raw);
          const nextSavings = current.savings.map((row) =>
            row.month === month
              ? {
                  ...row,
                  items: row.items.map((it) =>
                    it.id === itemId ? { ...it, ...patch, id: it.id } : it,
                  ),
                }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, savings: nextSavings },
              },
            },
            lastUpdated: stamp,
          };
        }),

      deleteSavings: (year, month, itemId) =>
        set((state) => {
          const key = String(year);
          const raw = state.data.years[key];
          if (!raw) return state;
          const current = normalizeYear(raw);
          // Mirror the expense-delete pattern: preserve the (possibly empty)
          // month row to retain the "this month was tracked" signal.
          const nextSavings = current.savings.map((row) =>
            row.month === month
              ? { ...row, items: row.items.filter((it) => it.id !== itemId) }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, savings: nextSavings },
              },
            },
            lastUpdated: stamp,
          };
        }),

      setSelectedYear: (year) => set({ selectedYear: year }),

      setSelectedMonth: (month) => set({ selectedMonth: month }),

      replaceAllData: (data) =>
        set(() => {
          const stamp = nowIso();
          // Normalise every year so missing `savings` arrays don't crash
          // downstream selectors.
          const years: WealthLensData['years'] = {};
          for (const [k, yr] of Object.entries(data.years)) {
            years[k] = normalizeYear(yr);
          }
          return {
            data: { ...data, years, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      resetToSeed: () =>
        set(() => {
          const stamp = nowIso();
          return {
            data: { ...seedData, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      // Persist only what should outlive a refresh. Action functions are
      // excluded automatically by zustand persist as they are not enumerated
      // here, but we keep the partializer explicit for safety.
      partialize: (state) => ({
        data: state.data,
        selectedYear: state.selectedYear,
        selectedMonth: state.selectedMonth,
        lastUpdated: state.lastUpdated,
      }),
      /**
       * Persisted snapshots written before the savings refactor lack the
       * `savings` field on each YearData. Normalise them in place during
       * rehydration so selectors can rely on the field being present.
       *
       * We DON'T bump `STORAGE_VERSION` because the change is purely
       * additive (no breakage for callers that don't know about savings).
       */
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<FinanceState>;
        const data = persisted.data;
        if (!data?.years) {
          return { ...currentState, ...persisted };
        }
        const years: WealthLensData['years'] = {};
        for (const [k, yr] of Object.entries(data.years)) {
          years[k] = normalizeYear(yr);
        }
        return {
          ...currentState,
          ...persisted,
          data: { ...data, years },
        };
      },
    },
  ),
);
