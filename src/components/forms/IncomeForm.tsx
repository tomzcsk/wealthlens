/**
 * WealthLens — IncomeForm (F07).
 *
 * A self-contained form for entering or editing one month of income +
 * deductions. Designed to be reusable both as a Modal body AND inline
 * (e.g. on the Monthly Detail page) — it does not own its visibility,
 * the parent decides via `onSaved` / `onCancel` callbacks.
 *
 * Live summary at the bottom recomputes on every keystroke using the
 * canonical `calculateNetAll` formula, so the user sees Net / Net.All
 * change as they type.
 *
 * Number-input UX:
 *   - State stores RAW numbers (or `''` for empty).
 *   - Display reformats with thousand separators on every render.
 *   - On change we strip non-digits and reposition the cursor so it
 *     stays anchored relative to the digits the user typed (not the
 *     commas the formatter inserted), which is the only way a typing
 *     experience like "1234567" → "1,234,567" doesn't feel jumpy.
 *   - inputMode="decimal" gives mobile users the number pad without
 *     locking out paste/keyboard editing on desktop.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { useToastStore } from '@/stores/toastStore';
import type {
  BankAccount,
  IncomeDepositTargets,
  MonthlyDeductions,
  MonthlyIncome,
} from '@/types';
import { calculateNetAll } from '@/utils/calculations';
import { formatNumber, formatTHB, formatThaiMonth } from '@/utils/formatters';
import {
  computeIncomeDeposits,
  isSalaryUnderwater,
} from '@/utils/incomeDeposits';

import IncomeDepositSummary from './IncomeDepositSummary';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface IncomeFormProps {
  /** Calendar year (e.g. 2026). */
  year: number;
  /** Calendar month, 1-12 — fixed for the lifetime of this form instance. */
  month: number;
  /** Existing income to edit. `null` / `undefined` → blank "add" mode. */
  initialValues?: MonthlyIncome | null;
  /** Called after a successful save with the persisted income object. */
  onSaved?: (income: MonthlyIncome) => void;
  /** Called when the user cancels. */
  onCancel?: () => void;
  /**
   * If provided AND we're in edit mode (initialValues present), shows a
   * Delete button that wipes the income row after a confirm.
   */
  onDelete?: () => void;
}

// ---------------------------------------------------------------------------
// Internal field state
// ---------------------------------------------------------------------------

/** "" means "no value entered yet" — we coerce to 0 on save/calc. */
type FieldValue = number | '';

interface IncomeFormState {
  salary: FieldValue;
  bonus: FieldValue;
  commission: FieldValue;
  otherIncome: FieldValue;
  tax: FieldValue;
  socialSecurity: FieldValue;
  providentFund: FieldValue;
  gsl: FieldValue;
}

const EMPTY_STATE: IncomeFormState = {
  salary: '',
  bonus: '',
  commission: '',
  otherIncome: '',
  tax: '',
  socialSecurity: '',
  providentFund: '',
  gsl: '',
};

const fromIncome = (income: MonthlyIncome): IncomeFormState => ({
  salary: income.salary,
  bonus: income.bonus,
  commission: income.commission,
  otherIncome: income.otherIncome ?? 0,
  tax: income.deductions.tax,
  socialSecurity: income.deductions.socialSecurity,
  providentFund: income.deductions.providentFund,
  gsl: income.deductions.gsl,
});

const num = (v: FieldValue): number => (v === '' ? 0 : v);

/** Stable empty reference so the store selector never re-triggers renders. */
const EMPTY_ACCOUNTS: BankAccount[] = [];

// ---------------------------------------------------------------------------
// NumberInput — comma-formatted numeric input with cursor anchoring.
// ---------------------------------------------------------------------------

interface NumberInputProps {
  id: string;
  label: string;
  value: FieldValue;
  onChange: (next: FieldValue) => void;
  onBlur?: () => void;
  /** Inline error message — shown below the field when truthy. */
  error?: string;
  /** Optional right-side adornment (e.g. "฿"). */
  suffix?: string;
  /** Tooltip hint shown under the field in muted text. */
  hint?: string;
  /** When true, applies the autoFocus prop. */
  autoFocus?: boolean;
}

/**
 * Count the digits to the LEFT of `cursor` in `formatted`. That count is
 * stable across reformatting (commas are non-digits) so we can use it to
 * find the equivalent cursor position in the new formatted string.
 */
const countDigitsBeforeCursor = (formatted: string, cursor: number): number => {
  let count = 0;
  for (let i = 0; i < cursor && i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) count += 1;
  }
  return count;
};

/** Find the index in `formatted` after the Nth digit (1-based count). */
const cursorAfterNthDigit = (formatted: string, n: number): number => {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return formatted.length;
};

const NumberInput = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  suffix = '฿',
  hint,
  autoFocus,
}: NumberInputProps): ReactNode => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Track the cursor target across the controlled re-render.
  const pendingCursorRef = useRef<number | null>(null);

  // After every render, if we set a pending cursor position, apply it.
  useEffect(() => {
    if (pendingCursorRef.current !== null && inputRef.current) {
      const pos = pendingCursorRef.current;
      inputRef.current.setSelectionRange(pos, pos);
      pendingCursorRef.current = null;
    }
  });

  const display = value === '' ? '' : formatNumber(value);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const raw = event.target.value;
      const cursor = event.target.selectionStart ?? raw.length;

      // How many digits did the user type to the LEFT of the caret?
      const digitsLeftOfCursor = countDigitsBeforeCursor(raw, cursor);

      // Strip everything but digits — minus signs are silently dropped.
      const digitsOnly = raw.replace(/\D/g, '');

      if (digitsOnly === '') {
        pendingCursorRef.current = 0;
        onChange('');
        return;
      }

      const parsed = Number.parseInt(digitsOnly, 10);
      // Reformat for display, then anchor the cursor after the same
      // number of digits as before so typing in the middle feels natural.
      const reformatted = formatNumber(parsed);
      pendingCursorRef.current = cursorAfterNthDigit(
        reformatted,
        digitsLeftOfCursor,
      );
      onChange(parsed);
    },
    [onChange],
  );

  const inputClass = [
    'w-full bg-slate-50 border rounded-lg px-3 py-2 text-right tabular-nums',
    'focus:outline-none focus:ring-2',
    error
      ? 'border-expense focus:ring-expense focus:border-expense'
      : 'border-slate-200 focus:ring-primary focus:border-primary',
  ].join(' ');

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <label
        htmlFor={id}
        className="text-sm text-slate-700 pt-2 select-none"
      >
        {label}
      </label>
      <div>
        <div className="relative">
          <input
            id={id}
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={display}
            onChange={handleChange}
            onBlur={onBlur}
            autoFocus={autoFocus}
            placeholder="0"
            className={`${inputClass} pr-8`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          />
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"
          >
            {suffix}
          </span>
        </div>
        {error && (
          <p id={`${id}-error`} className="mt-1 text-xs text-expense">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-slate-400">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SummaryRow — labelled value pair for the live summary panel.
// ---------------------------------------------------------------------------

interface SummaryRowProps {
  label: string;
  value: number;
  emphasis?: 'default' | 'net' | 'netAll';
}

const SummaryRow = ({
  label,
  value,
  emphasis = 'default',
}: SummaryRowProps): ReactNode => {
  const valueClass =
    emphasis === 'netAll'
      ? 'text-net font-semibold tabular-nums text-base'
      : emphasis === 'net'
        ? 'text-slate-900 font-semibold tabular-nums'
        : 'text-slate-700 tabular-nums';
  return (
    <>
      <div className="text-slate-500">{label}</div>
      <div className={`text-right ${valueClass}`}>{formatTHB(value)}</div>
    </>
  );
};

// ---------------------------------------------------------------------------
// DepositSelect — tiny per-field "เข้าบัญชี" picker (F39).
// Aligned to the input column of NumberInput's 140px/1fr grid.
// ---------------------------------------------------------------------------

interface DepositSelectProps {
  field: keyof IncomeDepositTargets;
  label: string;
  value: string | undefined;
  accounts: ReadonlyArray<BankAccount>;
  onChange: (field: keyof IncomeDepositTargets, accountId: string | undefined) => void;
}

const DepositSelect = ({
  field,
  label,
  value,
  accounts,
  onChange,
}: DepositSelectProps): ReactNode => (
  <div className="grid grid-cols-[140px_1fr] gap-3">
    <span aria-hidden="true" />
    <label className="flex items-center gap-2 text-xs text-slate-500">
      เข้าบัญชี
      <select
        value={value ?? ''}
        onChange={(e) => onChange(field, e.target.value || undefined)}
        aria-label={`บัญชีปลายทางของ ${label}`}
        className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">— ไม่ลงบัญชี —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  </div>
);

// ---------------------------------------------------------------------------
// IncomeForm
// ---------------------------------------------------------------------------

export const IncomeForm = ({
  year,
  month,
  initialValues,
  onSaved,
  onCancel,
  onDelete,
}: IncomeFormProps): ReactNode => {
  const isEdit = Boolean(initialValues);

  const addIncome = useFinanceStore((s) => s.addIncome);
  const deleteIncome = useFinanceStore((s) => s.deleteIncome);
  const bankAccounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_ACCOUNTS);
  const incomeDefaults = useGoalsStore((s) => s.incomeDefaults);
  const pushToast = useToastStore((s) => s.push);

  const [form, setForm] = useState<IncomeFormState>(() =>
    initialValues ? fromIncome(initialValues) : EMPTY_STATE,
  );

  // F39 — per-field deposit targets. Fresh month defaults salary → the first
  // 'salary'-typed account; every other field stays blank (don't guess).
  const [deposits, setDeposits] = useState<IncomeDepositTargets>(() => {
    if (initialValues?.deposits) return initialValues.deposits;
    if (initialValues) return {};
    const salaryAccount = bankAccounts.find((a) => a.type === 'salary');
    return salaryAccount ? { salary: salaryAccount.id } : {};
  });
  const [pending, setPending] = useState<MonthlyIncome | null>(null);

  const setDepositTarget = useCallback(
    (field: keyof IncomeDepositTargets, accountId: string | undefined): void => {
      setDeposits((prev) => ({ ...prev, [field]: accountId }));
    },
    [],
  );

  const handleFillDefaults = useCallback((): void => {
    if (!incomeDefaults) return;
    // In edit mode (or whenever any default-target field is non-empty),
    // confirm before overwriting — Tom may have typed a value he wants.
    const targetKeys = ['salary', 'tax', 'socialSecurity', 'providentFund', 'gsl'] as const;
    setForm((prev) => {
      const willOverwrite = targetKeys.some((k) => prev[k] !== '');
      if (willOverwrite && !window.confirm('ทับค่าปัจจุบันด้วยค่าเริ่มต้น?')) {
        return prev;
      }
      return {
        ...prev,
        salary: incomeDefaults.salary || '',
        tax: incomeDefaults.tax || '',
        socialSecurity: incomeDefaults.socialSecurity || '',
        providentFund: incomeDefaults.providentFund || '',
        gsl: incomeDefaults.gsl || '',
        // bonus + commission stay untouched — those vary
      };
    });
  }, [incomeDefaults]);
  // Track which fields have been blurred so we don't yell at the user
  // before they've had a chance to type.
  const [touched, setTouched] = useState<Partial<Record<keyof IncomeFormState, boolean>>>(
    {},
  );

  // ---- Validation -------------------------------------------------------
  const errors = useMemo(() => {
    const out: Partial<Record<keyof IncomeFormState, string>> = {};
    // บางเดือนเป็นโบนัสล้วน หรือคอมล้วน (เงินเดือน 0) ก็ต้องเซฟได้ —
    // ขอแค่มีรายได้อย่างน้อยหนึ่งช่อง ไม่บังคับเงินเดือนอย่างเดียว
    const totalIncome =
      num(form.salary) + num(form.bonus) + num(form.commission) + num(form.otherIncome);
    if (totalIncome <= 0) {
      out.salary = 'กรอกรายได้อย่างน้อยหนึ่งช่อง (เงินเดือน/โบนัส/คอม/อื่นๆ)';
    }
    return out;
  }, [form.salary, form.bonus, form.commission, form.otherIncome]);

  const isValid = Object.keys(errors).length === 0;

  // ---- Live summary -----------------------------------------------------
  const summary = useMemo(() => {
    const salary = num(form.salary);
    const bonus = num(form.bonus);
    const commission = num(form.commission);
    const otherIncome = num(form.otherIncome);
    const totalDeductions =
      num(form.tax) +
      num(form.socialSecurity) +
      num(form.providentFund) +
      num(form.gsl);
    const grossIncome = salary + bonus + commission + otherIncome;
    const netSalary = salary + bonus - totalDeductions;
    const netAll = calculateNetAll({
      salary,
      bonus,
      commission,
      otherIncome,
      totalDeductions,
    });
    return { grossIncome, totalDeductions, netSalary, netAll };
  }, [form]);

  // ---- Field updaters ---------------------------------------------------
  const setField = useCallback(
    (key: keyof IncomeFormState) =>
      (next: FieldValue): void => {
        setForm((prev) => ({ ...prev, [key]: next }));
      },
    [],
  );

  const markTouched = useCallback(
    (key: keyof IncomeFormState) =>
      (): void => {
        setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      },
    [],
  );

  // ---- Save -------------------------------------------------------------
  const handleSave = useCallback((): void => {
    if (!isValid) {
      // Force-show errors on attempted save.
      setTouched((prev) => ({ ...prev, salary: true }));
      return;
    }

    const deductions: MonthlyDeductions = {
      tax: num(form.tax),
      socialSecurity: num(form.socialSecurity),
      providentFund: num(form.providentFund),
      gsl: num(form.gsl),
    };
    // Note: ลงทุน Dime is no longer a deduction — it lives in
    // `MonthlySavings` and is entered via the Savings list/form on the
    // Monthly Detail page.

    // Keep only fields that actually point at an account — an all-blank
    // selection means "no deposits", so leave the field off entirely to
    // preserve backward-compat (rows without `deposits` never touch banks).
    const cleanedDeposits = Object.fromEntries(
      Object.entries(deposits).filter(([, v]) => Boolean(v)),
    ) as IncomeDepositTargets;
    const hasTargets = Object.keys(cleanedDeposits).length > 0;

    const income: MonthlyIncome = {
      month,
      salary: num(form.salary),
      bonus: num(form.bonus),
      commission: num(form.commission),
      otherIncome: num(form.otherIncome),
      deductions,
      ...(hasTargets ? { deposits: cleanedDeposits } : {}),
    };

    // Nothing will actually land in a bank account → save straight through
    // rather than nagging the user with an empty confirmation modal.
    if (computeIncomeDeposits(income).length === 0) {
      addIncome(year, income);
      onSaved?.(income);
      return;
    }
    setPending(income);
  }, [addIncome, deposits, form, isValid, month, onSaved, year]);

  const confirmSave = useCallback((): void => {
    if (!pending) return;
    addIncome(year, pending);
    pushToast({ message: 'บันทึกรายได้แล้ว', tone: 'success' });
    onSaved?.(pending);
    setPending(null);
  }, [addIncome, onSaved, pending, pushToast, year]);

  // ---- Delete -----------------------------------------------------------
  const handleDelete = useCallback((): void => {
    if (!onDelete || !isEdit) return;
    const monthName = formatThaiMonth(month, { long: true });
    const confirmed = window.confirm(
      `ลบข้อมูลรายได้เดือน ${monthName} ${year}?`,
    );
    if (!confirmed) return;
    deleteIncome(year, month);
    onDelete();
  }, [deleteIncome, isEdit, month, onDelete, year]);

  // ---- Keyboard shortcuts ----------------------------------------------
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      // Cmd+S / Ctrl+S → save
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
        return;
      }
      // ESC → cancel (only when our parent cares about cancel)
      if (event.key === 'Escape' && onCancel) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleSave, onCancel]);

  // ---- Render -----------------------------------------------------------
  const monthLabel = `${formatThaiMonth(month, { long: true })} ${year}`;
  const showDelete = isEdit && Boolean(onDelete);
  const hasAccounts = bankAccounts.length > 0;
  const pendingRefs = pending ? computeIncomeDeposits(pending) : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl w-full">
      {/* Month header — fixed, not editable. The form is always scoped
          to one year+month chosen by the parent. */}
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide">
            เดือน
          </div>
          <div className="text-lg font-semibold text-slate-900 mt-0.5">
            {monthLabel}
          </div>
        </div>
        {incomeDefaults && (
          <button
            type="button"
            onClick={handleFillDefaults}
            className="px-3 py-1.5 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary-light transition"
            title="ดึงค่าเริ่มต้นจาก Settings → ค่าเริ่มต้นรายได้"
          >
            📋 เติมจากค่าเริ่มต้น
          </button>
        )}
      </div>
      {!incomeDefaults && (
        <p className="mb-4 text-xs text-slate-400">
          💡 ตั้งค่า Settings → ค่าเริ่มต้นรายได้ เพื่อ pre-fill เดือนใหม่
          ในคลิกเดียว
        </p>
      )}

      {/* --- Income section --- */}
      <SectionHeader title="รายได้" />
      <div className="space-y-3">
        <NumberInput
          id="income-salary"
          label="เงินเดือน"
          value={form.salary}
          onChange={setField('salary')}
          onBlur={markTouched('salary')}
          error={touched.salary ? errors.salary : undefined}
          autoFocus={!isEdit}
        />
        {hasAccounts && (
          <DepositSelect
            field="salary"
            label="เงินเดือน"
            value={deposits.salary}
            accounts={bankAccounts}
            onChange={setDepositTarget}
          />
        )}
        <NumberInput
          id="income-bonus"
          label="โบนัส"
          value={form.bonus}
          onChange={setField('bonus')}
        />
        {hasAccounts && (
          <DepositSelect
            field="bonus"
            label="โบนัส"
            value={deposits.bonus}
            accounts={bankAccounts}
            onChange={setDepositTarget}
          />
        )}
        <NumberInput
          id="income-commission"
          label="คอม"
          value={form.commission}
          onChange={setField('commission')}
        />
        {hasAccounts && (
          <DepositSelect
            field="commission"
            label="คอม"
            value={deposits.commission}
            accounts={bankAccounts}
            onChange={setDepositTarget}
          />
        )}
        <NumberInput
          id="income-otherIncome"
          label="รายได้อื่นๆ"
          value={form.otherIncome}
          onChange={setField('otherIncome')}
        />
        {hasAccounts && (
          <DepositSelect
            field="otherIncome"
            label="รายได้อื่นๆ"
            value={deposits.otherIncome}
            accounts={bankAccounts}
            onChange={setDepositTarget}
          />
        )}
      </div>

      {/* --- Deductions section --- */}
      <hr className="border-slate-200 my-6" />
      <SectionHeader title="หัก (Deductions)" />
      <div className="space-y-3">
        <NumberInput
          id="deduction-tax"
          label="ภาษี"
          value={form.tax}
          onChange={setField('tax')}
        />
        <NumberInput
          id="deduction-social"
          label="ประกันสังคม"
          value={form.socialSecurity}
          onChange={setField('socialSecurity')}
        />
        <NumberInput
          id="deduction-provident"
          label="กองทุน"
          value={form.providentFund}
          onChange={setField('providentFund')}
        />
        <NumberInput
          id="deduction-gsl"
          label="อื่นๆ"
          value={form.gsl}
          onChange={setField('gsl')}
        />
      </div>

      {/* --- Live summary --- */}
      <hr className="border-slate-200 my-6" />
      <SectionHeader title="สรุป" />
      <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        <SummaryRow label="รวมรายได้" value={summary.grossIncome} />
        <SummaryRow label="รวมหัก" value={summary.totalDeductions} />
        <SummaryRow label="Net." value={summary.netSalary} emphasis="net" />
        <SummaryRow
          label="Net. All"
          value={summary.netAll}
          emphasis="netAll"
        />
      </div>

      {/* --- Action bar --- */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 text-sm text-slate-700"
            >
              ยกเลิก
            </button>
          )}
          {showDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-expense hover:bg-expense-light px-4 py-2 rounded-lg text-sm"
            >
              ลบ
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          title="บันทึก (⌘S / Ctrl+S)"
        >
          {isEdit ? 'อัปเดตรายได้' : 'บันทึกรายได้'} ✓
        </button>
      </div>

      <IncomeDepositSummary
        open={pending != null}
        onClose={() => setPending(null)}
        onConfirm={confirmSave}
        refs={pendingRefs}
        previousRefs={initialValues?.depositSideEffects}
        accounts={bankAccounts}
        salaryUnderwater={pending ? isSalaryUnderwater(pending) : false}
        monthLabel={monthLabel}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// SectionHeader — small visual divider with a label.
// ---------------------------------------------------------------------------

const SectionHeader = ({ title }: { title: string }): ReactNode => (
  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
    {title}
  </h3>
);

export default IncomeForm;
