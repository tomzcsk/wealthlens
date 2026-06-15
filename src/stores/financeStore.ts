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

import { gslLoan as seedGslLoan } from '@/data/seedData';
import {
  advanceMonth,
  applyCarInstallmentTags,
  CAR_INSTALLMENT,
  carSequenceFor,
  removeInstallmentTags,
  round2,
} from '@/utils/installments';
import type {
  ExpenseCategory,
  ExpenseItem,
  ExtraPayment,
  GoldHolding,
  GoldPaymentMethod,
  GoldPriceSnapshot,
  GoldPurity,
  GoldSaleRecord,
  GoldType,
  InstallmentMeta,
  Loan,
  LoanInstallment,
  LoanType,
  MonthlyExpense,
  MonthlyIncome,
  MonthlySavings,
  Reimbursement,
  SavingsItem,
  TaxAllowanceInputs,
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

/**
 * Inputs for creating a new Loan. The store generates `id` and accepts the
 * lender-issued schedule + extras as-given (they're authoritative).
 */
export interface LoanInput {
  name: string;
  type: LoanType;
  startDate: string;
  schedule: LoanInstallment[];
  linkedDeductionField?: Loan['linkedDeductionField'];
}

/** Editable subset of a Loan, mirroring the GoldHoldingPatch pattern. */
export interface LoanPatch {
  name?: string;
  type?: LoanType;
  startDate?: string;
  schedule?: LoanInstallment[];
  linkedDeductionField?: Loan['linkedDeductionField'] | null;
}

/** Inputs for a lump-sum extra payment ("โปะ"). */
export interface ExtraPaymentInput {
  date: string;
  amount: number;
  reference?: string;
  notes?: string;
  /**
   * When true, the store dual-writes a matching ExpenseItem (category
   * 'finance') into the month derived from `date`. The new item's id is
   * stamped onto the ExtraPayment so a later delete can revert cleanly.
   */
  createExpenseEntry: boolean;
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
  /** ถอด installment metadata ออกจากทุกแถวของแผน (เก็บแถว expense ไว้). */
  untagInstallmentPlan: (planId: string) => void;

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
  /**
   * Bulk-import historical price snapshots (e.g. from a pasted website
   * table). `mode: 'merge'` dedupes against existing entries by minute;
   * `'replace'` discards the existing history entirely.
   */
  bulkImportGoldPriceHistory: (
    snapshots: GoldPriceSnapshot[],
    mode: 'merge' | 'replace',
  ) => void;

  // --- Loans --------------------------------------------------------------
  /**
   * Create a new long-running debt with its lender-issued amortization
   * schedule. Returns the new loan's id.
   */
  addLoan: (input: LoanInput) => string;
  /**
   * Push an already-shaped Loan onto `data.loans` verbatim — used by the
   * "Load demo" button to seed Tom's กยศ ledger without going through the
   * input/uuid path. No-op when a loan with the same id already exists,
   * so the button is idempotent if the user clicks it twice.
   */
  seedLoan: (loan: Loan) => void;
  /** Patch a loan's metadata or replace its schedule wholesale. */
  updateLoan: (id: string, patch: LoanPatch) => void;
  /**
   * Remove a loan and ALL of its `extraPayments`. When
   * `revertExpenseSideEffects` is true, also delete every linked
   * ExpenseItem the dual-write created (the mirror of
   * `deleteGoldHolding`).
   */
  deleteLoan: (
    id: string,
    options: { revertExpenseSideEffects: boolean },
  ) => void;
  /**
   * Add a lump-sum payment to a loan. When `createExpenseEntry` is true,
   * dual-writes an ExpenseItem (category 'finance') in the matching
   * month. Returns the new ExtraPayment id.
   */
  addExtraPayment: (loanId: string, input: ExtraPaymentInput) => string;
  /**
   * Remove an extra payment. When `revertExpenseSideEffect` is true,
   * also delete the linked ExpenseItem.
   */
  deleteExtraPayment: (
    loanId: string,
    extraId: string,
    options: { revertExpenseSideEffect: boolean },
  ) => void;

  // --- Tax allowances ------------------------------------------------------
  /**
   * Replace the itemized PIT allowance inputs for one tax year. The tax
   * page writes the whole object on every keystroke (single-screen form),
   * so field-level patching isn't needed.
   */
  setTaxAllowances: (year: number, inputs: TaxAllowanceInputs) => void;

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
          const expensesAddedYears: WealthLensData['years'] = {
            ...years,
            [key]: { ...current, expenses: nextExpenses },
          };
          // Auto-continue the รถยนต์ installment plan — a freshly added car row
          // in a month within the 60-งวด range is tagged automatically (joining
          // the existing plan via its planId, computing งวด from the calendar),
          // so the "ผ่อน X/60" badge appears without a manual re-tag. Idempotent
          // and a no-op for every other expense.
          const isCarInstallmentRow =
            newItem.name === CAR_INSTALLMENT.name &&
            newItem.category === CAR_INSTALLMENT.category &&
            carSequenceFor(year, month) != null;
          const finalYears = isCarInstallmentRow
            ? applyCarInstallmentTags(expensesAddedYears)
            : expensesAddedYears;
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: finalYears,
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


      untagInstallmentPlan: (planId) =>
        set((state) => {
          const years = removeInstallmentTags(state.data.years, planId);
          const stamp = nowIso();
          return {
            data: { ...state.data, lastUpdated: stamp, years },
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

          // Append to rolling history. Dedup: if the newest snapshot is
          // from the same API round, replace it instead of growing the
          // list (handles rapid re-clicks of the refresh button).
          const MAX_SNAPSHOTS = 365;
          const newSnap: GoldPriceSnapshot = {
            fetchedAt: stampIso,
            price965: price,
            ...(round ? { round } : {}),
          };
          const prevHistory = state.data.goldPriceHistory ?? [];
          const lastSnap = prevHistory[prevHistory.length - 1];
          const sameRound =
            lastSnap && round && lastSnap.round === round;
          const nextHistory = sameRound
            ? [...prevHistory.slice(0, -1), newSnap]
            : [...prevHistory, newSnap];
          const cappedHistory =
            nextHistory.length > MAX_SNAPSHOTS
              ? nextHistory.slice(-MAX_SNAPSHOTS)
              : nextHistory;

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              preferences: nextPrefs,
              goldPriceHistory: cappedHistory,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      bulkImportGoldPriceHistory: (incoming, mode) =>
        set((state) => {
          const MAX_SNAPSHOTS = 365;
          let next: GoldPriceSnapshot[];
          if (mode === 'replace') {
            next = [...incoming];
          } else {
            const prev = state.data.goldPriceHistory ?? [];
            const byTime = new Map<string, GoldPriceSnapshot>();
            for (const s of prev) byTime.set(s.fetchedAt, s);
            for (const s of incoming) byTime.set(s.fetchedAt, s);
            next = Array.from(byTime.values());
          }
          next.sort((a, b) => (a.fetchedAt < b.fetchedAt ? -1 : 1));
          if (next.length > MAX_SNAPSHOTS) {
            next = next.slice(-MAX_SNAPSHOTS);
          }
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              goldPriceHistory: next,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      addLoan: (input) => {
        const id = uuidv4();
        set((state) => {
          const loan: Loan = {
            id,
            name: input.name,
            type: input.type,
            startDate: input.startDate,
            schedule: input.schedule,
            scheduledPayments: [],
            extraPayments: [],
            ...(input.linkedDeductionField
              ? { linkedDeductionField: input.linkedDeductionField }
              : {}),
          };
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              loans: [...(state.data.loans ?? []), loan],
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        });
        return id;
      },

      seedLoan: (loan) =>
        set((state) => {
          const loans = state.data.loans ?? [];
          if (loans.some((l) => l.id === loan.id)) return state;
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              loans: [...loans, loan],
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      updateLoan: (id, patch) =>
        set((state) => {
          const loans = state.data.loans ?? [];
          let touched = false;
          const next = loans.map((l) => {
            if (l.id !== id) return l;
            touched = true;
            // Re-build the loan field-by-field so undefined patch values
            // don't accidentally clobber existing data (a `{}` spread
            // would leave them, but explicit is safer).
            const merged: Loan = {
              ...l,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.type !== undefined ? { type: patch.type } : {}),
              ...(patch.startDate !== undefined
                ? { startDate: patch.startDate }
                : {}),
              ...(patch.schedule !== undefined
                ? { schedule: patch.schedule }
                : {}),
            };
            // `linkedDeductionField: null` is the explicit "clear it" signal.
            if (patch.linkedDeductionField === null) {
              delete (merged as { linkedDeductionField?: unknown })
                .linkedDeductionField;
            } else if (patch.linkedDeductionField !== undefined) {
              merged.linkedDeductionField = patch.linkedDeductionField;
            }
            return merged;
          });
          if (!touched) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, loans: next, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),

      deleteLoan: (id, { revertExpenseSideEffects }) =>
        set((state) => {
          const loans = state.data.loans ?? [];
          const target = loans.find((l) => l.id === id);
          if (!target) return state;

          const nextLoans = loans.filter((l) => l.id !== id);
          let nextYears = state.data.years;

          if (revertExpenseSideEffects) {
            // Sweep every linked expense — keep month rows intact (mirror
            // of deleteExpense semantics).
            for (const ep of target.extraPayments) {
              if (
                !ep.linkedExpenseItemId ||
                ep.linkedExpenseYear == null ||
                ep.linkedExpenseMonth == null
              ) {
                continue;
              }
              const yearKey = String(ep.linkedExpenseYear);
              const yr = nextYears[yearKey];
              if (!yr) continue;
              const nextExpenses = yr.expenses.map((row) =>
                row.month === ep.linkedExpenseMonth
                  ? {
                      ...row,
                      items: row.items.filter(
                        (it) => it.id !== ep.linkedExpenseItemId,
                      ),
                    }
                  : row,
              );
              nextYears = {
                ...nextYears,
                [yearKey]: { ...yr, expenses: nextExpenses },
              };
            }
          }

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              loans: nextLoans,
              years: nextYears,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      addExtraPayment: (loanId, input) => {
        const extraId = uuidv4();
        set((state) => {
          const loans = state.data.loans ?? [];
          if (!loans.some((l) => l.id === loanId)) return state;

          // Anchor date for the optional expense side-effect.
          const dt = new Date(`${input.date}T00:00:00`);
          const year = dt.getFullYear();
          const month = dt.getMonth() + 1;

          let nextYears = state.data.years;
          let linkedExpenseItemId: string | undefined;

          if (input.createExpenseEntry) {
            nextYears = ensureYear(nextYears, year);
            const yearKey = String(year);
            const yr = normalizeYear(nextYears[yearKey]);
            linkedExpenseItemId = uuidv4();
            const newExpense: ExpenseItem = {
              id: linkedExpenseItemId,
              category: 'finance',
              name: `โปะ${loans.find((l) => l.id === loanId)?.name ?? 'loan'}`,
              amount: input.amount,
              isRecurring: false,
            };
            const monthRow = yr.expenses.find((e) => e.month === month);
            const nextExpenses: MonthlyExpense[] = monthRow
              ? yr.expenses.map((e) =>
                  e.month === month
                    ? { ...e, items: [...e.items, newExpense] }
                    : e,
                )
              : [...yr.expenses, { month, items: [newExpense] }];
            nextYears = {
              ...nextYears,
              [yearKey]: { ...yr, expenses: nextExpenses },
            };
          }

          const newExtra: ExtraPayment = {
            id: extraId,
            date: input.date,
            amount: input.amount,
            createExpenseEntry: input.createExpenseEntry,
            ...(input.reference ? { reference: input.reference } : {}),
            ...(input.notes ? { notes: input.notes } : {}),
            ...(linkedExpenseItemId
              ? {
                  linkedExpenseItemId,
                  linkedExpenseYear: year,
                  linkedExpenseMonth: month,
                }
              : {}),
          };

          const nextLoans = loans.map((l) =>
            l.id === loanId
              ? { ...l, extraPayments: [...l.extraPayments, newExtra] }
              : l,
          );

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              loans: nextLoans,
              years: nextYears,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        });
        return extraId;
      },

      deleteExtraPayment: (loanId, extraId, { revertExpenseSideEffect }) =>
        set((state) => {
          const loans = state.data.loans ?? [];
          const loan = loans.find((l) => l.id === loanId);
          if (!loan) return state;
          const extra = loan.extraPayments.find((e) => e.id === extraId);
          if (!extra) return state;

          let nextYears = state.data.years;
          if (
            revertExpenseSideEffect &&
            extra.linkedExpenseItemId &&
            extra.linkedExpenseYear != null &&
            extra.linkedExpenseMonth != null
          ) {
            const yearKey = String(extra.linkedExpenseYear);
            const yr = nextYears[yearKey];
            if (yr) {
              const nextExpenses = yr.expenses.map((row) =>
                row.month === extra.linkedExpenseMonth
                  ? {
                      ...row,
                      items: row.items.filter(
                        (it) => it.id !== extra.linkedExpenseItemId,
                      ),
                    }
                  : row,
              );
              nextYears = {
                ...nextYears,
                [yearKey]: { ...yr, expenses: nextExpenses },
              };
            }
          }

          const nextLoans = loans.map((l) =>
            l.id === loanId
              ? {
                  ...l,
                  extraPayments: l.extraPayments.filter(
                    (e) => e.id !== extraId,
                  ),
                }
              : l,
          );

          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              loans: nextLoans,
              years: nextYears,
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      setTaxAllowances: (year, inputs) =>
        set((state) => {
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              taxAllowances: {
                ...state.data.taxAllowances,
                [String(year)]: inputs,
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
          // Same preserve-local policy as preferences: a remote payload
          // written before the tax-allowances feature must not wipe them.
          const taxAllowances =
            data.taxAllowances ?? state.data.taxAllowances;
          // Same preserve-local policy for gold/loans: payloads predating
          // these features must not wipe locally-stored ledger data.
          const goldHoldings = data.goldHoldings ?? state.data.goldHoldings;
          const goldPriceHistory =
            data.goldPriceHistory ?? state.data.goldPriceHistory;
          const loans = data.loans ?? state.data.loans;
          return {
            data: {
              ...data,
              years,
              preferences,
              taxAllowances,
              goldHoldings,
              goldPriceHistory,
              loans,
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
        // One-shot migrations for seed values Claude made up before the
        // actual paycheck slips arrived (2026-05-19). Each migration only
        // overwrites cells that still hold a *known wrong* value — if a
        // user manually corrected something to a different value, we leave
        // it alone. Multiple predicates cover the various intermediate
        // states older Claude commits may have written.
        const fixDeductions = (
          yearKey: string,
          monthNum: number,
          predicate: (d: MonthlyIncome['deductions']) => boolean,
          patch: Partial<MonthlyIncome['deductions']>,
        ): void => {
          const yr = years[yearKey];
          if (!yr) return;
          const inc = yr.income.find((i) => i.month === monthNum);
          if (!inc) return;
          if (!predicate(inc.deductions)) return;
          inc.deductions = { ...inc.deductions, ...patch };
        };

        // 2024 Oct — paycheck pattern (confirmed by Q1 2026 slips) is that
        // the company auto-debits every month even when the lender portal
        // doesn't post a credit. An earlier Claude commit zeroed this; now
        // revert to the original seed/sheet value.
        fixDeductions('2024', 10, (d) => d.gsl === 0, { gsl: 994 });

        // 2025 Mar/Apr — portal confirms two separate 994 entries. Earlier
        // seed lumped them as Apr=1988, Mar=0.
        fixDeductions('2025', 3, (d) => d.gsl === 0, { gsl: 994 });
        fixDeductions('2025', 4, (d) => d.gsl === 1988, { gsl: 994 });

        // 2026 Feb — slip: ss 875, gsl 1,156. Catch every stale intermediate.
        fixDeductions(
          '2026',
          2,
          (d) =>
            (d.gsl === 1281 || d.gsl === 0) &&
            (d.socialSecurity === 750 || d.socialSecurity === 1125),
          { gsl: 1156, socialSecurity: 875 },
        );

        // 2026 Mar — slip: ss 875, gsl 0 (paycheck skipped this month).
        fixDeductions(
          '2026',
          3,
          (d) =>
            (d.gsl === 125 || d.gsl === 0) && d.socialSecurity === 750,
          { gsl: 0, socialSecurity: 875 },
        );

        // 2026 Apr — slip: ss 875, gsl 1,156.
        fixDeductions(
          '2026',
          4,
          (d) =>
            (d.gsl === 906 || d.gsl === 0) &&
            (d.socialSecurity === 1125 || d.socialSecurity === 750),
          { gsl: 1156, socialSecurity: 875 },
        );

        // Loans written before scheduledPayments existed lack the field;
        // backfill an empty array so selectors can iterate without guards.
        // For the seed กยศ loan specifically, restore the portal-derived
        // scheduledPayments from the bundled seed so existing users pick
        // up the 22-row monthly history without having to re-seed.
        const loans = data.loans?.map((l) => {
          if (l.scheduledPayments && l.scheduledPayments.length > 0) return l;
          if (l.id === seedGslLoan.id) {
            return { ...l, scheduledPayments: seedGslLoan.scheduledPayments };
          }
          return { ...l, scheduledPayments: l.scheduledPayments ?? [] };
        });
        return {
          ...currentState,
          ...persisted,
          data: { ...data, years, ...(loans ? { loans } : {}) },
        };
      },
    },
  ),
);
