/**
 * WealthLens — Print Report Page (F17).
 *
 * A self-contained, print-optimized annual financial report. Lives at
 * `/report/:year` *outside* the main `<Layout>` so the printed PDF has no
 * sidebar/header chrome. The browser's native "Print → Save as PDF" handles
 * Thai font rendering perfectly (Inter + Noto Sans Thai are already loaded
 * by the app shell), so we don't need jsPDF / react-pdf.
 *
 * Two display modes:
 *   - Default (preview): renders the report on screen with a "Print Now"
 *     button (class `no-print` so it never appears in the PDF).
 *   - `?print=1`: auto-fires `window.print()` after a short settle delay so
 *     web fonts have time to load before paint.
 *
 * Hook usage follows the safety pattern documented at the top of
 * `src/hooks/useFinanceData.ts`: only stable selectors are used so we never
 * trip Zustand's `Object.is` equality and infinite-loop.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import { useFinanceStore } from '@/stores/financeStore';
import {
  useAvailableYears,
  useExpenseByCategory,
  useMonthlySummariesForYear,
  useSubscriptions,
  useYearSummary,
} from '@/hooks/useFinanceData';
import { useToastStore } from '@/stores/toastStore';
import {
  EXPENSE_CATEGORIES,
  CATEGORY_ORDER,
} from '@/types/expense-categories';
import {
  THAI_MONTHS_SHORT,
  formatNumber,
  formatTHB,
  formatThaiDate,
} from '@/utils/formatters';

/** Auto-print delay — gives web fonts time to load before the print dialog. */
const AUTO_PRINT_DELAY_MS = 300;

/** Top-N subscriptions to show on the report. */
const TOP_SUBSCRIPTIONS = 5;

const PRINT_STYLES = `
  @page { size: A4 portrait; margin: 16mm 14mm; }

  @media print {
    html, body { background: white !important; }
    body, * { color: #0F172A !important; }
    .no-print { display: none !important; }
    .page-break { page-break-after: always; break-after: page; }
    .print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
    table { page-break-inside: auto; }
    tr, td, th { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
  }

  @media screen {
    body { background: #f1f5f9; }
    .print-page {
      max-width: 210mm;
      margin: 24px auto;
      padding: 20mm 16mm;
      background: white;
      box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
      border-radius: 4px;
    }
  }
`;

const HEADER_CELL =
  'px-2 py-1.5 text-right font-semibold text-slate-700 border-b border-slate-300 tabular-nums';
const HEADER_CELL_LEFT =
  'px-2 py-1.5 text-left font-semibold text-slate-700 border-b border-slate-300';
const BODY_CELL =
  'px-2 py-1 text-right tabular-nums border-b border-slate-100';
const BODY_CELL_LEFT = 'px-2 py-1 text-left border-b border-slate-100';

interface CategoryRowVm {
  category: string;
  label: string;
  icon: string;
  amount: number;
  pct: number;
  hex: string;
}

const PrintReportPage = (): ReactNode => {
  const { year: yearParam } = useParams<{ year: string }>();
  const [searchParams] = useSearchParams();
  const availableYears = useAvailableYears();
  const pushToast = useToastStore((s) => s.push);

  // Parse + validate year. We can't early-return before the hooks below
  // (rules of hooks), so we resolve to a "safe" year for the hook calls and
  // gate the actual render with `isValidYear`.
  const parsedYear = Number(yearParam);
  const dataYears = useFinanceStore((s) => s.data.years);
  const isValidYear =
    Number.isFinite(parsedYear) && Boolean(dataYears[String(parsedYear)]);
  const safeYear = isValidYear
    ? parsedYear
    : availableYears[availableYears.length - 1] ?? new Date().getFullYear();

  const summary = useYearSummary(safeYear);
  const monthlyRows = useMonthlySummariesForYear(safeYear);
  const expenseByCategory = useExpenseByCategory(undefined, safeYear);
  const subscriptions = useSubscriptions(safeYear);

  // Toast on bad URL — fire once, then redirect via <Navigate />.
  useEffect(() => {
    if (!isValidYear) {
      pushToast({ tone: 'error', message: 'ปีนี้ไม่มีข้อมูล' });
    }
  }, [isValidYear, pushToast]);

  // Auto-print mode — give the page a beat to settle before firing the dialog.
  const autoPrint = searchParams.get('print') === '1';
  useEffect(() => {
    if (!isValidYear || !autoPrint) return;
    const t = window.setTimeout(() => {
      window.print();
    }, AUTO_PRINT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [autoPrint, isValidYear]);

  // Derive table totals + percentages once per render.
  const tableTotals = useMemo(() => {
    const totals = monthlyRows.reduce(
      (acc, row) => {
        acc.salary += 0; // salary not on MonthSummary — pulled separately below
        acc.totalDeductions += row.totalDeductions;
        acc.netSalary += row.netSalary;
        acc.netAll += row.netAll;
        acc.totalExpenses += row.totalExpenses;
        acc.remaining += row.remaining;
        return acc;
      },
      {
        salary: 0,
        totalDeductions: 0,
        netSalary: 0,
        netAll: 0,
        totalExpenses: 0,
        remaining: 0,
      },
    );
    return totals;
  }, [monthlyRows]);

  // Salary/bonus/commission per month — read directly from store snapshot
  // (already loaded above as `dataYears`, no extra subscription needed).
  const incomeByMonth = useMemo(() => {
    const yr = dataYears[String(safeYear)];
    const map = new Map<
      number,
      { salary: number; bonus: number; commission: number }
    >();
    if (!yr) return map;
    for (const inc of yr.income) {
      map.set(inc.month, {
        salary: inc.salary,
        bonus: inc.bonus,
        commission: inc.commission,
      });
    }
    return map;
  }, [dataYears, safeYear]);

  const categoryRows = useMemo<CategoryRowVm[]>(() => {
    const total = CATEGORY_ORDER.reduce(
      (acc, c) => acc + expenseByCategory[c],
      0,
    );
    return CATEGORY_ORDER.map((cat) => {
      const meta = EXPENSE_CATEGORIES[cat];
      const amount = expenseByCategory[cat];
      return {
        category: cat,
        label: meta.label,
        icon: meta.icon,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        hex: meta.hex,
      };
    })
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [expenseByCategory]);

  const topSubs = useMemo(
    () => subscriptions.slice(0, TOP_SUBSCRIPTIONS),
    [subscriptions],
  );

  const avgMonthlyNet = useMemo(() => {
    if (summary.monthsWithData === 0) return 0;
    return summary.netAll / summary.monthsWithData;
  }, [summary]);

  const generatedAt = useMemo(() => formatThaiDate(new Date()), []);

  if (!isValidYear) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <style>{PRINT_STYLES}</style>

      {/* Top toolbar — never prints. */}
      <div className="no-print bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              WealthLens รายงานรายปี
            </span>
            <span className="ml-2 text-slate-500">ปี {safeYear}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <span aria-hidden="true">🖨️</span>
              พิมพ์
            </button>
          </div>
        </div>
      </div>

      <article className="print-page text-slate-900">
        {/* ── Header ───────────────────────────────────────────── */}
        <header className="flex items-end justify-between border-b-2 border-slate-900 pb-3 mb-6 avoid-break">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              รายงานสรุปการเงินรายปี
            </div>
            <h1 className="text-3xl font-bold mt-1">WealthLens — ปี {safeYear}</h1>
          </div>
          <div className="text-right text-xs text-slate-500 leading-tight">
            <div>สร้างเมื่อ</div>
            <div className="font-medium text-slate-700">{generatedAt}</div>
          </div>
        </header>

        {/* ── Year Summary ─────────────────────────────────────── */}
        <section className="avoid-break mb-6">
          <h2 className="text-base font-semibold text-slate-700 uppercase tracking-wide mb-3">
            สรุปรายปี
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 border border-slate-300 rounded p-4">
            <SummaryLine label="รายรับรวม (Net All)" value={summary.netAll} accent="net" />
            <SummaryLine label="ค่าใช้จ่ายทั้งหมด" value={summary.totalExpenses} accent="expense" />
            <SummaryLine label="เงินเดือน" value={summary.salary} />
            <SummaryLine label="โบนัส" value={summary.bonus} />
            <SummaryLine label="คอมมิชชั่น" value={summary.commission} />
            <SummaryLine label="รวมหัก" value={summary.totalDeductions} />
            <SummaryLine label="เหลือจริง (Kept)" value={summary.remaining} accent="kept" />
            <SummaryLine label="รายได้สุทธิเฉลี่ย" value={avgMonthlyNet} />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            จำนวนเดือนที่มีข้อมูล: <span className="tabular-nums font-medium">{summary.monthsWithData}</span>
          </p>
        </section>

        {/* ── Monthly Breakdown ───────────────────────────────── */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-slate-700 uppercase tracking-wide mb-3">
            แยกรายเดือน
          </h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className={HEADER_CELL_LEFT}>เดือน</th>
                <th className={HEADER_CELL}>เงินเดือน</th>
                <th className={HEADER_CELL}>โบนัส</th>
                <th className={HEADER_CELL}>คอม</th>
                <th className={HEADER_CELL}>หัก</th>
                <th className={HEADER_CELL}>Net.All</th>
                <th className={HEADER_CELL}>จ่าย</th>
                <th className={HEADER_CELL}>เหลือ</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map((row) => {
                const inc = incomeByMonth.get(row.month);
                return (
                  <tr key={row.month}>
                    <td className={BODY_CELL_LEFT}>{THAI_MONTHS_SHORT[row.month - 1]}</td>
                    <td className={BODY_CELL}>{inc ? formatNumber(inc.salary) : '—'}</td>
                    <td className={BODY_CELL}>{inc ? formatNumber(inc.bonus) : '—'}</td>
                    <td className={BODY_CELL}>{inc ? formatNumber(inc.commission) : '—'}</td>
                    <td className={BODY_CELL}>{formatNumber(row.totalDeductions)}</td>
                    <td className={BODY_CELL}>{formatNumber(row.netAll)}</td>
                    <td className={BODY_CELL}>{formatNumber(row.totalExpenses)}</td>
                    <td className={`${BODY_CELL} ${row.remaining < 0 ? 'text-expense font-semibold' : ''}`}>
                      {formatNumber(row.remaining)}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold border-t-2 border-slate-400">
                <td className="px-2 py-1.5 text-left">รวม</td>
                <td className={BODY_CELL}>{formatNumber(summary.salary)}</td>
                <td className={BODY_CELL}>{formatNumber(summary.bonus)}</td>
                <td className={BODY_CELL}>{formatNumber(summary.commission)}</td>
                <td className={BODY_CELL}>{formatNumber(tableTotals.totalDeductions)}</td>
                <td className={BODY_CELL}>{formatNumber(tableTotals.netAll)}</td>
                <td className={BODY_CELL}>{formatNumber(tableTotals.totalExpenses)}</td>
                <td className={BODY_CELL}>{formatNumber(tableTotals.remaining)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/*
          Page break hint — the monthly table is the densest section, so
          forcing the next two cards to a new page keeps the breakdown
          visually grouped on multi-page PDFs.
        */}
        <div className="page-break" />

        {/* ── Expense Breakdown by Category ─────────────────────── */}
        <section className="mb-6 avoid-break">
          <h2 className="text-base font-semibold text-slate-700 uppercase tracking-wide mb-3">
            ค่าใช้จ่ายแยกตามหมวด
          </h2>
          {categoryRows.length === 0 ? (
            <p className="text-sm text-slate-500 italic">ยังไม่มีค่าใช้จ่ายในปีนี้</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={HEADER_CELL_LEFT}>หมวดหมู่</th>
                  <th className={HEADER_CELL}>จำนวนเงิน</th>
                  <th className={HEADER_CELL}>%</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row) => (
                  <tr key={row.category}>
                    <td className={BODY_CELL_LEFT}>
                      <span
                        aria-hidden="true"
                        className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-2"
                        style={{ backgroundColor: row.hex }}
                      />
                      <span aria-hidden="true" className="mr-1">
                        {row.icon}
                      </span>
                      {row.label}
                    </td>
                    <td className={BODY_CELL}>{formatTHB(row.amount)}</td>
                    <td className={BODY_CELL}>{row.pct.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t-2 border-slate-400">
                  <td className="px-2 py-1.5 text-left">รวม</td>
                  <td className={BODY_CELL}>{formatTHB(summary.totalExpenses)}</td>
                  <td className={BODY_CELL}>100.0%</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* ── Top Subscriptions ─────────────────────────────────── */}
        <section className="mb-6 avoid-break">
          <h2 className="text-base font-semibold text-slate-700 uppercase tracking-wide mb-3">
            Subscription หลัก
          </h2>
          {topSubs.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              ยังไม่มี subscription ในปีนี้
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={HEADER_CELL_LEFT}>รายการ</th>
                  <th className={HEADER_CELL}>เฉลี่ย/เดือน</th>
                  <th className={HEADER_CELL}>เดือนที่เห็น</th>
                  <th className={HEADER_CELL}>รวมทั้งปี</th>
                  <th className={HEADER_CELL}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {topSubs.map((sub) => (
                  <tr key={sub.key}>
                    <td className={BODY_CELL_LEFT}>{sub.name}</td>
                    <td className={BODY_CELL}>
                      {formatTHB(sub.averageMonthlyAmount)}
                    </td>
                    <td className={BODY_CELL}>{sub.monthsSeen}</td>
                    <td className={BODY_CELL}>{formatTHB(sub.totalAmount)}</td>
                    <td className={BODY_CELL_LEFT.replace('text-left', 'text-right')}>
                      {sub.isActive ? 'ใช้งาน' : 'ไม่ใช้งาน'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="border-t border-slate-300 pt-3 mt-8 flex items-center justify-between text-[10px] text-slate-500">
          <span>WealthLens — บัญชีส่วนตัว</span>
          <span>ปี {safeYear} · สร้างเมื่อ {generatedAt}</span>
        </footer>
      </article>
    </>
  );
};

interface SummaryLineProps {
  label: string;
  value: number;
  accent?: 'net' | 'expense' | 'kept';
}

const SummaryLine = ({ label, value, accent }: SummaryLineProps): ReactNode => {
  const valueClass =
    accent === 'expense'
      ? 'text-expense font-semibold'
      : accent === 'net'
        ? 'text-income font-semibold'
        : accent === 'kept'
          ? (value < 0 ? 'text-expense font-semibold' : 'text-savings font-semibold')
          : 'text-slate-900';
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{formatTHB(value)}</span>
    </div>
  );
};

export default PrintReportPage;
