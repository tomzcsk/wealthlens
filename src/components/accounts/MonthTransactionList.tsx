/**
 * WealthLens — รายการเดินบัญชีของเดือนหนึ่ง (F40).
 *
 * รายการที่มาจากต้นทาง (รายได้/รายจ่าย/ทอง) แก้ที่นี่ไม่ได้ — ถ้าแก้สองทางได้
 * ต้นทางกับสมุดรายการจะไม่ตรงกันทันที. แสดงป้ายบอกที่มาแล้วให้ไปแก้ที่ต้นทาง.
 * ลบได้เฉพาะรายการที่ผู้ใช้สร้างเอง: manual / transfer / adjustment.
 *
 * เซลล์เดือนอาจ "ผสม" ได้: ยอดที่กรอกไว้ก่อนมีฟีเจอร์นี้ (หรือยอด Kept ที่
 * migrate มา) ไม่มีบรรทัด journal อยู่เบื้องหลัง แต่อาจมีบรรทัดใหม่เพิ่มทีหลัง.
 * ดังนั้น Σ รายการ อาจไม่เท่ายอดเดือน — ไม่ใช่บั๊ก แต่คือความจริงของข้อมูลเก่า.
 * เราคำนวณ `opening = ยอดเดือน − Σ รายการ` แล้วโชว์เป็นบรรทัดแรก "ยอดก่อนมี
 * รายการ" เพื่อให้เลขบนจอบวกกันได้ครบเสมอ และแถว "รวม" เท่ายอดเดือนเป๊ะ.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { BankTransaction } from '@/types';
import { formatTHB, formatThaiDate } from '@/utils/formatters';

const SOURCE_BADGE: Record<BankTransaction['source']['type'], string | null> = {
  manual: null,
  adjustment: '✏️ ปรับยอดเอง',
  transfer: '⇄ โอน',
  income: '💰 รายได้',
  expense: '🧾 รายจ่าย',
  gold: '🪙 ทอง',
  // ยอดที่กรอกไว้เดิม (F41): label บอกตัวเองอยู่แล้ว ไม่ต้องมี badge; และไม่อยู่
  // ใน DELETABLE จึงไม่มีปุ่มลบ — ลบเดี่ยวจะทำให้ Σรายการ ≠ ยอด (ใช้ปุ่มย้อนกลับ).
  backfill: null,
};

/** รายการที่ผู้ใช้สร้างเองเท่านั้นที่ลบจากหน้านี้ได้. */
const DELETABLE: ReadonlySet<BankTransaction['source']['type']> = new Set([
  'manual',
  'transfer',
  'adjustment',
]);

interface MonthTransactionListProps {
  transactions: ReadonlyArray<BankTransaction>;
  /** ยอดของเดือนนั้น — ใช้แสดงแถวรวมและพิสูจน์ว่าตรงกับผลรวมรายการ. */
  monthTotal: number;
  onDelete: (txId: string) => void;
}

/** เซ็นเครื่องหมายหน้าจำนวน: +฿1,000 / −฿400. */
const signedAmount = (amount: number): string =>
  `${amount < 0 ? '−' : '+'}${formatTHB(Math.abs(amount))}`;

export const MonthTransactionList = ({
  transactions,
  monthTotal,
  onDelete,
}: MonthTransactionListProps): ReactNode => {
  // แถวเดียวที่รอยืนยันลบ (ไม่ใช่ boolean) — กด ✕ แถวอื่นย้ายการยืนยันไปแถวนั้น
  // แทนที่จะค้างสองแถว. ไม่ใช้ onBlur reset เพราะ blur ยิงก่อน click บน mousedown
  // ปุ่มจะ unmount ก่อน onClick ทำงาน → ลบไม่ติด. reset เมื่อกด ✕ แถวอื่น/ลบเสร็จ.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // ทางถอยจากสถานะ "ยืนยัน?" ที่ไม่ทำลายข้อมูล — ถ้าเดือนมีแถวลบได้แถวเดียว
  // ปุ่มยืนยันคือ affordance เดียวบนแถวที่ติดอาวุธ กดพลาดแล้วจะไม่มีทางออก.
  // Esc หรือกดที่อื่นในหน้า เคลียร์การยืนยัน. ไม่ใช้ onBlur (จะ unmount ปุ่ม
  // ก่อน onClick ทำงาน → ลบไม่ติด). pointerdown ปลอดภัยเพราะเช็คก่อนว่า target
  // อยู่ในปุ่มยืนยันไหม ถ้าใช่ข้ามการ reset ให้ onClick ของปุ่มทำงานตามปกติ.
  useEffect(() => {
    if (confirmingId === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setConfirmingId(null);
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!confirmButtonRef.current?.contains(event.target as Node)) {
        setConfirmingId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [confirmingId]);

  if (transactions.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-slate-400">
        ยอดที่กรอกไว้ ไม่มีรายละเอียดรายการ
      </p>
    );
  }

  const txSum = transactions.reduce((acc, t) => acc + t.amount, 0);
  const opening = monthTotal - txSum;
  // ปัดทศนิยมกันเศษ float ก่อนตัดสินว่ามียอดก่อนมีรายการหรือไม่.
  const hasOpening = Math.round(opening * 100) !== 0;

  return (
    <div className="rounded-lg border border-slate-100 divide-y divide-slate-100 bg-slate-50/40">
      {hasOpening && (
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="flex-1 min-w-0 truncate text-sm italic text-slate-400">
            ยอดก่อนมีรายการ
          </span>
          <span className="financial-number text-sm tabular-nums text-slate-400">
            {formatTHB(opening)}
          </span>
          <span className="w-14 shrink-0" aria-hidden="true" />
        </div>
      )}

      {transactions.map((tx) => {
        const badge = SOURCE_BADGE[tx.source.type];
        const canDelete = DELETABLE.has(tx.source.type);
        const isNegative = tx.amount < 0;
        return (
          <div key={tx.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-900">{tx.label}</p>
              {(tx.date || badge) && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {tx.date && <span>{formatThaiDate(tx.date)}</span>}
                  {badge && <span className="text-slate-500">{badge}</span>}
                </div>
              )}
            </div>
            <span
              className={`financial-number text-sm tabular-nums ${
                isNegative ? 'text-expense' : 'text-income'
              }`}
            >
              {signedAmount(tx.amount)}
            </span>
            {canDelete ? (
              confirmingId === tx.id ? (
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={() => {
                    onDelete(tx.id);
                    setConfirmingId(null);
                  }}
                  aria-label="ยืนยันการลบรายการ"
                  className="w-14 shrink-0 whitespace-nowrap text-right text-xs font-semibold text-red-600 transition hover:text-red-700"
                >
                  ยืนยัน?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(tx.id)}
                  aria-label="ลบรายการ"
                  className="w-14 shrink-0 text-right text-slate-300 transition hover:text-red-600"
                >
                  ✕
                </button>
              )
            ) : (
              <span className="w-14 shrink-0" aria-hidden="true" />
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 bg-slate-100/70 px-3 py-2">
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
          รวม
        </span>
        <span
          className={`financial-number text-sm font-semibold tabular-nums ${
            monthTotal < 0 ? 'text-red-700' : 'text-slate-900'
          }`}
        >
          {formatTHB(monthTotal)}
        </span>
        <span className="w-14 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
};

export default MonthTransactionList;
