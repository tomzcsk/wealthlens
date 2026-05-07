/**
 * Thai Personal Income Tax (PIT) calculator — simplified for WealthLens.
 *
 * Brackets used: post-2017 progressive table (still in force as of 2026):
 *   0 –   150,000 →  0%
 *   150 – 300,000 →  5%
 *   300 – 500,000 → 10%
 *   500 – 750,000 → 15%
 *   750 – 1,000,000 → 20%
 *   1M – 2M       → 25%
 *   2M – 5M       → 30%
 *   5M+           → 35%
 *
 * Allowances supported (the common ones for a salaried single filer):
 *   - 50% expense deduction (capped at 100,000)
 *   - Personal allowance: 60,000
 *   - Social Security paid (capped at 9,000)
 *   - Provident Fund paid (capped at 15% of income, max 500,000)
 *
 * Custom allowances (insurance, RMF, SSF, child, spouse) can be added via
 * the `extraAllowances` field for what-if scenarios.
 */
export interface TaxBracket {
  /** Lower bound (inclusive). */
  min: number;
  /** Upper bound (inclusive); `null` = open-ended top bracket. */
  max: number | null;
  rate: number;
}

export const TH_PIT_BRACKETS: ReadonlyArray<TaxBracket> = [
  { min: 0, max: 150_000, rate: 0 },
  { min: 150_000, max: 300_000, rate: 0.05 },
  { min: 300_000, max: 500_000, rate: 0.1 },
  { min: 500_000, max: 750_000, rate: 0.15 },
  { min: 750_000, max: 1_000_000, rate: 0.2 },
  { min: 1_000_000, max: 2_000_000, rate: 0.25 },
  { min: 2_000_000, max: 5_000_000, rate: 0.3 },
  { min: 5_000_000, max: null, rate: 0.35 },
];

export const PERSONAL_ALLOWANCE = 60_000;
export const EXPENSE_DEDUCTION_RATE = 0.5;
export const EXPENSE_DEDUCTION_CAP = 100_000;
export const SOCIAL_SECURITY_CAP = 9_000;
export const PROVIDENT_FUND_RATE_CAP = 0.15;
export const PROVIDENT_FUND_MAX = 500_000;

export interface TaxInput {
  /** Annual gross income (the assessable amount before any deductions). */
  income: number;
  /** Annual social security paid (will be capped at SOCIAL_SECURITY_CAP). */
  socialSecurity: number;
  /** Annual provident fund paid (capped at min(15% income, 500k)). */
  providentFund: number;
  /** Optional extra allowances (insurance, child, spouse, etc.) summed. */
  extraAllowances?: number;
}

export interface BracketBreakdown extends TaxBracket {
  /** Portion of taxable income that fell into this bracket. */
  taxableInBracket: number;
  /** Tax owed from this bracket alone. */
  taxFromBracket: number;
}

export interface TaxResult {
  grossIncome: number;
  expenseAllowance: number;
  personalAllowance: number;
  socialSecurityAllowance: number;
  providentFundAllowance: number;
  extraAllowances: number;
  totalAllowances: number;
  taxableIncome: number;
  brackets: BracketBreakdown[];
  totalTax: number;
  /** Effective tax rate against gross income (0..1). */
  effectiveRate: number;
}

const ZERO_RESULT = (gross: number): TaxResult => ({
  grossIncome: gross,
  expenseAllowance: 0,
  personalAllowance: 0,
  socialSecurityAllowance: 0,
  providentFundAllowance: 0,
  extraAllowances: 0,
  totalAllowances: 0,
  taxableIncome: 0,
  brackets: [],
  totalTax: 0,
  effectiveRate: 0,
});

export const calculateThaiPIT = (input: TaxInput): TaxResult => {
  const gross = Math.max(0, input.income);
  if (gross === 0) return ZERO_RESULT(0);

  const expenseAllowance = Math.min(
    gross * EXPENSE_DEDUCTION_RATE,
    EXPENSE_DEDUCTION_CAP,
  );
  const ssAllowance = Math.min(
    Math.max(0, input.socialSecurity),
    SOCIAL_SECURITY_CAP,
  );
  const pfCap = Math.min(gross * PROVIDENT_FUND_RATE_CAP, PROVIDENT_FUND_MAX);
  const pfAllowance = Math.min(Math.max(0, input.providentFund), pfCap);
  const extraAllowances = Math.max(0, input.extraAllowances ?? 0);

  const totalAllowances =
    expenseAllowance +
    PERSONAL_ALLOWANCE +
    ssAllowance +
    pfAllowance +
    extraAllowances;

  const taxableIncome = Math.max(0, gross - totalAllowances);

  const brackets: BracketBreakdown[] = [];
  let totalTax = 0;
  for (const bracket of TH_PIT_BRACKETS) {
    if (taxableIncome <= bracket.min) {
      brackets.push({ ...bracket, taxableInBracket: 0, taxFromBracket: 0 });
      continue;
    }
    const upper = bracket.max ?? Infinity;
    const portion = Math.min(taxableIncome, upper) - bracket.min;
    const tax = portion * bracket.rate;
    brackets.push({
      ...bracket,
      taxableInBracket: portion,
      taxFromBracket: tax,
    });
    totalTax += tax;
  }

  return {
    grossIncome: gross,
    expenseAllowance,
    personalAllowance: PERSONAL_ALLOWANCE,
    socialSecurityAllowance: ssAllowance,
    providentFundAllowance: pfAllowance,
    extraAllowances,
    totalAllowances,
    taxableIncome,
    brackets,
    totalTax,
    effectiveRate: gross > 0 ? totalTax / gross : 0,
  };
};
