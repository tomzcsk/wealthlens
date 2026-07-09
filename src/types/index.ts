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
  /**
   * Rolling log of 96.5% spot prices captured each time Tom hits "🔄 ดึง"
   * on the Gold page. Powers the assistant's 30-day moving average and
   * high/low signals. Capped to the last 365 entries to keep the Drive
   * payload bounded. Optional — older payloads have no history yet.
   */
  goldPriceHistory?: GoldPriceSnapshot[];
  /**
   * Long-running debts (กยศ today; mortgage/auto loans tomorrow). Each
   * entry carries its own annual amortization schedule plus a log of
   * out-of-band lump-sum payments ("โปะ"). Monthly recurring payments
   * are NOT stored here — they live in `years[*].income[*].deductions.gsl`
   * and are pulled into the payment log via `getMergedPaymentLog`. This
   * keeps a single source of truth and avoids dual-entry. Optional so
   * older Drive payloads without the field still hydrate.
   */
  loans?: Loan[];
  /**
   * Itemized PIT allowance inputs keyed by 4-digit tax year. These are
   * annual filing inputs, not monthly ledger rows — so they live at the
   * root (pattern: `loans`/`goldHoldings`), not under YearData. Optional
   * so payloads written before this feature still hydrate.
   */
  taxAllowances?: { [year: string]: TaxAllowanceInputs };
  /**
   * Generic bank accounts (F33) — replaces the Tom-specific single "Kept
   * (กรุงศรี)" balance with an arbitrary list of accounts, each carrying
   * its own per-month net-balance map. Optional so older Drive payloads
   * without the field still hydrate; `migrateKeptToBankAccounts` in
   * utils/bankAccounts.ts one-time-migrates legacy `preferences.keptBalances`.
   */
  bankAccounts?: BankAccount[];
  /**
   * สมุดรายการเดินบัญชี (F40). Optional — ข้อมูลก่อนฟีเจอร์นี้ไม่มี และเดือน
   * ที่ไม่มีรายการเลยจะแสดงยอดเฉยๆ โดยไม่ถือว่าผิด invariant.
   */
  bankTransactions?: BankTransaction[];
}

/**
 * One observation of the 96.5% gold-bar buy price at a moment in time.
 * Append-only; we never edit past snapshots so the time series stays
 * faithful to what the API actually returned.
 */
export interface GoldPriceSnapshot {
  /** ISO timestamp when the API responded. */
  fetchedAt: string;
  /** ทองคำแท่ง 96.5% buy price (THB per 1 บาททอง). */
  price965: number;
  /** API-reported round, e.g. "เวลา 14:04 น. (ครั้งที่ 14)". */
  round?: string;
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
 * Itemized PIT allowance inputs for one tax year — what Tom types on the
 * 🧮 tax page. Count fields are จำนวนคน; everything else is THB actually
 * paid. Legal caps are deliberately NOT applied at entry —
 * `resolveTaxAllowances` applies them at calculation time, so the raw
 * inputs stay faithful if the law's ceilings change.
 */
export interface TaxAllowanceInputs {
  /** คู่สมรสไม่มีเงินได้ → 60,000. */
  spouseNoIncome: boolean;
  /** บุตร → 30,000/คน. */
  childrenCount: number;
  /** บุตรคนที่ 2 เป็นต้นไปที่เกิดตั้งแต่ พ.ศ. 2561 → 60,000/คน. */
  childrenBorn2561Count: number;
  /** บิดามารดาอายุ 60+ (เงินได้ ≤30,000/ปี) → 30,000/คน สูงสุด 4 คน. */
  parentsCount: number;
  /** ผู้พิการ/ทุพพลภาพในอุปการะ → 60,000/คน. */
  disabledCount: number;
  /** ค่าฝากครรภ์/คลอดบุตร — ยอดจ่ายจริง (cap 60,000). */
  prenatalCare: number;
  /** เบี้ยประกันชีวิต (คุ้มครอง ≥10 ปี) — cap 100,000 ร่วมกับสุขภาพ. */
  lifeInsurance: number;
  /** เบี้ยประกันสุขภาพตนเอง — cap 25,000 และรวมประกันชีวิต ≤100,000. */
  healthInsurance: number;
  /** เบี้ยประกันสุขภาพบิดามารดา — cap 15,000. */
  parentHealthInsurance: number;
  /** เบี้ยประกันชีวิตแบบบำนาญ — ≤15% เงินได้, ≤200,000, กลุ่มเกษียณ 500k. */
  pensionInsurance: number;
  /** RMF — ≤30% เงินได้, ≤500,000, กลุ่มเกษียณ 500k. */
  rmf: number;
  /** ThaiESG — ≤30% เงินได้, ≤300,000 (แยกจากกลุ่มเกษียณ). */
  thaiEsg: number;
  /** กอช — cap 30,000, กลุ่มเกษียณ 500k. */
  nationalSavingsFund: number;
  /** ดอกเบี้ยเงินกู้ที่อยู่อาศัย — cap 100,000. */
  homeLoanInterest: number;
  /** บริจาคการศึกษา/กีฬา/รพ.รัฐ — นับ ×2, cap 10% หลังหักลดหย่อนอื่น. */
  donationEducation: number;
  /** บริจาคทั่วไป — cap 10% ของยอดหลังหักบริจาคการศึกษาแล้ว. */
  donationGeneral: number;
  /** มาตรการรายปี เช่น Easy E-Receipt — ไม่ cap. */
  other: number;
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

/** ปลายทางของรายได้แต่ละช่อง (BankAccount.id). undefined = ไม่ลงบัญชี. */
export interface IncomeDepositTargets {
  salary?: string;
  bonus?: string;
  commission?: string;
  otherIncome?: string;
}

/** สิ่งที่ถูกเขียนลงยอดบัญชีไปแล้วจริง — ใช้ revert ตอนแก้/ลบ. */
export interface IncomeDepositRef {
  source: 'salary' | 'bonus' | 'commission' | 'otherIncome';
  accountId: string;
  amount: number;
}

export interface MonthlyIncome {
  /** Calendar month, 1-12. */
  month: number;
  salary: number;
  bonus: number;
  commission: number;
  /** รายได้อื่นๆ — extra income added to Net.All like commission (post-deduction). Optional for backward-compat. */
  otherIncome?: number;
  deductions: MonthlyDeductions;
  /** ปลายทางที่ผู้ใช้เลือกไว้ต่อช่อง. Optional, backward-compat. */
  deposits?: IncomeDepositTargets;
  /**
   * ยอดที่ฝากเข้าบัญชีไปแล้วจริง — เขียนโดย store เท่านั้น ห้ามแก้จากฟอร์ม.
   * ต้องเก็บตัวเลขจริงไว้ เพราะ revert ต้องคืนยอด "ที่เคยฝาก" ไม่ใช่ยอดที่
   * คำนวณใหม่จากค่าปัจจุบัน (salary/deductions อาจเปลี่ยนไปแล้ว → คืนผิด →
   * ยอดบัญชีเพี้ยนถาวร). บทเรียนเดียวกับ ExpenseSideEffectRefs ของ F34.
   */
  depositSideEffects?: IncomeDepositRef[];
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
   * ISO yyyy-mm-dd date the expense was actually made. Optional and
   * backward-compatible: legacy rows (and any month-only entries) simply
   * omit it and the UI shows no date. New rows default to the day they're
   * created, but Tom can edit it. The owning `MonthlyExpense.month` /
   * year key remain the source of truth for which month a row belongs to —
   * `date` is finer-grained context only, never used in month bucketing.
   */
  date?: string;
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
  /** บัญชีที่จ่ายรายการนี้ (รวมบัญชี 'เงินสด'). ไม่ระบุ = ไม่หักบัญชี. */
  paymentAccountId?: string;
  /** Ref เพื่อ revert การหักยอดบัญชี. */
  sideEffects?: ExpenseSideEffectRefs;
  /**
   * รายจ่ายนี้เป็นการชำระหนี้ก้อนไหน (`Loan.id`). Optional — รายการทั่วไป
   * ไม่มี field นี้. หน้าหนี้สิน *อ่าน* field นี้เพื่อ derive ประวัติชำระ
   * โดยไม่เขียนอะไรกลับ: รายจ่ายคือ source of truth เดียว แก้/ลบรายจ่าย
   * แล้วยอดหนี้ขยับตามเอง ไม่มี state ให้ reconcile (ต่างจาก
   * `paymentAccountId` ซึ่ง dual-write ยอดบัญชี).
   */
  loanId?: string;
}

/**
 * Mirror of the side-effect written into a `BankAccount`'s monthly balance
 * when an expense specifies `paymentAccountId`. Stored so a later edit or
 * delete can cleanly revert the deduction (add `deductAmount` back) before
 * applying a new one — same pattern as `GoldSideEffectRefs`.
 */
export interface ExpenseSideEffectRefs {
  /** บัญชีที่ถูกหัก (BankAccount.id). */
  accountId: string;
  /** ปี/เดือนที่หัก = ของ MonthlyExpense ที่รายการอยู่. */
  deductYear: number;
  deductMonth: number;
  /** ยอดที่หักไป (revert = บวกกลับเท่านี้). */
  deductAmount: number;
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
 *   - `kept`  → decrement the migrated กรุงศรี bank account's
 *                `balances[year][month]` by `totalCost` (F33). Tom sees
 *                that account shrink; no impact on monthly Net.All (the
 *                cash already left months ago when he funded the account).
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
  /**
   * Bank account (F33) that absorbed the debit, when paymentMethod ===
   * 'kept'. Defaults to KRUNGSRI_ACCOUNT_ID for legacy refs written before
   * generic bank accounts existed. Kept alongside keptYear/keptMonth/
   * keptAmount for backward-compat — those still identify the month/amount.
   */
  accountId?: string;
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

// ---------------------------------------------------------------------------
// Loans — long-running debts with an amortization schedule (กยศ, mortgage, …)
// ---------------------------------------------------------------------------

/**
 * Source field on `MonthlyDeductions` that the loan tracker should treat as
 * the monthly payment for THIS loan. `gsl` for the student loan; other types
 * have no auto-link today (set `null` or omit).
 */
export type LoanDeductionField = 'gsl';

export type LoanType = 'gsl' | 'mortgage' | 'auto' | 'other';

/**
 * One row of the lender-issued amortization table. Stored verbatim — we
 * do NOT recompute the schedule from a (principal, rate, term) tuple
 * because real loan tables include rounding adjustments the lender owns.
 */
export interface LoanInstallment {
  /** 1-based installment number. */
  installmentNumber: number;
  /** ISO yyyy-mm-dd date this installment is due. */
  dueDate: string;
  /** Principal fraction allocated to this installment (e.g. 0.06 = 6%). */
  principalRatio: number;
  /** Baht of principal repaid by this installment. */
  principalAmount: number;
  /** Baht of interest charged on this installment. */
  interestAmount: number;
  /** principalAmount + interestAmount (denormalised for display). */
  totalAmount: number;
}

/**
 * A lump-sum payment ("โปะ") made outside the recurring monthly debit.
 * When `createExpenseEntry` is true, the store dual-writes an
 * `ExpenseItem` (category 'finance') in the matching month so the
 * cashflow ledger reflects the outflow — same pattern as gold purchases.
 */
export interface ExtraPayment {
  /** UUID v4 generated client-side. */
  id: string;
  /** ISO yyyy-mm-dd date the payment was made. */
  date: string;
  amount: number;
  /** Optional lender reference number (เลขอ้างอิงรายการ). */
  reference?: string;
  notes?: string;
  /** Whether this payment was mirrored to the expense ledger. */
  createExpenseEntry: boolean;
  /**
   * Id of the auto-created `ExpenseItem`. Stored so a later delete can
   * cleanly revert the dual write — without it, the expense row would
   * orphan. Absent when `createExpenseEntry === false`.
   */
  linkedExpenseItemId?: string;
  /** Year/month the linked expense lives in (for clean revert). */
  linkedExpenseYear?: number;
  linkedExpenseMonth?: number;
}

/**
 * One recurring monthly debit confirmed by the lender's portal. Distinct
 * from `ExtraPayment` only by intent (and the badge it draws in the UI):
 * "งวดเดือน" rows come from the auto-debit cycle; "โปะ" rows are voluntary
 * lump-sums Tom made on top. Both ledgers are the source of truth for the
 * loan log — we no longer derive monthly entries from `deductions.gsl`
 * because the salary slip's deducted amount and the amount that actually
 * reached the lender can differ (timing, partial credits, derivation
 * errors when reconstructing historical sheets).
 */
export interface ScheduledPayment {
  /** UUID v4 generated client-side. */
  id: string;
  /** ISO yyyy-mm-dd date the payment posted at the lender. */
  date: string;
  amount: number;
  /** Lender reference number (เลขอ้างอิงรายการ). Always present in real data. */
  reference?: string;
  notes?: string;
}

export interface Loan {
  /** UUID v4 generated client-side. */
  id: string;
  /** Free-form label shown in UI (e.g. "กยศ"). */
  name: string;
  type: LoanType;
  /** ISO yyyy-mm-dd of the loan's first installment date. */
  startDate: string;
  /** Lender-issued amortization rows. Order = `installmentNumber`. */
  schedule: LoanInstallment[];
  /** Recurring monthly auto-debits confirmed by the lender's portal. */
  scheduledPayments: ScheduledPayment[];
  /** Out-of-band lump-sum payments ("โปะ"). */
  extraPayments: ExtraPayment[];
  /**
   * เมื่อ true: ถือว่าทุกงวดที่ครบกำหนดแล้ว (dueDate ≤ วันนี้) ถูกจ่ายแล้ว
   * — สำหรับหนี้ที่หักบัญชีอัตโนมัติ เช่น สินเชื่อบ้าน ที่ผู้ใช้ไม่ได้มา
   * บันทึกทีละงวด. Optional: payload เดิม (กยศ) ไม่มี field นี้ →
   * คำนวณจาก `scheduledPayments` เหมือนเดิมทุกประการ.
   */
  assumeOnSchedule?: boolean;
  /**
   * Legacy hint pointing at a `MonthlyDeductions` field that *also* tracks
   * this loan's debit on the salary slip. Kept for forms that prefill from
   * a paycheck line, but the loan log no longer derives from it — see
   * `scheduledPayments` above.
   */
  linkedDeductionField?: LoanDeductionField;
}

// ---------------------------------------------------------------------------
// Bank Accounts (F33) — generic replacement for the Tom-specific "Kept"
// ---------------------------------------------------------------------------

/**
 * ประเภทบัญชี — ใช้เลือก default ปลายทางของเงินเดือน และแสดง badge บนการ์ด
 * เท่านั้น. ไม่มีผลต่อการคำนวณยอดใดๆ.
 */
export type BankAccountType = 'salary' | 'savings' | 'cash' | 'other';

export interface BankAccount {
  /** UUID v4, or KRUNGSRI_ACCOUNT_ID for the migrated Kept account. */
  id: string;
  /** Free-form label, e.g. "กรุงศรี". */
  name: string;
  /** Optional reference into the curated Thai-bank list (F33), for brand avatar rendering. */
  bankKey?: string;
  /** ประเภทบัญชี. Optional — บัญชีเดิมไม่มี field นี้ ถือเป็น 'other'. */
  type?: BankAccountType;
  /** Net balance per month (+deposit / −withdraw). */
  balances: { [year: string]: { [month: string]: number } };
}

/**
 * ที่มาของรายการเดินบัญชี — ใช้ทั้งแสดงผลและเป็น "คีย์" ตอน reconcile
 * (ลบ/แทนที่บรรทัดเดิมของต้นทางเดียวกัน). Discriminated union เพราะแต่ละ
 * ที่มามีคีย์ต่างกัน: รายได้ระบุด้วย (ปี, เดือน, ช่อง) รายจ่ายด้วย expenseId.
 */
export type BankTxSource =
  | { type: 'manual' }
  | { type: 'adjustment' }
  | { type: 'transfer'; counterpartAccountId: string }
  | {
      type: 'income';
      year: number;
      month: number;
      field: 'salary' | 'bonus' | 'commission' | 'otherIncome';
    }
  | { type: 'expense'; expenseId: string }
  | { type: 'gold'; holdingId: string };

export interface BankTransaction {
  id: string;
  accountId: string;
  /**
   * bucket เดียวกับ `BankAccount.balances` — ไม่ derive จาก `date` เพราะ
   * ยอดถูกจัดเข้าเดือนตามที่ผู้ใช้เลือก ไม่ใช่ตามวันที่จริงเสมอ. derive
   * เมื่อไหร่ invariant พังทันที.
   */
  year: number;
  month: number;
  /** ISO yyyy-mm-dd เมื่อรู้วันจริง (รายจ่ายมี, เงินเดือนไม่มี). */
  date?: string;
  /** + เข้าบัญชี, − ออกจากบัญชี. ไม่มีวันเป็น 0. */
  amount: number;
  label: string;
  source: BankTxSource;
}
