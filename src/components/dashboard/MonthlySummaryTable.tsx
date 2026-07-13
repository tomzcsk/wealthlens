/**
 * WealthLens — F06 Monthly Summary Table.
 *
 * Renders the 12-row month-by-month summary on the Overview page, plus a
 * totals row. Every numeric cell is derived from selectors (no hardcoded
 * values, per CLAUDE.md). Clicking a row navigates to the monthly-detail
 * page with the chosen month preselected via query param.
 *
 * The "ธนาคาร" column sums every entry in `data.bankAccounts` for that
 * month (F33) — it replaced the old single-account "Kept (กรุงศรี)" figure.
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

import { useFinanceStore } from '@/stores/financeStore';
import { EMPTY_BANK_ACCOUNTS } from '@/stores/emptyRefs';
import {
  selectMonthIncome,
  selectMonthlySummariesForYear,
  type MonthlySummaryRow,
} from '@/stores/selectors';
import { useSelectedYear } from '@/hooks/useFinanceData';
import { sumBankMonth } from '@/utils/bankAccounts';
import { formatNumber, formatThaiMonth } from '@/utils/formatters';
import type { BankAccount, MonthlyIncome, WealthLensData } from '@/types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MonthlySummaryTableProps {
  /** Override the active year. Defaults to the store's `selectedYear`. */
  year?: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Combined per-month payload — selector summary + raw income + savings breakdown. */
interface MonthPayload {
  summary: MonthlySummaryRow;
  income: MonthlyIncome | null;
  /** Sum of savings items for category 'investment-dime' this month. */
  dime: number;
  /** Sum of savings items for category 'travel' this month. */
  travel: number;
  /** Sum across every `bankAccounts` entry for this month (signed; negative = withdrawal). */
  kept: number;
}

interface RowTotals {
  salary: number;
  bonus: number;
  commission: number;
  otherIncome: number;
  totalDeductions: number;
  netSalary: number;
  netAll: number;
  totalExpenses: number;
  dime: number;
  travel: number;
  kept: number;
  remaining: number;
}

const COLUMN_HEADERS = [
  'เดือน',
  'เงินเดือน',
  'โบนัส',
  'คอม',
  'รายได้อื่น',
  'หัก',
  'Net',
  'Net.All',
  'จ่าย',
  'ลงทุน Dime',
  'ออมเที่ยว',
  'ธนาคาร',
  'เหลือ',
] as const;

const HEADER_CELL_BASE =
  'sticky top-0 z-10 bg-card border-b border-ink-200 py-3 px-3 text-xs font-semibold uppercase tracking-wider text-ink-500';

const BODY_CELL_BASE = 'py-3 px-3 text-sm tabular-nums';

/** Excel-friendly UTF-8 BOM so Thai characters render correctly. */
const UTF8_BOM = '﻿';

// ---------------------------------------------------------------------------
// Build per-month payloads from a snapshot. Pure — runs inside `useMemo` so
// the array identity is stable as long as the underlying `data` reference
// doesn't change, avoiding render loops from Zustand's `Object.is` check.
// ---------------------------------------------------------------------------

const buildPayloads = (
  data: WealthLensData,
  year: number,
  accounts: readonly BankAccount[],
): MonthPayload[] => {
  const snapshot = { data };
  const summaries = selectMonthlySummariesForYear(snapshot, year);
  // Pre-bucket savings rows by month so each row builds in O(1) lookups
  // instead of re-scanning the year's savings array per month.
  const yr = data.years[String(year)];
  const dimeByMonth = new Map<number, number>();
  const travelByMonth = new Map<number, number>();
  for (const row of yr?.savings ?? []) {
    let dime = 0;
    let travel = 0;
    for (const item of row.items) {
      if (item.category === 'investment-dime') dime += item.amount;
      else if (item.category === 'travel') travel += item.amount;
    }
    if (dime !== 0) dimeByMonth.set(row.month, dime);
    if (travel !== 0) travelByMonth.set(row.month, travel);
  }
  return summaries.map((summary) => ({
    summary,
    income: selectMonthIncome(snapshot, year, summary.month),
    dime: dimeByMonth.get(summary.month) ?? 0,
    travel: travelByMonth.get(summary.month) ?? 0,
    kept: sumBankMonth(accounts, year, summary.month),
  }));
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const MonthlySummaryTable = ({ year }: MonthlySummaryTableProps) => {
  const selectedYear = useSelectedYear();
  const activeYear = year ?? selectedYear;
  const navigate = useNavigate();

  // Subscribe to just the persisted `data` slice — its reference only
  // changes when state.data mutates. Then derive payloads lazily so we
  // avoid creating new arrays on unrelated re-renders.
  const data = useFinanceStore((s) => s.data);
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);
  const payloads = useMemo(
    () => buildPayloads(data, activeYear, accounts),
    [data, activeYear, accounts],
  );

  const totals: RowTotals = useMemo(() => computeTotals(payloads), [payloads]);

  const handleRowSelect = useCallback(
    (month: number) => {
      navigate(`/monthly?month=${month}`);
    },
    [navigate],
  );

  const handleExportCsv = useCallback(() => {
    const csv = buildCsv(payloads, totals, activeYear);
    downloadCsv(
      `wealthlens_${activeYear}_monthly_summary.csv`,
      UTF8_BOM + csv,
    );
  }, [payloads, totals, activeYear]);

  return (
    <section className="bg-card rounded-2xl border border-ink-200 shadow-sm overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
        <div>
          <h2 className="text-base font-semibold text-ink-900">
            สรุปรายเดือน
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            สรุปรายเดือนของปี {activeYear} — คลิกแถวเพื่อดูรายละเอียด
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="border border-ink-200 px-3 py-1.5 rounded-lg text-sm hover:bg-hover transition-colors text-ink-700 font-medium"
        >
          Export CSV
        </button>
      </header>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLUMN_HEADERS.map((label, idx) => (
                <th
                  key={label}
                  scope="col"
                  className={clsx(
                    HEADER_CELL_BASE,
                    idx === 0 ? 'text-left' : 'text-right',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payloads.map((p) => (
              <MonthRow
                key={p.summary.month}
                payload={p}
                year={activeYear}
                onSelect={handleRowSelect}
              />
            ))}
            <TotalsRow totals={totals} />
          </tbody>
        </table>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface MonthRowProps {
  payload: MonthPayload;
  year: number;
  onSelect: (month: number) => void;
}

const MonthRow = ({ payload, year, onSelect }: MonthRowProps) => {
  const { summary, income, dime, travel, kept } = payload;
  const isEmpty = income === null;

  const tooltip = useMemo(() => {
    if (isEmpty) {
      return `${formatThaiMonth(summary.month, { long: true })} ${year} — ยังไม่มีข้อมูล`;
    }
    return [
      `${formatThaiMonth(summary.month, { long: true })} ${year}`,
      `รายรับรวม: ฿${formatNumber(summary.gross)}`,
      `รวมหัก: ฿${formatNumber(summary.totalDeductions)}`,
      `Net.All: ฿${formatNumber(summary.netAll)}`,
      `จ่าย: ฿${formatNumber(summary.totalExpenses)}`,
      `เหลือ: ฿${formatNumber(summary.remaining)}`,
    ].join('\n');
  }, [isEmpty, summary, year]);

  const handleClick = useCallback(
    () => onSelect(summary.month),
    [onSelect, summary.month],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(summary.month);
      }
    },
    [onSelect, summary.month],
  );

  // Style helpers — dim the entire row when there's no income data.
  const cellMuted = isEmpty ? 'text-ink-400' : 'text-ink-900';
  const dimZero = (value: number) =>
    value === 0 ? 'text-ink-400' : cellMuted;

  const remainingTone = isEmpty
    ? 'text-ink-400'
    : summary.remaining > 0
      ? 'text-income-ink'
      : summary.remaining < 0
        ? 'text-expense-ink'
        : 'text-ink-500';

  const expensesTone = isEmpty
    ? 'text-ink-400'
    : summary.totalExpenses === 0
      ? 'text-ink-400'
      : 'text-expense-ink';

  const deductionsTone = isEmpty ? 'text-ink-400' : 'text-ink-500';

  return (
    <tr
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`ดูรายละเอียด ${formatThaiMonth(summary.month, { long: true })} ${year}`}
      title={tooltip}
      className="border-b border-ink-100 hover:bg-hover transition-colors cursor-pointer focus:outline-none focus:bg-hover focus:ring-2 focus:ring-inset focus:ring-primary-ink/30"
    >
      <td className={clsx(BODY_CELL_BASE, 'font-medium text-left', cellMuted)}>
        {formatThaiMonth(summary.month)}
      </td>
      <td
        className={clsx(BODY_CELL_BASE, 'text-right', dimZero(income?.salary ?? 0))}
      >
        {formatNumber(income?.salary ?? 0)}
      </td>
      <td
        className={clsx(BODY_CELL_BASE, 'text-right', dimZero(income?.bonus ?? 0))}
      >
        {formatNumber(income?.bonus ?? 0)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          dimZero(income?.commission ?? 0),
        )}
      >
        {formatNumber(income?.commission ?? 0)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          dimZero(income?.otherIncome ?? 0),
        )}
      >
        {formatNumber(income?.otherIncome ?? 0)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right', deductionsTone)}>
        {formatNumber(summary.totalDeductions)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right', cellMuted)}>
        {formatNumber(summary.netSalary)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right font-semibold',
          isEmpty ? 'text-ink-400' : 'text-ink-900',
        )}
      >
        {formatNumber(summary.netAll)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right', expensesTone)}>
        {formatNumber(summary.totalExpenses)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          dime === 0 ? 'text-ink-400' : 'text-savings-ink',
        )}
        title="ลงทุน Dime เดือนนี้"
      >
        {formatNumber(dime)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          travel === 0 ? 'text-ink-400' : 'text-savings-ink',
        )}
        title="ออมเที่ยว เดือนนี้"
      >
        {formatNumber(travel)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          kept === 0
            ? 'text-ink-400'
            : kept < 0
              ? 'text-expense-ink'
              : 'text-savings-ink',
        )}
        title="ยอดบัญชีธนาคาร (รวมทุกบัญชี) เดือนนี้ — ติดลบ = ถอนออก"
      >
        {formatNumber(kept)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right font-medium', remainingTone)}>
        {formatNumber(summary.remaining)}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Totals row
// ---------------------------------------------------------------------------

interface TotalsRowProps {
  totals: RowTotals;
}

const TotalsRow = ({ totals }: TotalsRowProps) => {
  const remainingTone =
    totals.remaining > 0
      ? 'text-income-ink'
      : totals.remaining < 0
        ? 'text-expense-ink'
        : 'text-ink-500';

  return (
    <tr className="border-t-2 border-ink-300 bg-surface/60 font-semibold">
      <td className={clsx(BODY_CELL_BASE, 'text-left text-ink-900')}>รวม</td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900')}>
        {formatNumber(totals.salary)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900')}>
        {formatNumber(totals.bonus)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900')}>
        {formatNumber(totals.commission)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900')}>
        {formatNumber(totals.otherIncome)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-500')}>
        {formatNumber(totals.totalDeductions)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900')}>
        {formatNumber(totals.netSalary)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-ink-900 font-bold')}>
        {formatNumber(totals.netAll)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right text-expense-ink')}>
        {formatNumber(totals.totalExpenses)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          totals.dime === 0 ? 'text-ink-400' : 'text-savings-ink',
        )}
      >
        {formatNumber(totals.dime)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          totals.travel === 0 ? 'text-ink-400' : 'text-savings-ink',
        )}
      >
        {formatNumber(totals.travel)}
      </td>
      <td
        className={clsx(
          BODY_CELL_BASE,
          'text-right',
          totals.kept === 0
            ? 'text-ink-400'
            : totals.kept < 0
              ? 'text-expense-ink'
              : 'text-savings-ink',
        )}
      >
        {formatNumber(totals.kept)}
      </td>
      <td className={clsx(BODY_CELL_BASE, 'text-right', remainingTone)}>
        {formatNumber(totals.remaining)}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Pure helpers — totals + CSV
// ---------------------------------------------------------------------------

const computeTotals = (payloads: MonthPayload[]): RowTotals => {
  let salary = 0;
  let bonus = 0;
  let commission = 0;
  let otherIncome = 0;
  let totalDeductions = 0;
  let netSalary = 0;
  let netAll = 0;
  let totalExpenses = 0;
  let dime = 0;
  let travel = 0;
  let kept = 0;
  let remaining = 0;

  for (const {
    summary,
    income,
    dime: monthDime,
    travel: monthTravel,
    kept: monthKept,
  } of payloads) {
    if (income) {
      salary += income.salary;
      bonus += income.bonus;
      commission += income.commission;
      otherIncome += income.otherIncome ?? 0;
    }
    totalDeductions += summary.totalDeductions;
    netSalary += summary.netSalary;
    netAll += summary.netAll;
    totalExpenses += summary.totalExpenses;
    dime += monthDime;
    travel += monthTravel;
    kept += monthKept;
    remaining += summary.remaining;
  }

  return {
    salary,
    bonus,
    commission,
    otherIncome,
    totalDeductions,
    netSalary,
    netAll,
    totalExpenses,
    dime,
    travel,
    kept,
    remaining,
  };
};

/** Escape a CSV cell — quote and double-up internal quotes when needed. */
const csvCell = (value: string | number): string => {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const buildCsv = (
  payloads: MonthPayload[],
  totals: RowTotals,
  year: number,
): string => {
  const headerLine = COLUMN_HEADERS.map(csvCell).join(',');

  const dataLines = payloads.map(({ summary, income, dime, travel, kept }) =>
    [
      formatThaiMonth(summary.month),
      income?.salary ?? 0,
      income?.bonus ?? 0,
      income?.commission ?? 0,
      income?.otherIncome ?? 0,
      summary.totalDeductions,
      summary.netSalary,
      summary.netAll,
      summary.totalExpenses,
      dime,
      travel,
      kept,
      summary.remaining,
    ]
      .map(csvCell)
      .join(','),
  );

  const totalsLine = [
    `รวม ${year}`,
    totals.salary,
    totals.bonus,
    totals.commission,
    totals.otherIncome,
    totals.totalDeductions,
    totals.netSalary,
    totals.netAll,
    totals.totalExpenses,
    totals.dime,
    totals.travel,
    totals.kept,
    totals.remaining,
  ]
    .map(csvCell)
    .join(',');

  return [headerLine, ...dataLines, totalsLine].join('\n');
};

const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Free the blob URL once the click handler has had a chance to fire.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default MonthlySummaryTable;
