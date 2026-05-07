import { useState, type ReactNode } from 'react';

import { useGoalsStore, type IncomeDefaults } from '@/stores/goalsStore';
import { useToastStore } from '@/stores/toastStore';
import { formatNumber, formatTHB } from '@/utils/formatters';

interface FieldConfig {
  key: keyof IncomeDefaults;
  label: string;
  hint?: string;
}

const FIELDS: ReadonlyArray<FieldConfig> = [
  { key: 'salary', label: 'เงินเดือน', hint: 'ฐานเงินเดือนรายเดือน' },
  { key: 'tax', label: 'ภาษี', hint: 'ภาษีหัก ณ ที่จ่ายต่อเดือน (เปลี่ยนได้ในเดือนที่มีโบนัส)' },
  { key: 'socialSecurity', label: 'ประกันสังคม', hint: 'ปกติ 750/เดือน' },
  { key: 'providentFund', label: 'กองทุนสำรองเลี้ยงชีพ', hint: 'ปกติ 2,400/เดือน' },
  { key: 'gsl', label: 'กยศ', hint: 'ผ่อนชำระเงินกู้' },
];

const ZERO_DEFAULTS: IncomeDefaults = {
  salary: 0,
  tax: 0,
  socialSecurity: 0,
  providentFund: 0,
  gsl: 0,
};

const formatDefault = (n: number): string => (n > 0 ? formatNumber(n) : '');

const parseDefault = (raw: string): number => {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const IncomeDefaultsSection = (): ReactNode => {
  const stored = useGoalsStore((s) => s.incomeDefaults);
  const setIncomeDefaults = useGoalsStore((s) => s.setIncomeDefaults);
  const clearIncomeDefaults = useGoalsStore((s) => s.clearIncomeDefaults);
  const push = useToastStore((s) => s.push);

  // Local draft is seeded from the store ONCE on mount. Saving pushes back
  // into the store explicitly; we don't mirror store→draft because that
  // would clobber in-progress edits if persistence rehydrates mid-typing.
  const [draft, setDraft] = useState<Record<keyof IncomeDefaults, string>>(() =>
    fromDefaults(stored ?? ZERO_DEFAULTS),
  );

  const total = FIELDS.reduce(
    (acc, f) => acc + parseDefault(draft[f.key]),
    0,
  );

  const handleSave = (): void => {
    const next: IncomeDefaults = {
      salary: parseDefault(draft.salary),
      tax: parseDefault(draft.tax),
      socialSecurity: parseDefault(draft.socialSecurity),
      providentFund: parseDefault(draft.providentFund),
      gsl: parseDefault(draft.gsl),
    };
    setIncomeDefaults(next);
    push({ message: 'บันทึกค่าเริ่มต้นรายได้แล้ว', tone: 'success' });
  };

  const handleClear = (): void => {
    if (!window.confirm('ลบค่าเริ่มต้นรายได้?')) return;
    clearIncomeDefaults();
    setDraft(fromDefaults(ZERO_DEFAULTS));
    push({ message: 'ลบค่าเริ่มต้นแล้ว', tone: 'info' });
  };

  return (
    <section
      aria-label="Income defaults"
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            ค่าเริ่มต้นรายได้ / หัก
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ตั้งค่าฐานเงินเดือน + หักรายเดือน — กดปุ่ม "เติมจากค่าเริ่มต้น" ใน
            Income form ของเดือนใหม่จะ pre-fill ให้ทันที
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-sm font-medium text-slate-700">{f.label}</span>
            <input
              type="text"
              inputMode="numeric"
              value={draft[f.key]}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, '');
                setDraft((prev) => ({
                  ...prev,
                  [f.key]: digits ? formatNumber(Number(digits)) : '',
                }));
              }}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {f.hint && (
              <span className="text-xs text-slate-400 mt-1 block">
                {f.hint}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">
          รวมหักโดย default:{' '}
          <span className="font-semibold tabular-nums text-slate-900">
            {formatTHB(total - parseDefault(draft.salary))}
          </span>
        </span>
        <div className="flex gap-2">
          {stored && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              ลบค่า
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
          >
            บันทึก
          </button>
        </div>
      </div>
    </section>
  );
};

const fromDefaults = (
  d: IncomeDefaults,
): Record<keyof IncomeDefaults, string> => ({
  salary: formatDefault(d.salary),
  tax: formatDefault(d.tax),
  socialSecurity: formatDefault(d.socialSecurity),
  providentFund: formatDefault(d.providentFund),
  gsl: formatDefault(d.gsl),
});

export default IncomeDefaultsSection;
