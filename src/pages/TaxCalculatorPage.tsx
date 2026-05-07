import { useMemo, useState, type ReactNode } from 'react';

import {
  useAvailableYears,
  useSelectedYear,
  useYearSummary,
} from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { formatNumber, formatPercent, formatTHB } from '@/utils/formatters';
import { calculateThaiPIT } from '@/utils/taxCalculator';

interface DeductionBreakdown {
  tax: number;
  socialSecurity: number;
  providentFund: number;
  gsl: number;
}

export const TaxCalculatorPage = (): ReactNode => {
  const availableYears = useAvailableYears();
  const selectedYear = useSelectedYear();
  const setSelectedYear = useFinanceStore((s) => s.setSelectedYear);

  const [includeBonus, setIncludeBonus] = useState(false);
  const [includeCommission, setIncludeCommission] = useState(false);
  const [extraInput, setExtraInput] = useState('');

  const summary = useYearSummary(selectedYear);
  const data = useFinanceStore((s) => s.data);

  // Break out the deduction lines from the raw data — YearSummary only
  // exposes the aggregate `totalDeductions`, but tax/SS/PF/GSL are needed
  // separately for the tax calculator's allowance caps + the actual-vs-
  // calculated comparison.
  const deductionBreakdown = useMemo<DeductionBreakdown>(() => {
    const yr = data.years[String(selectedYear)];
    if (!yr) return { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 };
    let tax = 0;
    let socialSecurity = 0;
    let providentFund = 0;
    let gsl = 0;
    for (const i of yr.income) {
      tax += i.deductions.tax;
      socialSecurity += i.deductions.socialSecurity;
      providentFund += i.deductions.providentFund;
      gsl += i.deductions.gsl;
    }
    return { tax, socialSecurity, providentFund, gsl };
  }, [data, selectedYear]);

  const extraAllowances = useMemo(() => {
    const cleaned = extraInput.replace(/,/g, '').trim();
    if (cleaned === '') return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [extraInput]);

  const result = useMemo(() => {
    const income =
      summary.salary +
      (includeBonus ? summary.bonus : 0) +
      (includeCommission ? summary.commission : 0);
    return calculateThaiPIT({
      income,
      socialSecurity: deductionBreakdown.socialSecurity,
      providentFund: deductionBreakdown.providentFund,
      extraAllowances,
    });
  }, [summary, includeBonus, includeCommission, extraAllowances, deductionBreakdown]);

  // Actual tax withheld in the year (sum of monthly tax fields).
  const actualTax = deductionBreakdown.tax;
  const variance = result.totalTax - actualTax;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          🧮 คำนวณภาษีเงินได้บุคคลธรรมดา
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          ตามตารางภาษีก้าวหน้า (Thailand PIT) — ใช้ข้อมูลรายได้จริงในปีที่เลือก
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">ปี:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeBonus}
              onChange={(e) => setIncludeBonus(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">
              รวมโบนัส{' '}
              <span className="text-slate-400 tabular-nums">
                ({formatTHB(summary.bonus)})
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeCommission}
              onChange={(e) => setIncludeCommission(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-slate-700">
              รวมคอม{' '}
              <span className="text-slate-400 tabular-nums">
                ({formatTHB(summary.commission)})
              </span>
            </span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            ลดหย่อนเพิ่มเติม (ประกัน, RMF, SSF, ลูก, คู่สมรส, etc.)
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={extraInput}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              setExtraInput(digits ? formatNumber(Number(digits)) : '');
            }}
            placeholder="0"
            className="mt-1 w-full md:w-64 rounded-lg border border-slate-300 px-3 py-2 text-base tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">รายได้และลดหย่อน</h2>
          <Row label="รายได้รวม (assessable)" value={result.grossIncome} bold />
          <hr className="border-slate-100" />
          <Row
            label={`หักค่าใช้จ่าย 50% (max ${formatNumber(100_000)})`}
            value={-result.expenseAllowance}
            tone="muted"
          />
          <Row
            label="หักลดหย่อนส่วนตัว"
            value={-result.personalAllowance}
            tone="muted"
          />
          <Row
            label="หักประกันสังคม (max 9,000)"
            value={-result.socialSecurityAllowance}
            tone="muted"
          />
          <Row
            label="หักกองทุนสำรองเลี้ยงชีพ"
            value={-result.providentFundAllowance}
            tone="muted"
          />
          {result.extraAllowances > 0 && (
            <Row
              label="หักลดหย่อนอื่นๆ"
              value={-result.extraAllowances}
              tone="muted"
            />
          )}
          <hr className="border-slate-200" />
          <Row label="เงินได้สุทธิ (taxable)" value={result.taxableIncome} bold />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">สรุปภาษี</h2>
          <div className="rounded-xl bg-primary-light p-4">
            <div className="text-xs text-primary uppercase tracking-wider">
              ภาษีที่ต้องเสีย (estimate)
            </div>
            <div className="text-3xl font-bold text-primary tabular-nums mt-1">
              {formatTHB(result.totalTax)}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              อัตราเฉลี่ย {formatPercent(result.effectiveRate)}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Row
              label="ภาษีที่จ่ายจริงในปีนี้"
              value={actualTax}
              tone="muted"
            />
            <hr className="border-slate-200" />
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-slate-700">
                {variance > 0 ? '🟠 ต้องจ่ายเพิ่ม' : variance < 0 ? '🟢 ขอคืนได้' : '✅ ตรงพอดี'}
              </span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  variance > 0 ? 'text-expense' : variance < 0 ? 'text-income' : 'text-slate-700'
                }`}
              >
                {variance === 0 ? '—' : formatTHB(Math.abs(variance))}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              ภาษีหัก ณ ที่จ่ายรายเดือนเป็นการประมาณ — ตอนยื่นแบบ ภงด.91/90
              ปลายปีจะเทียบกับยอดที่ต้องเสียจริง ส่วนต่างเป็นเงินคืน/เงินค้างชำระ
            </p>
          </div>
        </section>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <header className="px-6 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            แบ่งตาม bracket
          </h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">ช่วงเงินได้สุทธิ</th>
              <th className="px-4 py-2 text-right font-semibold">อัตรา</th>
              <th className="px-4 py-2 text-right font-semibold">เงินที่ตกใน bracket</th>
              <th className="px-4 py-2 text-right font-semibold">ภาษี</th>
            </tr>
          </thead>
          <tbody>
            {result.brackets.map((b) => {
              const active = b.taxableInBracket > 0;
              const rangeLabel = b.max
                ? `${formatNumber(b.min)} – ${formatNumber(b.max)}`
                : `${formatNumber(b.min)}+`;
              return (
                <tr
                  key={`${b.min}-${b.max ?? 'max'}`}
                  className={`border-t border-slate-100 ${active ? '' : 'opacity-50'}`}
                >
                  <td className="px-4 py-2 text-slate-700">{rangeLabel}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {`${Math.round(b.rate * 100)}%`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                    {b.taxableInBracket === 0 ? '—' : formatTHB(b.taxableInBracket)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                    {b.taxFromBracket === 0 ? '—' : formatTHB(b.taxFromBracket)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="px-4 py-3" colSpan={3}>
                รวม
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatTHB(result.totalTax)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
};

interface RowProps {
  label: string;
  value: number;
  bold?: boolean;
  tone?: 'default' | 'muted';
}

const Row = ({ label, value, bold = false, tone = 'default' }: RowProps): ReactNode => (
  <div className="flex items-center justify-between">
    <span className={`text-sm ${tone === 'muted' ? 'text-slate-500' : 'text-slate-700'}`}>
      {label}
    </span>
    <span
      className={`tabular-nums ${
        bold ? 'text-base font-bold text-slate-900' : 'text-sm text-slate-700'
      }`}
    >
      {value < 0 ? `−${formatTHB(Math.abs(value))}` : formatTHB(value)}
    </span>
  </div>
);

export default TaxCalculatorPage;
