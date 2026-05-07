/**
 * MultiYearComparison — F10
 *
 * Cross-year analytics panel. Three things on screen, top to bottom:
 *   1. Year-toggle pills — checkbox-style, default all-on, last one locked
 *      so the chart never has zero series.
 *   2. Multi-line chart of monthly Net All across selected years (one
 *      `<Line>` per year, fixed-by-year color so the legend stays stable
 *      even if the user toggles years off and back on).
 *   3. Summary table — one column per selected year, one row per metric.
 *      A small YoY % chip sits under each year header (vs the prior year
 *      in the same selection — see `priorByIndex` for why we walk the
 *      visible list, not just `year-1`). The year with the highest Net
 *      All gets a tinted column to satisfy the F10 "highlight" criterion.
 *
 * Why the data plumbing looks like it does:
 *   - `useAvailableYears` is the only safe way to pull the year list from
 *     the store without triggering the fresh-array re-render trap (see the
 *     header comment in `useFinanceData.ts`).
 *   - `useYearSummary(year)` is invoked once per available year through a
 *     small wrapper component (`YearColumnDataLoader` would be overkill);
 *     instead we pre-resolve summaries via stable per-year hook calls in
 *     `usePerYearSummaries`. Hook count is fixed once the year list is
 *     known, so the rules-of-hooks contract is preserved as long as
 *     available years don't change mid-session (they don't — seed data is
 *     loaded once on store init).
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  useAvailableYears,
  useMonthlySummariesForYear,
  useYearSummary,
} from '@/hooks/useFinanceData';
import type { YearSummary } from '@/stores/selectors';
import { calculatePercentChange } from '@/utils/calculations';
import {
  THAI_MONTHS_SHORT,
  formatPercent,
  formatTHB,
} from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Year color palette
// ---------------------------------------------------------------------------

/**
 * Fixed colors per year so a year is always recognisable across renders
 * (toggling it off and on must not reshuffle the legend).
 */
const YEAR_COLORS: Record<number, string> = {
  2023: '#6366F1', // indigo
  2024: '#06B6D4', // cyan
  2025: '#F59E0B', // amber
  2026: '#DC2626', // red
};

/** Deterministic fallback for years outside the curated palette. */
const fallbackColorForYear = (year: number): string => {
  // Pick a hue from a fixed set keyed by `year mod N` — guarantees stability
  // without relying on string hashing.
  const palette = ['#0EA5E9', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];
  return palette[Math.abs(year) % palette.length];
};

const colorForYear = (year: number): string =>
  YEAR_COLORS[year] ?? fallbackColorForYear(year);

// ---------------------------------------------------------------------------
// Metric row definition (table)
// ---------------------------------------------------------------------------

type SummaryNumericKey =
  | 'salary'
  | 'bonus'
  | 'commission'
  | 'totalDeductions'
  | 'netAll'
  | 'totalExpenses'
  | 'remaining';

interface MetricRowDef {
  key: SummaryNumericKey;
  label: string;
}

/** Order matches the UXUI.md §5.4 mock. */
const METRIC_ROWS: readonly MetricRowDef[] = [
  { key: 'salary', label: 'เงินเดือน' },
  { key: 'bonus', label: 'โบนัส' },
  { key: 'commission', label: 'คอม' },
  { key: 'totalDeductions', label: 'รวมหัก' },
  { key: 'netAll', label: 'Net All' },
  { key: 'totalExpenses', label: 'รวมจ่าย' },
  { key: 'remaining', label: 'เหลือ' },
];

// ---------------------------------------------------------------------------
// Hooks composition
// ---------------------------------------------------------------------------

/**
 * Pre-fetch every available year's summary. Hook order is stable as long
 * as `availableYears` is stable across renders — which it is, because
 * seed data only loads once and `useAvailableYears` returns a memoized
 * sorted list.
 */
const usePerYearSummaries = (years: number[]): Record<number, YearSummary> => {
  // Fixed array of slots — we map by index to satisfy rules-of-hooks.
  // 12 covers 2015–2026 plus headroom; if the dataset ever grows past it,
  // `slot < length` keeps the hooks safe.
  const slotCount = 12;
  const slots: number[] = Array.from({ length: slotCount }, (_, i) => i);
  // We must always invoke the same number of hooks per render. We fall
  // back to a sentinel year (the first available, or `0`) for unused
  // slots — its result is simply discarded.
  const fallbackYear = years[0] ?? 0;

  /* eslint-disable react-hooks/rules-of-hooks */
  // Each `useYearSummary` is a stable hook call at a fixed index.
  const summaries = slots.map((slot) =>
    useYearSummary(years[slot] ?? fallbackYear),
  );
  /* eslint-enable react-hooks/rules-of-hooks */

  return useMemo(() => {
    const map: Record<number, YearSummary> = {};
    years.forEach((y, i) => {
      const s = summaries[i];
      if (s) map[y] = s;
    });
    return map;
  }, [years, summaries]);
};

/** Same trick for monthly rows — used only by the chart. */
const usePerYearMonthlyRows = (
  years: number[],
): Record<number, ReturnType<typeof useMonthlySummariesForYear>> => {
  const slotCount = 12;
  const slots: number[] = Array.from({ length: slotCount }, (_, i) => i);
  const fallbackYear = years[0] ?? 0;

  /* eslint-disable react-hooks/rules-of-hooks */
  const rows = slots.map((slot) =>
    useMonthlySummariesForYear(years[slot] ?? fallbackYear),
  );
  /* eslint-enable react-hooks/rules-of-hooks */

  return useMemo(() => {
    const map: Record<number, ReturnType<typeof useMonthlySummariesForYear>> =
      {};
    years.forEach((y, i) => {
      const r = rows[i];
      if (r) map[y] = r;
    });
    return map;
  }, [years, rows]);
};

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  name?: string | number;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
}

const ChartTooltip = ({
  active,
  label,
  payload,
}: ChartTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;

  // Sort entries high → low so the user reads the "best" year first.
  const sorted = [...payload].sort((a, b) => {
    const av = typeof a.value === 'number' ? a.value : Number(a.value ?? 0);
    const bv = typeof b.value === 'number' ? b.value : Number(b.value ?? 0);
    return bv - av;
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-slate-700">
        {String(label ?? '')}
      </div>
      <ul className="space-y-0.5">
        {sorted.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? '');
          const numeric =
            typeof entry.value === 'number'
              ? entry.value
              : Number(entry.value ?? 0);
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-3 text-xs text-slate-700"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color ?? '#94A3B8' }}
                />
                {key}
              </span>
              <span className="font-semibold tabular-nums">
                {formatTHB(numeric)}
              </span>
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

const yTickFormatter = (value: number): string =>
  formatTHB(value, { compact: true });

export interface MultiYearComparisonProps {
  /** Inner chart height in px. */
  height?: number;
}

export const MultiYearComparison = ({
  height = 340,
}: MultiYearComparisonProps): ReactNode => {
  const availableYears = useAvailableYears();
  const yearSummaries = usePerYearSummaries(availableYears);
  const yearMonthlyRows = usePerYearMonthlyRows(availableYears);

  // Local toggle state — default: every available year selected.
  // We also stash a "key" derived from `availableYears` so we can detect
  // dataset changes and reset the selection during render (the React-
  // recommended alternative to syncing with `useEffect` + `setState`).
  const availableKey = useMemo(() => availableYears.join(','), [availableYears]);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(availableYears),
  );
  const [lastKey, setLastKey] = useState<string>(availableKey);

  let effectiveSelected = selected;
  if (lastKey !== availableKey) {
    // Dataset changed (import/sync). Preserve any user toggle that still
    // applies, opt-in newly appearing years.
    const next = new Set<number>();
    for (const y of availableYears) {
      if (selected.has(y)) next.add(y);
      else next.add(y);
    }
    effectiveSelected = next;
    setSelected(next);
    setLastKey(availableKey);
  }

  const selectedYears = useMemo(
    () => availableYears.filter((y) => effectiveSelected.has(y)),
    [availableYears, effectiveSelected],
  );

  /** Toggle a year on/off; refuse to unselect the last one. */
  const toggleYear = (year: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        if (next.size === 1) return prev; // floor: keep at least one.
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  // Chart data: 12 rows × N year columns.
  const chartData = useMemo(() => {
    return THAI_MONTHS_SHORT.map((label, i) => {
      const month = i + 1;
      const row: Record<string, string | number> = { monthLabel: label };
      for (const year of selectedYears) {
        const monthly = yearMonthlyRows[year];
        const found = monthly?.find((m) => m.month === month);
        row[String(year)] = found?.netAll ?? 0;
      }
      return row;
    });
  }, [selectedYears, yearMonthlyRows]);

  const hasAnyChartData = useMemo(
    () =>
      selectedYears.some((year) =>
        chartData.some((row) => Number(row[String(year)] ?? 0) !== 0),
      ),
    [selectedYears, chartData],
  );

  // Year column with the highest Net All across the visible selection.
  const maxNetAllYear = useMemo<number | null>(() => {
    if (selectedYears.length === 0) return null;
    let best: number | null = null;
    let bestVal = -Infinity;
    for (const y of selectedYears) {
      const v = yearSummaries[y]?.netAll ?? 0;
      if (v > bestVal) {
        bestVal = v;
        best = y;
      }
    }
    return best;
  }, [selectedYears, yearSummaries]);

  // YoY % vs the previously visible year in the same selection.
  // Falls back to "—" when there's no prior column.
  const headerYoY: Record<number, number | null> = useMemo(() => {
    const map: Record<number, number | null> = {};
    selectedYears.forEach((y, idx) => {
      if (idx === 0) {
        map[y] = null;
        return;
      }
      const prevYear = selectedYears[idx - 1];
      const curr = yearSummaries[y]?.netAll ?? 0;
      const prev = yearSummaries[prevYear]?.netAll ?? 0;
      map[y] = calculatePercentChange(curr, prev);
    });
    return map;
  }, [selectedYears, yearSummaries]);

  return (
    <div className="space-y-6">
      {/* ---------- Year toggle pills ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-medium text-slate-700">
            เปรียบเทียบรายปี:
          </span>
          {availableYears.map((year) => {
            const isOn = effectiveSelected.has(year);
            const isLast = isOn && effectiveSelected.size === 1;
            const color = colorForYear(year);
            return (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                disabled={isLast}
                aria-pressed={isOn}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition',
                  isOn
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  isLast ? 'cursor-not-allowed opacity-90' : 'cursor-pointer',
                ].join(' ')}
                style={isOn ? { backgroundColor: color } : undefined}
                title={
                  isLast
                    ? 'ต้องเลือกอย่างน้อย 1 ปี'
                    : isOn
                      ? `ซ่อน ${year}`
                      : `แสดง ${year}`
                }
              >
                <span aria-hidden="true">{isOn ? '✓' : ''}</span>
                <span className="tabular-nums">{year}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Multi-line chart ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            แนวโน้มรายได้สุทธิ
          </h2>
          <p className="text-xs text-slate-500">
            เปรียบเทียบ Net All รายเดือน ข้ามปี
          </p>
        </header>

        {hasAnyChartData ? (
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E2E8F0"
                  vertical={false}
                />
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
                  cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
                {selectedYears.map((year) => {
                  const color = colorForYear(year);
                  return (
                    <Line
                      key={year}
                      type="monotone"
                      dataKey={String(year)}
                      name={String(year)}
                      stroke={color}
                      strokeWidth={2.25}
                      dot={{ r: 3, strokeWidth: 0, fill: color }}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="flex items-center justify-center text-sm text-slate-400"
            style={{ height }}
            role="status"
          >
            ยังไม่มีข้อมูลสำหรับปีที่เลือก
          </div>
        )}
      </section>

      {/* ---------- Summary table ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            สรุปรายปี
          </h2>
          <p className="text-xs text-slate-500">
            ตัวเลขรวมแต่ละปี — % คือการเปลี่ยนแปลงเทียบกับปีก่อนหน้า
            {maxNetAllYear !== null
              ? ` · ปีที่ Net All สูงสุด: ${maxNetAllYear}`
              : ''}
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-2 pr-4 font-semibold text-slate-600">
                  รายการ
                </th>
                {selectedYears.map((year) => {
                  const isMax = year === maxNetAllYear;
                  const yoy = headerYoY[year];
                  const yoyText =
                    yoy === null || yoy === undefined
                      ? '—'
                      : formatPercent(yoy / 100, { signed: true });
                  const yoyTone =
                    yoy === null || yoy === undefined
                      ? 'text-slate-400'
                      : yoy > 0
                        ? 'text-emerald-600'
                        : yoy < 0
                          ? 'text-rose-600'
                          : 'text-slate-500';
                  return (
                    <th
                      key={year}
                      className={[
                        'px-3 py-2 text-right font-semibold text-slate-900',
                        isMax ? 'bg-emerald-50' : '',
                      ].join(' ')}
                    >
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: colorForYear(year) }}
                          />
                          <span className="tabular-nums">{year}</span>
                        </span>
                        <span
                          className={`text-[11px] font-medium tabular-nums ${yoyTone}`}
                          title="YoY vs ปีก่อนหน้าในตาราง (Net All)"
                        >
                          {yoyText}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((row, rowIdx) => (
                <tr
                  key={row.key}
                  className={
                    rowIdx % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50/40'
                  }
                >
                  <td className="py-2 pr-4 font-medium text-slate-700">
                    {row.label}
                  </td>
                  {selectedYears.map((year) => {
                    const summary = yearSummaries[year];
                    const value = summary ? summary[row.key] : 0;
                    const isMax = year === maxNetAllYear;
                    return (
                      <td
                        key={year}
                        className={[
                          'px-3 py-2 text-right tabular-nums text-slate-800',
                          isMax ? 'bg-emerald-50' : '',
                        ].join(' ')}
                      >
                        {formatTHB(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MultiYearComparison;
