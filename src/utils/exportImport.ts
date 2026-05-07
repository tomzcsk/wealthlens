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

import type {
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

const VALID_SAVINGS_CATEGORIES: readonly SavingsCategory[] = [
  'investment-dime',
  'travel',
  'emergency',
  'retirement',
  'general',
];

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
  return {
    month: raw.month as number,
    salary: raw.salary as number,
    bonus: raw.bonus as number,
    commission: raw.commission as number,
    deductions,
  };
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
  return {
    id: raw.id as string,
    category: raw.category as ExpenseCategory,
    name: raw.name as string,
    amount: raw.amount as number,
    isRecurring: raw.isRecurring as boolean,
  };
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

  return {
    ok: true,
    data: {
      version: parsed.version as string,
      lastUpdated: parsed.lastUpdated as string,
      years,
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
  return {
    version: local.version,
    lastUpdated: new Date().toISOString(),
    years,
  };
};
