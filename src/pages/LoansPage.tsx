/**
 * WealthLens — Loans / หนี้สิน manager (F26).
 *
 * One screen showing every long-running debt at a glance:
 *   - Hero card: ยอดคงเหลือ, ปีที่เหลือ, progress bar
 *   - This-year card: งวดปัจจุบัน + จ่ายไป % ของยอดงวดนี้
 *   - Schedule table (lender amortization, current row highlighted)
 *   - Payment log (auto-pulled gsl + manual lump sums)
 *
 * Multi-loan ready by construction — the page selects the first loan
 * for v1 (Tom only has กยศ), but the structure already maps over the
 * `loans[]` array so adding a mortgage row in the future is trivial.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import ExtraPaymentForm from '@/components/loans/ExtraPaymentForm';
import LoanScheduleTable from '@/components/loans/LoanScheduleTable';
import PaymentLogTable from '@/components/loans/PaymentLogTable';
import { gslLoan } from '@/data/seedData';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import type { Loan } from '@/types';
import {
  getLoanSummary,
  type LoanSummary,
} from '@/utils/loanCalculations';
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
}

const LoanHero = ({ loan, summary, onAddExtra }: LoanCardsProps): ReactNode => {
  const { remaining, totalPaid, scheduleTotal, progressFraction, yearsRemaining, endYear } = summary;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            {loan.name}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-bold financial-number tabular-nums text-slate-900">
              {formatTHB(remaining, { decimals: 2 })}
            </span>
            <span className="text-sm text-slate-500">เหลือต้องชำระ</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {yearsRemaining > 0
              ? `อีก ${yearsRemaining} ปี`
              : 'ครบกำหนดสุดท้ายแล้ว'}
            {endYear != null && (
              <span className="text-slate-400"> · จบ ก.ค. {endYear}</span>
            )}
          </div>
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const LoansPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const deleteExtraPayment = useFinanceStore((s) => s.deleteExtraPayment);
  const seedLoan = useFinanceStore((s) => s.seedLoan);
  const pushToast = useToastStore((s) => s.push);

  const loans = data.loans ?? [];
  const loan = loans[0] ?? null;
  const summary = useMemo(
    () => (loan ? getLoanSummary(loan, data) : null),
    [loan, data],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [pendingDeleteExtra, setPendingDeleteExtra] = useState<string | null>(null);

  if (!loan || !summary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💰 หนี้สิน</h1>
            <p className="text-sm text-slate-500 mt-1">
              ตารางผ่อน + ประวัติชำระ ของหนี้ระยะยาว
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center space-y-3">
          <p className="text-sm text-slate-500">ยังไม่มีข้อมูลหนี้</p>
          <button
            type="button"
            onClick={() => {
              seedLoan(gslLoan);
              pushToast({
                message: 'โหลด กยศ ตัวอย่างแล้ว',
                tone: 'success',
              });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition"
          >
            โหลด กยศ ตัวอย่าง
          </button>
          <p className="text-xs text-slate-400 mt-2">
            ตารางผ่อน 15 งวด + ประวัติโปะ ของ Tom — เพิ่มเข้าระบบโดยไม่ทับข้อมูลอื่น
          </p>
        </div>
      </div>
    );
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">💰 หนี้สิน</h1>
          <p className="text-sm text-slate-500 mt-1">
            ตารางผ่อน + ประวัติชำระ — auto-link เข้า กยศ ในรายได้รายเดือน
          </p>
        </div>
      </div>

      <LoanHero
        loan={loan}
        summary={summary}
        onAddExtra={() => setAddOpen(true)}
      />

      <ThisYearCard summary={summary} />

      <LoanScheduleTable loan={loan} />

      <PaymentLogTable
        loan={loan}
        data={data}
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

export default LoansPage;
