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
import { formatNumber, formatTHB } from '@/utils/formatters';

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
  /**
   * Fired after a successful save with the resulting item.
   * `continueAdding` is true only for quick-add (Enter / ⌘S on a new item),
   * signalling the parent to keep the modal open for the next entry; a plain
   * button click saves with `continueAdding = false` so the modal can close.
   */
  onSaved?: (item: ExpenseItem, continueAdding: boolean) => void;
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

/**
 * Parse a signed delta string ("+500", "-3,000", "1234") into a number.
 * Returns `null` when there's nothing usable yet (empty or a lone "-"), so
 * callers can treat "no delta entered" as "leave the amount unchanged".
 */
const parseDelta = (input: string): number | null => {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const n = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Re-format the delta field with thousand separators on every keystroke,
 * preserving an optional leading minus and a trailing decimal while typing.
 * Mirrors the Kept (Krungsri) add/withdraw editor so the two feel identical.
 */
const formatDeltaInput = (raw: string): string => {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return cleaned;
  const negative = cleaned.startsWith('-');
  const digits = cleaned.replace(/[^\d.]/g, '');
  if (digits === '') return negative ? '-' : '';
  const [intPart, decPart] = digits.split('.');
  const intNum = Number(intPart);
  const intFormatted = Number.isFinite(intNum) ? formatNumber(intNum) : '';
  return decPart !== undefined
    ? `${negative ? '-' : ''}${intFormatted}.${decPart}`
    : `${negative ? '-' : ''}${intFormatted}`;
};

const validate = (values: {
  name: string;
  newAmount: number;
  isEdit: boolean;
}): FormErrors => {
  const errors: FormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'กรอกชื่อรายการ';
  }
  if (values.newAmount < 0) {
    // A withdrawal larger than the current amount would go negative — block it.
    errors.amount = 'ยอดใหม่ติดลบไม่ได้';
  } else if (!values.isEdit && !(values.newAmount > 0)) {
    // New rows still need a real amount (keeps quick-add from inserting ฿0
    // junk); edits may legitimately drop to ฿0 (e.g. a recurring item not
    // billed this month).
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
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);

  const isEdit = initialValues != null;

  const [category, setCategory] = useState<ExpenseCategory>(
    initialValues?.category ?? defaultCategory ?? 'housing',
  );
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  // วันที่จ่าย (yyyy-mm-dd). New rows default to today; editing an existing
  // row keeps its stored date, or stays blank for legacy rows that never had
  // one (Tom opts in by picking a date — we never back-fill silently).
  const [dateText, setDateText] = useState<string>(
    initialValues != null ? (initialValues.date ?? '') : todayIso(),
  );
  // The amount field holds a *delta* to apply to the existing amount (or to
  // ฿0 for new rows) — positive = เพิ่ม, negative = ลด. It always starts empty
  // so an edit that only touches category/name keeps the amount untouched.
  const [amountDeltaText, setAmountDeltaText] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(
    initialValues?.isRecurring ?? false,
  );
  const [reimbursable, setReimbursable] = useState<boolean>(
    initialValues?.reimbursement != null,
  );
  const [reimbursementStatus, setReimbursementStatus] = useState<
    'pending' | 'received'
  >(initialValues?.reimbursement?.status ?? 'pending');
  const [paymentAccountId, setPaymentAccountId] = useState<string>(
    initialValues?.paymentAccountId ?? '',
  );
  const [touched, setTouched] = useState<FormTouched>({});
  const [showFlash, setShowFlash] = useState(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  // Tracks how the latest submit was triggered. A direct button click means
  // "I'm done — close the modal"; Enter (native form submit) means quick-add.
  // Defaults to 'enter' and resets after every submit.
  const submitSourceRef = useRef<'click' | 'enter'>('enter');

  // Stable IDs for label/input pairing.
  const categoryId = useId();
  const paymentAccountIdFieldId = useId();
  const nameId = useId();
  const amountId = useId();
  const dateId = useId();
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

  const baseAmount = initialValues?.amount ?? 0;
  const amountDelta = useMemo(
    () => parseDelta(amountDeltaText),
    [amountDeltaText],
  );
  const newAmount = baseAmount + (amountDelta ?? 0);
  const errors = useMemo(
    () => validate({ name, newAmount, isEdit }),
    [name, newAmount, isEdit],
  );
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
    // Empty date field → omit the field entirely (don't store "").
    const date = dateText.trim() === '' ? undefined : dateText;
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
        amount: newAmount,
        isRecurring,
        date,
        reimbursement,
        paymentAccountId: paymentAccountId || undefined,
      });
      onSaved?.(
        {
          ...initialValues,
          category,
          name: trimmedName,
          amount: newAmount,
          isRecurring,
          date,
          reimbursement,
          paymentAccountId: paymentAccountId || undefined,
        },
        false,
      );
      return;
    }

    addExpense(year, month, {
      category,
      name: trimmedName,
      amount: newAmount,
      isRecurring,
      date,
      reimbursement,
      paymentAccountId: paymentAccountId || undefined,
    });

    // Best-effort callback — we don't have the new id since addExpense
    // generates it internally and doesn't return it. Synthesize a transient
    // payload so consumers that just want "something saved" can react.
    onSaved?.(
      {
        id: '',
        category,
        name: trimmedName,
        amount: newAmount,
        isRecurring,
        date,
        reimbursement,
        paymentAccountId: paymentAccountId || undefined,
      },
      continueAdding,
    );

    if (continueAdding) {
      // Quick-add: keep category, clear the rest, flash confirmation,
      // refocus the name field for the next entry.
      setName('');
      setAmountDeltaText('');
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
    // Quick-add (keep modal open) only on a NEW item submitted via Enter.
    // A direct button click — even on a new item — means "done": save & close.
    const source = submitSourceRef.current;
    submitSourceRef.current = 'enter';
    persist(!isEdit && source === 'enter');
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

      {/* จ่ายผ่าน — which bank account (or เงินสด) to deduct from. */}
      <div>
        <label htmlFor={paymentAccountIdFieldId} className={labelClass}>
          จ่ายผ่าน
        </label>
        <select
          id={paymentAccountIdFieldId}
          value={paymentAccountId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setPaymentAccountId(e.target.value)
          }
          className={inputBaseClass}
        >
          <option value="">ไม่ระบุ (ไม่หักบัญชี)</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
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

      {/* Amount — delta editor (matches the Kept add/withdraw field). Type a
          signed change instead of the full total; leaving it blank keeps the
          current amount so category/name-only edits save cleanly. */}
      <div>
        <label htmlFor={amountId} className={labelClass}>
          จำนวนเงิน (บาท)
        </label>

        {isEdit && (
          <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-3 py-2 mb-2">
            <span className="text-xs text-slate-500">ยอดเดิม</span>
            <span className="text-sm font-medium tabular-nums text-slate-700">
              {formatTHB(baseAmount)}
            </span>
          </div>
        )}

        <input
          id={amountId}
          type="text"
          inputMode="decimal"
          value={amountDeltaText}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setAmountDeltaText(formatDeltaInput(e.target.value))
          }
          onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
          onKeyDown={handleAmountKeyDown}
          placeholder={isEdit ? 'เช่น +500 หรือ -200' : 'เช่น 2,228'}
          className={`${inputBaseClass} financial-number text-right`}
          aria-invalid={touched.amount === true && errors.amount !== undefined}
          aria-describedby={
            touched.amount === true && errors.amount !== undefined
              ? `${amountId}-err`
              : undefined
          }
        />
        <p className="mt-1 text-xs text-slate-500">
          {isEdit
            ? 'ปรับยอด · บวก = เพิ่ม · ลบ = ลด · เว้นว่าง = คงเดิม'
            : 'พิมพ์จำนวนเงิน (ใส่ - ข้างหน้าเพื่อลดยอด)'}
        </p>

        <div className="flex items-center justify-between rounded-md bg-primary-light border border-blue-100 px-3 py-2 mt-2">
          <span className="text-sm text-slate-600">ยอดใหม่หลังบันทึก</span>
          <span className="flex items-baseline gap-2">
            {amountDelta !== null && amountDelta !== 0 && (
              <span
                className={`text-xs tabular-nums ${
                  amountDelta > 0 ? 'text-income' : 'text-expense'
                }`}
              >
                {amountDelta > 0 ? '+' : '−'}
                {formatNumber(Math.abs(amountDelta))}
              </span>
            )}
            <span
              className={`text-lg font-semibold tabular-nums ${
                newAmount < 0 ? 'text-expense' : 'text-slate-800'
              }`}
            >
              {formatTHB(newAmount)}
            </span>
          </span>
        </div>

        {touched.amount === true && errors.amount !== undefined && (
          <p id={`${amountId}-err`} className={errorClass}>
            {errors.amount}
          </p>
        )}
      </div>

      {/* วันที่จ่าย — defaults to today on a new row, editable. Clearing it is
          allowed (legacy rows have no date). */}
      <div>
        <label htmlFor={dateId} className={labelClass}>
          วันที่จ่าย
        </label>
        <input
          id={dateId}
          type="date"
          value={dateText}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setDateText(e.target.value)
          }
          className={inputBaseClass}
        />
        <p className="mt-1 text-xs text-slate-500">
          เว้นว่างได้ — ปล่อยว่างถ้าไม่อยากระบุวันที่
        </p>
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
            onClick={() => {
              submitSourceRef.current = 'click';
            }}
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
