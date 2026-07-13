/**
 * WealthLens — คอลัมน์สินทรัพย์ หรือ หนี้ (F38).
 *
 * รับแถวที่ประกอบข้อความไทยมาแล้วจากหน้าเพจ — component นี้ไม่รู้ว่าเงินก้อน
 * ไหนคืออะไร มันแค่วางตัวเลขให้อ่านง่าย. แถวที่มี `details` กางดูย่อยได้.
 */
import { useState, type ReactNode } from 'react';

import { formatTHB } from '@/utils/formatters';

export interface NetWorthRow {
  key: string;
  label: string;
  amount: number;
  /** ข้อความเล็กใต้ชื่อแถว เช่น "เงินที่ใส่ไป ไม่ใช่มูลค่าปัจจุบัน". */
  note?: string;
  details?: ReadonlyArray<{ key: string; label: string; amount: number }>;
}

interface NetWorthColumnProps {
  title: string;
  tone: 'asset' | 'liability';
  rows: ReadonlyArray<NetWorthRow>;
  total: number;
}

export const NetWorthColumn = ({
  title,
  tone,
  rows,
  total,
}: NetWorthColumnProps): ReactNode => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const amountCls = tone === 'asset' ? 'text-income-700' : 'text-expense-ink';

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-ink-700">{title}</h2>
      <div className="mt-3 divide-y divide-ink-100">
        {rows.map((r) => {
          const expandable = (r.details?.length ?? 0) > 0;
          const open = openKey === r.key;
          return (
            <div key={r.key} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : r.key)}
                      aria-expanded={open}
                      className="text-sm text-ink-700 hover:text-primary-ink transition"
                    >
                      {open ? '▾' : '▸'} {r.label}
                    </button>
                  ) : (
                    <span className="text-sm text-ink-700">{r.label}</span>
                  )}
                  {r.note && (
                    <div className="text-xs text-ink-400">{r.note}</div>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold financial-number tabular-nums ${amountCls}`}
                >
                  {formatTHB(r.amount, { decimals: 0 })}
                </span>
              </div>

              {expandable && open && (
                <div className="mt-1.5 space-y-1 pl-4">
                  {r.details?.map((d) => (
                    <div key={d.key} className="flex justify-between text-xs">
                      <span className="text-ink-500">{d.label}</span>
                      <span className="financial-number tabular-nums text-ink-600">
                        {formatTHB(d.amount, { decimals: 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-200 pt-3">
        <span className="text-sm font-semibold text-ink-700">รวม</span>
        <span
          className={`text-base font-bold financial-number tabular-nums ${amountCls}`}
        >
          {formatTHB(total, { decimals: 0 })}
        </span>
      </div>
    </section>
  );
};

export default NetWorthColumn;
