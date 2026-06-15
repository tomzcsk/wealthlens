import { useMemo, useState, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useToastStore } from '@/stores/toastStore';
import { parseGoldPriceHistory } from '@/utils/parseGoldPriceHistory';

export const DangerZone = (): ReactNode => {
  const bulkImportGoldPriceHistory = useFinanceStore(
    (s) => s.bulkImportGoldPriceHistory,
  );
  const existingHistoryCount = useFinanceStore(
    (s) => (s.data.goldPriceHistory ?? []).length,
  );
  const push = useToastStore((s) => s.push);
  const [busy, setBusy] = useState<null | 'gold'>(null);
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
