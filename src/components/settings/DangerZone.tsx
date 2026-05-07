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
  const [busy, setBusy] = useState(false);

  const handleReset = async (): Promise<void> => {
    if (!window.confirm(RESET_CONFIRM)) return;
    setBusy(true);
    try {
      resetToSeed();
      // Sync Kept balances from seed too — clear any not in seed, set those in seed.
      for (const yearStr of Object.keys(existingKept)) {
        if (!(yearStr in SEED_KEPT_BALANCES)) {
          clearKeptBalance(Number(yearStr));
        }
      }
      for (const [yearStr, amount] of Object.entries(SEED_KEPT_BALANCES)) {
        setKeptBalance(Number(yearStr), amount);
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
      setBusy(false);
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
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? 'กำลังรีเซ็ต...' : '🔄 รีเซ็ตและอัพโหลดไป Drive'}
      </button>

      <p className="text-xs text-slate-500">
        ครอบคลุม: ledger (income/expense), Kept balances (จาก
        SEED_KEPT_BALANCES). ไม่กระทบ: <code>yearlyGoals</code>,{' '}
        <code>travelSavingsGoal</code>,{' '}
        <code>wealthlens_anomaly_dismissals</code>
      </p>
    </section>
  );
};

export default DangerZone;
