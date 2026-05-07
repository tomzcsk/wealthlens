/**
 * ExpensePieChart — F05
 *
 * Donut breakdown of expenses by category for either:
 *   - the active year (when `month` is undefined / null), or
 *   - a specific month within the active year.
 *
 * Layout follows UXUI.md §5.2 and §6.1:
 *   - Donut (innerRadius 60 / outerRadius 100), animated mount.
 *   - Center label = "รวมจ่าย" + total (HTML overlay so we can style with
 *     Tailwind tokens instead of fighting Recharts' SVG <Label/>).
 *   - Right-side legend (icon + Thai label + amount + %) on desktop;
 *     stacks below on narrow viewports via Tailwind responsive grid.
 *   - Tooltip shows category name + amount + share %.
 *
 * Categories with zero spend are filtered out of the pie + legend (they'd
 * render as invisible slivers). The center total still reflects everything.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { useExpenseByCategory, useSelectedYear } from '@/hooks/useFinanceData';
import { CATEGORY_ORDER, EXPENSE_CATEGORIES } from '@/types/expense-categories';
import type { ExpenseCategory } from '@/types';
import { formatPercent, formatTHB } from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ExpensePieChartProps {
  /** Override the year — defaults to `selectedYear` from the store. */
  year?: number;
  /**
   * Specific calendar month (1-12). `undefined` or `null` means
   * year-wide aggregation — matches the selector's optional `month` arg.
   */
  month?: number | null;
  /** Inner chart height in px. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Per-task spec: keep diffs small by mirroring the 8 category hexes locally
 * rather than extending the EXPENSE_CATEGORIES type. Values are pulled
 * directly from UXUI.md §2 expense-category palette.
 */
const CATEGORY_HEX_COLORS: Record<ExpenseCategory, string> = {
  housing: '#6366F1',
  vehicle: '#8B5CF6',
  utilities: '#06B6D4',
  subscription: '#F59E0B',
  finance: '#EF4444',
  entertainment: '#EC4899',
  savings: '#10B981',
  other: '#6B7280',
};

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

interface SliceDatum {
  category: ExpenseCategory;
  label: string;
  icon: string;
  amount: number;
  /** 0..1 share of total spend — used for legend & tooltip. */
  share: number;
  color: string;
}

interface TooltipEntry {
  payload?: SliceDatum;
  value?: number | string;
}

interface PieTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const PieTooltip = ({ active, payload }: PieTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: datum.color }}
        />
        <span>{datum.icon}</span>
        <span>{datum.label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-xs text-slate-700">
        <span className="font-semibold tabular-nums">{formatTHB(datum.amount)}</span>
        <span className="text-slate-500 tabular-nums">{formatPercent(datum.share)}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ExpensePieChart = ({
  year,
  month,
  height = 320,
}: ExpensePieChartProps): ReactNode => {
  const selectedYear = useSelectedYear();
  const activeYear = year ?? selectedYear;
  // The hook accepts `month?: number` — coalesce a `null` prop into undefined.
  const monthArg = month ?? undefined;
  const byCategory = useExpenseByCategory(monthArg, activeYear);

  const { slices, total } = useMemo(() => {
    const sum = CATEGORY_ORDER.reduce((acc, cat) => acc + byCategory[cat], 0);

    const computed: SliceDatum[] = CATEGORY_ORDER.filter(
      (cat) => byCategory[cat] > 0,
    ).map((cat) => {
      const meta = EXPENSE_CATEGORIES[cat];
      const amount = byCategory[cat];
      return {
        category: cat,
        label: meta.label,
        icon: meta.icon,
        amount,
        share: sum > 0 ? amount / sum : 0,
        color: CATEGORY_HEX_COLORS[cat],
      };
    });

    return { slices: computed, total: sum };
  }, [byCategory]);

  const hasData = slices.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">สัดส่วนค่าใช้จ่าย</h2>
          <p className="text-xs text-slate-500">ปี {activeYear}</p>
        </div>
      </header>

      {hasData ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
          {/* Donut + center label */}
          <div className="relative" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<PieTooltip />} />
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={1.5}
                  stroke="none"
                  isAnimationActive
                  animationDuration={600}
                >
                  {slices.map((s) => (
                    <Cell key={s.category} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* HTML overlay for the donut centre — easier styling than SVG <Label>. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs font-medium text-slate-500">รวมจ่าย</span>
              <span className="text-xl font-bold tabular-nums text-slate-900">
                {formatTHB(total)}
              </span>
            </div>
          </div>

          {/* Legend */}
          <ul className="space-y-2">
            {slices.map((s) => (
              <li
                key={s.category}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span aria-hidden="true">{s.icon}</span>
                  <span className="truncate text-slate-700">{s.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="font-semibold text-slate-900">{formatTHB(s.amount)}</span>
                  <span className="text-xs text-slate-500">{formatPercent(s.share)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          className="flex items-center justify-center text-sm text-slate-400"
          style={{ height }}
          role="status"
        >
          ยังไม่มีรายการค่าใช้จ่าย
        </div>
      )}
    </section>
  );
};

export default ExpensePieChart;
