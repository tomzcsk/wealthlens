/**
 * WealthLens — form for logging a lump-sum loan payment ("โปะ").
 *
 * Mirrors the field set in the กยศ portal payment receipt (date, amount,
 * reference) and exposes a single dual-write toggle: when checked, the
 * store mirrors the payment as an ExpenseItem in the matching month so
 * the cashflow ledger reflects the outflow. Defaults to on for fresh
 * entries — these are real-money events that belong in the budget.
 */

import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import { formatNumber, formatTHB } from '@/utils/formatters';

interface ExtraPaymentFormProps {
  loanId: string;
  onSaved: () => void;
  onCancel: () => void;
}

const todayIso = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Strip commas / non-digits for numeric inputs. */
const toDigits = (s: string): string => s.replace(/[^\d.]/g, '');

export const ExtraPaymentForm = ({
  loanId,
  onSaved,
  onCancel,
}: ExtraPaymentFormProps): ReactNode => {
  const addExtraPayment = useFinanceStore((s) => s.addExtraPayment);
  const pushToast = useToastStore((s) => s.push);

  const [date, setDate] = useState<string>(todayIso());
  const [amountText, setAmountText] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [createExpenseEntry, setCreateExpenseEntry] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const cleaned = toDigits(e.target.value);
    if (cleaned === '') {
      setAmountText('');
      return;
    }
    // Preserve trailing decimal during typing ("1234." should not auto-format).
    if (cleaned.endsWith('.')) {
      setAmountText(cleaned);
      return;
    }
    const numeric = Number(cleaned);
    setAmountText(Number.isFinite(numeric) ? formatNumber(numeric, { decimals: 0 }) : cleaned);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const amount = Number(amountText.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('กรอกจำนวนเงินที่มากกว่า 0');
      return;
    }
    if (!date) {
      setError('เลือกวันที่ชำระ');
      return;
    }
    addExtraPayment(loanId, {
      date,
      amount,
      createExpenseEntry,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    pushToast({
      message: `บันทึกโปะ ${formatTHB(amount)} แล้ว`,
      tone: 'success',
    });
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          วันที่ชำระ
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          จำนวนเงิน (บาท)
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={handleAmountChange}
            placeholder="เช่น 10,000"
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base financial-number tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          เลขอ้างอิงรายการ
          <span className="text-xs text-slate-400 font-normal"> (ถ้ามี)</span>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="เช่น 68062600000000073388"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          หมายเหตุ
          <span className="text-xs text-slate-400 font-normal"> (ถ้ามี)</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="เช่น โปะกลางปี"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer hover:bg-slate-100 transition">
        <input
          type="checkbox"
          checked={createExpenseEntry}
          onChange={(e) => setCreateExpenseEntry(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-400 text-primary focus:ring-primary"
        />
        <span className="text-sm text-slate-700">
          สร้างรายการค่าใช้จ่ายในเดือนที่ชำระด้วย
          <span className="block text-xs text-slate-500 mt-0.5">
            หมวด &quot;การเงิน&quot; — เห็นเงินไหลออกใน Overview เดือนนั้น
          </span>
        </span>
      </label>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          บันทึก
        </button>
      </div>
    </form>
  );
};

export default ExtraPaymentForm;
