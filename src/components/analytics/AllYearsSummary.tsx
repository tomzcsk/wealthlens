import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFinanceStore } from '@/stores/financeStore';
import { EMPTY_BANK_ACCOUNTS } from '@/stores/emptyRefs';
import { selectMonthSummary } from '@/stores/selectors';
import type { WealthLensData } from '@/types';
import { sumBankYear } from '@/utils/bankAccounts';
import { formatTHB } from '@/utils/formatters';

interface YearRow {
  year: number;
  salary: number;
  bonus: number;
  commission: number;
  otherIncome: number;
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
  otherIncome: 0,
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
    row.otherIncome += income.otherIncome ?? 0;
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
    total.otherIncome += r.otherIncome;
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

/*
 * F47 — pinned first column (ปี) for phones. The pinned cell must be opaque
 * and must take its colour from the row (`bg-inherit`), otherwise the zebra /
 * totals rows show a wrong-coloured seam down the left edge. Every row below
 * therefore carries an opaque background of its own.
 */
const STICKY_COL = 'sticky left-0 z-10 bg-inherit shadow-[8px_0_8px_-8px_rgb(2_6_23_/_0.22)]';
const STICKY_CORNER = 'sticky left-0 z-20 bg-inherit shadow-[8px_0_8px_-8px_rgb(2_6_23_/_0.22)]';

/** The old zebra was `bg-warning-50/30` — translucent, so a pinned cell that
 *  inherited it let the scrolling numbers ghost through. `color-mix` bakes the
 *  identical composite (30% warning-50 over the card) into an opaque colour. */
const ZEBRA_ROW = 'bg-[color-mix(in_srgb,rgb(var(--c-warning-50))_30%,rgb(var(--bg-card)))]';

interface MoneyCellProps {
  value: number;
  bold?: boolean;
  muted?: boolean;
}

const MoneyCell = ({ value, bold = false, muted = false }: MoneyCellProps): ReactNode => (
  <td
    className={`px-3 py-2 text-right tabular-nums ${
      bold ? 'font-bold text-ink-900' : 'text-ink-700'
    } ${muted && value === 0 ? 'text-ink-300' : ''}`}
  >
    {value === 0 ? '—' : formatTHB(value)}
  </td>
);

export const AllYearsSummary = (): ReactNode => {
  const navigate = useNavigate();
  const data = useFinanceStore((s) => s.data);
  const setSelectedYear = useFinanceStore((s) => s.setSelectedYear);
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);

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
    // ธนาคาร rollup = sum across every bank account, across every year.
    const keptSum = computed.reduce((acc, r) => acc + sumBankYear(accounts, r.year), 0);
    return {
      rows: computed,
      totals: sumRows(computed),
      remainingTotal: remainingOnlyTracked,
      keptTotal: keptSum,
    };
  }, [data, accounts]);

  /**
   * Per-month editing lives on the Monthly page now (one row per month is
   * the natural editor for a sum-of-12-cells field). Clicking a year's
   * Kept cell selects that year and navigates there with January preselected
   * — Tom can then arrow through months and edit each one inline.
   */
  const handleEditKept = (year: number): void => {
    setSelectedYear(year);
    navigate('/monthly?month=1');
  };

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm overflow-hidden">
      <header className="bg-warning-100 px-6 py-3 border-b border-warning-200">
        <h2 className="text-lg font-bold text-warning-900 text-center">
          รายรับ – รายจ่าย (ภาพรวมทุกปี)
        </h2>
        <span className="md:hidden mt-0.5 block text-center text-[10px] font-normal text-ink-400">
          เลื่อนดูคอลัมน์อื่น →
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warning-50 text-warning-900 border-b border-warning-200">
              <th
                rowSpan={2}
                className={`px-3 py-2 text-left font-semibold align-middle border-r border-warning-200 ${STICKY_CORNER}`}
              >
                ปี
              </th>
              <th
                colSpan={4}
                className="px-3 py-2 text-center font-semibold border-r border-warning-200"
              >
                เงินได้
              </th>
              <th
                colSpan={5}
                className="px-3 py-2 text-center font-semibold border-r border-warning-200"
              >
                ค่าใช้จ่าย (หัก)
              </th>
              <th colSpan={6} className="px-3 py-2 text-center font-semibold">
                ยอดรวม
              </th>
            </tr>
            <tr className="bg-warning-50 text-warning-900 border-b border-warning-200 text-xs">
              <th className="px-3 py-2 text-right font-semibold">เงินเดือน</th>
              <th className="px-3 py-2 text-right font-semibold">โบนัส</th>
              <th className="px-3 py-2 text-right font-semibold">คอม</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-warning-200">
                รายได้อื่น
              </th>
              <th className="px-3 py-2 text-right font-semibold">ภาษี</th>
              <th className="px-3 py-2 text-right font-semibold">ประกันสังคม</th>
              <th className="px-3 py-2 text-right font-semibold">กองทุน</th>
              <th className="px-3 py-2 text-right font-semibold">อื่นๆ</th>
              <th className="px-3 py-2 text-right font-semibold border-r border-warning-200">
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
                title="ยอดรวมทุกบัญชีธนาคาร — กรอกเอง"
              >
                ธนาคาร 💰
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.year}
                className={`border-b border-ink-100 hover:bg-hover ${
                  idx % 2 === 1 ? ZEBRA_ROW : 'bg-card'
                }`}
              >
                <td
                  className={`px-3 py-2 font-semibold text-ink-900 border-r border-ink-100 ${STICKY_COL}`}
                >
                  {r.year}
                </td>
                <MoneyCell value={r.salary} />
                <MoneyCell value={r.bonus} muted />
                <MoneyCell value={r.commission} />
                <MoneyCell value={r.otherIncome} muted />
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
                    r.totalSavings > 0 ? 'text-savings-ink font-medium' : 'text-ink-300'
                  }`}
                  title="รวมยอดออม + ลงทุน ปีนี้"
                >
                  {r.totalSavings === 0 ? '—' : formatTHB(r.totalSavings)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.totalExpenses === 0
                      ? 'text-ink-300 italic'
                      : r.remaining > 0
                        ? 'text-income-ink'
                        : r.remaining < 0
                          ? 'text-expense-ink'
                          : 'text-ink-300'
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
                  const annual = sumBankYear(accounts, r.year);
                  const hasValue = annual !== 0;
                  return (
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold cursor-pointer hover:bg-warning-100/40 transition ${
                        hasValue
                          ? annual > 0
                            ? 'text-savings-ink'
                            : 'text-expense-ink'
                          : 'text-ink-300'
                      }`}
                      onClick={() => handleEditKept(r.year)}
                      title="คลิกเพื่อแก้ไขรายเดือนใน Monthly page"
                    >
                      {hasValue ? formatTHB(annual) : '+ ใส่ยอด'}
                    </td>
                  );
                })()}
              </tr>
            ))}

            <tr className="bg-warning-100 border-t-2 border-warning-300 font-bold">
              <td
                className={`px-3 py-3 text-warning-900 border-r border-warning-200 ${STICKY_COL}`}
              >
                รวม
              </td>
              <MoneyCell value={totals.salary} bold />
              <MoneyCell value={totals.bonus} bold />
              <MoneyCell value={totals.commission} bold />
              <MoneyCell value={totals.otherIncome} bold />
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
                  totals.totalSavings > 0 ? 'text-savings-ink' : 'text-ink-300'
                }`}
                title="ผลรวมออม/ลงทุนทุกปี"
              >
                {totals.totalSavings === 0 ? '—' : formatTHB(totals.totalSavings)}
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums font-bold ${
                  remainingTotal > 0 ? 'text-income-ink' : 'text-expense-ink'
                }`}
                title="ผลรวมเหลือจริง เฉพาะปีที่มีข้อมูลค่าใช้จ่าย"
              >
                {remainingTotal === 0 ? '—' : formatTHB(remainingTotal)}
              </td>
              <td
                className="px-3 py-3 text-right tabular-nums font-bold text-savings-ink"
                title="ผลรวมยอดธนาคารที่กรอกไว้"
              >
                {keptTotal === 0 ? '—' : formatTHB(keptTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="px-6 py-2 text-xs text-ink-500 bg-surface border-t border-ink-200 space-y-1">
        <div>
          Net. = (เงินเดือน + โบนัส) − รวมหัก · Net. All = Net. + คอม · เหลือจริง = Net. All − จ่าย
          · ออม/ลงทุน = สะสมทั้งปี
        </div>
        <div>
          💰 <strong>ธนาคาร</strong> = ผลรวมยอดรายเดือนของทุกบัญชีธนาคาร — คลิกที่ cell
          เพื่อไปแก้รายเดือนที่หน้า Monthly
        </div>
      </footer>
    </section>
  );
};

export default AllYearsSummary;
