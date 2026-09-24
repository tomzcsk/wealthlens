/**
 * WealthLens — "ตั้งยอด" (F54): พิมพ์ยอด *สะสม* ที่ควรจะเป็น แล้วแอปลงส่วนต่าง
 * จริงเป็นรายการ ฝาก/ถอน (`manual`) ในเดือนปัจจุบัน — เหมือน ฝาก/ถอน ปกติ
 * (เดิม ฿2,000 → ตั้ง ฿1,500 = "ถอนเงิน ฿500"). ไม่มีตัวเลือกเดือน: ลงเดือนนี้
 * เหมือน BankActionForm. พรีวิวใช้ `planSetTotal` ตัวเดียวกับ action จึงตรงกันเสมอ.
 */
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { BankAccount } from '@/types';
import { accountAllTimeTotal, planSetTotal } from '@/utils/bankAccounts';
import { formatNumber, formatTHB, formatThaiMonthYear } from '@/utils/formatters';

interface SetBankTotalFormProps {
  account: BankAccount;
  onSaved: () => void;
  onCancel: () => void;
}

/**
 * Sanitize a money input, preserving a leading minus (ยอดเป้าหมายติดลบได้ — F44)
 * and a decimal point being typed. "-1500.5" → "-1,500.5".
 */
const formatTargetInput = (raw: string): string => {
  const neg = raw.trimStart().startsWith('-');
  const digits = raw.replace(/[^\d.]/g, '');
  if (digits === '') return neg ? '-' : '';
  const [intPart, ...rest] = digits.split('.');
  const intFmt = intPart === '' ? '' : formatNumber(Number(intPart), { decimals: 0 });
  const body = rest.length > 0 ? `${intFmt}.${rest.join('')}` : intFmt;
  return neg ? `-${body}` : body;
};

export const SetBankTotalForm = ({
  account,
  onSaved,
  onCancel,
}: SetBankTotalFormProps): ReactNode => {
  const setBankTotal = useFinanceStore((s) => s.setBankTotal);
  const pushToast = useToastStore((s) => s.push);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const monthLabel = formatThaiMonthYear(curMonth, curYear);
  const current = accountAllTimeTotal(account);

  const [amountText, setAmountText] = useState('');

  const handleAmount = (e: ChangeEvent<HTMLInputElement>): void => {
    setAmountText(formatTargetInput(e.target.value));
  };

  const raw = amountText.replace(/,/g, '');
  const target = Number(raw);
  const hasTarget = raw !== '' && raw !== '-' && Number.isFinite(target);
  // พรีวิว = แผนจริงที่จะลง (null = ยอดเท่าเดิม). ปุ่มยืนยันเปิดเฉพาะตอนมีแผน.
  const plan = hasTarget ? planSetTotal(account, target) : null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!plan) return;
    setBankTotal(account.id, curYear, curMonth, target);
    const verb = plan.amount > 0 ? 'ฝาก' : 'ถอน';
    pushToast({
      message: `ตั้งยอด ${account.name} เป็น ${formatTHB(target)} (${verb} ${formatTHB(Math.abs(plan.amount))}) แล้ว`,
      tone: 'success',
    });
    onSaved();
  };

  const inputCls =
    'mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/30';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-ink-500">
        {account.name} · ตั้งยอดสะสม
        <span className="block text-xs text-ink-400">
          ยอดสะสมตอนนี้:{' '}
          <span className="financial-number tabular-nums">
            {formatTHB(current)}
          </span>
        </span>
      </div>

      <label className="block text-sm font-medium text-ink-700">
        ยอดที่ต้องการ (บาท)
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

      <div className="min-h-[2.5rem] rounded-md bg-raised px-3 py-2 text-sm">
        {!hasTarget ? (
          <span className="text-ink-400">พิมพ์ยอดที่อยากให้เป็น</span>
        ) : !plan ? (
          <span className="text-ink-500">ยอดเท่าเดิม ไม่มีอะไรเปลี่ยน</span>
        ) : (
          <span className={plan.amount > 0 ? 'text-income-700' : 'text-expense-700'}>
            จะบันทึกเป็น: {plan.amount > 0 ? '↓ ฝากเงิน' : '↑ ถอนเงิน'}{' '}
            <span className="financial-number tabular-nums font-semibold">
              {formatTHB(Math.abs(plan.amount))}
            </span>{' '}
            ({monthLabel})
          </span>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-hover"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={!plan}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-40"
        >
          ตั้งยอด
        </button>
      </div>
    </form>
  );
};

export default SetBankTotalForm;
