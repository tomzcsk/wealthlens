import { useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useSyncCoordinator } from '@/auth/syncCoordinator';
import { SEED_KEPT_BALANCES } from '@/data/seedData';
import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { useToastStore } from '@/stores/toastStore';

const RESET_CONFIRM =
  'ยืนยันรีเซ็ตข้อมูลกลับเป็น seedData.ts ทั้งหมด?\n\nข้อมูลที่กรอกใน LocalStorage จะหายไป และถูกแทนที่ด้วยข้อมูลจาก seedData.ts ' +
  '(ถ้า sign in กับ Drive ไฟล์บน Drive จะถูก overwrite ด้วยข้อมูลใหม่)';

export const DangerZone = (): ReactNode => {
  const { isSignedIn } = useGoogleAuth();
  const { manualSync } = useSyncCoordinator();
  const resetToSeed = useFinanceStore((s) => s.resetToSeed);
  const setKeptBalance = useGoalsStore((s) => s.setKeptBalance);
  const clearKeptBalance = useGoalsStore((s) => s.clearKeptBalance);
  const existingKept = useGoalsStore((s) => s.keptBalances);
  const push = useToastStore((s) => s.push);
  const [busy, setBusy] = useState<null | 'reset' | 'kept'>(null);

  const handleReset = async (): Promise<void> => {
    if (!window.confirm(RESET_CONFIRM)) return;
    setBusy('reset');
    try {
      resetToSeed();
      // Sync Kept balances from seed too — clear any (year, month) entries
      // not present in seed, then set the seeded (year, month, amount) tuples.
      for (const [yearStr, months] of Object.entries(existingKept)) {
        const seedYear = SEED_KEPT_BALANCES[yearStr];
        for (const monthStr of Object.keys(months)) {
          if (!seedYear || !(monthStr in seedYear)) {
            clearKeptBalance(Number(yearStr), Number(monthStr));
          }
        }
      }
      for (const [yearStr, months] of Object.entries(SEED_KEPT_BALANCES)) {
        for (const [monthStr, amount] of Object.entries(months)) {
          setKeptBalance(Number(yearStr), Number(monthStr), amount);
        }
      }
      if (isSignedIn) {
        await manualSync();
        push({
          message: 'รีเซ็ตข้อมูล + Kept และ push ขึ้น Drive แล้ว',
          tone: 'success',
        });
      } else {
        push({
          message: 'รีเซ็ตข้อมูล + Kept กลับเป็น seed แล้ว',
          tone: 'success',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      push({ message: `Reset error: ${msg}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Non-destructive Kept import — replaces every (year, month) entry that
   * appears in `SEED_KEPT_BALANCES` and leaves the rest of the ledger
   * (income, expenses, savings, goals, defaults) untouched. Use this when
   * Tom's per-month Kept data is missing or stuck in the legacy "December
   * only" shape from the pre-refactor migration, but his ledger is fine.
   */
  const handleImportKept = async (): Promise<void> => {
    setBusy('kept');
    try {
      for (const [yearStr, months] of Object.entries(SEED_KEPT_BALANCES)) {
        for (const [monthStr, amount] of Object.entries(months)) {
          setKeptBalance(Number(yearStr), Number(monthStr), amount);
        }
      }
      if (isSignedIn) {
        await manualSync();
        push({
          message: 'เติม Kept รายเดือนจาก seed + sync Drive แล้ว',
          tone: 'success',
        });
      } else {
        push({
          message: 'เติม Kept รายเดือนจาก seed แล้ว',
          tone: 'success',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      push({ message: `Import error: ${msg}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="โซนอันตราย"
      className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-4"
    >
      <header className="flex items-center gap-2">
        <span className="text-2xl">⚠️</span>
        <h2 className="text-lg font-semibold text-red-700">โซนอันตราย</h2>
      </header>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          รีเซ็ตเป็นข้อมูลต้นฉบับ
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          โหลดข้อมูลจาก{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
            src/data/seedData.ts
          </code>{' '}
          ใหม่ — ใช้ตอนแก้ seed file แล้วอยากให้ store sync ตามทันที
          {isSignedIn && (
            <>
              {' '}
              จะ <strong>force-push</strong> ขึ้น Drive ทันที (overwrite ของเก่า
              โดยไม่ผ่าน conflict resolver)
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={handleReset}
        disabled={busy !== null}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy === 'reset' ? 'กำลังรีเซ็ต...' : '🔄 รีเซ็ตและอัพโหลดไป Drive'}
      </button>

      <p className="text-xs text-slate-500">
        ครอบคลุม: ledger (income/expense), Kept balances (จาก
        SEED_KEPT_BALANCES). ไม่กระทบ: <code>yearlyGoals</code>,{' '}
        <code>travelSavingsGoal</code>,{' '}
        <code>wealthlens_anomaly_dismissals</code>
      </p>

      <div className="space-y-2 pt-4 border-t border-red-100">
        <h3 className="text-sm font-semibold text-slate-900">
          เติม Kept รายเดือนจาก seed
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          เขียนทับเฉพาะค่า Kept (กรุงศรี) รายเดือนตาม{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
            SEED_KEPT_BALANCES
          </code>{' '}
          ของแต่ละ (ปี, เดือน) — ledger (รายรับ/รายจ่าย/ออม) ไม่ถูกแตะ
          {isSignedIn && <> · sync Drive ให้ทันที</>}
        </p>
        <button
          type="button"
          onClick={handleImportKept}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'kept' ? 'กำลังเติม...' : '💼 เติม Kept รายเดือน'}
        </button>
      </div>
    </section>
  );
};

export default DangerZone;
