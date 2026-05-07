/**
 * WealthLens — core domain types.
 * Mirrors the data schema in techstack.md section 6.
 *
 * Single source of truth for shape of data persisted to LocalStorage,
 * synced to Google Drive, and exported as JSON backup.
 */

/** Top-level container persisted to LocalStorage / synced to Drive. */
export interface WealthLensData {
  /** Schema version — bump on any breaking change to enable migrations. */
  version: string;
  /** ISO 8601 timestamp of the last write. Used for Drive conflict resolution. */
  lastUpdated: string;
  /** Indexed by 4-digit year string (e.g. "2026"). */
  years: {
    [year: string]: YearData;
  };
  /**
   * Per-user UI preferences that need to ride along with the Drive payload
   * (yearly goals, travel goal, Krungsri Kept balances, income defaults).
   * Optional — Drive payloads written before the preferences refactor won't
   * have it. Consumers must default-handle `undefined`.
   */
  preferences?: UserPreferences;
}

/**
 * Per-user preferences synced via the Drive payload.
 * Migrated from the standalone `goalsStore` so that signing in on a fresh
 * device hydrates these alongside the financial ledger.
 */
export interface UserPreferences {
  /** Per-year savings target in raw THB. Indexed by 4-digit year string. */
  yearlyGoals: { [year: string]: number };
  /** Standalone "ออมเที่ยว" target — single value, not per-year. */
  travelSavingsGoal: number;
  /** Per-year balance of the Krungsri "Kept" account, manually entered. */
  keptBalances: { [year: string]: number };
  /** Default income/deduction values — pre-fills new months on demand. */
  incomeDefaults: IncomeDefaults | null;
}

/**
 * Defaults pre-filled when opening the Income form in add mode. Salary and
 * the stable deduction lines (ปกส, กองทุน, กยศ) tend to be constant — Tom
 * sets these once and pulls them into each new month with one click.
 * Variable fields (bonus, commission, monthly tax variance) stay manual.
 */
export interface IncomeDefaults {
  salary: number;
  tax: number;
  socialSecurity: number;
  providentFund: number;
  gsl: number;
}

export interface YearData {
  income: MonthlyIncome[];
  expenses: MonthlyExpense[];
  /**
   * Monthly savings/investments — first-class citizen alongside income and
   * expenses. Existed conceptually before (Dime tucked into deductions,
   * ออมเที่ยว tucked into expenses) but is now its own column. Empty array
   * for years with no contributions.
   */
  savings: MonthlySavings[];
}

export interface MonthlyIncome {
  /** Calendar month, 1-12. */
  month: number;
  salary: number;
  bonus: number;
  commission: number;
  deductions: MonthlyDeductions;
}

export interface MonthlyDeductions {
  tax: number;
  socialSecurity: number;
  providentFund: number;
  /** กยศ (student loan) repayment. */
  gsl: number;
  // NOTE: `investment` (Dime) used to live here as an optional field. It has
  // moved to `MonthlySavings` as a first-class savings line. Do NOT add it
  // back here — savings are not deductions.
}

export interface MonthlyExpense {
  /** Calendar month, 1-12. */
  month: number;
  items: ExpenseItem[];
}

export interface ExpenseItem {
  /** UUID v4 generated client-side. */
  id: string;
  category: ExpenseCategory;
  /** Free-form Thai label (e.g. "บ้าน", "Net AIS"). */
  name: string;
  amount: number;
  isRecurring: boolean;
}

export type ExpenseCategory =
  | 'housing'
  | 'vehicle'
  | 'utilities'
  | 'subscription'
  | 'finance'
  | 'entertainment'
  /**
   * @deprecated — savings are now tracked in `MonthlySavings`, not as
   * expense items. This variant is retained so legacy persisted data
   * doesn't fail typecheck during migration; new entry forms must NOT
   * offer it.
   */
  | 'savings'
  | 'other';

// ---------------------------------------------------------------------------
// Savings & Investments — first-class category (parallel to income/expenses)
// ---------------------------------------------------------------------------

export type SavingsCategory =
  /** Dime app investments — moved here from MonthlyDeductions.investment. */
  | 'investment-dime'
  /** ออมเที่ยว — travel goal savings. */
  | 'travel'
  /** Emergency fund — future use. */
  | 'emergency'
  /**
   * Personal retirement savings (NOT the mandatory provident fund — that
   * stays in deductions because it's payroll-mandated).
   */
  | 'retirement'
  /** Catch-all for ad-hoc savings goals. */
  | 'general';

export interface SavingsItem {
  /** UUID v4 generated client-side. */
  id: string;
  category: SavingsCategory;
  /** Free-form Thai label (e.g. "ลงทุน Dime", "ออมเที่ยว"). */
  name: string;
  amount: number;
  isRecurring: boolean;
}

export interface MonthlySavings {
  /** Calendar month, 1-12. */
  month: number;
  items: SavingsItem[];
}
