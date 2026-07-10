/**
 * WealthLens — Bank Accounts (F33) delta-based balance editor.
 *
 * Mirrors `KeptEditForm` in SavingsList.tsx: instead of asking for a new
 * monthly *total*, this takes a single delta (+เข้า / −ออก) and folds it
 * into the running balance, previewing the result live before save.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import {
  THAI_MONTHS_LONG,
  formatNumber,
  formatTHBAuto,
} from '@/utils/formatters';

export interface BankBalanceEditFormProps {
  accountId: string;
  year: number;
  month: number;
  /** Current persisted value, or `undefined` if no entry yet for this month. */
  current: number | undefined;
  onSaved: () => void;
  onCancel: () => void;
}

export const BankBalanceEditForm = ({
  accountId,
  year,
  month,
  current,
  onSaved,
  onCancel,
}: BankBalanceEditFormProps): ReactNode => {
  const setBankBalance = useFinanceStore((s) => s.setBankBalance);
  const clearBankBalance = useFinanceStore((s) => s.clearBankBalance);
  const pushToast = useToastStore((s) => s.push);

  const inputRef = useRef<HTMLInputElement | null>(null);
  // The field holds a delta to apply, never the stored total — it always
  // starts empty regardless of whether the month already has a value.
  const [text, setText] = useState<string>('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const base = current ?? 0;

  const delta = useMemo<number | null>(() => {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '-') return null;
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }, [text]);

  const canSubmit = delta !== null && delta !== 0;
  const hasValue = current !== undefined;
  const monthLabel = THAI_MONTHS_LONG[month - 1];
  const newTotal = base + (delta ?? 0);

  const handleChange = (raw: string): void => {
    const cleaned = raw.replace(/[^\d.,-]/g, '');
    const trimmed = cleaned.trim();
    if (trimmed === '' || trimmed === '-') {
      setText(trimmed);
      return;
    }
    const negative = trimmed.startsWith('-');
    const digits = trimmed.replace(/[^\d.]/g, '');
    if (digits === '') {
      setText(negative ? '-' : '');
      return;
    }
    const [intPart, decPart] = digits.split('.');
    const intNum = Number(intPart);
    const intFormatted = Number.isFinite(intNum) ? formatNumber(intNum) : '';
    const display =
      decPart !== undefined
        ? `${negative ? '-' : ''}${intFormatted}.${decPart}`
        : `${negative ? '-' : ''}${intFormatted}`;
    setText(display);
  };

  const handleSubmit = (e?: FormEvent): void => {
    if (e) e.preventDefault();
    if (!canSubmit) return;
    setBankBalance(accountId, year, month, newTotal);
    pushToast({ message: `บันทึกยอด ${monthLabel} แล้ว`, tone: 'success' });
    onSaved();
  };

  const handleClear = (): void => {
    clearBankBalance(accountId, year, month);
    pushToast({ message: `ล้างยอด ${monthLabel} แล้ว`, tone: 'info' });
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="bank-balance-delta-input"
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          ยอดบัญชี — {monthLabel} {year}
        </label>

        <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-3 py-2 mb-3">
          <span className="text-sm text-slate-600">ยอดปัจจุบันเดือนนี้</span>
          <span className="text-base font-medium tabular-nums text-slate-800">
            {formatTHBAuto(base)}
          </span>
        </div>

        <input
          id="bank-balance-delta-input"
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="เช่น +5,000 หรือ -3,000"
          className="w-full px-3 py-2 text-base tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          เพิ่ม/ถอน · บวก = ฝากเข้า · ลบ = ถอนออก
        </p>

        <div className="flex items-center justify-between rounded-md bg-primary-light border border-blue-100 px-3 py-2 mt-3">
          <span className="text-sm text-slate-600">ยอดใหม่หลังบันทึก</span>
          <span
            className={`text-lg font-semibold tabular-nums ${
              delta === null || delta === 0
                ? 'text-slate-800'
                : delta > 0
                  ? 'text-income'
                  : 'text-expense'
            }`}
          >
            {formatTHBAuto(newTotal)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-sm font-medium text-expense bg-white border border-red-200 rounded-md hover:bg-red-50 transition"
            >
              🗑️ ล้างยอดเดือนนี้
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            บันทึก
          </button>
        </div>
      </div>
    </form>
  );
};

export default BankBalanceEditForm;
