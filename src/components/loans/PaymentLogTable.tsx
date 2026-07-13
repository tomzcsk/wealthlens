/**
 * WealthLens — merged payment history for a loan.
 *
 * Two sources, one table:
 *   - `auto`  — pulled from `deductions.gsl` per month (read-only here;
 *               edit them via the monthly Income form).
 *   - `extra` — lump-sum โปะ entries; deletable inline.
 *
 * Reproduces the left-hand "ตาราง3" view from the กยศ portal so the
 * page reads like a faithful upgrade of the source-of-truth Tom already
 * trusts. Sorted newest-first; collapsible at 20 rows to keep the page
 * scrollable even on a 15-year loan.
 */

import { useMemo, useState, type ReactNode } from 'react';

import type { Loan } from '@/types';
import {
  getMergedPaymentLog,
  type PaymentLogEntry,
} from '@/utils/loanCalculations';
import { formatNumber, formatThaiDate } from '@/utils/formatters';

interface PaymentLogTableProps {
  loan: Loan;
  onDeleteExtra: (extraId: string) => void;
}

const VISIBLE_DEFAULT = 20;

export const PaymentLogTable = ({
  loan,
  onDeleteExtra,
}: PaymentLogTableProps): ReactNode => {
  const log = useMemo(() => getMergedPaymentLog(loan), [loan]);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? log : log.slice(0, VISIBLE_DEFAULT);
  const total = useMemo(
    () => log.reduce((acc, row) => acc + row.amount, 0),
    [log],
  );

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm">
      <header className="px-4 py-3 border-b border-ink-100 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink-700">
          ประวัติการชำระ
        </h2>
        <span className="text-xs text-ink-400">
          {log.length} รายการ · รวม{' '}
          <span className="financial-number tabular-nums text-ink-600">
            {formatNumber(total, { decimals: 2 })}
          </span>{' '}
          บาท
        </span>
      </header>

      {log.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-ink-500">
          ยังไม่มีรายการชำระ — เพิ่มโปะพิเศษด้วยปุ่ม &quot;+ เพิ่มโปะ&quot;
          หรือกรอก กยศ ในฟอร์มรายได้รายเดือน
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">วันที่</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    เลขอ้างอิง
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">รายการ</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    ยอดชำระ
                  </th>
                  <th className="px-3 py-2 text-right font-semibold w-16" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row: PaymentLogEntry, idx) => (
                  <tr
                    key={`${row.source}-${row.extraId ?? row.date}-${idx}`}
                    className="border-b border-ink-100 last:border-b-0 hover:bg-hover transition"
                  >
                    <td className="px-3 py-2 text-ink-600">
                      {formatThaiDate(row.date)}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-ink-400">
                      {row.reference ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-ink-700">{row.label}</span>
                      {row.source === 'auto' ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-raised px-1.5 py-0.5 text-xs text-ink-500">
                          auto
                        </span>
                      ) : (
                        <span className="ml-2 inline-flex items-center rounded-full bg-warning-50 px-1.5 py-0.5 text-xs text-warning-700">
                          โปะ
                        </span>
                      )}
                      {row.notes && (
                        <span className="ml-2 text-xs text-ink-400">
                          · {row.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right financial-number tabular-nums text-ink-900">
                      {formatNumber(row.amount, { decimals: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.source === 'extra' && row.extraId && (
                        <button
                          type="button"
                          onClick={() => onDeleteExtra(row.extraId!)}
                          aria-label="ลบโปะนี้"
                          className="p-1 inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-ink-400 hover:text-expense-ink transition"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {log.length > VISIBLE_DEFAULT && (
            <div className="px-4 py-2 border-t border-ink-100 text-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center min-h-11 md:min-h-0 text-xs font-medium text-primary-ink hover:text-primary-700"
              >
                {expanded
                  ? '▴ แสดง 20 รายการล่าสุด'
                  : `▾ แสดงทั้งหมด (อีก ${log.length - VISIBLE_DEFAULT} รายการ)`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default PaymentLogTable;
