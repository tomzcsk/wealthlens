/**
 * WealthLens — Expense entry form (F08).
 *
 * One-item-at-a-time editor for an `ExpenseItem` row. Composable: drop into
 * an inline panel (e.g. on the Monthly Detail page) or into a Modal — the
 * component itself doesn't impose a card/chrome wrapper, so the parent
 * decides surface treatment.
 *
 * Quick-add behaviour (per F08 acceptance):
 *   When the user presses Enter to save (rather than Tab + click), the form
 *   stays mounted with the same category pre-selected, clears name+amount,
 *   refocuses the name input, and flashes a "เพิ่มแล้ว ✓" confirmation for
 *   ~1.5s. This makes batch entry of monthly expenses feel snappy.
 *
 * Validation is inline (on blur) and disables Save when the form is invalid.
 * Cmd/Ctrl+S → save, Esc → cancel.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import {
  CATEGORY_ORDER,
  EXPENSE_CATEGORIES,
} from '@/types/expense-categories';
import type { ExpenseCategory, ExpenseItem, Reimbursement } from '@/types';
import { formatNumber } from '@/utils/formatters';

/** Today's date as ISO yyyy-mm-dd — used when Tom flips status to received. */
const todayIso = (): string => new Date().toISOString().slice(0, 10);

export interface ExpenseFormProps {
  year: number;
  /** Calendar month, 1-12. */
  month: number;
  /** Provide an existing item to enter "edit" mode. */
  initialValues?: ExpenseItem | null;
  /** Pre-select a category (used by per-category "+ Add" buttons). */
  defaultCategory?: ExpenseCategory;
  /** Fired after a successful save with the resulting item. */
  onSaved?: (item: ExpenseItem) => void;
  /** Fired when the user presses Cancel or Esc. */
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
  amount?: string;
}

interface FormTouched {
  name?: boolean;
  amount?: boolean;
}

/** Strip commas + non-digit characters so users can paste "1,234" freely. */
const parseAmount = (input: string): number => {
  if (input.trim() === '') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

/** Render the live numeric value with thousand separators in the input. */
const displayAmount = (raw: string): string => {
  if (raw === '' || raw === '-') return raw;
  // Preserve trailing dot while typing decimals.
  const endsWithDot = raw.endsWith('.');
  const numeric = parseAmount(raw);
  if (numeric === 0 && raw.replace(/[^0-9]/g, '') === '') return raw;
  const [, decimalPart] = raw.split('.');
  if (decimalPart !== undefined) {
    return `${formatNumber(Math.trunc(numeric))}.${decimalPart}`;
  }
  return formatNumber(numeric) + (endsWithDot ? '.' : '');
};

const validate = (values: {
  name: string;
  amount: number;
}): FormErrors => {
  const errors: FormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'กรอกชื่อรายการ';
  }
  if (!(values.amount > 0)) {
    errors.amount = 'จำนวนเงินต้องมากกว่า 0';
  }
  return errors;
};

const FLASH_MS = 1500;

export const ExpenseForm = ({
  year,
  month,
  initialValues,
  defaultCategory,
  onSaved,
  onCancel,
}: ExpenseFormProps): ReactNode => {
  const addExpense = useFinanceStore((s) => s.addExpense);
  const updateExpense = useFinanceStore((s) => s.updateExpense);

  const isEdit = initialValues != null;

  const [category, setCategory] = useState<ExpenseCategory>(
    initialValues?.category ?? defaultCategory ?? 'housing',
  );
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [amountInput, setAmountInput] = useState<string>(
    initialValues != null ? formatNumber(initialValues.amount) : '',
  );
  const [isRecurring, setIsRecurring] = useState<boolean>(
    initialValues?.isRecurring ?? false,
  );
  const [reimbursable, setReimbursable] = useState<boolean>(
    initialValues?.reimbursement != null,
  );
  const [reimbursementStatus, setReimbursementStatus] = useState<
    'pending' | 'received'
  >(initialValues?.reimbursement?.status ?? 'pending');
  const [touched, setTouched] = useState<FormTouched>({});
  const [showFlash, setShowFlash] = useState(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  // Stable IDs for label/input pairing.
  const categoryId = useId();
  const nameId = useId();
  const amountId = useId();
  const recurringId = useId();
  const reimbursableId = useId();

  // Auto-focus name input on mount — covers both "add" and "edit" modes,
  // and is the field most users want to fill in first.
  useEffect(() => {
    nameInputRef.current?.focus();
    if (initialValues != null) {
      // Place caret at end for edits.
      nameInputRef.current?.setSelectionRange(
        initialValues.name.length,
        initialValues.name.length,
      );
    }
  }, [initialValues]);

  // Cleanup the flash timer on unmount so we don't setState after unmount.
  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const amount = useMemo(() => parseAmount(amountInput), [amountInput]);
  const errors = useMemo(() => validate({ name, amount }), [name, amount]);
  const isValid = Object.keys(errors).length === 0;

  // -------------------------------------------------------------------------
  // Save / cancel
  // -------------------------------------------------------------------------

  /**
   * @param continueAdding If true (Enter key), keep the form open after save
   * with category pre-selected and name/amount cleared for fast batch entry.
   */
  const persist = (continueAdding: boolean): void => {
    setTouched({ name: true, amount: true });
    if (!isValid) return;

    const trimmedName = name.trim();
    // Build reimbursement payload only when checked. Preserve `receivedDate`
    // from the existing record when status is unchanged so we don't lose
    // the original reimbursement-day stamp on unrelated edits.
    const reimbursement: Reimbursement | undefined = reimbursable
      ? reimbursementStatus === 'received'
        ? {
            status: 'received',
            receivedDate:
              initialValues?.reimbursement?.status === 'received'
                ? initialValues.reimbursement.receivedDate
                : todayIso(),
          }
        : { status: 'pending' }
      : undefined;
    if (isEdit && initialValues != null) {
      updateExpense(year, month, initialValues.id, {
        category,
        name: trimmedName,
        amount,
        isRecurring,
        reimbursement,
      });
      onSaved?.({
        ...initialValues,
        category,
        name: trimmedName,
        amount,
        isRecurring,
        reimbursement,
      });
      return;
    }

    addExpense(year, month, {
      category,
      name: trimmedName,
      amount,
      isRecurring,
      reimbursement,
    });

    // Best-effort callback — we don't have the new id since addExpense
    // generates it internally and doesn't return it. Synthesize a transient
    // payload so consumers that just want "something saved" can react.
    onSaved?.({
      id: '',
      category,
      name: trimmedName,
      amount,
      isRecurring,
      reimbursement,
    });

    if (continueAdding) {
      // Quick-add: keep category, clear the rest, flash confirmation,
      // refocus the name field for the next entry.
      setName('');
      setAmountInput('');
      setIsRecurring(false);
      setReimbursable(false);
      setReimbursementStatus('pending');
      setTouched({});
      setShowFlash(true);
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => {
        setShowFlash(false);
        flashTimerRef.current = null;
      }, FLASH_MS);
      window.requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Form-level submit comes from the Save button → close on edit, quick-add
    // on new (matches the user expectation of "Enter to save and continue").
    persist(!isEdit);
  };

  const handleAmountKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      // Native form submit will fire — let it. We only handle Enter here for
      // the explicit Cmd/Ctrl+S shortcut path below.
      return;
    }
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel?.();
      return;
    }
    // Cmd/Ctrl+S → save (close on edit, quick-add on new).
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      persist(!isEdit);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const inputBaseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const errorClass = 'mt-1 text-xs text-expense';

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className="space-y-4"
      aria-label={isEdit ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}
    >
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

      {/* Name */}
      <div>
        <label htmlFor={nameId} className={labelClass}>
          ชื่อรายการ
        </label>
        <input
          id={nameId}
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="เช่น Netflix, ค่าไฟบ้าน"
          className={inputBaseClass}
          aria-invalid={touched.name === true && errors.name !== undefined}
          aria-describedby={
            touched.name === true && errors.name !== undefined
              ? `${nameId}-err`
              : undefined
          }
        />
        {touched.name === true && errors.name !== undefined && (
          <p id={`${nameId}-err`} className={errorClass}>
            {errors.name}
          </p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label htmlFor={amountId} className={labelClass}>
          จำนวนเงิน (บาท)
        </label>
        <input
          id={amountId}
          type="text"
          inputMode="decimal"
          value={displayAmount(amountInput)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setAmountInput(e.target.value)
          }
          onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
          onKeyDown={handleAmountKeyDown}
          placeholder="0"
          className={`${inputBaseClass} financial-number text-right`}
          aria-invalid={touched.amount === true && errors.amount !== undefined}
          aria-describedby={
            touched.amount === true && errors.amount !== undefined
              ? `${amountId}-err`
              : undefined
          }
        />
        {touched.amount === true && errors.amount !== undefined && (
          <p id={`${amountId}-err`} className={errorClass}>
            {errors.amount}
          </p>
        )}
      </div>

      {/* Recurring toggle */}
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
          รายการประจำเดือน
        </label>
      </div>

      {/* Reimbursable toggle — for expenses paid out-of-pocket and claimed
          back from the company (e.g. Claude AI subscription). */}
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
            {reimbursementStatus === 'received' &&
              initialValues?.reimbursement?.status === 'received' &&
              initialValues.reimbursement.receivedDate != null && (
                <span className="text-xs text-slate-500">
                  ได้คืน {initialValues.reimbursement.receivedDate}
                </span>
              )}
          </div>
        )}
      </div>

      {/* Footer: actions + quick-add flash */}
      <div className="flex items-center justify-between pt-2">
        <span
          className={`text-xs text-income transition-opacity duration-200 ${showFlash ? 'opacity-100' : 'opacity-0'}`}
          aria-live="polite"
        >
          {showFlash ? 'เพิ่มแล้ว ✓' : ' '}
        </span>
        <div className="flex items-center gap-2">
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
            {isEdit ? 'บันทึก' : 'เพิ่มรายการ'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default ExpenseForm;
