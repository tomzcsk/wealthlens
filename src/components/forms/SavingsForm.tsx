/**
 * WealthLens — Savings entry form.
 *
 * Sister-component to ExpenseForm: one-item-at-a-time editor for a
 * `SavingsItem` row. Same UX patterns (quick-add, validation, keyboard
 * shortcuts) so Tom doesn't have to learn a new interaction model.
 *
 * Quick-add: Enter saves and resets `name` + `amount` while keeping the
 * category pre-selected — same flash-then-refocus pattern as ExpenseForm.
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
  SAVINGS_CATEGORIES,
  SAVINGS_CATEGORY_ORDER,
} from '@/types/savings-categories';
import type { SavingsCategory, SavingsItem } from '@/types';
import { formatNumber } from '@/utils/formatters';

export interface SavingsFormProps {
  year: number;
  /** Calendar month, 1-12. */
  month: number;
  /** Provide an existing item to enter "edit" mode. */
  initialValues?: SavingsItem | null;
  /** Pre-select a category (used by per-category "+ Add" buttons). */
  defaultCategory?: SavingsCategory;
  /** Fired after a successful save with the resulting item. */
  onSaved?: (item: SavingsItem) => void;
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

const parseAmount = (input: string): number => {
  if (input.trim() === '') return 0;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
};

const displayAmount = (raw: string): string => {
  if (raw === '' || raw === '-') return raw;
  const endsWithDot = raw.endsWith('.');
  const numeric = parseAmount(raw);
  if (numeric === 0 && raw.replace(/[^0-9]/g, '') === '') return raw;
  const [, decimalPart] = raw.split('.');
  if (decimalPart !== undefined) {
    return `${formatNumber(Math.trunc(numeric))}.${decimalPart}`;
  }
  return formatNumber(numeric) + (endsWithDot ? '.' : '');
};

const validate = (values: { name: string; amount: number }): FormErrors => {
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

export const SavingsForm = ({
  year,
  month,
  initialValues,
  defaultCategory,
  onSaved,
  onCancel,
}: SavingsFormProps): ReactNode => {
  const addSavings = useFinanceStore((s) => s.addSavings);
  const updateSavings = useFinanceStore((s) => s.updateSavings);

  const isEdit = initialValues != null;

  const [category, setCategory] = useState<SavingsCategory>(
    initialValues?.category ?? defaultCategory ?? 'investment-dime',
  );
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [amountInput, setAmountInput] = useState<string>(
    initialValues != null ? formatNumber(initialValues.amount) : '',
  );
  const [isRecurring, setIsRecurring] = useState<boolean>(
    initialValues?.isRecurring ?? false,
  );
  const [touched, setTouched] = useState<FormTouched>({});
  const [showFlash, setShowFlash] = useState(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const categoryId = useId();
  const nameId = useId();
  const amountId = useId();
  const recurringId = useId();

  useEffect(() => {
    nameInputRef.current?.focus();
    if (initialValues != null) {
      nameInputRef.current?.setSelectionRange(
        initialValues.name.length,
        initialValues.name.length,
      );
    }
  }, [initialValues]);

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

  const persist = (continueAdding: boolean): void => {
    setTouched({ name: true, amount: true });
    if (!isValid) return;

    const trimmedName = name.trim();
    if (isEdit && initialValues != null) {
      updateSavings(year, month, initialValues.id, {
        category,
        name: trimmedName,
        amount,
        isRecurring,
      });
      onSaved?.({
        ...initialValues,
        category,
        name: trimmedName,
        amount,
        isRecurring,
      });
      return;
    }

    addSavings(year, month, {
      category,
      name: trimmedName,
      amount,
      isRecurring,
    });

    onSaved?.({
      id: '',
      category,
      name: trimmedName,
      amount,
      isRecurring,
    });

    if (continueAdding) {
      setName('');
      setAmountInput('');
      setIsRecurring(false);
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
    persist(!isEdit);
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel?.();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      persist(!isEdit);
    }
  };

  const inputBaseClass =
    'w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const errorClass = 'mt-1 text-xs text-expense';

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className="space-y-4"
      aria-label={isEdit ? 'แก้ไขรายการออม' : 'เพิ่มรายการออม'}
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
            setCategory(e.target.value as SavingsCategory)
          }
          className={inputBaseClass}
        >
          {SAVINGS_CATEGORY_ORDER.map((cat) => {
            const meta = SAVINGS_CATEGORIES[cat];
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
          placeholder="เช่น ลงทุน Dime, ออมเที่ยว"
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
        <label
          htmlFor={recurringId}
          className="text-sm text-slate-700 select-none"
        >
          รายการประจำเดือน
        </label>
      </div>

      <div className="flex items-center justify-between pt-2">
        <span
          className={`text-xs text-income transition-opacity duration-200 ${showFlash ? 'opacity-100' : 'opacity-0'}`}
          aria-live="polite"
        >
          {showFlash ? 'เพิ่มแล้ว ✓' : ' '}
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

export default SavingsForm;
