/**
 * Settings — Reports section (F17).
 *
 * Lets the user open a print-optimized annual report in a new tab. Two
 * actions:
 *   • Preview          → opens `/report/:year` for on-screen review.
 *   • Generate PDF     → opens `/report/:year?print=1`, which auto-fires
 *                        `window.print()` so the user lands directly on the
 *                        browser's "Save as PDF" dialog.
 *
 * No PDF library — the browser's native print pipeline already understands
 * Inter + Noto Sans Thai (which the app preloads), so output Thai-text fonts
 * just work. The trade-off is one extra dialog click vs a one-tap download.
 */

import { useState, type ReactNode } from 'react';

import {
  useAvailableYears,
  useSelectedYear,
} from '@/hooks/useFinanceData';

const openReport = (year: number, autoPrint: boolean): void => {
  const qs = autoPrint ? '?print=1' : '';
  window.open(`/report/${year}${qs}`, '_blank', 'noopener,noreferrer');
};

export const ReportsSection = (): ReactNode => {
  const availableYears = useAvailableYears();
  const selectedYear = useSelectedYear();

  // Default to the user's currently-selected year if it's actually present
  // in `availableYears` (it should be, but defensive default keeps the
  // dropdown sane on first run / corrupted state).
  const initialYear = availableYears.includes(selectedYear)
    ? selectedYear
    : (availableYears[availableYears.length - 1] ?? selectedYear);

  const [year, setYear] = useState<number>(initialYear);

  const hasYears = availableYears.length > 0;

  return (
    <section
      aria-labelledby="settings-reports"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
    >
      <header>
        <h2
          id="settings-reports"
          className="text-lg font-semibold text-slate-900"
        >
          รายงาน
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          สร้างรายงานสรุปการเงินรายปี (PDF) —
          ใช้กล่อง Print ของเบราว์เซอร์ → Save as PDF
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="report-year"
          className="text-sm font-medium text-slate-700"
        >
          ปี
        </label>
        <select
          id="report-year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          disabled={!hasYears}
          className="text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasYears ? (
            availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))
          ) : (
            <option value={year}>{year}</option>
          )}
        </select>

        <button
          type="button"
          onClick={() => openReport(year, false)}
          disabled={!hasYears}
          className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <span aria-hidden="true">👁</span>
          พรีวิว
        </button>

        <button
          type="button"
          onClick={() => openReport(year, true)}
          disabled={!hasYears}
          className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
        >
          <span aria-hidden="true">📄</span>
          สร้าง PDF
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        <span aria-hidden="true">💡 </span>
        เคล็ดลับ: ใช้กล่อง Print ของเบราว์เซอร์ → Save as PDF เลือก{' '}
        <span className="font-medium">"Save as PDF"</span> เป็น destination
        เพื่อบันทึกเป็นไฟล์ PDF — รองรับฟอนต์ภาษาไทยเต็มรูปแบบ
      </p>
    </section>
  );
};

export default ReportsSection;
