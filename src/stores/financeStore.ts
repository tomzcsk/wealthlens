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
  ExpenseCategory,
  ExpenseItem,
  GoldHolding,
  GoldPaymentMethod,
  GoldPurity,
  GoldSaleRecord,
  GoldType,
  InstallmentMeta,
  MonthlyExpense,
  MonthlyIncome,
  MonthlySavings,
  Reimbursement,
  SavingsItem,
  UserPreferences,
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

/**
 * Inputs for creating a new installment plan. The store derives `planId`,
 * per-งวด amount, and the year/month walk from these.
 */
export interface InstallmentPlanInput {
  name: string;
  category: ExpenseCategory;
  /** Full price the plan is for — split across `totalMonths` งวด. */
  totalAmount: number;
  totalMonths: number;
  startYear: number;
  /** 1-12. */
  startMonth: number;
  isRecurring?: boolean;
  reimbursement?: Reimbursement;
}

/**
 * Round to 2 decimals. Uses `Math.round` rather than `toFixed` to keep the
 * result as a number (avoids string→number churn downstream).
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Inputs for adding a gold purchase. The store derives `id`, generates
 * the side-effect ref block, and writes both halves of the dual-entry.
 */
export interface GoldHoldingInput {
  purchaseDate: string; // ISO yyyy-mm-dd
  brand: string;
  type: GoldType;
  purity: GoldPurity;
  weightBaht: number;
  totalCost: number;
  spotPriceAtPurchase?: number;
  notes?: string;
  paymentMethod: GoldPaymentMethod;
}

/** Subset of GoldHolding fields editable post-create — see action docs. */
export interface GoldHoldingPatch {
  brand?: string;
  type?: GoldType;
  purity?: GoldPurity;
  notes?: string;
  spotPriceAtPurchase?: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  yearlyGoals: {},
  travelSavingsGoal: 0,
  keptBalances: {},
  incomeDefaults: null,
};

/** Returns prefs with sensible defaults filled in for missing fields. */
const ensurePreferences = (
  prefs: UserPreferences | undefined,
): UserPreferences => prefs ?? DEFAULT_PREFERENCES;

/**
 * Walk (year, month) forward by `offset` months. month overflow rolls into
 * the next calendar year, e.g. (2026, 11) + 3 → (2027, 2).
 */
const advanceMonth = (
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } => {
  const zeroBased = month - 1 + offset;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
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

  // --- Installment plan mutations ---------------------------------------
  /**
   * Create N expense items (1 per งวด) across consecutive months, all
   * tagged with the same generated `planId`. Spans years naturally —
   * month overflow rolls into the next calendar year.
   */
  addInstallmentPlan: (input: InstallmentPlanInput) => string;
  /** Remove every ExpenseItem tagged with the given `planId`. */
  deleteInstallmentPlan: (planId: string) => void;

  // --- Gold holdings ------------------------------------------------------
  /**
   * Record a gold purchase + auto-write the matching side-effect on the
   * cashflow ledger (SavingsItem for `cash`, Kept decrement for `kept`).
   * Returns the new holding's id.
   */
  addGoldHolding: (input: GoldHoldingInput) => string;
  /**
   * Patch a holding's metadata-only fields (brand/type/purity/notes/spot).
   * Amount, date, and paymentMethod are immutable post-create to keep the
   * side-effect bookkeeping coherent; change those by delete + re-add.
   */
  updateGoldHolding: (id: string, patch: GoldHoldingPatch) => void;
  /**
   * Remove a holding. When `revertSideEffects` is true, also undo the
   * auto-write (delete the SavingsItem or restore the Kept balance).
   */
  deleteGoldHolding: (
    id: string,
    options: { revertSideEffects: boolean },
  ) => void;
  /** Mark a holding as sold with the resulting sale record. */
  sellGoldHolding: (id: string, sale: GoldSaleRecord) => void;
  /** Clear the sold record, putting the holding back into active. */
  unsellGoldHolding: (id: string) => void;
  /** Update the manually-entered spot price for one purity grade. */
  setGoldSpotPrice: (purity: GoldPurity, price: number | null) => void;
  /** Stamp 96.5% spot from a successful auto-fetch (preserves round meta). */
  applyFetchedGoldPrice: (price: number, round: string) => void;

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

      addInstallmentPlan: (input) => {
        const planId = uuidv4();
        const {
          name,
          category,
          totalAmount,
          totalMonths,
          startYear,
          startMonth,
          isRecurring,
          reimbursement,
        } = input;

        // Per-งวด amount with the last งวด absorbing the rounding remainder
        // so the rows sum back to `totalAmount` exactly.
        const perInstallment = round2(totalAmount / totalMonths);
        const lastInstallment = round2(
          totalAmount - perInstallment * (totalMonths - 1),
        );

        set((state) => {
          // Work on a single mutable years map so all งวด land in one
          // state update — atomic and only bumps `lastUpdated` once.
          let years: WealthLensData['years'] = state.data.years;

          for (let seq = 1; seq <= totalMonths; seq++) {
            const { year, month } = advanceMonth(startYear, startMonth, seq - 1);
            years = ensureYear(years, year);
            const key = String(year);
            const current = years[key];
            const amount = seq === totalMonths ? lastInstallment : perInstallment;
            const installment: InstallmentMeta = {
              planId,
              sequence: seq,
              totalMonths,
              totalAmount,
              startYear,
              startMonth,
            };
            const newItem: ExpenseItem = {
              id: uuidv4(),
              category,
              name,
              amount,
              isRecurring: isRecurring ?? false,
              installment,
              ...(reimbursement ? { reimbursement } : {}),
            };
            const monthRow = current.expenses.find((e) => e.month === month);
            const nextExpenses: MonthlyExpense[] = monthRow
              ? current.expenses.map((e) =>
                  e.month === month
                    ? { ...e, items: [...e.items, newItem] }
                    : e,
                )
              : [...current.expenses, { month, items: [newItem] }];
            years = {
              ...years,
              [key]: { ...current, expenses: nextExpenses },
            };
          }

          const stamp = nowIso();
          return {
            data: { ...state.data, lastUpdated: stamp, years },
            lastUpdated: stamp,
          };
        });

        return planId;
      },

      deleteInstallmentPlan: (planId) =>
        set((state) => {
          let touched = false;
          const nextYears: WealthLensData['years'] = {};
          for (const [yearKey, yr] of Object.entries(state.data.years)) {
            let yearTouched = false;
            const nextExpenses = yr.expenses.map((row) => {
              const filtered = row.items.filter(
                (it) => it.installment?.planId !== planId,
              );
              if (filtered.length === row.items.length) return row;
              yearTouched = true;
              return { ...row, items: filtered };
            });
            if (yearTouched) {
              touched = true;
              nextYears[yearKey] = { ...yr, expenses: nextExpenses };
            } else {
              nextYears[yearKey] = yr;
            }
          }
          if (!touched) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, lastUpdated: stamp, years: nextYears },
            lastUpdated: stamp,
          };
        }),

      addGoldHolding: (input) => {
        const newId = uuidv4();
        set((state) => {
          // Date parsing — purchaseDate is the cashflow anchor for both
          // SavingsItem and Kept side-effects.
          const dt = new Date(`${input.purchaseDate}T00:00:00`);
          const year = dt.getFullYear();
          const month = dt.getMonth() + 1;

          const holding: GoldHolding = {
            id: newId,
            purchaseDate: input.purchaseDate,
            brand: input.brand,
            type: input.type,
            purity: input.purity,
            weightBaht: input.weightBaht,
            totalCost: input.totalCost,
            paymentMethod: input.paymentMethod,
            ...(input.spotPriceAtPurchase != null
              ? { spotPriceAtPurchase: input.spotPriceAtPurchase }
              : {}),
            ...(input.notes != null ? { notes: input.notes } : {}),
          };

          let nextYears = state.data.years;
          let nextPrefs = ensurePreferences(state.data.preferences);

          if (input.paymentMethod === 'cash') {
            // Dual-write: mirror the purchase as a SavingsItem in the
            // matching month's savings row so "ออม/ลงทุน" of that month
            // reflects the cash outflow.
            nextYears = ensureYear(nextYears, year);
            const yearKey = String(year);
            const yr = normalizeYear(nextYears[yearKey]);
            const savingsItemId = uuidv4();
            const newSavingsItem: SavingsItem = {
              id: savingsItemId,
              category: 'gold',
              name: `🪙 ${input.brand} ${input.weightBaht} บาท`,
              amount: input.totalCost,
              isRecurring: false,
            };
            const monthRow = yr.savings.find((s) => s.month === month);
            const nextSavings: MonthlySavings[] = monthRow
              ? yr.savings.map((s) =>
                  s.month === month
                    ? { ...s, items: [...s.items, newSavingsItem] }
                    : s,
                )
              : [...yr.savings, { month, items: [newSavingsItem] }];
            nextYears = {
              ...nextYears,
              [yearKey]: { ...yr, savings: nextSavings },
            };
            holding.sideEffects = {
              savingsItemId,
              savingsYear: year,
              savingsMonth: month,
            };
          } else {
            // Kept decrement: read the absolute balance and subtract.
            const yearKey = String(year);
            const monthKey = String(month);
            const currentKept = nextPrefs.keptBalances[yearKey]?.[monthKey] ?? 0;
            const nextKept = currentKept - input.totalCost;
            nextPrefs = {
              ...nextPrefs,
              keptBalances: {
                ...nextPrefs.keptBalances,
                [yearKey]: {
                  ...(nextPrefs.keptBalances[yearKey] ?? {}),
                  [monthKey]: nextKept,
                },
              },
            };
            holding.sideEffects = {
              keptYear: year,
              keptMonth: month,
              keptAmount: input.totalCost,
            };
          }

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              years: nextYears,
              preferences: nextPrefs,
              goldHoldings: [...(state.data.goldHoldings ?? []), holding],
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        });
        return newId;
      },

      updateGoldHolding: (id, patch) =>
        set((state) => {
          const holdings = state.data.goldHoldings ?? [];
          let touched = false;
          const next = holdings.map((h) => {
            if (h.id !== id) return h;
            touched = true;
            return {
              ...h,
              ...(patch.brand !== undefined ? { brand: patch.brand } : {}),
              ...(patch.type !== undefined ? { type: patch.type } : {}),
              ...(patch.purity !== undefined ? { purity: patch.purity } : {}),
              ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
              ...(patch.spotPriceAtPurchase !== undefined
                ? { spotPriceAtPurchase: patch.spotPriceAtPurchase }
                : {}),
            };
          });
          if (!touched) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, goldHoldings: next, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      deleteGoldHolding: (id, { revertSideEffects }) =>
        set((state) => {
          const holdings = state.data.goldHoldings ?? [];
          const target = holdings.find((h) => h.id === id);
          if (!target) return state;

          const nextHoldings = holdings.filter((h) => h.id !== id);
          let nextYears = state.data.years;
          let nextPrefs = ensurePreferences(state.data.preferences);

          if (revertSideEffects && target.sideEffects) {
            const se = target.sideEffects;
            if (
              se.savingsItemId &&
              se.savingsYear != null &&
              se.savingsMonth != null
            ) {
              // Remove the matched SavingsItem only — keep the (possibly
              // empty) month row, mirroring deleteSavings semantics.
              const yearKey = String(se.savingsYear);
              const yr = nextYears[yearKey];
              if (yr) {
                const normalized = normalizeYear(yr);
                const nextSavings = normalized.savings.map((row) =>
                  row.month === se.savingsMonth
                    ? {
                        ...row,
                        items: row.items.filter(
                          (it) => it.id !== se.savingsItemId,
                        ),
                      }
                    : row,
                );
                nextYears = {
                  ...nextYears,
                  [yearKey]: { ...normalized, savings: nextSavings },
                };
              }
            } else if (
              se.keptYear != null &&
              se.keptMonth != null &&
              se.keptAmount != null
            ) {
              // Restore Kept by re-adding the subtracted amount.
              const yearKey = String(se.keptYear);
              const monthKey = String(se.keptMonth);
              const current = nextPrefs.keptBalances[yearKey]?.[monthKey] ?? 0;
              nextPrefs = {
                ...nextPrefs,
                keptBalances: {
                  ...nextPrefs.keptBalances,
                  [yearKey]: {
                    ...(nextPrefs.keptBalances[yearKey] ?? {}),
                    [monthKey]: current + se.keptAmount,
                  },
                },
              };
            }
          }

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              goldHoldings: nextHoldings,
              years: nextYears,
              preferences: nextPrefs,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      sellGoldHolding: (id, sale) =>
        set((state) => {
          const holdings = state.data.goldHoldings ?? [];
          let touched = false;
          const next = holdings.map((h) => {
            if (h.id !== id) return h;
            touched = true;
            return { ...h, sold: sale };
          });
          if (!touched) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, goldHoldings: next, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      unsellGoldHolding: (id) =>
        set((state) => {
          const holdings = state.data.goldHoldings ?? [];
          let touched = false;
          const next = holdings.map((h) => {
            if (h.id !== id || h.sold == null) return h;
            touched = true;
            // Drop `sold` by copying every other property.
            const rest: GoldHolding = {
              id: h.id,
              purchaseDate: h.purchaseDate,
              brand: h.brand,
              type: h.type,
              purity: h.purity,
              weightBaht: h.weightBaht,
              totalCost: h.totalCost,
              paymentMethod: h.paymentMethod,
              ...(h.spotPriceAtPurchase != null
                ? { spotPriceAtPurchase: h.spotPriceAtPurchase }
                : {}),
              ...(h.notes != null ? { notes: h.notes } : {}),
              ...(h.sideEffects ? { sideEffects: h.sideEffects } : {}),
            };
            return rest;
          });
          if (!touched) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, goldHoldings: next, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      setGoldSpotPrice: (purity, price) =>
        set((state) => {
          const prefs = ensurePreferences(state.data.preferences);
          const existing = prefs.goldSpotPrice ?? {};
          const nextSpot = { ...existing };
          if (price == null || !Number.isFinite(price) || price <= 0) {
            delete nextSpot[purity];
          } else {
            nextSpot[purity] = price;
          }
          nextSpot.updatedAt = new Date().toISOString();
          if (purity === '96.5') {
            delete nextSpot.autoFetchedAt;
            delete nextSpot.autoFetchedRound;
          }
          const nextPrefs: UserPreferences = {
            ...prefs,
            goldSpotPrice: nextSpot,
          };
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              preferences: nextPrefs,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      applyFetchedGoldPrice: (price, round) =>
        set((state) => {
          if (!Number.isFinite(price) || price <= 0) return state;
          const prefs = ensurePreferences(state.data.preferences);
          const existing = prefs.goldSpotPrice ?? {};
          const stampIso = new Date().toISOString();
          const nextSpot = {
            ...existing,
            '96.5': price,
            updatedAt: stampIso,
            autoFetchedAt: stampIso,
            autoFetchedRound: round || undefined,
          };
          const nextPrefs: UserPreferences = {
            ...prefs,
            goldSpotPrice: nextSpot,
          };
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              preferences: nextPrefs,
              lastUpdated: stamp,
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
        set((state) => {
          const stamp = nowIso();
          // Normalise every year so missing `savings` arrays don't crash
          // downstream selectors.
          const years: WealthLensData['years'] = {};
          for (const [k, yr] of Object.entries(data.years)) {
            years[k] = normalizeYear(yr);
          }
          // Preferences policy: prefer the incoming `data.preferences` if
          // present (Drive payloads written post-refactor carry it). For
          // older Drive payloads with no `preferences`, preserve whatever
          // is currently in local state — wholesale wiping the user's
          // Kept balances on a Drive pull would be the same data-loss bug
          // we're fixing.
          const preferences =
            data.preferences ?? state.data.preferences;
          return {
            data: { ...data, years, preferences, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      resetToSeed: () =>
        set((state) => {
          const stamp = nowIso();
          // Preserve current preferences across a "Reset to seed" — the
          // DangerZone flow re-hydrates Kept balances from
          // SEED_KEPT_BALANCES explicitly after calling this, so wiping
          // here would just be churn. yearlyGoals, travelSavingsGoal, and
          // incomeDefaults are intentionally retained.
          return {
            data: {
              ...seedData,
              preferences: state.data.preferences,
              lastUpdated: stamp,
            },
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
