/**
 * WealthLens — Bank Accounts (F33) summary card with inline quick actions.
 *
 * A brand-accented card in the BankAccountsPage grid. The content area is
 * clickable (opens the full detail); a ฝาก / ถอน / โอน action row sits at
 * the bottom for one-tap transactions on the current month — no need to
 * open the detail first. No goal/progress — accounts don't have one.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import type { BankAccount } from '@/types';
import { resolveBank } from '@/data/thaiBanks';
import { useFinanceStore } from '@/stores/financeStore';
import { accountAllTimeTotal, accountYearTotal } from '@/utils/bankAccounts';
import { formatTHB } from '@/utils/formatters';

import BankActionForm, { type BankActionMode } from './BankActionForm';
import BankAvatar from './BankAvatar';

interface BankAccountCardProps {
  account: BankAccount;
  year: number;
  onOpen: () => void;
}

export const BankAccountCard = ({
  account,
  year,
  onOpen,
}: BankAccountCardProps): ReactNode => {
  const hasOtherAccounts = useFinanceStore(
    (s) => (s.data.bankAccounts ?? []).length > 1,
  );
  const [action, setAction] = useState<BankActionMode | null>(null);

  const yearTotal = useMemo(
    () => accountYearTotal(account, year),
    [account, year],
  );
  const headline = useMemo(
    () => accountAllTimeTotal(account),
    [account],
  );

  const accent = resolveBank(account)?.color ?? '#cbd5e1';
  const isNegative = headline < 0;

  return (
    <div
      style={{ borderLeftColor: accent }}
      className="bg-white rounded-2xl border border-slate-200 border-l-4 shadow-sm p-5 space-y-3 hover:shadow-md transition"
    >
      <button
        type="button"
        onClick={onOpen}
        className="text-left w-full space-y-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <BankAvatar account={account} size="md" />
          <div className="font-semibold text-slate-900 truncate">
            {account.name}
          </div>
        </div>

        <div>
          <div
            className={`text-2xl font-bold financial-number tabular-nums ${
              isNegative ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {formatTHB(headline, { decimals: 0 })}
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">ยอดสะสมทุกปี</span>
            <span className="text-slate-400 financial-number tabular-nums">
              ปี {year} {formatTHB(yearTotal, { decimals: 0 })}
            </span>
          </div>
        </div>
      </button>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setAction('deposit')}
          className="flex-1 rounded-lg border border-emerald-200 text-income py-1.5 text-xs font-semibold hover:bg-emerald-50 transition"
        >
          ↓ ฝาก
        </button>
        <button
          type="button"
          onClick={() => setAction('withdraw')}
          className="flex-1 rounded-lg border border-red-200 text-expense py-1.5 text-xs font-semibold hover:bg-red-50 transition"
        >
          ↑ ถอน
        </button>
        <button
          type="button"
          onClick={() => setAction('transfer')}
          disabled={!hasOtherAccounts}
          title={hasOtherAccounts ? undefined : 'ต้องมีบัญชีอื่นอย่างน้อย 1 บัญชี'}
          className="flex-1 rounded-lg border border-primary/30 text-primary py-1.5 text-xs font-semibold hover:bg-primary-light transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ⇄ โอน
        </button>
      </div>

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

export default BankAccountCard;
