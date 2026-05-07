import { useMemo, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { selectMonthSummary } from '@/stores/selectors';
import type { WealthLensData } from '@/types';
import { formatTHB, formatNumber } from '@/utils/formatters';

interface YearRow {
  year: number;
  salary: number;
  bonus: number;
  commission: number;
  tax: number;
  socialSecurity: number;
  providentFund: number;
  gsl: number;
  totalDeductions: number;
  netSalary: number;
  netAll: number;
  totalExpenses: number;
  /** Sum of MonthlySavings items across the year (Dime, ออมเที่ยว, ...). */
  totalSavings: number;
  /** Derived "เหลือจริง" — Net.All − จ่าย. Kept ≠ this; Kept is manual. */
  remaining: number;
}

const ZERO_TOTALS = (year: number): YearRow => ({
  year,
  salary: 0,
  bonus: 0,
  commission: 0,
  tax: 0,
  socialSecurity: 0,
  providentFund: 0,
  gsl: 0,
  totalDeductions: 0,
  netSalary: 0,
  netAll: 0,
  totalExpenses: 0,
  totalSavings: 0,
  remaining: 0,
});

const buildYearRow = (data: WealthLensData, year: number): YearRow => {
  const row = ZERO_TOTALS(year);
  const yr = data.years[String(year)];
  if (!yr) return row;

  for (const income of yr.income) {
    row.salary += income.salary;
    row.bonus += income.bonus;
    row.commission += income.commission;
    row.tax += income.deductions.tax;
    row.socialSecurity += income.deductions.socialSecurity;
    row.providentFund += income.deductions.providentFund;
    row.gsl += income.deductions.gsl;
  }

  const monthsTouched = new Set<number>();
  for (const i of yr.income) monthsTouched.add(i.month);
  for (const e of yr.expenses) monthsTouched.add(e.month);
  for (const s of yr.savings ?? []) monthsTouched.add(s.month);

  for (const month of monthsTouched) {
    const summary = selectMonthSummary({ data }, year, month);
    row.totalDeductions += summary.totalDeductions;
    row.netSalary += summary.netSalary;
    row.netAll += summary.netAll;
    row.totalExpenses += summary.totalExpenses;
    row.totalSavings += summary.totalSavings;
    row.remaining += summary.remaining;
  }

  return row;
};

const sumRows = (rows: ReadonlyArray<YearRow>): YearRow => {
  const total = ZERO_TOTALS(0);
  for (const r of rows) {
    total.salary += r.salary;
    total.bonus += r.bonus;
    total.commission += r.commission;
    total.tax += r.tax;
    total.socialSecurity += r.socialSecurity;
    total.providentFund += r.providentFund;
    total.gsl += r.gsl;
    total.totalDeductions += r.totalDeductions;
    total.netSalary += r.netSalary;
    total.netAll += r.netAll;
    total.totalExpenses += r.totalExpenses;
    total.totalSavings += r.totalSavings;
    total.remaining += r.remaining;
  }
  return total;
};

interface MoneyCellProps {
  value: number;
  bold?: boolean;
  muted?: boolean;
}

const MoneyCell = ({
  value,
  bold = false,
  muted = false,
}: MoneyCellProps): ReactNode => (
  <td
    className={`px-3 py-2 text-right tabular-nums ${
      bold ? 'font-bold text-slate-900' : 'text-slate-700'
    } ${muted && value === 0 ? 'text-slate-300' : ''}`}
  >
    {value === 0 ? '—' : formatTHB(value)}
  </td>
);

export const AllYearsSummary = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const keptBalances = useGoalsStore((s) => s.keptBalances);
  const setKeptBalance = useGoalsStore((s) => s.setKeptBalance);
  const clearKeptBalance = useGoalsStore((s) => s.clearKeptBalance);

  const { rows, totals, remainingTotal, keptTotal } = useMemo(() => {
    const years = Object.keys(data.years)
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y))
      .sort((a, b) => a - b);
    const computed = years.map((y) => buildYearRow(data, y));
    // "เหลือจริง" rollup excludes years with no expense data — those values
    // are unknowable, not zero, so summing them would inflate the total.
    const remainingOnlyTracked = computed
      .filter((r) => r.totalExpenses > 0)
      .reduce((acc, r) => acc + r.remaining, 0);
    // Kept rollup = sum of manually-entered Krungsri savings balances.
    const keptSum = computed.reduce(
      (acc, r) => acc + (keptBalances[String(r.year)] ?? 0),
      0,
    );
    return {
      rows: computed,
      totals: sumRows(computed),
      remainingTotal: remainingOnlyTracked,
      keptTotal: keptSum,
    };
  }, [data, keptBalances]);

  const handleEditKept = (year: number): void => {
    const current = keptBalances[String(year)];
    const promptMsg = `ใส่ยอดบัญชี Kept (กรุงศรี) สำหรับปี ${year} — เว้นว่างเพื่อลบ`;
    const raw = window.prompt(promptMsg, current ? formatNumber(current) : '');
    if (raw === null) return; // user cancelled
    const trimmed = raw.trim();
    if (trimmed === '') {
      clearKeptBalance(year);
      return;
    }
    const parsed = Number(trimmed.replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed >= 0) {
      setKeptBalance(year, parsed);
    } else {
      window.alert('กรอกตัวเลขที่ถูกต้อง');
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="bg-amber-100 px-6 py-3 border-b border-amber-200">
        <h2 className="text-lg font-bold text-amber-900 text-center">
          รายรับ – รายจ่าย (ภาพรวมทุกปี)
        </h2>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-50 text-amber-900 border-b border-amber-200">
              <th
                rowSpan={2}
                className="px-3 py-2 text-left font-semibold align-middle border-r border-amber-200"
              >
                ปี
              </th>
              <th
                colSpan={3}
                className="px-3 py-2 text-center font-semibold border-r border-amber-200"
              >
                เงินได้
              </th>
              <th
                colSpan={5}
                className="px-3 py-2 text-center font-semibold border-r border-amber-200"
              >
                ค่าใช้จ่าย (หัก)
              </th>
              <th
                colSpan={6}
                className="px-3 py-2 text-center font-semibold"
              >
                ยอดรวม
              </th>
            </tr>
            <tr className="bg-amber-50 text-amber-900 border-b border-amber-200 text-xs">
              <th className="px-3 py-2 text-right font-semibold">เงินเดือน</th>
              <th className="px-3 py-2 text-right font-semibold">โบนัส</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-amber-200">
                คอม
              </th>
              <th className="px-3 py-2 text-right font-semibold">ภาษี</th>
              <th className="px-3 py-2 text-right font-semibold">ประกันสังคม</th>
              <th className="px-3 py-2 text-right font-semibold">กองทุน</th>
              <th className="px-3 py-2 text-right font-semibold">กยศ</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-amber-200">
                รวมหัก
              </th>
              <th className="px-3 py-2 text-right font-semibold">Net.</th>
              <th className="px-3 py-2 text-right font-semibold">Net. All</th>
              <th className="px-3 py-2 text-right font-semibold">จ่าย</th>
              <th
                className="px-3 py-2 text-right font-semibold"
                title="รวมยอดออม + ลงทุน (Dime, ออมเที่ยว, ฯลฯ)"
              >
                ออม/ลงทุน
              </th>
              <th className="px-3 py-2 text-right font-semibold">เหลือจริง</th>
              <th
                className="px-3 py-2 text-right font-semibold"
                title="ยอดบัญชี Kept (กรุงศรี) — กรอกเอง"
              >
                Kept 💰
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.year}
                className={`border-b border-slate-100 hover:bg-slate-50 ${
                  idx % 2 === 1 ? 'bg-amber-50/30' : ''
                }`}
              >
                <td className="px-3 py-2 font-semibold text-slate-900 border-r border-slate-100">
                  {r.year}
                </td>
                <MoneyCell value={r.salary} />
                <MoneyCell value={r.bonus} muted />
                <MoneyCell value={r.commission} />
                <MoneyCell value={r.tax} muted />
                <MoneyCell value={r.socialSecurity} muted />
                <MoneyCell value={r.providentFund} muted />
                <MoneyCell value={r.gsl} muted />
                <MoneyCell value={r.totalDeductions} />
                <MoneyCell value={r.netSalary} />
                <MoneyCell value={r.netAll} bold />
                <MoneyCell value={r.totalExpenses} />
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.totalSavings > 0
                      ? 'text-savings font-medium'
                      : 'text-slate-300'
                  }`}
                  title="รวมยอดออม + ลงทุน ปีนี้"
                >
                  {r.totalSavings === 0 ? '—' : formatTHB(r.totalSavings)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.totalExpenses === 0
                      ? 'text-slate-300 italic'
                      : r.remaining > 0
                        ? 'text-income'
                        : r.remaining < 0
                          ? 'text-expense'
                          : 'text-slate-300'
                  }`}
                  title={
                    r.totalExpenses === 0
                      ? 'ไม่มีข้อมูลค่าใช้จ่ายปีนี้ — เหลือจริงคำนวณไม่ได้'
                      : 'Net. All − จ่าย'
                  }
                >
                  {r.totalExpenses === 0 ? '—' : formatTHB(r.remaining)}
                </td>
                {(() => {
                  const balance = keptBalances[String(r.year)];
                  const hasValue = balance !== undefined && balance > 0;
                  return (
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold cursor-pointer hover:bg-amber-100/40 transition ${
                        hasValue ? 'text-savings' : 'text-slate-300'
                      }`}
                      onClick={() => handleEditKept(r.year)}
                      title="คลิกเพื่อใส่/แก้ยอดบัญชี Kept (กรุงศรี)"
                    >
                      {hasValue ? formatTHB(balance) : '+ ใส่ยอด'}
                    </td>
                  );
                })()}
              </tr>
            ))}

            <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold">
              <td className="px-3 py-3 text-amber-900 border-r border-amber-200">
                รวม
              </td>
              <MoneyCell value={totals.salary} bold />
              <MoneyCell value={totals.bonus} bold />
              <MoneyCell value={totals.commission} bold />
              <MoneyCell value={totals.tax} bold />
              <MoneyCell value={totals.socialSecurity} bold />
              <MoneyCell value={totals.providentFund} bold />
              <MoneyCell value={totals.gsl} bold />
              <MoneyCell value={totals.totalDeductions} bold />
              <MoneyCell value={totals.netSalary} bold />
              <MoneyCell value={totals.netAll} bold />
              <MoneyCell value={totals.totalExpenses} bold />
              <td
                className={`px-3 py-3 text-right tabular-nums font-bold ${
                  totals.totalSavings > 0 ? 'text-savings' : 'text-slate-300'
                }`}
                title="ผลรวมออม/ลงทุนทุกปี"
              >
                {totals.totalSavings === 0 ? '—' : formatTHB(totals.totalSavings)}
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums font-bold ${
                  remainingTotal > 0 ? 'text-income' : 'text-expense'
                }`}
                title="ผลรวมเหลือจริง เฉพาะปีที่มีข้อมูลค่าใช้จ่าย"
              >
                {remainingTotal === 0 ? '—' : formatTHB(remainingTotal)}
              </td>
              <td
                className="px-3 py-3 text-right tabular-nums font-bold text-savings"
                title="ผลรวมยอด Kept ที่กรอกไว้"
              >
                {keptTotal === 0 ? '—' : formatTHB(keptTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="px-6 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-200 space-y-1">
        <div>
          Net. = (เงินเดือน + โบนัส) − รวมหัก · Net. All = Net. + คอม ·
          เหลือจริง = Net. All − จ่าย · ออม/ลงทุน = สะสมทั้งปี
        </div>
        <div>
          💰 <strong>Kept</strong> = ยอดบัญชี Kept (กรุงศรี) — กรอกเอง
          คลิกที่ cell เพื่อใส่/แก้
        </div>
      </footer>
    </section>
  );
};

export default AllYearsSummary;
