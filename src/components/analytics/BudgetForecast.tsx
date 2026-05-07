/**
 * BudgetForecast — F16
 *
 * Two-mode component driven by `useForecast()`:
 *
 *   1. PREDICT mode — when the forecast month has no actuals yet. Headlines
 *      the predicted total + range, then a category-by-category breakdown
 *      with each row's basis values. Reads as "here's what to expect."
 *
 *   2. COMPARE mode — when the forecast month already has actuals logged.
 *      Headlines forecast vs actual + variance %, then a per-category table
 *      with the same comparison. Reads as "how did we do."
 *
 * The mode flip is purely data-driven (`forecast.hasActual`) so the UI
 * adapts automatically the moment Tom logs the first item of a new month —
 * no toggle, no setting.
 *
 * Variance colour rules (only meaningful in COMPARE mode):
 *   - actual ≤ forecast (under-budget)        → green (success)
 *   - within ±range OR overshoot ≤ 5%         → green
 *   - overshoot 5%–15%                        → amber (warn)
 *   - overshoot > 15%                         → red (danger)
 *
 * Card chrome matches sibling analytics components (TrendAnalysis,
 * SubscriptionManager) — same `rounded-2xl border border-slate-200 bg-white
 * shadow-sm` shell, identical inner padding rhythm.
 */

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { useForecast } from '@/hooks/useForecast';
import { useFinanceStore } from '@/stores/financeStore';
import { selectExpenseByCategory } from '@/stores/selectors';
import type { ExpenseCategory } from '@/types';
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
import {
  THAI_MONTHS_SHORT,
  formatPercent,
  formatTHB,
  formatThaiMonthYear,
} from '@/utils/formatters';
import type { CategoryForecast, MonthForecast } from '@/utils/forecast';

// ---------------------------------------------------------------------------
// Helpers — variance classification
// ---------------------------------------------------------------------------

type VarianceTone = 'good' | 'warn' | 'bad';

interface Variance {
  /** actual - forecast (signed). Positive = over budget. */
  amountDelta: number;
  /** (actual - forecast) / forecast (fractional). 0 when forecast is 0. */
  pctDelta: number;
  tone: VarianceTone;
  /** True when actual sits within [rangeMin, rangeMax]. */
  withinRange: boolean;
}

const classifyVariance = (
  forecast: number,
  actual: number,
  rangeMin: number,
  rangeMax: number,
): Variance => {
  const amountDelta = actual - forecast;
  const pctDelta = forecast > 0 ? amountDelta / forecast : 0;
  const withinRange = actual >= rangeMin && actual <= rangeMax;

  // Under-budget or within the predicted range is unambiguously good.
  if (amountDelta <= 0 || withinRange) {
    return { amountDelta, pctDelta, tone: 'good', withinRange };
  }
  // Above range but only mildly so → warn; a clear blow-out → bad.
  if (pctDelta > 0.15) {
    return { amountDelta, pctDelta, tone: 'bad', withinRange };
  }
  if (pctDelta > 0.05) {
    return { amountDelta, pctDelta, tone: 'warn', withinRange };
  }
  return { amountDelta, pctDelta, tone: 'good', withinRange };
};

const toneTextClass = (tone: VarianceTone): string => {
  switch (tone) {
    case 'good':
      return 'text-emerald-600';
    case 'warn':
      return 'text-amber-600';
    case 'bad':
      return 'text-rose-600';
  }
};

const toneBadgeClass = (tone: VarianceTone): string => {
  switch (tone) {
    case 'good':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warn':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'bad':
      return 'bg-rose-50 text-rose-700 border-rose-200';
  }
};

// ---------------------------------------------------------------------------
// Helpers — basis range label ("Feb–Apr 2026" / spans years if needed)
// ---------------------------------------------------------------------------

const formatBasisRange = (forecast: MonthForecast): string => {
  const first = forecast.byCategory[0]?.basisMonths[0];
  const last = forecast.byCategory[0]?.basisMonths[2];
  if (!first || !last) return '';
  const firstShort = THAI_MONTHS_SHORT[first.month - 1] ?? '';
  const lastShort = THAI_MONTHS_SHORT[last.month - 1] ?? '';
  if (first.year === last.year) {
    return `${firstShort}–${lastShort} ${first.year}`;
  }
  return `${firstShort} ${first.year} – ${lastShort} ${last.year}`;
};

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

const PredictView = ({
  forecast,
}: {
  forecast: MonthForecast;
}): ReactNode => {
  return (
    <>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            คาดการณ์รวม
          </div>
          <div className="mt-0.5 text-3xl font-bold tabular-nums text-slate-900">
            {formatTHB(forecast.totalPoint)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ช่วง
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700">
            {formatTHB(forecast.totalMin)} – {formatTHB(forecast.totalMax)}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          แยกตามหมวด
        </div>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {forecast.byCategory.map((row) => (
            <PredictRow key={row.category} row={row} />
          ))}
          {forecast.byCategory.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-400">
              ยังไม่มีข้อมูลค่าใช้จ่ายเพียงพอสำหรับการคาดการณ์
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
};

const PredictRow = ({ row }: { row: CategoryForecast }): ReactNode => {
  const meta = EXPENSE_CATEGORIES[row.category];
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">{meta.icon}</span>
        <span className="text-sm text-slate-800">{meta.label}</span>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-slate-900">
          {formatTHB(row.pointForecast)}
        </div>
        <div className="text-xs tabular-nums text-slate-500">
          {formatTHB(row.rangeMin)} – {formatTHB(row.rangeMax)}
        </div>
      </div>
    </li>
  );
};

interface CompareViewProps {
  forecast: MonthForecast;
  actuals: Record<ExpenseCategory, number>;
  actualTotal: number;
}

const CompareView = ({
  forecast,
  actuals,
  actualTotal,
}: CompareViewProps): ReactNode => {
  const totalVariance = classifyVariance(
    forecast.totalPoint,
    actualTotal,
    forecast.totalMin,
    forecast.totalMax,
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ประมาณการ
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
            {formatTHB(forecast.totalPoint)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-slate-500">
            {formatTHB(forecast.totalMin)} – {formatTHB(forecast.totalMax)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            จริง
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
            {formatTHB(actualTotal)}
          </div>
          <div
            className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${toneBadgeClass(totalVariance.tone)}`}
          >
            {totalVariance.withinRange ? '✅ อยู่ในช่วง' : '⚠️ เกินช่วง'}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ผลต่าง
          </div>
          <div
            className={`mt-0.5 text-2xl font-bold tabular-nums ${toneTextClass(totalVariance.tone)}`}
          >
            {totalVariance.amountDelta >= 0 ? '+' : '-'}
            {formatTHB(Math.abs(totalVariance.amountDelta))}
          </div>
          <div
            className={`mt-0.5 text-xs tabular-nums ${toneTextClass(totalVariance.tone)}`}
          >
            {formatPercent(totalVariance.pctDelta, { signed: true })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          แยกตามหมวด
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">หมวด</th>
                <th className="px-4 py-2 text-right font-medium">ประมาณการ</th>
                <th className="px-4 py-2 text-right font-medium">จริง</th>
                <th className="px-4 py-2 text-right font-medium">ต่าง %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {forecast.byCategory.map((row) => {
                const actual = actuals[row.category] ?? 0;
                const v = classifyVariance(
                  row.pointForecast,
                  actual,
                  row.rangeMin,
                  row.rangeMax,
                );
                const meta = EXPENSE_CATEGORIES[row.category];
                return (
                  <tr key={row.category}>
                    <td className="px-4 py-2 text-slate-800">
                      <span className="mr-1.5" aria-hidden="true">
                        {meta.icon}
                      </span>
                      {meta.label}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {formatTHB(row.pointForecast)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      {formatTHB(actual)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold tabular-nums ${toneTextClass(v.tone)}`}
                    >
                      {formatPercent(v.pctDelta, { signed: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export const BudgetForecast = (): ReactNode => {
  const forecast = useForecast();
  const data = useFinanceStore((s) => s.data);

  // Pull actual category totals for the forecast month directly from the
  // store. Memoised on `data` + the forecast coordinates so we only recompute
  // when the underlying dataset or anchor month changes.
  const actuals = useMemo(() => {
    if (!forecast) return null;
    return selectExpenseByCategory(
      { data },
      forecast.forYear,
      forecast.forMonth,
    );
  }, [data, forecast]);

  const actualTotal = useMemo(() => {
    if (!actuals) return 0;
    return Object.values(actuals).reduce((acc, n) => acc + n, 0);
  }, [actuals]);

  if (!forecast) {
    return (
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">
            ประมาณการเดือนหน้า
          </h2>
        </header>
        <p className="text-sm text-slate-500">
          ยังไม่มีข้อมูลค่าใช้จ่ายเพียงพอสำหรับการคาดการณ์
        </p>
      </section>
    );
  }

  const forecastLabel = formatThaiMonthYear(forecast.forMonth, forecast.forYear);
  const basisLabel = formatBasisRange(forecast);
  const inCompareMode = forecast.hasActual;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {inCompareMode
              ? `ประมาณการ vs จริง — ${forecastLabel}`
              : `ประมาณการเดือนหน้า — ${forecastLabel}`}
          </h2>
          <p className="text-xs text-slate-500">
            {inCompareMode
              ? 'เปรียบเทียบคาดการณ์กับยอดจริงของเดือนนี้'
              : 'การคาดการณ์ใช้ค่าเฉลี่ย 3 เดือนล่าสุดในแต่ละหมวด'}
          </p>
        </div>
        {basisLabel ? (
          <span className="self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            อ้างอิงจาก {basisLabel}
          </span>
        ) : null}
      </header>

      {inCompareMode && actuals ? (
        <CompareView
          forecast={forecast}
          actuals={actuals}
          actualTotal={actualTotal}
        />
      ) : (
        <PredictView forecast={forecast} />
      )}

      {!inCompareMode ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          ℹ️ การคาดการณ์ใช้ค่าเฉลี่ย 3 เดือนล่าสุดในแต่ละหมวด ช่วงคาดการณ์
          คำนวณจากความผันผวนของข้อมูล (CV — coefficient of variation)
        </p>
      ) : null}
    </section>
  );
};

export default BudgetForecast;
