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
  /**
   * Discrete physical-gold purchases — each entry is one ทอง transaction
   * with its own date, brand, weight, and price. Stored at the top level
   * (not under YearData) because a holding is an asset whose lifecycle —
   * buy → hold → sell — spans calendar years and isn't naturally bucketed
   * by month. UI filters by `purchaseDate` when a year view is needed.
   * Optional so payloads written before the gold feature still hydrate.
   */
  goldHoldings?: GoldHolding[];
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
  /**
   * Annual "ลงทุน Dime" investment target. Single value (not per-year)
   * because Dime is an auto-DCA stream Tom configures once. Optional so
   * older Drive payloads written before the field was added still hydrate.
   */
  dimeInvestmentGoal?: number;
  /**
   * Krungsri "Kept" savings account — monthly transactions.
   * Indexed by 4-digit year then 1-12 month string.
   * Annual Kept = sum of values across all 12 months for that year.
   * Negative values = withdrawals from the account.
   *
   * Schema note: this used to be `Record<year, number>` (a single yearly
   * snapshot). The shift to per-month tracking matches Tom's actual Sheet,
   * where each row of the Kept column is a deposit/withdrawal. A runtime
   * normaliser in `goalsStore` (`normalizePreferences`) lifts old-shape
   * payloads into the new shape so persisted data and Drive backups keep
   * working without requiring a schema-version bump.
   */
  keptBalances: { [year: string]: { [month: string]: number } };
  /** Default income/deduction values — pre-fills new months on demand. */
  incomeDefaults: IncomeDefaults | null;
  /**
   * Manually-entered spot price for ทอง per 1 บาททอง (15.244g) — used
   * by the Gold page to compute unrealized P&L. We deliberately do NOT
   * fetch from an API: free gold APIs come with rate limits, CORS pain,
   * and quietly-changing endpoints; manual entry from goldtraders.or.th
   * is the same single-source Tom already trusts. Optional — undefined
   * means "don't show unrealized P&L on the dashboard."
   */
  goldSpotPrice?: GoldSpotPrice;
}

export interface GoldSpotPrice {
  /** ทองรูปพรรณ / ทองคำ 96.5% baseline. */
  '96.5'?: number;
  /** ทองคำแท่ง 99.99% baseline. */
  '99.99'?: number;
  /** ISO date the user last updated the spot — shows staleness in UI. */
  updatedAt?: string;
  /**
   * ISO date when 96.5% was auto-fetched from สมาคมค้าทองคำ. Cleared on
   * any manual edit, so the "auto-fetched" indicator only shows while
   * the live value is still the API value.
   */
  autoFetchedAt?: string;
  /** API-reported round metadata, e.g. "เวลา 14:04 น. (ครั้งที่ 14)". */
  autoFetchedRound?: string;
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
  /**
   * Out-of-pocket expense awaiting (or already received) company
   * reimbursement. Absent when the expense is not reimbursable. Tom uses
   * this for Claude AI subscriptions he pays personally then claims back
   * from the office. The card on the Overview page sums every `pending`
   * row so he can see what the company still owes him at a glance.
   */
  reimbursement?: Reimbursement;
  /**
   * Installment metadata — present when this row is one งวด of an ผ่อน 0%
   * (or similar) multi-month plan. Each ExpenseItem in a plan carries the
   * same `planId` so the Installment Manager can join them, and a unique
   * `sequence` (1..totalMonths). Absent on regular one-shot expenses.
   */
  installment?: InstallmentMeta;
}

/**
 * Marks an `ExpenseItem` as one งวด of a multi-month installment plan.
 * The plan itself is not a separate entity — it's the set of all
 * ExpenseItems sharing the same `planId`. This keeps the existing
 * sum-from-items pipelines (charts, KPIs, exports) working without
 * special-casing installments while still letting the UI present
 * "ผ่อน 3/10" badges and a manager view.
 */
export interface InstallmentMeta {
  /** UUID shared by every งวด of this plan. */
  planId: string;
  /** 1-based งวด number. */
  sequence: number;
  /** Total number of งวด in the plan. */
  totalMonths: number;
  /** Original full price the plan was created for (display only). */
  totalAmount: number;
  /** Calendar year the first งวด lands in. */
  startYear: number;
  /** Calendar month (1-12) the first งวด lands in. */
  startMonth: number;
}

/**
 * Tracks whether an expense is awaiting / has received company
 * reimbursement. `receivedDate` is the ISO 8601 date (yyyy-mm-dd) the
 * reimbursement actually landed — recorded automatically when the user
 * flips the status, useful for proving turnaround time later.
 */
export interface Reimbursement {
  status: 'pending' | 'received';
  /** Filled when status === 'received'. ISO date (yyyy-mm-dd). */
  receivedDate?: string;
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
  /**
   * Physical gold purchases auto-logged from a `GoldHolding` whose
   * `paymentMethod === 'cash'`. The SavingsItem.id is mirrored back into
   * `GoldHolding.sideEffects.savingsItemId` so a later delete can revert
   * cleanly without orphaning either side of the dual write.
   */
  | 'gold'
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

// ---------------------------------------------------------------------------
// Gold holdings — discrete physical-gold purchases (asset ledger)
// ---------------------------------------------------------------------------

/** Conversion factor: 1 บาททอง = 15.244 grams (Thai gold trade standard). */
export const GRAMS_PER_BAHT = 15.244;

export type GoldType = 'bar' | 'jewelry';
export type GoldPurity = '96.5' | '99.99';

/**
 * Source of funds for a gold purchase. Drives the auto-created
 * side-effect on the cashflow side of the ledger:
 *   - `cash`  → create a `SavingsItem` (category 'gold') in the savings
 *                row of the purchase month. Tom sees the money leave via
 *                the "ออม/ลงทุน" column of that month.
 *   - `kept`  → decrement `preferences.keptBalances[year][month]` by
 *                `totalCost`. Tom sees his Kept account shrink; no
 *                impact on monthly Net.All (the cash already left months
 *                ago when he funded Kept).
 */
export type GoldPaymentMethod = 'cash' | 'kept';

/**
 * Mirror of the side-effect this gold purchase wrote into the cashflow
 * ledger. Stored so `deleteGoldHolding` can offer a "revert" path that
 * cleanly undoes the dual write — without this, a delete would orphan
 * either a SavingsItem or a Kept entry that doesn't match anything.
 */
export interface GoldSideEffectRefs {
  /** Populated when paymentMethod === 'cash'. */
  savingsItemId?: string;
  savingsYear?: number;
  savingsMonth?: number;
  /** Populated when paymentMethod === 'kept'. */
  keptYear?: number;
  keptMonth?: number;
  /** Amount subtracted from Kept (so we can re-add the same value on revert). */
  keptAmount?: number;
}

/**
 * Records that a holding has been sold. Realized P&L is computed as
 * `soldPrice - totalCost` in the selector layer. No automatic ledger
 * write on sell — proceeds are typically untracked cash; if Tom puts
 * the money into Kept, he'll log that himself.
 */
export interface GoldSaleRecord {
  /** ISO yyyy-mm-dd. */
  soldDate: string;
  /** Gross sale price received (฿). */
  soldPrice: number;
  notes?: string;
}

/**
 * One physical-gold transaction. Identity = one trip to the shop.
 * Weight is stored in บาททอง (Thai unit, 15.244g) because that's how
 * the market is quoted; grams are displayed alongside via the
 * `GRAMS_PER_BAHT` constant.
 */
export interface GoldHolding {
  /** UUID v4 generated client-side. */
  id: string;
  /** ISO yyyy-mm-dd date Tom physically bought the gold. */
  purchaseDate: string;
  /** Free-form shop / brand label (ฮั่วเซ่งเฮง, ออโรร่า, MTS, ฯลฯ). */
  brand: string;
  /** ทองคำแท่ง (bar) vs ทองรูปพรรณ (jewelry). */
  type: GoldType;
  /** Purity grade — drives which spot price line is used for P&L. */
  purity: GoldPurity;
  /** Weight in บาททอง (1 = 15.244g). */
  weightBaht: number;
  /** Total ฿ paid (includes ค่ากำเหน็จ / making charges). */
  totalCost: number;
  /** Optional reference spot price at the time, per บาททอง. */
  spotPriceAtPurchase?: number;
  notes?: string;
  paymentMethod: GoldPaymentMethod;
  /** Side-effect tracking — see GoldSideEffectRefs. */
  sideEffects?: GoldSideEffectRefs;
  /** Present iff the holding has been sold. */
  sold?: GoldSaleRecord;
}
