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
import type { BankAccount, BankTransaction } from '@/types';
import { accountAllTimeTotal, accountYearTotal } from '@/utils/bankAccounts';
import { THAI_MONTHS_LONG, formatTHB } from '@/utils/formatters';

import BankActionForm, { type BankActionMode } from './BankActionForm';
import BankAvatar from './BankAvatar';
import BankBalanceEditForm from './BankBalanceEditForm';
import MonthTransactionList from './MonthTransactionList';

interface MonthRowProps {
  month: number;
  value: number | undefined;
  txCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
}

const MonthRow = ({
  month,
  value,
  txCount,
  isOpen,
  onToggle,
  onEdit,
}: MonthRowProps): ReactNode => {
  const hasValue = value !== undefined;
  const isNegative = hasValue && value < 0;
  return (
    <div className="group flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-slate-50">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span aria-hidden="true" className="text-xs text-slate-300">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="truncate text-sm text-slate-900">
          {THAI_MONTHS_LONG[month - 1]}
        </span>
        {txCount > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {txCount} รายการ
          </span>
        )}
      </button>
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
      <button
        type="button"
        onClick={onEdit}
        aria-label="แก้ไขยอด"
        className="p-1 text-slate-400 transition hover:text-primary"
      >
        ✏️
      </button>
    </div>
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
  const allTransactions = useFinanceStore((s) => s.data.bankTransactions ?? []);
  const deleteBankTransaction = useFinanceStore((s) => s.deleteBankTransaction);
  // `openMonth` = แถวเดือนที่กางดูรายการอยู่ (accordion);
  // `editMonth` = แถวเดือนที่เปิด modal แก้ยอด. แยกกันเพื่อให้กางดูโดยไม่เด้ง modal.
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const [editMonth, setEditMonth] = useState<number | null>(null);
  const [action, setAction] = useState<BankActionMode | null>(null);

  const yearTotal = useMemo(
    () => accountYearTotal(account, year),
    [account, year],
  );
  const allTimeTotal = useMemo(() => accountAllTimeTotal(account), [account]);

  // จัดรายการของบัญชีนี้/ปีนี้เข้าถังตามเดือน (map month → tx[]) ครั้งเดียว.
  const txByMonth = useMemo(() => {
    const map = new Map<number, BankTransaction[]>();
    for (const tx of allTransactions) {
      if (tx.accountId !== account.id || tx.year !== year) continue;
      const bucket = map.get(tx.month);
      if (bucket) bucket.push(tx);
      else map.set(tx.month, [tx]);
    }
    return map;
  }, [allTransactions, account.id, year]);

  const yearBucket = account.balances[String(year)];
  const currentForEditMonth =
    editMonth !== null ? yearBucket?.[String(editMonth)] : undefined;

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
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const monthTx = txByMonth.get(month) ?? [];
            const isOpen = openMonth === month;
            return (
              <div key={month}>
                <MonthRow
                  month={month}
                  value={yearBucket?.[String(month)]}
                  txCount={monthTx.length}
                  isOpen={isOpen}
                  onToggle={() => setOpenMonth(isOpen ? null : month)}
                  onEdit={() => setEditMonth(month)}
                />
                {isOpen && (
                  <div className="px-3 pb-3 pt-1">
                    <MonthTransactionList
                      transactions={monthTx}
                      monthTotal={yearBucket?.[String(month)] ?? 0}
                      onDelete={deleteBankTransaction}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <Modal
        open={editMonth != null}
        onClose={() => setEditMonth(null)}
        title={
          editMonth != null
            ? `แก้ไขยอด — ${THAI_MONTHS_LONG[editMonth - 1]} ${year}`
            : undefined
        }
        size="sm"
      >
        {editMonth != null && (
          <div className="px-6 py-5">
            <BankBalanceEditForm
              accountId={account.id}
              year={year}
              month={editMonth}
              current={currentForEditMonth}
              onSaved={() => setEditMonth(null)}
              onCancel={() => setEditMonth(null)}
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
