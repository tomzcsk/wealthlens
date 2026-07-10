/**
 * WealthLens — one loan's full detail (hero + this-year + schedule + log).
 * Extracted from LoansPage (F31) so the page can orchestrate a list of loans
 * while this component owns rendering a single loan and its payment modals.
 * Logic is unchanged from the original single-loan page.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { AnimatedNumber } from '@/components/motion';
import { Modal } from '@/components/ui/Modal';
import ExtraPaymentForm from '@/components/loans/ExtraPaymentForm';
import LoanScheduleTable from '@/components/loans/LoanScheduleTable';
import PaymentLogTable from '@/components/loans/PaymentLogTable';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { Loan } from '@/types';
import { getLoanSummary, type LoanSummary } from '@/utils/loanCalculations';
import { countLinkedExpenses } from '@/utils/loanPayments';
import {
  formatNumber,
  formatPercent,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';

interface LoanCardsProps {
  loan: Loan;
  summary: LoanSummary;
  onAddExtra: () => void;
  /** How many expenses point at this loan (F37) — 0 hides the origin note. */
  linkedCount: number;
}

const LoanHero = ({
  loan,
  summary,
  onAddExtra,
  linkedCount,
}: LoanCardsProps): ReactNode => {
  const {
    remaining,
    principalRemaining,
    totalPaid,
    scheduleTotal,
    progressFraction,
    yearsRemaining,
  } = summary;

  // Derive the "จบ" label from the final installment's real due date so it
  // reads correctly for any loan (a mortgage ending ธ.ค. — not just กยศ's ก.ค.).
  const lastDue = loan.schedule[loan.schedule.length - 1]?.dueDate;
  const endDate = lastDue ? new Date(`${lastDue}T00:00:00`) : null;
  const endLabel =
    endDate && Number.isFinite(endDate.getTime())
      ? formatThaiMonthYear(endDate.getMonth() + 1, endDate.getFullYear())
      : null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            {loan.name}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold financial-number tabular-nums text-slate-900">
              <AnimatedNumber
                value={remaining}
                format={(v) => formatTHB(v, { decimals: 2 })}
              />
            </span>
            <span className="text-sm text-slate-500">เหลือต้องชำระ</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {yearsRemaining > 0
              ? `อีก ${yearsRemaining} ปี`
              : 'ครบกำหนดสุดท้ายแล้ว'}
            {endLabel != null && (
              <span className="text-slate-400"> · จบ {endLabel}</span>
            )}
          </div>
          {Math.round(principalRemaining) !== Math.round(remaining) && (
            <div className="mt-1 text-sm text-slate-500">
              เงินต้นคงเหลือ{' '}
              <span className="financial-number tabular-nums text-slate-700">
                {formatTHB(principalRemaining, { decimals: 2 })}
              </span>
            </div>
          )}
          {linkedCount > 0 && (
            <div className="mt-1 text-xs text-slate-400">
              ยอดคำนวณจากรายจ่ายที่ผูกไว้ {linkedCount} รายการ
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onAddExtra}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition"
        >
          + เพิ่มโปะ
        </button>
      </div>

      <div className="space-y-2">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={Math.round(progressFraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`ความคืบหน้าการชำระ ${loan.name}`}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tabular-nums text-emerald-700">
            {formatPercent(progressFraction)}
          </span>
          <span className="text-slate-500">
            จ่ายไปแล้ว{' '}
            <span className="financial-number tabular-nums text-slate-700">
              {formatTHB(totalPaid, { decimals: 2 })}
            </span>{' '}
            /{' '}
            <span className="financial-number tabular-nums">
              {formatTHB(scheduleTotal, { decimals: 2 })}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
};

const ThisYearCard = ({ summary }: { summary: LoanSummary }): ReactNode => {
  const { installment, calendarYear, paidThisYear, dueThisYear, fraction } = summary.thisYear;
  if (!installment || calendarYear == null) {
    return null;
  }

  const remaining = Math.max(0, dueThisYear - paidThisYear);
  const dueDate = new Date(`${installment.dueDate}T00:00:00`);
  const dueLabel = Number.isFinite(dueDate.getTime())
    ? formatThaiMonthYear(dueDate.getMonth() + 1, dueDate.getFullYear())
    : installment.dueDate;

  return (
    <section className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            งวดที่ {installment.installmentNumber}
          </h2>
          <span className="text-xs text-slate-400">
            ครบกำหนด {dueLabel}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          ต้น{' '}
          <span className="financial-number tabular-nums text-slate-600">
            {formatNumber(installment.principalAmount, { decimals: 2 })}
          </span>{' '}
          · ดอก{' '}
          <span className="financial-number tabular-nums text-slate-600">
            {formatNumber(installment.interestAmount, { decimals: 2 })}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-slate-500">ต้องจ่าย</div>
          <div className="financial-number text-lg font-bold tabular-nums text-slate-900">
            {formatTHB(dueThisYear, { decimals: 2 })}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">จ่ายไปแล้ว</div>
          <div className="financial-number text-lg font-bold tabular-nums text-emerald-700">
            {formatTHB(paidThisYear, { decimals: 2 })}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">เหลืออีก</div>
          <div className="financial-number text-lg font-bold tabular-nums text-slate-900">
            {formatTHB(remaining, { decimals: 2 })}
          </div>
        </div>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="ความคืบหน้าการชำระงวดนี้"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <div className="text-xs">
        <span className="font-semibold tabular-nums text-emerald-700">
          {formatPercent(fraction)}
        </span>
        <span className="text-slate-400"> ของงวดนี้</span>
      </div>
    </section>
  );
};

interface LoanDetailProps {
  loan: Loan;
}

export const LoanDetail = ({ loan }: LoanDetailProps): ReactNode => {
  const deleteExtraPayment = useFinanceStore((s) => s.deleteExtraPayment);
  const pushToast = useToastStore((s) => s.push);

  const years = useFinanceStore((s) => s.data.years);
  const linkedCount = useMemo(
    () => countLinkedExpenses(loan, years),
    [loan, years],
  );

  const summary = useMemo(() => getLoanSummary(loan), [loan]);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDeleteExtra, setPendingDeleteExtra] = useState<string | null>(null);

  const handleDeleteExtra = (revert: boolean): void => {
    if (!pendingDeleteExtra) return;
    deleteExtraPayment(loan.id, pendingDeleteExtra, {
      revertExpenseSideEffect: revert,
    });
    setPendingDeleteExtra(null);
    pushToast({
      message: revert
        ? 'ลบโปะ + revert ค่าใช้จ่ายเดือนนั้นแล้ว'
        : 'ลบโปะแล้ว (เก็บค่าใช้จ่ายเดือนนั้นไว้)',
      tone: 'info',
    });
  };

  const pendingExtra = pendingDeleteExtra
    ? loan.extraPayments.find((e) => e.id === pendingDeleteExtra) ?? null
    : null;

  return (
    <div className="space-y-6">
      <LoanHero
        loan={loan}
        summary={summary}
        onAddExtra={() => setAddOpen(true)}
        linkedCount={linkedCount}
      />

      <ThisYearCard summary={summary} />

      <LoanScheduleTable loan={loan} />

      <PaymentLogTable
        loan={loan}
        onDeleteExtra={(id) => setPendingDeleteExtra(id)}
      />

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`เพิ่มโปะ — ${loan.name}`}
        size="md"
      >
        <div className="px-6 py-5">
          <ExtraPaymentForm
            loanId={loan.id}
            onSaved={() => setAddOpen(false)}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={pendingDeleteExtra != null}
        onClose={() => setPendingDeleteExtra(null)}
        title="ลบโปะนี้"
        size="sm"
      >
        {pendingExtra && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              <span className="font-semibold financial-number tabular-nums">
                {formatTHB(pendingExtra.amount, { decimals: 2 })}
              </span>{' '}
              · {pendingExtra.date}
              {pendingExtra.reference && (
                <span className="block mt-1 text-xs tabular-nums text-slate-400">
                  ref {pendingExtra.reference}
                </span>
              )}
            </p>
            <div className="flex flex-col gap-2">
              {pendingExtra.createExpenseEntry &&
                pendingExtra.linkedExpenseItemId && (
                  <button
                    type="button"
                    onClick={() => handleDeleteExtra(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 text-left transition"
                  >
                    <span className="block">ลบโปะอย่างเดียว</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      เก็บค่าใช้จ่ายเดือนนั้นไว้
                    </span>
                  </button>
                )}
              <button
                type="button"
                onClick={() => handleDeleteExtra(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-red-700 text-left transition"
              >
                <span className="block">
                  {pendingExtra.linkedExpenseItemId
                    ? 'ลบโปะ + revert ค่าใช้จ่าย'
                    : 'ลบโปะนี้'}
                </span>
                {pendingExtra.linkedExpenseItemId && (
                  <span className="block text-xs text-red-100 mt-0.5">
                    ลบรายการค่าใช้จ่ายของเดือนชำระด้วย
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteExtra(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LoanDetail;
