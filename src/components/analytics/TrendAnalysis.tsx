/**
 * TrendAnalysis — F14
 *
 * Long-form trend view spanning every available year × 12 months
 * (up to 48 data points: 2023–2026). Three stacked panels, top to bottom:
 *
 *   1. Net Income area chart — single violet series tracing `netAll` across
 *      the full timeline. Gradient fill from `--color-net` (#7C3AED) into
 *      transparent so the line carries the eye while the area gives
 *      magnitude context. Every 3rd X tick is rendered (`interval={2}`) to
 *      keep the axis legible at ~48 points.
 *
 *   2. Stats summary row — four small cards, one per derived insight:
 *      avg Net/month, avg Expense/month, best month, worst month. Months
 *      with no income AND no expenses are excluded from averages and from
 *      the best/worst search (a not-yet-happened month is not "the worst
 *      month ever"). See `bestWorstMonth` below for tie-breaking rules.
 *
 *   3. Stacked expense bar chart — one bar per month, segments stacked by
 *      `ExpenseCategory`. 8 `<Bar>` elements share `stackId="exp"`; legend
 *      click toggles individual category visibility. Tooltip lists every
 *      visible category for the hovered month, sorted high → low, plus a
 *      total at the bottom.
 *
 * Layout choice: stats row goes BETWEEN the two charts so each chart owns
 * its own visual breathing room — sandwiching it lets the eye travel from
 * "trend in net" → "headline numbers" → "where the money went" without two
 * adjacent dense visualisations competing for attention.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { use48MonthTrend, type TrendPoint } from '@/hooks/useFinanceData';
import { CATEGORY_ORDER, EXPENSE_CATEGORIES } from '@/types/expense-categories';
import type { ExpenseCategory } from '@/types';
import {
  THAI_MONTHS_SHORT,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** UXUI.md §2 — Net Income violet. */
const COLOR_NET = '#7C3AED';

/**
 * Local mirror of UXUI.md §2 expense-category palette so Recharts can
 * consume them as `fill` strings (it can't read CSS variables). Identical
 * values to ExpensePieChart's local map — duplicated rather than centralised
 * to keep this component drop-in self-contained.
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

/** Stable id for the area-chart gradient `<defs>`. */
const NET_GRADIENT_ID = 'wl-net-area-gradient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const yTickFormatter = (value: number): string =>
  formatTHB(value, { compact: true });

interface BestWorstMonth {
  /** The trend point that won/lost. `null` when no valid month exists. */
  point: TrendPoint | null;
  /** `remaining` value at that month (cached for display). */
  value: number;
}

/**
 * Find the months with the highest / lowest `remaining` (netAll - expenses)
 * across every month that has any data.
 *
 * Tie-breaking: when two months share the same `remaining` we keep the
 * EARLIER one for "best" (first-achieved deserves credit) and the LATER
 * one for "worst" (most-recent struggle is more actionable to revisit).
 * This is deterministic and intuitive when scanning the dashboard.
 */
const findBestWorst = (
  points: readonly TrendPoint[],
): { best: BestWorstMonth; worst: BestWorstMonth } => {
  let best: BestWorstMonth = { point: null, value: -Infinity };
  let worst: BestWorstMonth = { point: null, value: Infinity };

  for (const p of points) {
    if (!p.hasData) continue;
    if (p.remaining > best.value) {
      best = { point: p, value: p.remaining };
    }
    // Strict `<` keeps the LATER month on ties (we iterate oldest → newest,
    // so equality should NOT overwrite — that preserves the earliest).
    // Wait: for "worst" we want the LATER one — so we use `<=`.
    if (p.remaining <= worst.value) {
      worst = { point: p, value: p.remaining };
    }
  }

  if (best.point === null) best = { point: null, value: 0 };
  if (worst.point === null) worst = { point: null, value: 0 };
  return { best, worst };
};

// ---------------------------------------------------------------------------
// Tooltip — Area chart
// ---------------------------------------------------------------------------

interface AreaTooltipPayloadEntry {
  payload?: TrendPoint;
  value?: number | string;
  color?: string;
}

interface AreaTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<AreaTooltipPayloadEntry>;
}

const AreaTooltip = ({ active, payload }: AreaTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const numeric =
    typeof payload[0]?.value === 'number'
      ? (payload[0].value as number)
      : Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-slate-700">
        {formatThaiMonthYear(point.month, point.year)}
      </div>
      <div className="flex items-baseline gap-1.5 text-xs text-slate-700">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: COLOR_NET }}
        />
        <span>รายได้สุทธิ</span>
        <span className="ml-auto font-semibold tabular-nums">
          {formatTHB(numeric)}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tooltip — Stacked bar
// ---------------------------------------------------------------------------

interface BarTooltipPayloadEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  payload?: TrendPoint;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<BarTooltipPayloadEntry>;
}

const BarTooltip = ({ active, payload }: BarTooltipProps): ReactNode => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  // Each visible category becomes one entry; sort high → low for scannability.
  const rows = payload
    .map((entry) => {
      const cat = String(entry.dataKey ?? '') as ExpenseCategory;
      const numeric =
        typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
      return { cat, numeric, color: entry.color ?? CATEGORY_HEX_COLORS[cat] };
    })
    .filter((r) => r.numeric > 0)
    .sort((a, b) => b.numeric - a.numeric);

  const total = rows.reduce((acc, r) => acc + r.numeric, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <div className="mb-1 text-xs font-semibold text-slate-700">
        {formatThaiMonthYear(point.month, point.year)}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400">ไม่มีค่าใช้จ่าย</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => {
            const meta = EXPENSE_CATEGORIES[r.cat];
            return (
              <li
                key={r.cat}
                className="flex items-center justify-between gap-3 text-xs text-slate-700"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                  <span aria-hidden="true">{meta?.icon ?? ''}</span>
                  <span>{meta?.label ?? r.cat}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatTHB(r.numeric)}
                </span>
              </li>
            );
          })}
          <li className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 text-xs">
            <span className="font-semibold text-slate-600">รวม</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {formatTHB(total)}
            </span>
          </li>
        </ul>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-section: Net Income area chart
// ---------------------------------------------------------------------------

interface NetIncomeAreaSectionProps {
  data: TrendPoint[];
  firstYear: number | null;
  lastYear: number | null;
  height: number;
}

const NetIncomeAreaSection = ({
  data,
  firstYear,
  lastYear,
  height,
}: NetIncomeAreaSectionProps): ReactNode => {
  const hasAny = data.some((p) => p.netAll !== 0);
  const subtitle =
    firstYear !== null && lastYear !== null
      ? firstYear === lastYear
        ? `${firstYear}`
        : `${firstYear}–${lastYear}`
      : '';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          แนวโน้มรายได้สุทธิ (48 เดือน)
        </h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </header>

      {hasAny ? (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <defs>
                <linearGradient
                  id={NET_GRADIENT_ID}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={COLOR_NET} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={COLOR_NET} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E2E8F0"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#94A3B8"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                interval={2}
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
                content={<AreaTooltip />}
                cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="netAll"
                stroke={COLOR_NET}
                strokeWidth={2.25}
                fill={`url(#${NET_GRADIENT_ID})`}
                isAnimationActive
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="flex items-center justify-center text-sm text-slate-400"
          style={{ height }}
          role="status"
        >
          ยังไม่มีข้อมูล
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Sub-section: stats summary row
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  detail?: string;
  /** Optional accent color for the value (used by best/worst tints). */
  tone?: 'default' | 'positive' | 'negative';
  /** Optional emoji prefix on the label. */
  icon?: string;
}

const StatCard = ({
  label,
  value,
  detail,
  tone = 'default',
  icon,
}: StatCardProps): ReactNode => {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </div>
      {detail ? (
        <div className="mt-0.5 text-xs tabular-nums text-slate-500">
          {detail}
        </div>
      ) : null}
    </div>
  );
};

interface StatsSummaryRowProps {
  data: TrendPoint[];
}

const StatsSummaryRow = ({ data }: StatsSummaryRowProps): ReactNode => {
  const stats = useMemo(() => {
    const active = data.filter((p) => p.hasData);
    const netSum = active.reduce((acc, p) => acc + p.netAll, 0);
    const expSum = active.reduce((acc, p) => acc + p.totalExpenses, 0);
    const avgNet = active.length > 0 ? netSum / active.length : 0;
    const avgExp = active.length > 0 ? expSum / active.length : 0;
    const { best, worst } = findBestWorst(active);
    return { active, avgNet, avgExp, best, worst };
  }, [data]);

  const formatMonthLabel = (p: TrendPoint | null): string => {
    if (!p) return '—';
    return `${THAI_MONTHS_SHORT[p.month - 1] ?? ''} ${p.year}`;
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="ค่าเฉลี่ย Net/เดือน"
        value={formatTHB(stats.avgNet)}
        detail={`เฉลี่ยจาก ${stats.active.length} เดือน`}
      />
      <StatCard
        label="ค่าเฉลี่ยจ่าย/เดือน"
        value={formatTHB(stats.avgExp)}
        detail={`เฉลี่ยจาก ${stats.active.length} เดือน`}
      />
      <StatCard
        icon="🏆"
        label="เดือนที่เก่งที่สุด"
        value={formatMonthLabel(stats.best.point)}
        detail={
          stats.best.point ? `เหลือ ${formatTHB(stats.best.value)}` : undefined
        }
        tone="positive"
      />
      <StatCard
        icon="⚠️"
        label="เดือนที่ฝืดสุด"
        value={formatMonthLabel(stats.worst.point)}
        detail={
          stats.worst.point
            ? `เหลือ ${formatTHB(stats.worst.value)}`
            : undefined
        }
        tone="negative"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-section: stacked expense bar
// ---------------------------------------------------------------------------

interface ExpenseStackedBarSectionProps {
  data: TrendPoint[];
  height: number;
}

/**
 * Recharts feeds nested objects to the chart but stacked bars need flat
 * `dataKey` lookups. We pre-flatten `byCategory` so each category becomes
 * a top-level key on every datum.
 */
interface FlatBarRow extends TrendPoint {
  housing: number;
  vehicle: number;
  utilities: number;
  subscription: number;
  finance: number;
  entertainment: number;
  savings: number;
  other: number;
}

const flattenForBar = (points: TrendPoint[]): FlatBarRow[] =>
  points.map((p) => ({
    ...p,
    housing: p.byCategory.housing,
    vehicle: p.byCategory.vehicle,
    utilities: p.byCategory.utilities,
    subscription: p.byCategory.subscription,
    finance: p.byCategory.finance,
    entertainment: p.byCategory.entertainment,
    savings: p.byCategory.savings,
    other: p.byCategory.other,
  }));

const ExpenseStackedBarSection = ({
  data,
  height,
}: ExpenseStackedBarSectionProps): ReactNode => {
  // Track which categories are visually hidden (legend toggle).
  const [hidden, setHidden] = useState<Record<ExpenseCategory, boolean>>(() => {
    const init = {} as Record<ExpenseCategory, boolean>;
    for (const cat of CATEGORY_ORDER) init[cat] = false;
    return init;
  });

  const flatData = useMemo(() => flattenForBar(data), [data]);
  const hasAnyExpenses = useMemo(
    () => flatData.some((row) => CATEGORY_ORDER.some((c) => row[c] > 0)),
    [flatData],
  );

  const toggleCategory = (cat: ExpenseCategory): void => {
    setHidden((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          สัดส่วนค่าใช้จ่ายตลอดเวลา
        </h2>
        <p className="text-xs text-slate-500">
          ยอดรวมรายเดือนแยกตามหมวด
        </p>
      </header>

      {hasAnyExpenses ? (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={flatData}
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E2E8F0"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="#94A3B8"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                interval={2}
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
                content={<BarTooltip />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={36}
                iconType="circle"
                wrapperStyle={{ cursor: 'pointer', fontSize: 12 }}
                formatter={(value: string) => {
                  const cat = value as ExpenseCategory;
                  const meta = EXPENSE_CATEGORIES[cat];
                  if (!meta) return value;
                  return `${meta.icon} ${meta.label}`;
                }}
                onClick={(item) => {
                  const k = String(item?.dataKey ?? '') as ExpenseCategory;
                  if (CATEGORY_ORDER.includes(k)) {
                    toggleCategory(k);
                  }
                }}
              />
              {CATEGORY_ORDER.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="exp"
                  fill={CATEGORY_HEX_COLORS[cat]}
                  hide={hidden[cat]}
                  isAnimationActive
                  animationDuration={500}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
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

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface TrendAnalysisProps {
  /** Inner area-chart height in px. Stacked bar uses the same. */
  chartHeight?: number;
}

export const TrendAnalysis = ({
  chartHeight = 320,
}: TrendAnalysisProps): ReactNode => {
  const trend = use48MonthTrend();

  const { firstYear, lastYear } = useMemo(() => {
    if (trend.length === 0) return { firstYear: null, lastYear: null };
    return {
      firstYear: trend[0]?.year ?? null,
      lastYear: trend[trend.length - 1]?.year ?? null,
    };
  }, [trend]);

  return (
    <div className="space-y-6">
      <NetIncomeAreaSection
        data={trend}
        firstYear={firstYear}
        lastYear={lastYear}
        height={chartHeight}
      />
      <StatsSummaryRow data={trend} />
      <ExpenseStackedBarSection data={trend} height={chartHeight} />
    </div>
  );
};

export default TrendAnalysis;
