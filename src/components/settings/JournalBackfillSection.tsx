/**
 * Settings — แปลงยอดเก่าเป็นรายการเดินบัญชี (F41).
 *
 * อยู่ในหน้า Settings ไม่ใช่ DangerZone: ยอดเงินไม่เปลี่ยนแม้แต่บาทเดียว
 * เครื่องมือนี้เขียนคำอธิบายให้ยอดที่มีอยู่ (บรรทัด "ยอดที่กรอกไว้เดิม")
 * ไม่ได้เพิ่มเงิน — และย้อนกลับได้.
 *
 * UI ถามสองคำถามที่เป็นอิสระต่อกัน ไม่ใช่สามสถานะที่ตัดขาดกัน:
 *   • ยังมีส่วนต่างรอแปลงไหม (`plan.cellCount`) → ปุ่มแปลง
 *   • เคยแปลงไว้ไหม (`existing`)              → ปุ่มย้อนกลับ
 * ทั้งสองจริงพร้อมกันได้ — เช่น import backup เก่าทับหลังเคยแปลงแล้ว ยอดลอย
 * ชุดใหม่จะโผล่มาทั้งที่ `existing > 0`. เวอร์ชันแรกเช็ค `existing` ก่อน จึงบัง
 * ปุ่มแปลงไว้ ทั้งที่ `planBackfill` รันซ้ำได้อยู่แล้ว (idempotent).
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
      className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-4"
    >
      <header>
        <h2
          id="settings-journal-backfill"
          className="text-lg font-semibold text-ink-900"
        >
          แปลงยอดเก่าเป็นรายการ
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          เปลี่ยนยอดบัญชีที่กรอกไว้ก่อนมีสมุดรายการ ให้กลายเป็นบรรทัด
          "ยอดที่กรอกไว้เดิม" — ยอดเงินทุกบัญชีไม่เปลี่ยน และย้อนกลับได้
        </p>
      </header>

      {plan.cellCount > 0 ? (
        <div className="space-y-3">
          {existing > 0 && (
            <p className="text-sm text-ink-500">
              เคยแปลงไว้{' '}
              <span className="font-semibold tabular-nums text-ink-700">
                {formatNumber(existing)}
              </span>{' '}
              บรรทัด — มียอดลอยชุดใหม่รอแปลงอีก
            </p>
          )}
          <p className="text-sm text-ink-700">
            จะสร้าง{' '}
            <span className="font-semibold tabular-nums text-ink-900">
              {formatNumber(plan.cellCount)}
            </span>{' '}
            บรรทัด ใน{' '}
            <span className="font-semibold tabular-nums text-ink-900">
              {formatNumber(plan.accountCount)}
            </span>{' '}
            บัญชี
          </p>
          <p className="text-sm font-semibold text-income-ink bg-income-50 border border-income-200 rounded-lg px-3 py-2">
            <span aria-hidden="true">✓ </span>
            ยอดเงินทุกบัญชีไม่เปลี่ยน
          </p>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 min-h-11 md:min-h-0 rounded-lg shadow-sm transition-colors"
          >
            <span aria-hidden="true">🧾</span>
            แปลงยอดเก่าเป็นรายการ
          </button>
        </div>
      ) : existing > 0 ? (
        // แปลงครบแล้ว — เหลือทางถอยอย่างเดียว
        <div className="space-y-3">
          <p className="text-sm text-ink-700">
            แปลงแล้ว{' '}
            <span className="font-semibold tabular-nums text-ink-900">
              {formatNumber(existing)}
            </span>{' '}
            บรรทัด
          </p>
          {confirmingUndo ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-50 border border-warning-200 px-3 py-2">
              <p className="text-sm font-medium text-warning-900">
                ยืนยันย้อนกลับ? ลบบรรทัด "ยอดที่กรอกไว้เดิม" ทั้งหมด —
                ยอดเงินไม่เปลี่ยน
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleUndo}
                  className="rounded-md bg-warning px-3 py-1.5 text-xs font-semibold text-white hover:bg-warning-dark transition-colors"
                >
                  ✓ ยืนยันย้อนกลับ
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingUndo(false)}
                  aria-label="ยกเลิก"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-500 hover:bg-raised transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingUndo(true)}
              className="inline-flex items-center gap-1.5 bg-card hover:bg-hover border border-ink-300 text-ink-700 text-sm font-semibold px-4 py-2 min-h-11 md:min-h-0 rounded-lg shadow-sm transition-colors"
            >
              <span aria-hidden="true">↩︎</span>
              ย้อนกลับ
            </button>
          )}
        </div>
      ) : (
        // ยอดทุกเซลล์มีรายการรองรับแล้ว และไม่เคยต้องแปลง
        <div className="space-y-3">
          <p className="text-sm text-ink-400">
            ทุกเดือนมีรายการครบแล้ว ไม่ต้องแปลง
          </p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 bg-raised border border-ink-200 text-ink-400 text-sm font-semibold px-4 py-2 min-h-11 md:min-h-0 rounded-lg cursor-not-allowed"
          >
            แปลงยอดเก่าเป็นรายการ
          </button>
        </div>
      )}
    </section>
  );
};

export default JournalBackfillSection;
