/**
 * WealthLens — Installment plan entry form.
 *
 * Captures a single "ผ่อน N งวด" purchase (e.g. ผ่อน iPhone 0% 10 เดือน):
 * total price + number of งวด + month it kicks off. On save, the store
 * fans this out into N regular `ExpenseItem` rows tagged with a shared
 * `planId` so existing charts/KPIs/exports keep working without
 * special-casing installments.
 *
 * Live preview shows per-งวด amount, the date range, and flags the
 * rounding adjustment when totalAmount/N has a remainder.
 */

import {
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import {
  CATEGORY_ORDER,
  EXPENSE_CATEGORIES,
} from '@/types/expense-categories';
import type { ExpenseCategory, Reimbursement } from '@/types';
import {
  formatNumber,
  formatTHB,
  THAI_MONTHS_LONG,
} from '@/utils/formatters';

export interface InstallmentFormProps {
  /** Year currently in view — default for the start-month picker. */
  defaultYear: number;
  /** Month (1-12) currently in view — default for the start-month picker. */
  defaultMonth: number;
  onSaved?: (planId: string) => void;
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
  totalAmount?: string;
  totalMonths?: string;
}

interface FormTouched {
  name?: boolean;
  totalAmount?: boolean;
  totalMonths?: boolean;
}

const MIN_MONTHS = 2;
const MAX_MONTHS = 60;

/** Strip non-numeric chars so users can paste "50,000" or "฿50,000". */
const parseAmount = (input: string): number => {
  if (input.trim() === '') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

const displayAmount = (raw: string): string => {
  if (raw === '') return raw;
  const endsWithDot = raw.endsWith('.');
  const numeric = parseAmount(raw);
  if (numeric === 0 && raw.replace(/[^0-9]/g, '') === '') return raw;
  const [, decimalPart] = raw.split('.');
  if (decimalPart !== undefined) {
    return `${formatNumber(Math.trunc(numeric))}.${decimalPart}`;
  }
  return formatNumber(numeric) + (endsWithDot ? '.' : '');
};

const parseMonths = (input: string): number => {
  const n = Number.parseInt(input.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const advanceMonth = (
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } => {
  const zeroBased = month - 1 + offset;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
};

const validate = (v: {
  name: string;
  totalAmount: number;
  totalMonths: number;
}): FormErrors => {
  const errors: FormErrors = {};
  if (v.name.trim() === '') errors.name = 'กรอกชื่อรายการ';
  if (!(v.totalAmount > 0)) errors.totalAmount = 'ยอดเต็มต้องมากกว่า 0';
  if (!(v.totalMonths >= MIN_MONTHS && v.totalMonths <= MAX_MONTHS)) {
    errors.totalMonths = `จำนวนงวดต้องอยู่ระหว่าง ${MIN_MONTHS}-${MAX_MONTHS}`;
  }
  return errors;
};

/** Build the list of year options for the start-month picker. */
const buildYearOptions = (anchorYear: number): number[] => {
  const years: number[] = [];
  for (let y = anchorYear - 1; y <= anchorYear + 3; y += 1) years.push(y);
  return years;
};

export const InstallmentForm = ({
  defaultYear,
  defaultMonth,
  onSaved,
  onCancel,
}: InstallmentFormProps): ReactNode => {
  const addInstallmentPlan = useFinanceStore((s) => s.addInstallmentPlan);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [totalAmountInput, setTotalAmountInput] = useState('');
  const [totalMonthsInput, setTotalMonthsInput] = useState('10');
  const [startYear, setStartYear] = useState(defaultYear);
  const [startMonth, setStartMonth] = useState(defaultMonth);
  const [reimbursable, setReimbursable] = useState(false);
  const [reimbursementStatus, setReimbursementStatus] =
    useState<'pending' | 'received'>('pending');
  const [isRecurring, setIsRecurring] = useState(false);
  const [touched, setTouched] = useState<FormTouched>({});

  const nameId = useId();
  const categoryId = useId();
  const amountId = useId();
  const monthsId = useId();
  const startYearId = useId();
  const startMonthId = useId();
  const recurringId = useId();
  const reimbursableId = useId();

  const totalAmount = useMemo(() => parseAmount(totalAmountInput), [
    totalAmountInput,
  ]);
  const totalMonths = useMemo(() => parseMonths(totalMonthsInput), [
    totalMonthsInput,
  ]);
  const errors = useMemo(
    () => validate({ name, totalAmount, totalMonths }),
    [name, totalAmount, totalMonths],
  );
  const isValid = Object.keys(errors).length === 0;

  // Preview — per-งวด amount, last-งวด adjustment, end month.
  const preview = useMemo(() => {
    if (!(totalAmount > 0) || !(totalMonths >= MIN_MONTHS)) return null;
    const perInstallment = round2(totalAmount / totalMonths);
    const lastInstallment = round2(
      totalAmount - perInstallment * (totalMonths - 1),
    );
    const end = advanceMonth(startYear, startMonth, totalMonths - 1);
    const hasRemainder =
      Math.abs(perInstallment - lastInstallment) > 0.001;
    return {
      perInstallment,
      lastInstallment,
      hasRemainder,
      endYear: end.year,
      endMonth: end.month,
    };
  }, [totalAmount, totalMonths, startYear, startMonth]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched({ name: true, totalAmount: true, totalMonths: true });
    if (!isValid) return;

    const reimbursement: Reimbursement | undefined = reimbursable
      ? reimbursementStatus === 'received'
        ? {
            status: 'received',
            receivedDate: new Date().toISOString().slice(0, 10),
          }
        : { status: 'pending' }
      : undefined;

    const planId = addInstallmentPlan({
      name: name.trim(),
      category,
      totalAmount,
      totalMonths,
      startYear,
      startMonth,
      isRecurring,
      reimbursement,
    });
    onSaved?.(planId);
  };

  const inputBaseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const errorClass = 'mt-1 text-xs text-expense';

  const yearOptions = useMemo(() => buildYearOptions(defaultYear), [
    defaultYear,
  ]);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label="สร้างแผนผ่อน"
    >
      {/* Name */}
      <div>
        <label htmlFor={nameId} className={labelClass}>
          ชื่อรายการ
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="เช่น iPhone 16 Pro, โซฟา IKEA"
          className={inputBaseClass}
          aria-invalid={touched.name === true && errors.name !== undefined}
        />
        {touched.name === true && errors.name !== undefined && (
          <p className={errorClass}>{errors.name}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label htmlFor={categoryId} className={labelClass}>
          หมวดหมู่
        </label>
        <select
          id={categoryId}
          value={category}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setCategory(e.target.value as ExpenseCategory)
          }
          className={inputBaseClass}
        >
          {CATEGORY_ORDER.filter((cat) => cat !== 'savings').map((cat) => {
            const meta = EXPENSE_CATEGORIES[cat];
            return (
              <option key={cat} value={cat}>
                {meta.icon} {meta.label}
              </option>
            );
          })}
        </select>
      </div>

      {/* Total amount + months — side by side on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={amountId} className={labelClass}>
            ยอดเต็ม (บาท)
          </label>
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            value={displayAmount(totalAmountInput)}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTotalAmountInput(e.target.value)
            }
            onBlur={() => setTouched((t) => ({ ...t, totalAmount: true }))}
            placeholder="50,000"
            className={`${inputBaseClass} financial-number text-right`}
            aria-invalid={
              touched.totalAmount === true && errors.totalAmount !== undefined
            }
          />
          {touched.totalAmount === true && errors.totalAmount !== undefined && (
            <p className={errorClass}>{errors.totalAmount}</p>
          )}
        </div>
        <div>
          <label htmlFor={monthsId} className={labelClass}>
            จำนวนงวด (เดือน)
          </label>
          <input
            id={monthsId}
            type="number"
            inputMode="numeric"
            min={MIN_MONTHS}
            max={MAX_MONTHS}
            value={totalMonthsInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setTotalMonthsInput(e.target.value)
            }
            onBlur={() => setTouched((t) => ({ ...t, totalMonths: true }))}
            placeholder="10"
            className={`${inputBaseClass} financial-number text-right`}
            aria-invalid={
              touched.totalMonths === true && errors.totalMonths !== undefined
            }
          />
          {touched.totalMonths === true && errors.totalMonths !== undefined && (
            <p className={errorClass}>{errors.totalMonths}</p>
          )}
        </div>
      </div>

      {/* Start month / year */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={startMonthId} className={labelClass}>
            เริ่มจ่ายเดือน
          </label>
          <select
            id={startMonthId}
            value={startMonth}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStartMonth(Number(e.target.value))
            }
            className={inputBaseClass}
          >
            {THAI_MONTHS_LONG.map((label, idx) => (
              <option key={label} value={idx + 1}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={startYearId} className={labelClass}>
            ปี
          </label>
          <select
            id={startYearId}
            value={startYear}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setStartYear(Number(e.target.value))
            }
            className={inputBaseClass}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recurring + reimbursable toggles */}
      <div className="flex items-center gap-2">
        <input
          id={recurringId}
          type="checkbox"
          checked={isRecurring}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setIsRecurring(e.target.checked)
          }
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary focus:ring-2"
        />
        <label htmlFor={recurringId} className="text-sm text-slate-700 select-none">
          ทำเครื่องหมายเป็นรายการประจำเดือน
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            id={reimbursableId}
            type="checkbox"
            checked={reimbursable}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setReimbursable(e.target.checked)
            }
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary focus:ring-2"
          />
          <label
            htmlFor={reimbursableId}
            className="text-sm text-slate-700 select-none"
          >
            เบิกบริษัท (จ่ายก่อนแล้วเบิกคืน)
          </label>
        </div>
        {reimbursable && (
          <div className="ml-6 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReimbursementStatus('pending')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
                reimbursementStatus === 'pending'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              aria-pressed={reimbursementStatus === 'pending'}
            >
              🟡 รอเบิก
            </button>
            <button
              type="button"
              onClick={() => setReimbursementStatus('received')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
                reimbursementStatus === 'received'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
              aria-pressed={reimbursementStatus === 'received'}
            >
              🟢 เบิกแล้ว
            </button>
          </div>
        )}
      </div>

      {/* Live preview */}
      {preview && (
        <div className="rounded-md bg-primary-light border border-primary/20 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-600">งวดละ</span>
            <span className="financial-number font-semibold text-primary-dark">
              {formatTHB(preview.perInstallment, { decimals: 2 })} × {totalMonths} เดือน
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-slate-600">ช่วงเวลา</span>
            <span className="text-slate-900">
              {THAI_MONTHS_LONG[startMonth - 1]} {startYear} →{' '}
              {THAI_MONTHS_LONG[preview.endMonth - 1]} {preview.endYear}
            </span>
          </div>
          {preview.hasRemainder && (
            <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-slate-500">
              <span>งวดสุดท้าย (ปรับเศษ)</span>
              <span className="financial-number">
                {formatTHB(preview.lastInstallment, { decimals: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel != null && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          สร้างแผนผ่อน
        </button>
      </div>
    </form>
  );
};

export default InstallmentForm;
