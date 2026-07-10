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
import { Link } from 'react-router-dom';

import { EMPTY_BANK_ACCOUNTS } from '@/stores/emptyRefs';
import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { useToastStore } from '@/stores/toastStore';
import type {
  BankAccount,
  IncomeDepositTargets,
  MonthlyDeductions,
  MonthlyIncome,
} from '@/types';
import {
  incomeDeletedMessage,
  incomeSavedMessage,
} from '@/utils/actionMessages';
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

/** ติ๊ก "ลงบัญชี" ต่อช่องรายได้ — map เป็น account id ตอนบันทึก. */
interface IncomeDepositChecks {
  salary: boolean;
  bonus: boolean;
  commission: boolean;
  otherIncome: boolean;
}

/** Stable empty reference so the store selector never re-triggers renders. */
const EMPTY_ACCOUNTS: BankAccount[] = [];

/**
 * id ชั่วคราวของบัญชีเงินสดที่ "จะถูกสร้าง" ตอนกดยืนยัน. ใช้ระหว่างที่ modal
 * สรุปเปิดอยู่เท่านั้น — ไม่มีวันถูกเขียนลง store เพราะ confirmSave แทนที่ด้วย
 * id จริงก่อนบันทึก และการกดยกเลิกทิ้งมันไปพร้อมกับ pending.
 */
const PENDING_CASH_ID = '__pending-cash__';

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
// DepositCheckbox — one-decision "ลงบัญชี" toggle per income field (F39, simplified).
//
// เจ้าของบอกว่า dropdown 4 ตัวเลือกต่อช่องมันเยอะไป — เหลือแค่ติ๊กถูก/ไม่ติ๊ก.
// ปลายทางถูกกำหนดตายตัวตามชนิดของช่อง (เงินเดือน→บัญชีเงินเดือน, ที่เหลือ→เงินสด)
// ผู้ปกครองฝั่ง IncomeForm เป็นคน map checkbox → account id ให้.
//
// เหตุที่เงินเดือนกับที่เหลือทำงานต่างกัน:
//   - บัญชี "เงินเดือน" ผูกกับธนาคารจริง (เช่น กสิกร/ไทยพาณิชย์) ซึ่งเดาแทน
//     ไม่ได้ ถ้ายังไม่มี → ปิดการติ๊ก + ลิงก์ให้ไปเพิ่มเองที่ /accounts.
//   - บัญชี "เงินสด" ไม่มีแบรนด์ สร้างแทนได้ทันทีตอนติ๊ก (ดู handleCashDeposit).
// Aligned to the input column of NumberInput's 140px/1fr grid.
// ---------------------------------------------------------------------------

interface DepositCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Muted helper/link shown under the checkbox (e.g. เมื่อยังไม่มีบัญชีเงินเดือน). */
  helper?: ReactNode;
}

const DepositCheckbox = ({
  label,
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  helper,
}: DepositCheckboxProps): ReactNode => (
  <div className="grid grid-cols-[140px_1fr] gap-3">
    <span aria-hidden="true" />
    <div>
      <label
        className={[
          'flex items-center gap-2 text-xs select-none',
          disabled ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 cursor-pointer',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={ariaLabel}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />
        {label}
      </label>
      {helper && <div className="mt-1 text-xs text-slate-400">{helper}</div>}
    </div>
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
  const addBankAccount = useFinanceStore((s) => s.addBankAccount);
  const bankAccounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_ACCOUNTS);
  const incomeDefaults = useGoalsStore((s) => s.incomeDefaults);
  const pushToast = useToastStore((s) => s.push);

  // ปลายทางตายตัวตามชนิดบัญชี — เงินเดือนเข้าบัญชีประเภท 'salary', ส่วน
  // โบนัส/คอม/อื่นๆ เข้าบัญชีประเภท 'cash' (ตัวแรกที่เจอ).
  const salaryAccount = useMemo(
    () => bankAccounts.find((a) => a.type === 'salary'),
    [bankAccounts],
  );
  const cashAccount = useMemo(
    () => bankAccounts.find((a) => a.type === 'cash'),
    [bankAccounts],
  );

  const [form, setForm] = useState<IncomeFormState>(() =>
    initialValues ? fromIncome(initialValues) : EMPTY_STATE,
  );

  // F39 (simplified) — แต่ละช่องเหลือแค่ "ติ๊กลงบัญชีไหม" ไม่ใช่ dropdown เลือก
  // บัญชี. เก็บเป็น boolean ต่อช่อง แล้วค่อย map เป็น account id ตอนบันทึก.
  //
  // เดือนที่ "ยังไม่เคยกรอก" ตั้ง default ให้เงินเดือนติ๊กไว้เมื่อมีบัญชีเงินเดือน;
  // ช่องอื่นไม่ติ๊ก (ไม่เดาแทน). เกณฑ์คือ "ยังไม่เคยกรอก" ไม่ใช่ "ยังไม่มีแถว" —
  // seed สร้างแถวศูนย์ครบทุกเดือนอยู่แล้ว. เดือนที่มีตัวเลขจริงแต่ยังไม่เคยตั้ง
  // ปลายทางจะไม่ถูกเดาให้ เพราะการกดบันทึกจะเขียนเงินเข้าบัญชีจริง.
  //
  // แถวเก่า (legacy) ที่ deposits ชี้ไปบัญชีอะไรก็ได้ (เช่น โบนัส→กรุงศรี) ถูก
  // coerce: salary→บัญชีเงินเดือน, ที่เหลือ→เงินสด (เจ้าของเลือก "force-move to
  // cash" มากกว่าจะรักษาปลายทางเดิม). ตรงนี้แค่ตั้ง checkbox ให้ติ๊ก — การ
  // แปลงปลายทาง + reconcile ยอดจริงเกิดตอนบันทึก.
  const [checks, setChecks] = useState<IncomeDepositChecks>(() => {
    const salaryExists = bankAccounts.some((a) => a.type === 'salary');
    const prior = initialValues?.deposits;
    if (prior) {
      return {
        salary: Boolean(prior.salary) && salaryExists,
        bonus: Boolean(prior.bonus),
        commission: Boolean(prior.commission),
        otherIncome: Boolean(prior.otherIncome),
      };
    }
    const neverFilled =
      initialValues == null ||
      (initialValues.salary === 0 &&
        initialValues.bonus === 0 &&
        initialValues.commission === 0 &&
        (initialValues.otherIncome ?? 0) === 0 &&
        initialValues.depositSideEffects == null);
    return {
      salary: neverFilled && salaryExists,
      bonus: false,
      commission: false,
      otherIncome: false,
    };
  });
  const [pending, setPending] = useState<MonthlyIncome | null>(null);

  // คืน id บัญชีเงินสด — สร้างให้อัตโนมัติถ้ายังไม่มี. ทำได้เพราะเงินสดไม่มี
  // แบรนด์ (ต่างจากบัญชีเงินเดือนที่ต้องรู้ธนาคารจริงก่อน จึงสร้างแทนไม่ได้).
  const ensureCashAccountId = useCallback((): string => {
    const existing = bankAccounts.find((a) => a.type === 'cash');
    if (existing) return existing.id;
    const id = addBankAccount('เงินสด', 'cash', 'cash');
    pushToast({ message: 'สร้างบัญชีเงินสดให้อัตโนมัติ', tone: 'success' });
    return id;
  }, [addBankAccount, bankAccounts, pushToast]);

  // ชื่อบัญชีที่ "เงินเข้าจริง" (ยอด > 0) จากรายได้ก้อนนี้ —
  // computeIncomeDeposits กรองยอด 0 ทิ้งให้แล้ว. บัญชีเดียวรับหลายช่อง
  // (เช่น เงินเดือน + โบนัสเข้าเงินสดใบเดียว) ไม่ควรถูกพูดถึงสองครั้ง → dedupe.
  //
  // รับ `accounts` เป็น argument (ไม่ปิด closure ทับ bankAccounts) เพราะ
  // confirmSave อาจเพิ่งสร้างบัญชีเงินสดใบใหม่ผ่าน ensureCashAccountId ซึ่ง
  // bankAccounts ของ render นี้ยังไม่เห็น — ผู้เรียกจึงส่ง state สดจาก getState().
  const depositedAccountNames = useCallback(
    (income: MonthlyIncome, accounts: readonly BankAccount[]): string[] => {
      const names = computeIncomeDeposits(income).map(
        (d) => accounts.find((a) => a.id === d.accountId)?.name ?? 'บัญชี',
      );
      return [...new Set(names)];
    },
    [],
  );

  const toggleSalaryDeposit = useCallback((checked: boolean): void => {
    setChecks((prev) => ({ ...prev, salary: checked }));
  }, []);

  const toggleCashDeposit = useCallback(
    (field: 'bonus' | 'commission' | 'otherIncome', checked: boolean): void => {
      // ไม่สร้างบัญชีเงินสดตรงนี้ — การติ๊ก checkbox ไม่ควรเขียนข้อมูลถาวร
      // (ยกเลิกฟอร์มแล้วจะเหลือบัญชีเปล่าค้างไว้). บัญชีถูกสร้างตอนกด
      // "ยืนยันบันทึก" ใน handleConfirmSave ซึ่งเป็นจุดที่ผู้ใช้ตั้งใจเขียนจริง.
      setChecks((prev) => ({ ...prev, [field]: checked }));
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

    // Map checkbox → account id. เงินเดือนเข้าบัญชีเงินเดือน (ต้องมีอยู่แล้ว
    // เพราะ checkbox ถูก disable เมื่อไม่มี); โบนัส/คอม/อื่นๆ เข้าเงินสด — เรียก
    // ensureCashAccountId ครั้งเดียวแล้วใช้ id เดียวกันทุกช่อง (สร้าง+toast ถ้า
    // ยังไม่มี เผื่อ legacy row ที่ติ๊กมาแต่ยังไม่เคยแตะ checkbox).
    // ช่องที่ไม่ติ๊กถูกตัดทิ้ง — ไม่มีปลายทางเลย = ไม่มี deposits (backward-compat:
    // แถวที่ไม่มี `deposits` ไม่แตะยอดบัญชี).
    const cleanedDeposits: IncomeDepositTargets = {};
    if (checks.salary && salaryAccount) {
      cleanedDeposits.salary = salaryAccount.id;
    }
    if (checks.bonus || checks.commission || checks.otherIncome) {
      // ยังไม่สร้างบัญชีเงินสดที่นี่ — ผู้ใช้ยังกดยกเลิกที่ modal ได้.
      // ใส่ id ชั่วคราวไว้ก่อน แล้ว confirmSave จะสร้างบัญชีจริงและแทนที่ให้.
      const cashId = cashAccount?.id ?? PENDING_CASH_ID;
      if (checks.bonus) cleanedDeposits.bonus = cashId;
      if (checks.commission) cleanedDeposits.commission = cashId;
      if (checks.otherIncome) cleanedDeposits.otherIncome = cashId;
    }
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
      pushToast({
        message: incomeSavedMessage({
          mode: isEdit ? 'edit' : 'add',
          depositedAccounts: [],
        }),
        tone: 'success',
      });
      onSaved?.(income);
      return;
    }
    setPending(income);
  }, [
    addIncome,
    cashAccount,
    checks,
    form,
    isEdit,
    isValid,
    month,
    onSaved,
    pushToast,
    salaryAccount,
    year,
  ]);

  const confirmSave = useCallback((): void => {
    if (!pending) return;
    // จุดเดียวที่เขียนข้อมูลถาวร — ถ้ามีช่องไหนชี้ไปที่บัญชีเงินสดที่ยังไม่มีจริง
    // ค่อยสร้างตรงนี้ แล้วแทน id ชั่วคราวด้วย id จริงก่อนบันทึก.
    let income = pending;
    const targets = pending.deposits;
    if (targets && Object.values(targets).includes(PENDING_CASH_ID)) {
      const cashId = ensureCashAccountId();
      const resolved: IncomeDepositTargets = { ...targets };
      for (const key of ['bonus', 'commission', 'otherIncome'] as const) {
        if (resolved[key] === PENDING_CASH_ID) resolved[key] = cashId;
      }
      income = { ...pending, deposits: resolved };
    }
    addIncome(year, income);
    // ใช้ `income` (id บัญชีเงินสดถูก resolve เป็นของจริงแล้ว) ไม่ใช่ `pending`
    // ที่ยังถือ PENDING_CASH_ID — ไม่งั้นบัญชีเงินสดที่เพิ่งสร้างจะหาชื่อไม่เจอ.
    // อ่านรายชื่อบัญชีสดจาก getState() หลัง ensureCashAccountId เขียนบัญชีใหม่ลง
    // store แล้ว — bankAccounts ที่ปิด closure ไว้เป็นของ render ก่อนหน้า จึงยัง
    // ไม่เห็นบัญชีเงินสดใบใหม่ (จะ fallback เป็น 'บัญชี'). getState() ใน event
    // handler ปลอดภัย (ไม่ใช่ระหว่าง render).
    const currentAccounts =
      useFinanceStore.getState().data.bankAccounts ?? EMPTY_BANK_ACCOUNTS;
    pushToast({
      message: incomeSavedMessage({
        mode: isEdit ? 'edit' : 'add',
        depositedAccounts: depositedAccountNames(income, currentAccounts),
      }),
      tone: 'success',
    });
    onSaved?.(income);
    setPending(null);
  }, [
    addIncome,
    depositedAccountNames,
    ensureCashAccountId,
    isEdit,
    onSaved,
    pending,
    pushToast,
    year,
  ]);

  // ---- Delete -----------------------------------------------------------
  const handleDelete = useCallback((): void => {
    if (!onDelete || !isEdit) return;
    const monthName = formatThaiMonth(month, { long: true });
    const confirmed = window.confirm(
      `ลบข้อมูลรายได้เดือน ${monthName} ${year}?`,
    );
    if (!confirmed) return;

    // อ่านบัญชีที่ "เงินเข้าจริง" ก่อนลบ — จาก depositSideEffects (ยอดที่ลงบัญชี
    // จริง) ไม่ใช่ computeIncomeDeposits ที่คำนวณใหม่จากแถว: store คืนยอดด้วย
    // tx.amount ที่เคยลงไว้ ข้อความจึงต้องอ้างแหล่งเดียวกัน ไม่งั้นพูดถึงบัญชีที่
    // ไม่ได้ถูกคืนจริง. แถวที่ไม่มี deposits (ข้อมูลเก่า) → [] → toast ไม่พูดถึงยอด.
    const state = useFinanceStore.getState();
    const row = state.data.years[String(year)]?.income.find((i) => i.month === month);
    const accounts = state.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS;
    const revertedAccounts = [
      ...new Set(
        (row?.depositSideEffects ?? []).map(
          (ref) => accounts.find((a) => a.id === ref.accountId)?.name ?? 'บัญชี',
        ),
      ),
    ];

    deleteIncome(year, month);
    // `month` ที่นี่เป็น 1-based; incomeDeletedMessage รับแบบ 0-based.
    pushToast({
      message: incomeDeletedMessage({ month: month - 1, revertedAccounts }),
      tone: 'success',
    });
    onDelete();
  }, [deleteIncome, isEdit, month, onDelete, pushToast, year]);

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
  const pendingRefs = pending ? computeIncomeDeposits(pending) : [];

  // บัญชีเงินสดที่ยังไม่ถูกสร้างต้องมีชื่อให้ modal แสดง ไม่งั้นจะขึ้นว่า
  // "บัญชีที่ถูกลบ" ทั้งที่ความจริงคือ "กำลังจะสร้างให้".
  const summaryAccounts = useMemo(
    () =>
      cashAccount
        ? bankAccounts
        : [
            ...bankAccounts,
            {
              id: PENDING_CASH_ID,
              name: 'เงินสด (จะสร้างให้)',
              type: 'cash' as const,
              balances: {},
            },
          ],
    [bankAccounts, cashAccount],
  );

  return (
    // ไม่มี card chrome ของตัวเอง (bg/border/rounded) — ฟอร์มนี้ถูกวางใน Modal
    // ซึ่งเป็นเจ้าของกรอบอยู่แล้ว การใส่ซ้ำทำให้เห็นการ์ดซ้อนการ์ด. และไม่ล็อก
    // max-width ปล่อยให้เต็มความกว้างที่ Modal จัดให้ ไม่งั้นเหลือขาวข้างขวา.
    <div className="w-full px-6 py-5">
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

      {/* --- Income section ---
          แต่ละช่องจับคู่กับ checkbox ของตัวเองใน <div> เดียว: ระยะห่างภายในคู่
          (space-y-1) แคบกว่าระยะระหว่างคู่ (space-y-4) มาก สายตาจึงอ่านออกทันที
          ว่า "ลงเงินสด" เป็นของช่องบน ไม่ใช่ช่องล่าง (Gestalt: proximity). */}
      <SectionHeader title="รายได้" />
      <div className="space-y-4">
        <div className="space-y-1">
          <NumberInput
            id="income-salary"
            label="เงินเดือน"
            value={form.salary}
            onChange={setField('salary')}
            onBlur={markTouched('salary')}
            error={touched.salary ? errors.salary : undefined}
            autoFocus={!isEdit}
          />
          <DepositCheckbox
            label="ลงบัญชีเงินเดือน"
            ariaLabel="ลงบัญชีเงินเดือน"
            checked={checks.salary}
            disabled={!salaryAccount}
            onChange={toggleSalaryDeposit}
            helper={
              !salaryAccount ? (
                <>
                  ยังไม่มีบัญชีเงินเดือน — เพิ่มก่อน{' '}
                  <Link
                    to="/accounts"
                    className="text-primary underline underline-offset-2 hover:text-primary-dark"
                  >
                    ไปเพิ่มบัญชี
                  </Link>
                </>
              ) : undefined
            }
          />
        </div>

        <div className="space-y-1">
          <NumberInput
            id="income-bonus"
            label="โบนัส"
            value={form.bonus}
            onChange={setField('bonus')}
          />
          <DepositCheckbox
            label="ลงเงินสด"
            ariaLabel="ลงเงินสด (โบนัส)"
            checked={checks.bonus}
            onChange={(c) => toggleCashDeposit('bonus', c)}
          />
        </div>

        <div className="space-y-1">
          <NumberInput
            id="income-commission"
            label="คอม"
            value={form.commission}
            onChange={setField('commission')}
          />
          <DepositCheckbox
            label="ลงเงินสด"
            ariaLabel="ลงเงินสด (คอม)"
            checked={checks.commission}
            onChange={(c) => toggleCashDeposit('commission', c)}
          />
        </div>

        <div className="space-y-1">
          <NumberInput
            id="income-otherIncome"
            label="รายได้อื่นๆ"
            value={form.otherIncome}
            onChange={setField('otherIncome')}
          />
          <DepositCheckbox
            label="ลงเงินสด"
            ariaLabel="ลงเงินสด (รายได้อื่นๆ)"
            checked={checks.otherIncome}
            onChange={(c) => toggleCashDeposit('otherIncome', c)}
          />
        </div>
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
        accounts={summaryAccounts}
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
