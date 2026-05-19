/**
 * WealthLens — lender amortization schedule table.
 *
 * Reproduces the right-hand table from the กยศ portal: 15 rows of
 * (งวด, วันที่, สัดส่วน, เงินต้น, ดอกเบี้ย, รวม, สะสม). The active
 * installment row is tinted emerald — same visual idiom as the source
 * portal so Tom's eye lands on "where am I" instantly.
 */

import { useMemo, type ReactNode } from 'react';

import type { Loan, LoanInstallment } from '@/types';
import {
  getCumulativeBySchedule,
  getCurrentInstallment,
} from '@/utils/loanCalculations';
import { formatNumber, formatPercent, formatTHB } from '@/utils/formatters';

interface LoanScheduleTableProps {
  loan: Loan;
}

/** Format `2019-07-05` → `5 ก.ค. 2019` for inline schedule display. */
const formatScheduleDate = (iso: string): string => {
  const dt = new Date(`${iso}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return iso;
  const months = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
};

export const LoanScheduleTable = ({
  loan,
}: LoanScheduleTableProps): ReactNode => {
  const sorted = useMemo(
    () =>
      [...loan.schedule].sort(
        (a, b) => a.installmentNumber - b.installmentNumber,
      ),
    [loan.schedule],
  );
  const cumulative = useMemo(() => getCumulativeBySchedule(loan), [loan]);
  const current = useMemo(() => getCurrentInstallment(loan), [loan]);
  const totalPrincipal = sorted.reduce((acc, i) => acc + i.principalAmount, 0);
  const totalInterest = sorted.reduce((acc, i) => acc + i.interestAmount, 0);
  const totalAll = sorted.reduce((acc, i) => acc + i.totalAmount, 0);

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <header className="px-4 py-3 border-b border-slate-100 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">ตารางผ่อนชำระ</h2>
        <span className="text-xs text-slate-400">
          {sorted.length} งวด · จบ {formatScheduleDate(sorted[sorted.length - 1]?.dueDate ?? '')}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">งวด</th>
              <th className="px-3 py-2 text-left font-semibold">วันที่</th>
              <th className="px-3 py-2 text-right font-semibold">สัดส่วน</th>
              <th className="px-3 py-2 text-right font-semibold">เงินต้น</th>
              <th className="px-3 py-2 text-right font-semibold">ดอกเบี้ย</th>
              <th className="px-3 py-2 text-right font-semibold">รวม</th>
              <th className="px-3 py-2 text-right font-semibold">สะสม</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row: LoanInstallment, idx) => {
              const isCurrent =
                current?.installmentNumber === row.installmentNumber;
              return (
                <tr
                  key={row.installmentNumber}
                  className={`border-b border-slate-100 last:border-b-0 ${
                    isCurrent
                      ? 'bg-emerald-50 hover:bg-emerald-100'
                      : 'hover:bg-slate-50'
                  } transition`}
                >
                  <td className="px-3 py-2 text-slate-700 font-medium">
                    {row.installmentNumber}
                    {isCurrent && (
                      <span
                        aria-hidden="true"
                        className="ml-1.5 text-emerald-600"
                      >
                        ⭐
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatScheduleDate(row.dueDate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {formatPercent(row.principalRatio, { decimals: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right financial-number tabular-nums text-slate-900">
                    {formatNumber(row.principalAmount, { decimals: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right financial-number tabular-nums text-slate-600">
                    {formatNumber(row.interestAmount, { decimals: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right financial-number tabular-nums text-slate-900 font-medium">
                    {formatNumber(row.totalAmount, { decimals: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right financial-number tabular-nums text-slate-500">
                    {formatNumber(cumulative[idx] ?? 0, { decimals: 2 })}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="px-3 py-2.5 text-slate-700">
                ยอดรวม
              </td>
              <td className="px-3 py-2.5 text-right financial-number tabular-nums text-slate-900">
                {formatNumber(totalPrincipal, { decimals: 2 })}
              </td>
              <td className="px-3 py-2.5 text-right financial-number tabular-nums text-slate-900">
                {formatNumber(totalInterest, { decimals: 2 })}
              </td>
              <td className="px-3 py-2.5 text-right financial-number tabular-nums text-slate-900">
                {formatTHB(totalAll, { decimals: 2 })}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default LoanScheduleTable;
