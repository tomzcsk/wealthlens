/**
 * WealthLens — ReimbursementCard.
 *
 * "เบิกบริษัท" tracker — surfaces every expense item Tom marked as paid
 * out-of-pocket with `reimbursement.status === 'pending'`. The headline
 * number is the total still owed by the company. A list of the top
 * pending rows below makes it easy to spot what's overdue at a glance.
 *
 * Hidden entirely when there's nothing pending AND nothing received this
 * year — no point taking up grid space if Tom doesn't use the feature.
 */

import { useMemo, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useSelectedYear } from '@/hooks/useFinanceData';
import { useToastStore } from '@/stores/toastStore';
import { THAI_MONTHS_SHORT, formatTHB } from '@/utils/formatters';
import type { ExpenseItem, WealthLensData } from '@/types';

interface PendingRow {
  item: ExpenseItem;
  month: number;
}

const collectReimbursements = (
  data: WealthLensData,
  year: number,
): { pending: PendingRow[]; receivedTotal: number } => {
  const yr = data.years[String(year)];
  if (!yr) return { pending: [], receivedTotal: 0 };
  const pending: PendingRow[] = [];
  let receivedTotal = 0;
  for (const monthRow of yr.expenses) {
    for (const item of monthRow.items) {
      if (item.reimbursement == null) continue;
      if (item.reimbursement.status === 'pending') {
        pending.push({ item, month: monthRow.month });
      } else {
        receivedTotal += item.amount;
      }
    }
  }
  // Most-recent month first — Tom's freshest claims surface at the top.
  pending.sort((a, b) => b.month - a.month);
  return { pending, receivedTotal };
};

export const ReimbursementCard = (): ReactNode => {
  const year = useSelectedYear();
  const data = useFinanceStore((s) => s.data);
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const pushToast = useToastStore((s) => s.push);

  const { pending, receivedTotal } = useMemo(
    () => collectReimbursements(data, year),
    [data, year],
  );

  const pendingTotal = pending.reduce((acc, row) => acc + row.item.amount, 0);

  /**
   * Quick "เบิกแล้ว" action — flips status to received with today's date
   * stamped automatically. Lives here so Tom can clear pending claims
   * without leaving the Overview page.
   */
  const handleMarkReceived = (row: PendingRow): void => {
    updateExpense(year, row.month, row.item.id, {
      reimbursement: {
        status: 'received',
        receivedDate: new Date().toISOString().slice(0, 10),
      },
    });
    pushToast({
      message: `เบิกแล้ว: ${row.item.name}`,
      tone: 'success',
    });
  };

  // Hide the card when this year has no reimbursable activity at all.
  if (pending.length === 0 && receivedTotal === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-base"
          >
            🧾
          </span>
          <h3 className="text-base font-semibold text-slate-900">
            เบิกบริษัท — {year}
          </h3>
        </div>
        <span className="text-xs text-slate-500">
          ได้คืนแล้ว <strong className="tabular-nums">{formatTHB(receivedTotal)}</strong>
        </span>
      </header>

      <div>
        <div className="text-xs text-slate-500">รอเบิก</div>
        <div
          className={`financial-number text-2xl font-bold tabular-nums ${
            pendingTotal > 0 ? 'text-amber-700' : 'text-slate-400'
          }`}
        >
          {formatTHB(pendingTotal)}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {pending.length === 0
            ? 'เคลียร์หมด — ไม่มีรายการรอเบิก'
            : `${pending.length} รายการ`}
        </div>
      </div>

      {pending.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
          {pending.slice(0, 5).map((row) => (
            <li
              key={`${row.month}-${row.item.id}`}
              className="flex items-center gap-3 py-2 px-1"
            >
              <span className="flex-1 min-w-0 text-sm text-slate-900 truncate">
                <span className="text-xs text-slate-400 mr-2 tabular-nums">
                  {THAI_MONTHS_SHORT[row.month - 1]}
                </span>
                {row.item.name}
              </span>
              <span className="text-sm tabular-nums font-medium text-amber-800">
                {formatTHB(row.item.amount)}
              </span>
              <button
                type="button"
                onClick={() => handleMarkReceived(row)}
                title="ทำเครื่องหมายว่าได้คืนเงินแล้ว"
                className="px-2.5 py-1 text-xs font-medium rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition whitespace-nowrap"
              >
                🟢 เบิกแล้ว
              </button>
            </li>
          ))}
          {pending.length > 5 && (
            <li className="pt-2 text-xs text-slate-400 text-center">
              + อีก {pending.length - 5} รายการ
            </li>
          )}
        </ul>
      )}
    </section>
  );
};

export default ReimbursementCard;
