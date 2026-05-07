/**
 * IncomeExpenseChart — F04
 *
 * Per-month Income vs Expense composed chart for the active year.
 *  - Two grouped bars: Income (gross) green, Expense (totalExpenses) red
 *  - Net line overlay (netAll) in violet
 *  - Thai short month names on the X axis (ม.ค.–ธ.ค.)
 *  - Compact baht labels on the Y axis (฿120k, ฿1.2M)
 *  - Tooltip renders full ฿ values via the shared formatter
 *  - Legend toggles series visibility on click
 *
 * The component owns its own data fetch via the convenience hook so the
 * orchestrator can drop it in with no props beyond an optional year override.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useMonthlySummariesForYear, useSelectedYear } from '@/hooks/useFinanceData';
import { THAI_MONTHS_SHORT, formatTHB, formatThaiMonthYear } from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface IncomeExpenseChartProps {
  /** Override the year shown — defaults to `selectedYear` from the store. */
  year?: number;
  /** Inner chart height in px. Card padding is added on top. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UXUI.md §2 chart-friendly hex tokens — Recharts can't read CSS vars. */
const COLOR_INCOME_BAR = '#34D399';
const COLOR_EXPENSE_BAR = '#F87171';
const COLOR_NET_LINE = '#7C3AED';

/** Stable dataKey identifiers — used by both series and the legend toggle. */
const KEY_INCOME = 'income';
const KEY_EXPENSE = 'expense';
const KEY_NET = 'net';

type SeriesKey = typeof KEY_INCOME | typeof KEY_EXPENSE | typeof KEY_NET;

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

interface ChartRow {
  month: number;
  monthLabel: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Recharts payload entries are loosely typed (`unknown` values, optional keys).
 * We narrow to just the fields we read so the tooltip stays type-safe.
 */
interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  name?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a series key to its human label — used by both legend and tooltip. */
const SERIES_LABEL: Record<SeriesKey, string> = {
  [KEY_INCOME]: 'รายรับ',
  [KEY_EXPENSE]: 'ค่าใช้จ่าย',
  [KEY_NET]: 'Net',
};

const SERIES_COLOR: Record<SeriesKey, string> = {
  [KEY_INCOME]: COLOR_INCOME_BAR,
  [KEY_EXPENSE]: COLOR_EXPENSE_BAR,
  [KEY_NET]: COLOR_NET_LINE,
};

/** Y-axis tick formatter — compact baht (฿120k). */
const yTickFormatter = (value: number): string =>
  formatTHB(value, { compact: true });

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const ChartTooltip = ({ active, label, payload }: ChartTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-slate-700">{String(label ?? '')}</div>
      <ul className="space-y-0.5">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? '') as SeriesKey;
          const numeric =
            typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-3 text-xs text-slate-700"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color ?? SERIES_COLOR[key] }}
                />
                {SERIES_LABEL[key] ?? entry.name ?? key}
              </span>
              <span className="font-semibold tabular-nums">{formatTHB(numeric)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const IncomeExpenseChart = ({
  year,
  height = 320,
}: IncomeExpenseChartProps): ReactNode => {
  const selectedYear = useSelectedYear();
  const activeYear = year ?? selectedYear;
  const monthlyRows = useMonthlySummariesForYear(activeYear);

  // Track which series are hidden — legend click toggles entries here.
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    [KEY_INCOME]: false,
    [KEY_EXPENSE]: false,
    [KEY_NET]: false,
  });

  const chartData = useMemo<ChartRow[]>(
    () =>
      monthlyRows.map((row) => ({
        month: row.month,
        monthLabel: THAI_MONTHS_SHORT[row.month - 1] ?? String(row.month),
        income: row.gross,
        expense: row.totalExpenses,
        net: row.netAll,
      })),
    [monthlyRows],
  );

  const hasAnyData = useMemo(
    () => chartData.some((r) => r.income !== 0 || r.expense !== 0 || r.net !== 0),
    [chartData],
  );

  const toggleSeries = (key: SeriesKey): void => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            รายรับ vs ค่าใช้จ่าย (รายเดือน)
          </h2>
          <p className="text-xs text-slate-500">ปี {activeYear}</p>
        </div>
      </header>

      {hasAnyData ? (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                stroke="#94A3B8"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <YAxis
                stroke="#94A3B8"
                tick={{ fontSize: 12 }}
                tickFormatter={yTickFormatter}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                width={64}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                iconType="circle"
                wrapperStyle={{ cursor: 'pointer', fontSize: 12 }}
                onClick={(item) => {
                  const k = String(item?.dataKey ?? '') as SeriesKey;
                  if (k === KEY_INCOME || k === KEY_EXPENSE || k === KEY_NET) {
                    toggleSeries(k);
                  }
                }}
              />
              <Bar
                dataKey={KEY_INCOME}
                name={SERIES_LABEL[KEY_INCOME]}
                fill={COLOR_INCOME_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                hide={hidden[KEY_INCOME]}
              />
              <Bar
                dataKey={KEY_EXPENSE}
                name={SERIES_LABEL[KEY_EXPENSE]}
                fill={COLOR_EXPENSE_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                hide={hidden[KEY_EXPENSE]}
              />
              <Line
                type="monotone"
                dataKey={KEY_NET}
                name={SERIES_LABEL[KEY_NET]}
                stroke={COLOR_NET_LINE}
                strokeWidth={2.25}
                dot={{ r: 3, strokeWidth: 0, fill: COLOR_NET_LINE }}
                activeDot={{ r: 5 }}
                hide={hidden[KEY_NET]}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex items-center justify-center text-sm text-slate-400"
          style={{ height }}
          role="status"
          aria-label={`ไม่มีข้อมูลสำหรับ ${formatThaiMonthYear(1, activeYear).split(' ').slice(-1)[0]}`}
        >
          ยังไม่มีข้อมูลสำหรับปีนี้
        </div>
      )}
    </section>
  );
};

export default IncomeExpenseChart;
