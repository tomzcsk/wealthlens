/**
 * WealthLens — JSON backup export / import utilities.
 *
 * Pure functions, zero React. Three responsibilities:
 *   1. Serialise the in-memory `WealthLensData` to a downloadable Blob and
 *      trigger a date-stamped browser download.
 *   2. Validate an arbitrary parsed JSON value against the `WealthLensData`
 *      schema, returning ALL errors so the UI can show specifics rather than
 *      bailing on the first failure.
 *   3. Merge an imported snapshot into local data (last-write-wins at the
 *      year granularity — the simplest sane semantic for a backup file).
 *
 * Validation philosophy: structurally strict (required fields and types)
 * but tolerant of unknown extra fields. We never reject a backup just
 * because it carries forward-compat metadata we don't yet know about.
 */

import { KRUNGSRI_ACCOUNT_ID } from '@/utils/bankAccounts';
import type {
  BankAccount,
  BankTransaction,
  ExpenseCategory,
  ExpenseItem,
  MonthlyDeductions,
  MonthlyExpense,
  MonthlyIncome,
  MonthlySavings,
  SavingsCategory,
  SavingsItem,
  WealthLensData,
  YearData,
} from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: readonly ExpenseCategory[] = [
  'housing',
  'vehicle',
  'utilities',
  'subscription',
  'finance',
  'entertainment',
  // 'savings' kept for backwards-compat with old backups; new entries
  // shouldn't use it (savings now live in MonthlySavings).
  'savings',
  'other',
];

/**
 * Record (ไม่ใช่ array) เพื่อให้ TypeScript บังคับความครบถ้วน — เพิ่มหมวดใหม่ใน
 * `SavingsCategory` แล้วลืมเติมที่นี่ = typecheck แดงทันที
 *
 * WHY: เดิมเป็น array แล้วขาด 'gold' ทั้งที่ store สร้างหมวดนี้เองทุกครั้งที่ซื้อทอง
 * ด้วยเงินสด → ไฟล์ backup ของผู้ใช้เอง import กลับไม่ได้ และเงียบสนิทเพราะ
 * Drive sync ไม่ validate (พังเฉพาะวันที่ต้องกู้ข้อมูลจริง)
 */
const SAVINGS_CATEGORY_SET: Record<SavingsCategory, true> = {
  'investment-dime': true,
  travel: true,
  emergency: true,
  retirement: true,
  general: true,
  gold: true,
};

const VALID_SAVINGS_CATEGORIES = Object.keys(SAVINGS_CATEGORY_SET) as readonly SavingsCategory[];

const FILENAME_PREFIX = 'wealthlens_backup_';
const FILENAME_EXT = '.json';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isString = (v: unknown): v is string => typeof v === 'string';

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isNonNegativeNumber = (v: unknown): v is number =>
  isFiniteNumber(v) && v >= 0;

const isMonthInt = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= 12;

const isValidCategory = (v: unknown): v is ExpenseCategory =>
  isString(v) && (VALID_CATEGORIES as readonly string[]).includes(v);

const isValidSavingsCategory = (v: unknown): v is SavingsCategory =>
  isString(v) && (VALID_SAVINGS_CATEGORIES as readonly string[]).includes(v);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { ok: true; data: WealthLensData }
  | { ok: false; errors: string[] };

interface Ctx {
  errors: string[];
}

/** Push a contextual error message onto the accumulator. */
const fail = (ctx: Ctx, path: string, msg: string): void => {
  ctx.errors.push(`${path}: ${msg}`);
};

const validateDeductions = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): MonthlyDeductions | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  const fields: Array<keyof MonthlyDeductions> = [
    'tax',
    'socialSecurity',
    'providentFund',
    'gsl',
  ];
  let ok = true;
  for (const f of fields) {
    if (!isNonNegativeNumber(raw[f])) {
      fail(ctx, `${path}.${f}`, 'must be a number ≥ 0');
      ok = false;
    }
  }
  // Tolerate legacy backups that still carry `investment` here — silently
  // drop it (it lives in MonthlySavings now). Don't fail validation.
  if (!ok) return null;
  const out: MonthlyDeductions = {
    tax: raw.tax as number,
    socialSecurity: raw.socialSecurity as number,
    providentFund: raw.providentFund as number,
    gsl: raw.gsl as number,
  };
  return out;
};

const validateIncomeRow = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): MonthlyIncome | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isMonthInt(raw.month)) {
    fail(ctx, `${path}.month`, 'must be an integer 1-12');
    ok = false;
  }
  for (const f of ['salary', 'bonus', 'commission'] as const) {
    if (!isNonNegativeNumber(raw[f])) {
      fail(ctx, `${path}.${f}`, 'must be a number ≥ 0');
      ok = false;
    }
  }
  const deductions = validateDeductions(
    raw.deductions,
    `${path}.deductions`,
    ctx,
  );
  if (!deductions) ok = false;
  if (!ok || !deductions) return null;
  const row: MonthlyIncome = {
    month: raw.month as number,
    salary: raw.salary as number,
    bonus: raw.bonus as number,
    commission: raw.commission as number,
    otherIncome: isNonNegativeNumber(raw.otherIncome) ? (raw.otherIncome as number) : 0,
    deductions,
  };
  // F39 income→bank: ถ้าไม่ preserve ปลายทาง (deposits) และยอดที่ฝากจริง
  // (depositSideEffects) หลัง restore จะ revert ยอดฝากไม่ได้ → ยอดบัญชีเพี้ยน
  // ถาวรเมื่อแก้รายได้ครั้งถัดไป. (BankAccount.type รอดเองเพราะ bankAccounts
  // ถูก copy ทั้งก้อน.)
  if (isObject(raw.deposits)) {
    row.deposits = raw.deposits as unknown as MonthlyIncome['deposits'];
  }
  if (Array.isArray(raw.depositSideEffects)) {
    row.depositSideEffects = raw.depositSideEffects as unknown as MonthlyIncome['depositSideEffects'];
  }
  return row;
};

const validateExpenseItem = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): ExpenseItem | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isString(raw.id) || raw.id.length === 0) {
    fail(ctx, `${path}.id`, 'must be a non-empty string');
    ok = false;
  }
  if (!isValidCategory(raw.category)) {
    fail(
      ctx,
      `${path}.category`,
      `must be one of: ${VALID_CATEGORIES.join(', ')}`,
    );
    ok = false;
  }
  if (!isString(raw.name)) {
    fail(ctx, `${path}.name`, 'must be a string');
    ok = false;
  }
  if (!isNonNegativeNumber(raw.amount)) {
    fail(ctx, `${path}.amount`, 'must be a number ≥ 0');
    ok = false;
  }
  if (typeof raw.isRecurring !== 'boolean') {
    fail(ctx, `${path}.isRecurring`, 'must be a boolean');
    ok = false;
  }
  if (!ok) return null;
  const item: ExpenseItem = {
    id: raw.id as string,
    category: raw.category as ExpenseCategory,
    name: raw.name as string,
    amount: raw.amount as number,
    isRecurring: raw.isRecurring as boolean,
  };
  // Preserve the optional fields shape-as-is when present. Without this the
  // import/restore path would silently drop date, reimbursement, and
  // installment metadata — losing real data on every round-trip.
  if (isString(raw.date)) {
    item.date = raw.date;
  }
  if (isObject(raw.reimbursement)) {
    item.reimbursement = raw.reimbursement as unknown as ExpenseItem['reimbursement'];
  }
  if (isObject(raw.installment)) {
    item.installment = raw.installment as unknown as ExpenseItem['installment'];
  }
  // F34 payment-source: keep the account link AND its revert-ref, else a
  // restore would orphan the deduction (balance drifts on later edit/delete).
  if (isString(raw.paymentAccountId)) {
    item.paymentAccountId = raw.paymentAccountId;
  }
  if (isObject(raw.sideEffects)) {
    item.sideEffects = raw.sideEffects as unknown as ExpenseItem['sideEffects'];
  }
  // F37 loan link: รายจ่ายชี้ไปหาหนี้ที่มันชำระ — ไม่ preserve = ประวัติ
  // ชำระหนี้หายทั้งก้อนหลัง restore.
  if (isString(raw.loanId)) {
    item.loanId = raw.loanId;
  }
  return item;
};

const validateBankAccount = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): BankAccount | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isString(raw.id) || raw.id.length === 0) {
    fail(ctx, `${path}.id`, 'must be a non-empty string');
    ok = false;
  }
  if (!isString(raw.name)) {
    fail(ctx, `${path}.name`, 'must be a string');
    ok = false;
  }
  if (!isObject(raw.balances)) {
    fail(ctx, `${path}.balances`, 'must be an object');
    ok = false;
  } else {
    for (const [y, months] of Object.entries(raw.balances)) {
      if (!isObject(months)) {
        fail(ctx, `${path}.balances.${y}`, 'must be an object');
        ok = false;
        continue;
      }
      for (const [m, v] of Object.entries(months)) {
        if (!isFiniteNumber(v)) {
          fail(ctx, `${path}.balances.${y}.${m}`, 'must be a finite number');
          ok = false;
        }
      }
    }
  }
  return ok ? (raw as unknown as BankAccount) : null;
};

const validateBankTransaction = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): BankTransaction | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isString(raw.id) || raw.id.length === 0) {
    fail(ctx, `${path}.id`, 'must be a non-empty string');
    ok = false;
  }
  if (!isString(raw.accountId) || raw.accountId.length === 0) {
    fail(ctx, `${path}.accountId`, 'must be a non-empty string');
    ok = false;
  }
  if (!isFiniteNumber(raw.year)) {
    fail(ctx, `${path}.year`, 'must be a finite number');
    ok = false;
  }
  if (!isMonthInt(raw.month)) {
    fail(ctx, `${path}.month`, 'must be an integer 1-12');
    ok = false;
  }
  if (!isFiniteNumber(raw.amount)) {
    fail(ctx, `${path}.amount`, 'must be a finite number');
    ok = false;
  }
  if (!isObject(raw.source) || !isString(raw.source.type)) {
    fail(ctx, `${path}.source`, 'must be an object with a string `type`');
    ok = false;
  }
  return ok ? (raw as unknown as BankTransaction) : null;
};

const validateExpenseRow = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): MonthlyExpense | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isMonthInt(raw.month)) {
    fail(ctx, `${path}.month`, 'must be an integer 1-12');
    ok = false;
  }
  if (!Array.isArray(raw.items)) {
    fail(ctx, `${path}.items`, 'must be an array');
    return null;
  }
  const items: ExpenseItem[] = [];
  raw.items.forEach((it, idx) => {
    const valid = validateExpenseItem(it, `${path}.items[${idx}]`, ctx);
    if (valid) items.push(valid);
    else ok = false;
  });
  if (!ok) return null;
  return { month: raw.month as number, items };
};

const validateSavingsItem = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): SavingsItem | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isString(raw.id) || raw.id.length === 0) {
    fail(ctx, `${path}.id`, 'must be a non-empty string');
    ok = false;
  }
  if (!isValidSavingsCategory(raw.category)) {
    fail(
      ctx,
      `${path}.category`,
      `must be one of: ${VALID_SAVINGS_CATEGORIES.join(', ')}`,
    );
    ok = false;
  }
  if (!isString(raw.name)) {
    fail(ctx, `${path}.name`, 'must be a string');
    ok = false;
  }
  if (!isNonNegativeNumber(raw.amount)) {
    fail(ctx, `${path}.amount`, 'must be a number ≥ 0');
    ok = false;
  }
  if (typeof raw.isRecurring !== 'boolean') {
    fail(ctx, `${path}.isRecurring`, 'must be a boolean');
    ok = false;
  }
  if (!ok) return null;
  return {
    id: raw.id as string,
    category: raw.category as SavingsCategory,
    name: raw.name as string,
    amount: raw.amount as number,
    isRecurring: raw.isRecurring as boolean,
  };
};

const validateSavingsRow = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): MonthlySavings | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  let ok = true;
  if (!isMonthInt(raw.month)) {
    fail(ctx, `${path}.month`, 'must be an integer 1-12');
    ok = false;
  }
  if (!Array.isArray(raw.items)) {
    fail(ctx, `${path}.items`, 'must be an array');
    return null;
  }
  const items: SavingsItem[] = [];
  raw.items.forEach((it, idx) => {
    const valid = validateSavingsItem(it, `${path}.items[${idx}]`, ctx);
    if (valid) items.push(valid);
    else ok = false;
  });
  if (!ok) return null;
  return { month: raw.month as number, items };
};

const validateYearData = (
  raw: unknown,
  path: string,
  ctx: Ctx,
): YearData | null => {
  if (!isObject(raw)) {
    fail(ctx, path, 'must be an object');
    return null;
  }
  if (!Array.isArray(raw.income)) {
    fail(ctx, `${path}.income`, 'must be an array');
    return null;
  }
  if (!Array.isArray(raw.expenses)) {
    fail(ctx, `${path}.expenses`, 'must be an array');
    return null;
  }
  let ok = true;
  const income: MonthlyIncome[] = [];
  raw.income.forEach((row, idx) => {
    const valid = validateIncomeRow(row, `${path}.income[${idx}]`, ctx);
    if (valid) income.push(valid);
    else ok = false;
  });
  const expenses: MonthlyExpense[] = [];
  raw.expenses.forEach((row, idx) => {
    const valid = validateExpenseRow(row, `${path}.expenses[${idx}]`, ctx);
    if (valid) expenses.push(valid);
    else ok = false;
  });
  // `savings` is OPTIONAL on the wire — older backups won't have it.
  // Default to empty array so downstream code can rely on its presence.
  const savings: MonthlySavings[] = [];
  if (raw.savings !== undefined) {
    if (!Array.isArray(raw.savings)) {
      fail(ctx, `${path}.savings`, 'must be an array if present');
      return null;
    }
    raw.savings.forEach((row, idx) => {
      const valid = validateSavingsRow(row, `${path}.savings[${idx}]`, ctx);
      if (valid) savings.push(valid);
      else ok = false;
    });
  }
  if (!ok) return null;
  return { income, expenses, savings };
};

/**
 * Validate an unknown JSON parse result against the WealthLensData schema.
 * Collects ALL errors before returning so the UI can show them at once.
 */
export const validateBackup = (parsed: unknown): ValidationResult => {
  const ctx: Ctx = { errors: [] };

  if (!isObject(parsed)) {
    return { ok: false, errors: ['root: must be a JSON object'] };
  }
  if (!isString(parsed.version)) {
    fail(ctx, 'version', 'must be a string');
  }
  if (!isString(parsed.lastUpdated)) {
    fail(ctx, 'lastUpdated', 'must be a string');
  }
  if (!isObject(parsed.years)) {
    fail(ctx, 'years', 'must be an object keyed by year');
    return { ok: false, errors: ctx.errors };
  }

  const years: WealthLensData['years'] = {};
  for (const [yearKey, yearRaw] of Object.entries(parsed.years)) {
    if (!/^\d{4}$/.test(yearKey)) {
      fail(ctx, `years.${yearKey}`, 'key must be a 4-digit year string');
      continue;
    }
    const valid = validateYearData(yearRaw, `years.${yearKey}`, ctx);
    if (valid) years[yearKey] = valid;
  }

  if (ctx.errors.length > 0) {
    return { ok: false, errors: ctx.errors };
  }

  // Pass through the itemized tax allowances if present. Light-touch
  // validation: accept the object shape as-is — resolveTaxAllowances
  // clamps bad values (negative/NaN) to 0 at calculation time anyway.
  const taxAllowances = isObject(parsed.taxAllowances)
    ? (parsed.taxAllowances as WealthLensData['taxAllowances'])
    : undefined;

  // Same passthrough policy for the other optional root sections. Arrays
  // are accepted shape-as-is — their pages already default-handle missing
  // or partial entries.
  const goldHoldings = Array.isArray(parsed.goldHoldings)
    ? (parsed.goldHoldings as WealthLensData['goldHoldings'])
    : undefined;
  const goldPriceHistory = Array.isArray(parsed.goldPriceHistory)
    ? (parsed.goldPriceHistory as WealthLensData['goldPriceHistory'])
    : undefined;
  const loans = Array.isArray(parsed.loans)
    ? (parsed.loans as WealthLensData['loans'])
    : undefined;
  // bankAccounts / bankTransactions: validate each member, not just
  // Array.isArray. A junk member ([42, null, 'nope']) used to pass then crash
  // the render with a white screen; now the whole file is rejected up front.
  let bankAccounts: BankAccount[] | undefined;
  if (parsed.bankAccounts !== undefined) {
    if (!Array.isArray(parsed.bankAccounts)) {
      fail(ctx, 'bankAccounts', 'must be an array');
    } else {
      bankAccounts = [];
      parsed.bankAccounts.forEach((a, i) => {
        const v = validateBankAccount(a, `bankAccounts[${i}]`, ctx);
        if (v) bankAccounts!.push(v);
      });
    }
  }
  // F40 bank journal: preserve wholesale like bankAccounts. Without this the
  // restore path drops every line item and the source (income/expense/gold)
  // discriminated union — the account balance survives but its "why" is lost,
  // and the Σ tx === balance invariant breaks on the next edit.
  let bankTransactions: BankTransaction[] | undefined;
  if (parsed.bankTransactions !== undefined) {
    if (!Array.isArray(parsed.bankTransactions)) {
      fail(ctx, 'bankTransactions', 'must be an array');
    } else {
      bankTransactions = [];
      parsed.bankTransactions.forEach((t, i) => {
        const v = validateBankTransaction(t, `bankTransactions[${i}]`, ctx);
        if (v) bankTransactions!.push(v);
      });
    }
  }
  const preferences = isObject(parsed.preferences)
    ? (parsed.preferences as unknown as WealthLensData['preferences'])
    : undefined;

  // Referential integrity: every pointer into an account/loan must resolve, or
  // it becomes an orphan the moment `applyBankDelta` (silent on missing
  // account) touches it — the exact state deleteBankAccount was hardened
  // against. Locking the front door there means little if the import back door
  // still lets it in.
  //
  // Known accounts include the acct-krungsri that migrateKeptToBankAccounts
  // will synthesise from a legacy keptBalances payload — pointers to it must
  // NOT be rejected just because the migration runs later (at replaceAllData).
  const knownAccounts = new Set<string>((bankAccounts ?? []).map((a) => a.id));
  if (
    isObject(parsed.preferences) &&
    isObject((parsed.preferences as Record<string, unknown>).keptBalances) &&
    Object.keys((parsed.preferences as { keptBalances: object }).keptBalances).length > 0
  ) {
    knownAccounts.add(KRUNGSRI_ACCOUNT_ID);
  }
  const knownLoans = new Set<string>();
  for (const l of Array.isArray(parsed.loans) ? parsed.loans : []) {
    if (isObject(l) && isString(l.id)) knownLoans.add(l.id);
  }
  const refAccount = (id: unknown, path: string): void => {
    if (isString(id) && !knownAccounts.has(id)) {
      fail(ctx, path, `references unknown account '${id}'`);
    }
  };

  for (const t of bankTransactions ?? []) {
    refAccount(t.accountId, `bankTransactions[${t.id}].accountId`);
  }
  for (const [yk, yr] of Object.entries(years)) {
    yr.income.forEach((row, i) => {
      const base = `years.${yk}.income[${i}]`;
      for (const f of ['salary', 'bonus', 'commission', 'otherIncome'] as const) {
        refAccount(row.deposits?.[f], `${base}.deposits.${f}`);
      }
      (row.depositSideEffects ?? []).forEach((ref, j) =>
        refAccount(ref.accountId, `${base}.depositSideEffects[${j}].accountId`),
      );
    });
    yr.expenses.forEach((month, mi) => {
      month.items.forEach((item, ii) => {
        const base = `years.${yk}.expenses[${mi}].items[${ii}]`;
        refAccount(item.paymentAccountId, `${base}.paymentAccountId`);
        refAccount(item.sideEffects?.accountId, `${base}.sideEffects.accountId`);
        if (isString(item.loanId) && !knownLoans.has(item.loanId)) {
          fail(ctx, `${base}.loanId`, `references unknown loan '${item.loanId}'`);
        }
      });
    });
  }
  for (const g of Array.isArray(parsed.goldHoldings) ? parsed.goldHoldings : []) {
    if (isObject(g) && isObject(g.sideEffects)) {
      refAccount(
        (g.sideEffects as Record<string, unknown>).accountId,
        `goldHoldings[${isString(g.id) ? g.id : '?'}].sideEffects.accountId`,
      );
    }
  }

  if (ctx.errors.length > 0) {
    return { ok: false, errors: ctx.errors };
  }

  return {
    ok: true,
    data: {
      version: parsed.version as string,
      lastUpdated: parsed.lastUpdated as string,
      years,
      ...(taxAllowances ? { taxAllowances } : {}),
      ...(goldHoldings ? { goldHoldings } : {}),
      ...(goldPriceHistory ? { goldPriceHistory } : {}),
      ...(loans ? { loans } : {}),
      ...(bankAccounts ? { bankAccounts } : {}),
      ...(bankTransactions ? { bankTransactions } : {}),
      ...(preferences ? { preferences } : {}),
    },
  };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Build a downloadable JSON Blob containing all current data. */
export const exportToJson = (data: WealthLensData): Blob => {
  const json = JSON.stringify(data, null, 2);
  return new Blob([json], { type: 'application/json' });
};

/** YYYY-MM-DD in the user's local timezone (matches the visible date). */
const todayStamp = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Trigger a browser download with a date-stamped filename. */
export const downloadBackup = (data: WealthLensData): void => {
  const blob = exportToJson(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${FILENAME_PREFIX}${todayStamp()}${FILENAME_EXT}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Free the blob URL on the next tick so the browser has time to start the DL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Read a File and validate it against the WealthLensData schema. */
export const importFromFile = async (file: File): Promise<ValidationResult> => {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    return {
      ok: false,
      errors: [`failed to read file: ${(e as Error).message}`],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      errors: [`invalid JSON: ${(e as Error).message}`],
    };
  }
  return validateBackup(parsed);
};

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge `imported` into `local` at the year granularity.
 * For each year present in `imported`, the local entry is REPLACED whole-cloth
 * (last-write-wins per year). Years only present in `local` are preserved.
 * taxAllowances merges per-year key (imported wins on collision).
 * Whole-array sections (goldHoldings, goldPriceHistory, loans) and preferences
 * are taken wholesale from the import when present; otherwise local is kept
 * ("payload has field = use payload's, payload lacks field = keep local").
 *
 * `lastUpdated` is bumped to now so downstream sync layers see a fresh write.
 */
export const mergeData = (
  local: WealthLensData,
  imported: WealthLensData,
): WealthLensData => {
  const years: WealthLensData['years'] = { ...local.years };
  for (const [yearKey, yearData] of Object.entries(imported.years)) {
    years[yearKey] = yearData;
  }
  const taxAllowances =
    local.taxAllowances || imported.taxAllowances
      ? { ...local.taxAllowances, ...imported.taxAllowances }
      : undefined;
  const goldHoldings = imported.goldHoldings ?? local.goldHoldings;
  const goldPriceHistory = imported.goldPriceHistory ?? local.goldPriceHistory;
  const loans = imported.loans ?? local.loans;
  const bankAccounts = imported.bankAccounts ?? local.bankAccounts;
  // Keep the journal in lock-step with bankAccounts: taking one from `local`
  // and the other from `imported` would desync balances from their line items.
  const bankTransactions = imported.bankAccounts
    ? imported.bankTransactions
    : local.bankTransactions;
  const preferences = imported.preferences ?? local.preferences;
  return {
    version: local.version,
    lastUpdated: new Date().toISOString(),
    years,
    ...(taxAllowances ? { taxAllowances } : {}),
    ...(goldHoldings ? { goldHoldings } : {}),
    ...(goldPriceHistory ? { goldPriceHistory } : {}),
    ...(loans ? { loans } : {}),
    ...(bankAccounts ? { bankAccounts } : {}),
    ...(bankTransactions ? { bankTransactions } : {}),
    ...(preferences ? { preferences } : {}),
  };
};
