/**
 * WealthLens — deposit / withdraw / transfer for a bank account (F33).
 *
 * All three act on the CURRENT calendar month:
 *   ฝาก   → current-month balance += amount
 *   ถอน   → current-month balance −= amount
 *   โอน   → this account −= amount, destination += amount (atomic)
 */
import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { BankAccount } from '@/types';
import { formatNumber, formatTHB, formatThaiMonthYear } from '@/utils/formatters';

export type BankActionMode = 'deposit' | 'withdraw' | 'transfer';

interface BankActionFormProps {
  account: BankAccount;
  mode: BankActionMode;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Sanitize a money input while PRESERVING a decimal point the user is typing
 * (thousand-separate the integer part, keep the fractional part verbatim).
 * e.g. "1500.5" → "1,500.5", "1500." → "1,500."
 */
const formatAmountInput = (raw: string): string => {
  const digits = raw.replace(/[^\d.]/g, '');
  if (digits === '') return '';
  const [intPart, ...rest] = digits.split('.');
  const intFmt =
    intPart === '' ? '' : formatNumber(Number(intPart), { decimals: 0 });
  // Only the first dot counts; join any extra fractional chars after it.
  return rest.length > 0 ? `${intFmt}.${rest.join('')}` : intFmt;
};

const MODE_META: Record<
  BankActionMode,
  { title: string; verb: string; submitClass: string }
> = {
  deposit: {
    title: 'ฝากเงิน',
    verb: 'ฝาก',
    submitClass: 'bg-income hover:bg-emerald-700',
  },
  withdraw: {
    title: 'ถอนเงิน',
    verb: 'ถอน',
    submitClass: 'bg-expense hover:bg-red-700',
  },
  transfer: {
    title: 'โอนเงิน',
    verb: 'โอน',
    submitClass: 'bg-primary hover:bg-primary-dark',
  },
};

export const BankActionForm = ({
  account,
  mode,
  onSaved,
  onCancel,
}: BankActionFormProps): ReactNode => {
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);
  const setBankBalance = useFinanceStore((s) => s.setBankBalance);
  const transferBankBalance = useFinanceStore((s) => s.transferBankBalance);
  const pushToast = useToastStore((s) => s.push);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const monthLabel = formatThaiMonthYear(curMonth, curYear);
  const curBalance = account.balances[String(curYear)]?.[String(curMonth)] ?? 0;

  const others = accounts.filter((a) => a.id !== account.id);
  const [amountText, setAmountText] = useState('');
  const [toId, setToId] = useState<string>(others[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const meta = MODE_META[mode];

  const handleAmount = (e: ChangeEvent<HTMLInputElement>): void => {
    setAmountText(formatAmountInput(e.target.value));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const amount = Number(amountText.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('กรอกจำนวนเงินที่มากกว่า 0');
      return;
    }
    if (mode === 'transfer') {
      if (!toId) {
        setError('เลือกบัญชีปลายทาง');
        return;
      }
      const dest = others.find((a) => a.id === toId);
      transferBankBalance(account.id, toId, curYear, curMonth, amount);
      pushToast({
        message: `โอน ${formatTHB(amount)} → ${dest?.name ?? 'บัญชี'} แล้ว`,
        tone: 'success',
      });
    } else {
      const delta = mode === 'deposit' ? amount : -amount;
      setBankBalance(account.id, curYear, curMonth, curBalance + delta);
      pushToast({
        message: `${meta.verb} ${formatTHB(amount)} (${monthLabel}) แล้ว`,
        tone: 'success',
      });
    }
    onSaved();
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-slate-500">
        {account.name} · เดือน {monthLabel}
        <span className="block text-xs text-slate-400">
          ยอดเดือนนี้ตอนนี้:{' '}
          <span className="financial-number tabular-nums">
            {formatTHB(curBalance)}
          </span>
        </span>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        จำนวนเงิน (บาท)
        <input
          type="text"
          inputMode="decimal"
          value={amountText}
          onChange={handleAmount}
          placeholder="เช่น 5,000"
          autoFocus
          className={`${inputCls} text-right financial-number tabular-nums`}
        />
      </label>

      {mode === 'transfer' && (
        <label className="block text-sm font-medium text-slate-700">
          โอนไปบัญชี
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className={inputCls}
          >
            {others.length === 0 && <option value="">— ไม่มีบัญชีอื่น —</option>}
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

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
          disabled={mode === 'transfer' && others.length === 0}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 ${meta.submitClass}`}
        >
          {meta.title}
        </button>
      </div>
    </form>
  );
};

export default BankActionForm;
