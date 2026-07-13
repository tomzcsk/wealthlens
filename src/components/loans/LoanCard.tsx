/**
 * WealthLens — compact loan summary card (F31 master-detail).
 *
 * Shown in the LoansPage list when there are 2+ loans: name, type, remaining
 * balance, progress, and end date at a glance. Clicking opens the full
 * <LoanDetail>. Read-only — all derived values come from getLoanSummary.
 */
import { useMemo, type ReactNode } from 'react';

import type { Loan, LoanType } from '@/types';
import { getLoanSummary } from '@/utils/loanCalculations';
import {
  formatPercent,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';

const TYPE_LABEL: Record<LoanType, string> = {
  gsl: 'กยศ',
  mortgage: 'สินเชื่อบ้าน',
  auto: 'รถยนต์',
  other: 'อื่นๆ',
};

interface LoanCardProps {
  loan: Loan;
  onOpen: () => void;
}

export const LoanCard = ({ loan, onOpen }: LoanCardProps): ReactNode => {
  const summary = useMemo(() => getLoanSummary(loan), [loan]);
  const { remaining, progressFraction, yearsRemaining, totalPaid, scheduleTotal } =
    summary;

  const lastDue = loan.schedule[loan.schedule.length - 1]?.dueDate;
  const endDate = lastDue ? new Date(`${lastDue}T00:00:00`) : null;
  const endLabel =
    endDate && Number.isFinite(endDate.getTime())
      ? formatThaiMonthYear(endDate.getMonth() + 1, endDate.getFullYear())
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full bg-card rounded-2xl border border-ink-200 shadow-sm p-5 space-y-3 hover:border-primary-ink hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink-900">{loan.name}</div>
        <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-xs text-ink-500">
          {TYPE_LABEL[loan.type]}
        </span>
      </div>

      <div>
        <div className="text-2xl font-bold financial-number tabular-nums text-ink-900">
          {formatTHB(remaining, { decimals: 0 })}
        </div>
        <div className="text-xs text-ink-500">
          เหลือต้องชำระ
          {yearsRemaining > 0 ? ` · อีก ${yearsRemaining} ปี` : ''}
          {endLabel ? ` · จบ ${endLabel}` : ''}
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-income-fill transition-all duration-500"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums text-income-700">
            {formatPercent(progressFraction)}
          </span>
          <span className="text-ink-400 financial-number tabular-nums">
            {formatTHB(totalPaid, { decimals: 0 })} /{' '}
            {formatTHB(scheduleTotal, { decimals: 0 })}
          </span>
        </div>
      </div>
    </button>
  );
};

export default LoanCard;
