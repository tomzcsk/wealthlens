import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'wealthlens_goals';
const STORAGE_VERSION = 2;

/**
 * Defaults pre-filled when opening Income form in add mode. Salary and the
 * stable deduction lines (ปกส, กองทุน, กยศ) tend to be constant — Tom sets
 * these once and pulls them into each new month with one click. Variable
 * fields (bonus, commission, monthly tax variance) stay manual.
 */
export interface IncomeDefaults {
  salary: number;
  tax: number;
  socialSecurity: number;
  providentFund: number;
  gsl: number;
}

export interface GoalsState {
  /** Per-year savings target in raw THB. Indexed by 4-digit year string. */
  yearlyGoals: { [year: string]: number };
  /** Standalone "ออมเที่ยว" target — single value, not per-year. */
  travelSavingsGoal: number;
  /**
   * Per-year balance of Tom's Krungsri "Kept" savings account — manually
   * entered, NOT derived from Net.All − จ่าย. This is the actual money he
   * has stashed away (snapshot at end of year, or current balance for the
   * active year).
   */
  keptBalances: { [year: string]: number };
  /** Default income/deduction values — pre-fills new months on demand. */
  incomeDefaults: IncomeDefaults | null;

  setYearlyGoal: (year: number, amount: number) => void;
  setTravelSavingsGoal: (amount: number) => void;
  setKeptBalance: (year: number, amount: number) => void;
  clearKeptBalance: (year: number) => void;
  setIncomeDefaults: (defaults: IncomeDefaults) => void;
  clearIncomeDefaults: () => void;
}

export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      yearlyGoals: {},
      travelSavingsGoal: 0,
      keptBalances: {},
      incomeDefaults: null,

      setYearlyGoal: (year, amount) =>
        set((state) => ({
          yearlyGoals: {
            ...state.yearlyGoals,
            [String(year)]: Math.max(0, amount),
          },
        })),

      setTravelSavingsGoal: (amount) =>
        set({ travelSavingsGoal: Math.max(0, amount) }),

      setKeptBalance: (year, amount) =>
        set((state) => ({
          keptBalances: {
            ...state.keptBalances,
            [String(year)]: Math.max(0, amount),
          },
        })),

      clearKeptBalance: (year) =>
        set((state) => {
          const next = { ...state.keptBalances };
          delete next[String(year)];
          return { keptBalances: next };
        }),

      setIncomeDefaults: (defaults) =>
        set({
          incomeDefaults: {
            salary: Math.max(0, defaults.salary),
            tax: Math.max(0, defaults.tax),
            socialSecurity: Math.max(0, defaults.socialSecurity),
            providentFund: Math.max(0, defaults.providentFund),
            gsl: Math.max(0, defaults.gsl),
          },
        }),

      clearIncomeDefaults: () => set({ incomeDefaults: null }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      partialize: (state) => ({
        yearlyGoals: state.yearlyGoals,
        travelSavingsGoal: state.travelSavingsGoal,
        keptBalances: state.keptBalances,
        incomeDefaults: state.incomeDefaults,
      }),
    },
  ),
);
