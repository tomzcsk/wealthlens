/**
 * WealthLens — LoanSummaryCard for the Overview Dashboard.
 *
 * Snapshot of the primary loan (today: กยศ): % paid, remaining balance,
 * years left. Clicking the card jumps to the full Loans page where the
 * schedule + payment log live. Hidden entirely when no loans exist so
 * the Overview doesn't render a placeholder for users without debt.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useResolvedLoans } from '@/hooks/useFinanceData';
import { getLoanSummary } from '@/utils/loanCalculations';
import { formatPercent, formatTHB } from '@/utils/formatters';

export const LoanSummaryCard = (): ReactNode => {
  const loans = useResolvedLoans();
  const loan = loans[0] ?? null;
  if (!loan) return null;

  const summary = getLoanSummary(loan);

  return (
    <Link
      to="/loans"
      className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-primary hover:shadow-md transition"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-base"
          >
            💰
          </span>
          <h3 className="text-base font-semibold text-slate-900">
            หนี้ {loan.name}
          </h3>
        </div>
        <span className="text-xs text-slate-400">→</span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs text-slate-500">เหลือต้องชำระ</div>
          <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
            {formatTHB(summary.remaining, { decimals: 2 })}
          </div>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={Math.round(summary.progressFraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`ความคืบหน้าการชำระ ${loan.name}`}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${summary.progressFraction * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums text-emerald-700">
            {formatPercent(summary.progressFraction)} ชำระแล้ว
          </span>
          <span className="text-slate-500">
            {summary.yearsRemaining > 0
              ? `อีก ${summary.yearsRemaining} ปี`
              : 'ครบกำหนดสุดท้ายแล้ว'}
          </span>
        </div>
      </div>
    </Link>
  );
};

export default LoanSummaryCard;
