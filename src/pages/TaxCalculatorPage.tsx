import { useMemo, useState, type ReactNode } from 'react';

import { TaxAllowanceForm } from '@/components/forms/TaxAllowanceForm';
import {
  useAvailableYears,
  useSelectedYear,
  useYearSummary,
} from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { formatNumber, formatPercent, formatTHB } from '@/utils/formatters';
import {
  calculateThaiPIT,
  EMPTY_TAX_ALLOWANCES,
  resolveTaxAllowances,
} from '@/utils/taxCalculator';

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
  const [includeOtherIncome, setIncludeOtherIncome] = useState(false);

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

  const storedAllowances = useFinanceStore(
    (s) => s.data.taxAllowances?.[String(selectedYear)],
  );
  const allowanceInputs = storedAllowances ?? EMPTY_TAX_ALLOWANCES;
  const setTaxAllowances = useFinanceStore((s) => s.setTaxAllowances);

  const grossIncome =
    summary.salary +
    (includeBonus ? summary.bonus : 0) +
    (includeCommission ? summary.commission : 0) +
    (includeOtherIncome ? summary.otherIncome : 0);

  const resolvedAllowances = useMemo(
    () =>
      resolveTaxAllowances(
        allowanceInputs,
        grossIncome,
        deductionBreakdown.socialSecurity,
        deductionBreakdown.providentFund,
      ),
    [allowanceInputs, grossIncome, deductionBreakdown],
  );

  const result = useMemo(
    () =>
      calculateThaiPIT({
        income: grossIncome,
        socialSecurity: deductionBreakdown.socialSecurity,
        providentFund: deductionBreakdown.providentFund,
        extraAllowances: resolvedAllowances.total,
      }),
    [grossIncome, deductionBreakdown, resolvedAllowances],
  );

  // Actual tax withheld in the year (sum of monthly tax fields).
  const actualTax = deductionBreakdown.tax;
  const variance = result.totalTax - actualTax;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">
          🧮 คำนวณภาษีเงินได้บุคคลธรรมดา
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          ตามตารางภาษีก้าวหน้า (Thailand PIT) — ใช้ข้อมูลรายได้จริงในปีที่เลือก
        </p>
      </header>

      <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-700">ปี:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary-ink/30"
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
              className="h-4 w-4 rounded border-ink-300 text-primary-ink focus:ring-primary-ink"
            />
            <span className="text-sm text-ink-700">
              รวมโบนัส{' '}
              <span className="text-ink-400 tabular-nums">
                ({formatTHB(summary.bonus)})
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeCommission}
              onChange={(e) => setIncludeCommission(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-primary-ink focus:ring-primary-ink"
            />
            <span className="text-sm text-ink-700">
              รวมคอม{' '}
              <span className="text-ink-400 tabular-nums">
                ({formatTHB(summary.commission)})
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeOtherIncome}
              onChange={(e) => setIncludeOtherIncome(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-primary-ink focus:ring-primary-ink"
            />
            <span className="text-sm text-ink-700">
              รายได้อื่นๆ{' '}
              <span className="text-ink-400 tabular-nums">
                ({formatTHB(summary.otherIncome)})
              </span>
            </span>
          </label>
        </div>

      </section>

      <TaxAllowanceForm
        value={allowanceInputs}
        lines={resolvedAllowances.lines}
        onChange={(next) => setTaxAllowances(selectedYear, next)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">รายได้และลดหย่อน</h2>
          <Row label="รายได้รวม (assessable)" value={result.grossIncome} bold />
          <hr className="border-ink-100" />
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
          {resolvedAllowances.lines
            .filter((l) => l.applied > 0)
            .map((l) => (
              <Row key={l.key} label={`หัก${l.label}`} value={-l.applied} tone="muted" />
            ))}
          <hr className="border-ink-200" />
          <Row label="เงินได้สุทธิ (taxable)" value={result.taxableIncome} bold />
        </section>

        <section className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-3">
          <h2 className="text-lg font-semibold text-ink-900">สรุปภาษี</h2>
          <div className="rounded-xl bg-primary-50 p-4">
            <div className="text-xs text-primary-ink uppercase tracking-wider">
              ภาษีที่ต้องเสีย (estimate)
            </div>
            <div className="text-3xl font-bold text-primary-ink tabular-nums mt-1">
              {formatTHB(result.totalTax)}
            </div>
            <div className="text-xs text-ink-600 mt-1">
              อัตราเฉลี่ย {formatPercent(result.effectiveRate)}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Row
              label="ภาษีที่จ่ายจริงในปีนี้"
              value={actualTax}
              tone="muted"
            />
            <hr className="border-ink-200" />
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold text-ink-700">
                {variance > 0 ? '🟠 ต้องจ่ายเพิ่ม' : variance < 0 ? '🟢 ขอคืนได้' : '✅ ตรงพอดี'}
              </span>
              <span
                className={`text-xl font-bold tabular-nums ${
                  variance > 0 ? 'text-expense-ink' : variance < 0 ? 'text-income-ink' : 'text-ink-700'
                }`}
              >
                {variance === 0 ? '—' : formatTHB(Math.abs(variance))}
              </span>
            </div>
            <p className="text-xs text-ink-400 leading-relaxed">
              ภาษีหัก ณ ที่จ่ายรายเดือนเป็นการประมาณ — ตอนยื่นแบบ ภงด.91/90
              ปลายปีจะเทียบกับยอดที่ต้องเสียจริง ส่วนต่างเป็นเงินคืน/เงินค้างชำระ
            </p>
          </div>
        </section>
      </div>

      <section className="bg-card rounded-2xl border border-ink-200 shadow-sm overflow-hidden">
        <header className="px-6 py-3 border-b border-ink-200">
          <h2 className="text-lg font-semibold text-ink-900">
            แบ่งตาม bracket
          </h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wider text-ink-500">
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
                  className={`border-t border-ink-100 ${active ? '' : 'opacity-50'}`}
                >
                  <td className="px-4 py-2 text-ink-700">{rangeLabel}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                    {`${Math.round(b.rate * 100)}%`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-700">
                    {b.taxableInBracket === 0 ? '—' : formatTHB(b.taxableInBracket)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-ink-900">
                    {b.taxFromBracket === 0 ? '—' : formatTHB(b.taxFromBracket)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-ink-300 bg-surface font-bold">
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
    <span className={`text-sm ${tone === 'muted' ? 'text-ink-500' : 'text-ink-700'}`}>
      {label}
    </span>
    <span
      className={`tabular-nums ${
        bold ? 'text-base font-bold text-ink-900' : 'text-sm text-ink-700'
      }`}
    >
      {value < 0 ? `−${formatTHB(Math.abs(value))}` : formatTHB(value)}
    </span>
  </div>
);

export default TaxCalculatorPage;
