import { useMemo, useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useSyncCoordinator } from '@/auth/syncCoordinator';
import { SEED_KEPT_BALANCES } from '@/data/seedData';
import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { useToastStore } from '@/stores/toastStore';
import { parseGoldPriceHistory } from '@/utils/parseGoldPriceHistory';

const RESET_CONFIRM =
  'ยืนยันรีเซ็ตข้อมูลกลับเป็น seedData.ts ทั้งหมด?\n\nข้อมูลที่กรอกใน LocalStorage จะหายไป และถูกแทนที่ด้วยข้อมูลจาก seedData.ts ' +
  '(ถ้า sign in กับ Drive ไฟล์บน Drive จะถูก overwrite ด้วยข้อมูลใหม่)';

export const DangerZone = (): ReactNode => {
  const { isSignedIn } = useGoogleAuth();
  const { manualSync } = useSyncCoordinator();
  const resetToSeed = useFinanceStore((s) => s.resetToSeed);
  const bulkImportGoldPriceHistory = useFinanceStore(
    (s) => s.bulkImportGoldPriceHistory,
  );
  const existingHistoryCount = useFinanceStore(
    (s) => (s.data.goldPriceHistory ?? []).length,
  );
  const setKeptBalance = useGoalsStore((s) => s.setKeptBalance);
  const clearKeptBalance = useGoalsStore((s) => s.clearKeptBalance);
  const existingKept = useGoalsStore((s) => s.keptBalances);
  const push = useToastStore((s) => s.push);
  const [busy, setBusy] = useState<null | 'reset' | 'kept' | 'gold'>(null);
  const [pasteText, setPasteText] = useState('');
  const preview = useMemo(
    () => (pasteText.trim() ? parseGoldPriceHistory(pasteText) : null),
    [pasteText],
  );

  const handleImportGoldHistory = (mode: 'merge' | 'replace'): void => {
    if (!preview || preview.rowsAccepted === 0) return;
    setBusy('gold');
    try {
      bulkImportGoldPriceHistory(preview.snapshots, mode);
      push({
        message: `นำเข้า ${preview.rowsAccepted} snapshots สำเร็จ (${mode === 'merge' ? 'merge' : 'replace'})`,
        tone: 'success',
      });
      setPasteText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      push({ message: `Import error: ${msg}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

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
   * Replace Kept-from-seed — for every year present in SEED_KEPT_BALANCES,
   * the existing per-month entries are wiped and replaced by the seed's
   * exact (month → amount) tuples. This is what Tom usually wants: "make
   * Kept match the Sheet". Years NOT in seed are left alone, and the rest
   * of the ledger (income, expenses, savings, goals, defaults) is untouched.
   *
   * (Why we wipe first: a previous run could have written wrong months
   * that no longer appear in the new seed. A pure "set" loop would leave
   * those orphans behind. Clearing the per-year bucket first guarantees
   * the resulting state mirrors SEED_KEPT_BALANCES verbatim.)
   */
  const handleImportKept = async (): Promise<void> => {
    setBusy('kept');
    try {
      for (const yearStr of Object.keys(SEED_KEPT_BALANCES)) {
        const existingYear = existingKept[yearStr];
        if (existingYear) {
          for (const monthStr of Object.keys(existingYear)) {
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

      <div className="space-y-2 pt-4 border-t border-red-100">
        <h3 className="text-sm font-semibold text-slate-900">
          นำเข้าประวัติราคาทอง (paste จาก ทองคำราคา.com)
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          วางตารางจากหน้า "ราคาทองย้อนหลัง" — ระบบจะดึง{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
            ทองคำแท่งรับซื้อ
          </code>{' '}
          ออกมาเป็น snapshots เพื่อ unlock MA 30 วันให้ผู้ช่วยทอง
          (ตอนนี้มี {existingHistoryCount} snapshots ใน history)
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder="19/05/2569 15:37    20    70,050.00    70,250.00    68,644.48    71,050.00 ..."
          className="w-full font-mono text-xs bg-slate-50 border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {preview && (
          <div className="text-xs text-slate-600">
            พบ <strong>{preview.rowsAccepted}</strong> snapshots
            {preview.earliest && preview.latest && (
              <>
                {' '}· ตั้งแต่{' '}
                <span className="financial-number tabular-nums">
                  {preview.earliest.slice(0, 16).replace('T', ' ')}
                </span>{' '}
                ถึง{' '}
                <span className="financial-number tabular-nums">
                  {preview.latest.slice(0, 16).replace('T', ' ')}
                </span>
              </>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleImportGoldHistory('merge')}
            disabled={busy !== null || !preview || preview.rowsAccepted === 0}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy === 'gold' ? 'กำลังนำเข้า...' : '✅ นำเข้า (merge)'}
          </button>
          <button
            type="button"
            onClick={() => handleImportGoldHistory('replace')}
            disabled={busy !== null || !preview || preview.rowsAccepted === 0}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🔄 แทนที่ทั้งหมด
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Merge = รวมกับของเดิม, dedup ตาม timestamp · Replace = ลบของเดิมทิ้ง
        </p>
      </div>
    </section>
  );
};

export default DangerZone;
