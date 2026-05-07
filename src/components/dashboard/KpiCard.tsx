/**
 * WealthLens — KPI Card (F03)
 *
 * A single hero metric card used on the Overview dashboard. The card is a
 * presentational primitive: it knows nothing about the store. All numbers,
 * deltas, and labels are passed in as props so the same component can be
 * reused for monthly drill-downs or comparisons later.
 *
 * Spec references:
 *   UXUI.md §6.1 — KPI Card visual language
 *   UXUI.md §3   — Type scale (number-xl)
 *   UXUI.md §2   — Color tones (income / expense / net / savings)
 *
 * Per CLAUDE.md, every visible number flows through `utils/formatters.ts` —
 * we never call `toLocaleString` or hand-roll currency strings here.
 */

import type { ReactNode } from 'react';
import { formatDelta, formatTHB } from '@/utils/formatters';

/** Visual tone driving the icon-pill background and the delta accent. */
export type KpiTone = 'neutral' | 'income' | 'expense' | 'net' | 'savings';

export interface KpiCardProps {
  /** Top-row label, e.g. "รายรับรวม". */
  label: string;
  /** Raw THB amount. Formatting happens inside the card. */
  amount: number;
  /**
   * Fractional YoY change (0.123 → +12.3%). `null` when prior-year data is
   * absent so we can render a graceful "no comparison available" state
   * instead of a misleading ∞%.
   */
  delta?: number | null;
  /** Defaults to "vs ปีก่อน" — overridable for comparisons against other windows. */
  deltaLabel?: string;
  /** Optional emoji or icon node rendered inside the icon pill. */
  icon?: ReactNode;
  /** Color theming — see UXUI.md §2. Defaults to neutral. */
  tone?: KpiTone;
  /** When true, render skeleton bars instead of real content. */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Tone → CSS class map.
//
// We deliberately leave the BIG number in slate-900 (max legibility, per
// UXUI.md §1.2 "data-first design"). Tone manifests in two subtler places:
//   1. The icon pill background + foreground.
//   2. A thin top accent bar — gives each card a quiet color identity
//      without shouting at Tom every time he opens the dashboard.
// ---------------------------------------------------------------------------

interface ToneClasses {
  pillBg: string;
  pillText: string;
  accentBar: string;
}

const TONE_CLASSES: Record<KpiTone, ToneClasses> = {
  neutral: {
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-600',
    accentBar: 'bg-slate-300',
  },
  income: {
    pillBg: 'bg-income-light',
    pillText: 'text-income',
    accentBar: 'bg-income',
  },
  expense: {
    pillBg: 'bg-expense-light',
    pillText: 'text-expense',
    accentBar: 'bg-expense',
  },
  net: {
    pillBg: 'bg-violet-50',
    pillText: 'text-net',
    accentBar: 'bg-net',
  },
  savings: {
    pillBg: 'bg-amber-50',
    pillText: 'text-savings',
    accentBar: 'bg-savings',
  },
};

// ---------------------------------------------------------------------------
// Display rules
// ---------------------------------------------------------------------------

/** Auto-compact when the number gets so wide it would overflow a 4-up grid. */
const COMPACT_THRESHOLD = 10_000_000;

const formatAmount = (value: number): string => {
  const compact = Math.abs(value) >= COMPACT_THRESHOLD;
  return formatTHB(value, { compact });
};

/** Map delta sign to text color. */
const DELTA_TEXT_BY_SIGN = {
  positive: 'text-income',
  negative: 'text-expense',
  zero: 'text-slate-500',
} as const;

/** Map delta sign to leading glyph (matches UXUI.md mock arrows). */
const DELTA_GLYPH_BY_SIGN = {
  positive: '↑',
  negative: '↓',
  zero: '–',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KpiCard = ({
  label,
  amount,
  delta,
  deltaLabel = 'vs ปีก่อน',
  icon,
  tone = 'neutral',
  loading = false,
}: KpiCardProps): ReactNode => {
  const toneClasses = TONE_CLASSES[tone];

  // Loading skeleton — gray bars sized roughly like the real content so
  // the card's footprint doesn't jump when data resolves.
  if (loading) {
    return (
      <div
        role="group"
        aria-label={`${label}: กำลังโหลด`}
        aria-busy="true"
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${toneClasses.accentBar} opacity-40`} />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="mt-4 h-8 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  const formattedAmount = formatAmount(amount);

  // Delta block: three states — null (no comparison), zero, signed.
  let deltaNode: ReactNode;
  if (delta === null || delta === undefined) {
    deltaNode = (
      <span className="text-slate-400">— ไม่มีข้อมูลปีก่อน</span>
    );
  } else {
    // `selectYoYChange` returns a percent already in *percentage* units
    // (e.g. 12.3 means +12.3%). `formatDelta` expects a fractional value
    // (0.123 → +12.3%), so divide by 100 here. Doing the conversion at the
    // edge keeps the rest of the pipeline in the units each layer prefers.
    const fractional = delta / 100;
    const { text, sign } = formatDelta(fractional);
    const colorClass = DELTA_TEXT_BY_SIGN[sign];
    const glyph = DELTA_GLYPH_BY_SIGN[sign];
    deltaNode = (
      <>
        <span className={`font-semibold ${colorClass}`}>
          <span aria-hidden="true">{glyph}</span> {text}
        </span>
        <span className="ml-1 text-slate-500">{deltaLabel}</span>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={`${label}: ${formattedAmount}`}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow duration-150 hover:shadow-md"
    >
      {/* Quiet tone accent — 4px bar across the top */}
      <div className={`absolute inset-x-0 top-0 h-1 ${toneClasses.accentBar}`} />

      {/* Top row: icon pill + label */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon ? (
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${toneClasses.pillBg} ${toneClasses.pillText}`}
          >
            {icon}
          </span>
        ) : null}
        <span className="font-medium">{label}</span>
      </div>

      {/* Hero number */}
      <div className="mt-4 financial-number text-3xl font-bold tabular-nums text-slate-900">
        {formattedAmount}
      </div>

      {/* Delta line */}
      <div className="mt-2 text-xs">{deltaNode}</div>
    </div>
  );
};

export default KpiCard;
