/**
 * Settings — แปลงยอดเก่าเป็นรายการเดินบัญชี (F41).
 *
 * อยู่ในหน้า Settings ไม่ใช่ DangerZone: ยอดเงินไม่เปลี่ยนแม้แต่บาทเดียว
 * เครื่องมือนี้เขียนคำอธิบายให้ยอดที่มีอยู่ (บรรทัด "ยอดที่กรอกไว้เดิม")
 * ไม่ได้เพิ่มเงิน — และย้อนกลับได้.
 *
 * สามสถานะที่ตัดขาดกัน:
 *   1. มีบรรทัด backfill อยู่แล้ว → สรุป + ปุ่มย้อนกลับ (inline confirm 2 จังหวะ)
 *   2. ไม่มีอะไรต้องแปลง (cellCount 0) → ข้อความ, ปุ่ม disabled
 *   3. มีส่วนต่างรอแปลง → preview + ปุ่มแปลง
 *
 * inline confirm (ไม่ใช่ window.confirm ซึ่งค้าง automation และ repo เลิกใช้แล้ว
 * — ดู RecurringFillModal): กดครั้งแรกให้ปุ่มกลายเป็น "ยืนยันย้อนกลับ? ✓ / ✕".
 */

import { useMemo, useState, type ReactNode } from 'react';

import { EMPTY_BANK_ACCOUNTS, EMPTY_BANK_TRANSACTIONS } from '@/stores/emptyRefs';
import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import { planBackfill } from '@/utils/journalBackfill';
import { formatNumber } from '@/utils/formatters';

export const JournalBackfillSection = (): ReactNode => {
  // fallback เป็นค่าคงที่ (ref เดิม) เสมอ — `?? []` ในตัว selector จะสร้าง array
  // ใหม่ทุก render → React error #185 (verify-stable-selectors.ts จะ fail).
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);
  const transactions = useFinanceStore(
    (s) => s.data.bankTransactions ?? EMPTY_BANK_TRANSACTIONS,
  );
  const applyJournalBackfill = useFinanceStore((s) => s.applyJournalBackfill);
  const undoJournalBackfill = useFinanceStore((s) => s.undoJournalBackfill);
  const pushToast = useToastStore((s) => s.push);

  const [confirmingUndo, setConfirmingUndo] = useState(false);

  // BankLedger รับ array แบบ mutable; fallback คงที่เป็น readonly — spread
  // ให้ตรงชนิด. อยู่ใน useMemo จึงคำนวณเฉพาะตอน ref เปลี่ยน ไม่ทุก render.
  const plan = useMemo(
    () => planBackfill({ accounts: [...accounts], transactions: [...transactions] }),
    [accounts, transactions],
  );
  const existing = useMemo(
    () => transactions.filter((t) => t.source.type === 'backfill').length,
    [transactions],
  );

  const handleApply = (): void => {
    const created = plan.cellCount;
    applyJournalBackfill();
    pushToast({
      tone: 'success',
      message: `แปลงยอดเก่าเป็นรายการแล้ว ${formatNumber(created)} บรรทัด`,
    });
  };

  const handleUndo = (): void => {
    const removed = existing;
    undoJournalBackfill();
    setConfirmingUndo(false);
    pushToast({
      tone: 'info',
      message: `ย้อนกลับแล้ว ลบบรรทัด "ยอดที่กรอกไว้เดิม" ${formatNumber(removed)} บรรทัด`,
    });
  };

  return (
    <section
      aria-labelledby="settings-journal-backfill"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
    >
      <header>
        <h2
          id="settings-journal-backfill"
          className="text-lg font-semibold text-slate-900"
        >
          แปลงยอดเก่าเป็นรายการ
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          เปลี่ยนยอดบัญชีที่กรอกไว้ก่อนมีสมุดรายการ ให้กลายเป็นบรรทัด
          "ยอดที่กรอกไว้เดิม" — ยอดเงินทุกบัญชีไม่เปลี่ยน และย้อนกลับได้
        </p>
      </header>

      {existing > 0 ? (
        // สถานะ 1 — แปลงแล้ว
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            แปลงแล้ว{' '}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatNumber(existing)}
            </span>{' '}
            บรรทัด
          </p>
          {confirmingUndo ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-sm font-medium text-amber-900">
                ยืนยันย้อนกลับ? ลบบรรทัด "ยอดที่กรอกไว้เดิม" ทั้งหมด —
                ยอดเงินไม่เปลี่ยน
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleUndo}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                >
                  ✓ ยืนยันย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingUndo(false)}
                  aria-label="ยกเลิก"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingUndo(true)}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <span aria-hidden="true">↩︎</span>
              ย้อนกลับ
            </button>
          )}
        </div>
      ) : plan.cellCount === 0 ? (
        // สถานะ 2 — ไม่มีอะไรต้องแปลง
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            ทุกเดือนมีรายการครบแล้ว ไม่ต้องแปลง
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-400 text-sm font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
          >
            แปลงยอดเก่าเป็นรายการ
          </button>
        </div>
      ) : (
        // สถานะ 3 — มีส่วนต่างรอแปลง
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            จะสร้าง{' '}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatNumber(plan.cellCount)}
            </span>{' '}
            บรรทัด ใน{' '}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatNumber(plan.accountCount)}
            </span>{' '}
            บัญชี
          </p>
          <p className="text-sm font-semibold text-income bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span aria-hidden="true">✓ </span>
            ยอดเงินทุกบัญชีไม่เปลี่ยน
          </p>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <span aria-hidden="true">🧾</span>
            แปลงยอดเก่าเป็นรายการ
          </button>
        </div>
      )}
    </section>
  );
};

export default JournalBackfillSection;
