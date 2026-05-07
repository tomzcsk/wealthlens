/**
 * WealthLens — KPI Card Grid (F03)
 *
 * Assembles the four hero metrics on the Overview dashboard for the
 * currently-selected year. This is the only file in this feature that
 * speaks to the store; `KpiCard` itself stays purely presentational.
 *
 * Cards (UXUI.md §5.2):
 *   1. รายรับรวม   — gross income (salary + bonus + commission)
 *   2. ค่าใช้จ่าย  — totalExpenses
 *   3. Net Income  — netAll (the headline KPI per CLAUDE.md)
 *   4. Kept        — remaining (Net.All − จ่าย)
 *
 * Naming note (per CLAUDE.md "Data Quirks"):
 *   The 4th card is labelled "Kept" in the UXUI mock but the underlying
 *   number is what the source spreadsheets call "เหลือ" / "เหลือจริง"
 *   (Net.All minus expenses). True "Kept" (actual savings deposited) is a
 *   separate concept Tom hasn't tracked granularly yet — when he does, we
 *   swap the source field here without touching the visual layer.
 *
 * YoY note:
 *   `selectYoYChange` returns a value in *percentage units* (e.g. 12.3
 *   means +12.3%) and returns `null` when the prior year has no data.
 *   `KpiCard` divides by 100 internally before handing to `formatDelta`,
 *   and renders an explicit "ไม่มีข้อมูลปีก่อน" for null — so 2023, which
 *   has no 2022 baseline, gracefully shows "—" instead of pretending to
 *   have grown infinitely.
 */

import type { ReactNode } from 'react';
import { useSelectedYear, useYearSummary, useYoYChange } from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { useGoalsStore } from '@/stores/goalsStore';
import { selectYearSummary } from '@/stores/selectors';
import { KpiCard } from './KpiCard';

export const KpiCardGrid = (): ReactNode => {
  const year = useSelectedYear();
  const summary = useYearSummary();

  // gross = salary + bonus + commission (mirrors `selectMonthSummary.gross`).
  // Computed here rather than added to YearSummary because the per-year
  // selector intentionally keeps each income source separate — the UI
  // composes them only when it wants the headline "รายรับรวม" number.
  const grossIncome =
    summary.salary + summary.bonus + summary.commission;

  // YoY deltas — `salary`, `bonus`, `commission` aren't a single combined
  // metric in the selector, but each individual line is. We approximate the
  // gross-income YoY by combining the three mathematically. For consistency
  // with the other cards we still prefer a real selector hit when one fits
  // (totalExpenses, netAll, remaining are direct).
  const grossDelta = useGrossYoY();
  const expensesDelta = useYoYChange('totalExpenses');
  const netAllDelta = useYoYChange('netAll');

  // Kept = manually-tracked Krungsri savings balance (NOT derived).
  const keptBalances = useGoalsStore((s) => s.keptBalances);
  const keptThisYear = keptBalances[String(year)] ?? 0;
  const keptLastYear = keptBalances[String(year - 1)];
  const keptDelta =
    keptLastYear !== undefined && keptLastYear > 0
      ? ((keptThisYear - keptLastYear) / Math.abs(keptLastYear)) * 100
      : null;

  return (
    <section aria-label={`KPI สรุปปี ${year}`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="รายรับรวม"
          amount={grossIncome}
          delta={grossDelta}
          tone="income"
          icon="💰"
        />
        <KpiCard
          label="ค่าใช้จ่าย"
          amount={summary.totalExpenses}
          delta={expensesDelta}
          tone="expense"
          icon="💳"
        />
        <KpiCard
          label="รายได้สุทธิ"
          amount={summary.netAll}
          delta={netAllDelta}
          tone="net"
          icon="📊"
        />
        <KpiCard
          label="Kept (กรุงศรี)"
          amount={keptThisYear}
          delta={keptDelta}
          tone="savings"
          icon="🏦"
        />
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive YoY % change for *gross income* (salary + bonus + commission).
 *
 * `selectYoYChange` only operates on individual `YearSummary` fields, so
 * we synthesise gross-income YoY from this year's and last year's summary
 * directly. Returns `null` when the prior year has zero gross income —
 * matches the contract of `selectYoYChange` so KpiCard's null-handling
 * works uniformly across all four cards.
 */
const useGrossYoY = (): number | null =>
  useFinanceStore((s) => {
    const year = s.selectedYear;
    const prior = s.data.years[String(year - 1)];
    if (!prior) return null;
    const prev = selectYearSummary(s, year - 1);
    const prevGross = prev.salary + prev.bonus + prev.commission;
    if (prevGross === 0) return null;
    const curr = selectYearSummary(s, year);
    const currGross = curr.salary + curr.bonus + curr.commission;
    return ((currGross - prevGross) / Math.abs(prevGross)) * 100;
  });

export default KpiCardGrid;
