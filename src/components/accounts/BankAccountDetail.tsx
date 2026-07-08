/**
 * WealthLens — Bank Accounts (F33) single-account detail.
 *
 * Mirrors LoanDetail.tsx's role in the master-detail pattern, but the
 * content is a 12-row month grid (mirroring KeptRow in SavingsList.tsx)
 * instead of a schedule/log — accounts don't have a schedule.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import { useFinanceStore } from '@/stores/financeStore';
import type { BankAccount } from '@/types';
import { accountAllTimeTotal, accountYearTotal } from '@/utils/bankAccounts';
import { THAI_MONTHS_LONG, formatTHB } from '@/utils/formatters';

import BankActionForm, { type BankActionMode } from './BankActionForm';
import BankAvatar from './BankAvatar';
import BankBalanceEditForm from './BankBalanceEditForm';

interface MonthRowProps {
  month: number;
  value: number | undefined;
  onEdit: () => void;
}

const MonthRow = ({ month, value, onEdit }: MonthRowProps): ReactNode => {
  const hasValue = value !== undefined;
  const isNegative = hasValue && value < 0;
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">
          {THAI_MONTHS_LONG[month - 1]}
        </p>
      </div>
      <span
        className={`text-sm financial-number tabular-nums ${
          !hasValue
            ? 'text-slate-400 italic'
            : isNegative
              ? 'text-red-700'
              : 'text-slate-900'
        }`}
      >
        {hasValue ? formatTHB(value) : '+ ใส่ยอด'}
      </span>
      <span
        aria-hidden="true"
        className="p-1 text-slate-400 group-hover:text-primary transition"
      >
        ✏️
      </span>
    </button>
  );
};

interface BankAccountDetailProps {
  account: BankAccount;
}

export const BankAccountDetail = ({
  account,
}: BankAccountDetailProps): ReactNode => {
  const year = useFinanceStore((s) => s.selectedYear);
  const hasOtherAccounts = useFinanceStore(
    (s) => (s.data.bankAccounts ?? []).length > 1,
  );
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [action, setAction] = useState<BankActionMode | null>(null);

  const yearTotal = useMemo(
    () => accountYearTotal(account, year),
    [account, year],
  );
  const allTimeTotal = useMemo(() => accountAllTimeTotal(account), [account]);

  const yearBucket = account.balances[String(year)];
  const currentForOpenMonth =
    openMonth !== null ? yearBucket?.[String(openMonth)] : undefined;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
          <BankAvatar account={account} />
          <span>{account.name}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span
            className={`text-3xl font-bold financial-number tabular-nums ${
              allTimeTotal < 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {formatTHB(allTimeTotal, { decimals: 0 })}
          </span>
          <span className="text-sm text-slate-500">
            ยอดสะสมทุกปี · ปี {year}{' '}
            <span
              className={`financial-number tabular-nums ${
                yearTotal < 0 ? 'text-red-600' : 'text-slate-600'
              }`}
            >
              {formatTHB(yearTotal, { decimals: 0 })}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-3">
          <button
            type="button"
            onClick={() => setAction('deposit')}
            className="rounded-lg bg-income px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            ↓ ฝาก
          </button>
          <button
            type="button"
            onClick={() => setAction('withdraw')}
            className="rounded-lg bg-expense px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            ↑ ถอน
          </button>
          <button
            type="button"
            onClick={() => setAction('transfer')}
            disabled={!hasOtherAccounts}
            title={hasOtherAccounts ? undefined : 'ต้องมีบัญชีอื่นอย่างน้อย 1 บัญชี'}
            className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-light transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ⇄ โอน
          </button>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="px-1 py-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <MonthRow
              key={month}
              month={month}
              value={yearBucket?.[String(month)]}
              onEdit={() => setOpenMonth(month)}
            />
          ))}
        </div>
      </section>

      <Modal
        open={openMonth != null}
        onClose={() => setOpenMonth(null)}
        title={
          openMonth != null
            ? `แก้ไขยอด — ${THAI_MONTHS_LONG[openMonth - 1]} ${year}`
            : undefined
        }
        size="sm"
      >
        {openMonth != null && (
          <div className="px-6 py-5">
            <BankBalanceEditForm
              accountId={account.id}
              year={year}
              month={openMonth}
              current={currentForOpenMonth}
              onSaved={() => setOpenMonth(null)}
              onCancel={() => setOpenMonth(null)}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={action != null}
        onClose={() => setAction(null)}
        title={
          action === 'deposit'
            ? 'ฝากเงิน'
            : action === 'withdraw'
              ? 'ถอนเงิน'
              : action === 'transfer'
                ? 'โอนเงิน'
                : undefined
        }
        size="sm"
      >
        {action != null && (
          <div className="px-6 py-5">
            <BankActionForm
              account={account}
              mode={action}
              onSaved={() => setAction(null)}
              onCancel={() => setAction(null)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BankAccountDetail;
