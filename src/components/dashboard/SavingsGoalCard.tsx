/**
 * WealthLens — SavingsGoalCard (F11).
 *
 * Tracks "Kept" (year-to-date `remaining` from the year summary, mirroring
 * the Kept KPI) against a user-defined yearly target stored in the goals
 * store. Adds a streak indicator: the count of consecutive months ending on
 * the LAST month with data where `remaining > 0`. We anchor the streak on
 * the rightmost month that actually has income/expense data so an empty
 * December for the current year doesn't artificially zero out the streak.
 *
 * Goal is a UI preference, not financial data — it lives in `goalsStore`,
 * not `financeStore`. Unset goals render a "ตั้งเป้า" CTA instead of a
 * misleading 0% bar.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import {
  useMonthlySummariesForYear,
  useSelectedYear,
} from '@/hooks/useFinanceData';
import { sumAnnualKept, useGoalsStore } from '@/stores/goalsStore';
import { formatNumber, formatPercent, formatTHB } from '@/utils/formatters';
import type { MonthlySummaryRow } from '@/stores/selectors';

// ---------------------------------------------------------------------------
// Streak helper
// ---------------------------------------------------------------------------

/**
 * Determine the last month in the year that has tracked activity. We look at
 * either income or expenses (a month is "touched" if its summary moved any
 * non-zero value). Returns 0 when no month has data.
 */
const findLastMonthWithData = (rows: MonthlySummaryRow[]): number => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (
      row.gross !== 0 ||
      row.totalExpenses !== 0 ||
      row.totalDeductions !== 0
    ) {
      return row.month;
    }
  }
  return 0;
};

/**
 * Walk backwards from `lastMonth` and count consecutive months where
 * `remaining > 0`. Stops at the first month with `remaining <= 0` or with
 * no data at all (gross = expenses = 0 → break, since that's an unfilled
 * gap, not a deliberate negative month).
 */
const calculateStreak = (rows: MonthlySummaryRow[]): number => {
  const lastMonth = findLastMonthWithData(rows);
  if (lastMonth === 0) return 0;
  let streak = 0;
  for (let m = lastMonth; m >= 1; m -= 1) {
    const row = rows[m - 1];
    const hasData = row.gross !== 0 || row.totalExpenses !== 0;
    if (!hasData) break;
    if (row.remaining > 0) streak += 1;
    else break;
  }
  return streak;
};

// ---------------------------------------------------------------------------
// Goal edit modal
// ---------------------------------------------------------------------------

interface GoalEditModalProps {
  open: boolean;
  onClose: () => void;
  initialAmount: number;
  year: number;
  onSave: (amount: number) => void;
}

const GoalEditModal = ({
  open,
  onClose,
  initialAmount,
  year,
  onSave,
}: GoalEditModalProps): ReactNode => {
  const [text, setText] = useState<string>(
    initialAmount > 0 ? formatNumber(initialAmount) : '',
  );

  // Strip non-digits and re-format with commas as the user types so the
  // input always reads like real money.
  const handleChange = (raw: string): void => {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 0) {
      setText('');
      return;
    }
    setText(formatNumber(Number(digits)));
  };

  const handleSubmit = (): void => {
    const numeric = Number(text.replace(/,/g, ''));
    onSave(Number.isFinite(numeric) ? numeric : 0);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`ตั้งเป้าออม ${year}`}
      size="sm"
    >
      <div className="px-6 py-5 space-y-4">
        <label className="block">
          <span className="text-sm text-slate-600">เป้าหมายรายปี (บาท)</span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="เช่น 500,000"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            บันทึก
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export const SavingsGoalCard = (): ReactNode => {
  const year = useSelectedYear();
  const monthlyRows = useMonthlySummariesForYear(year);
  const goal = useGoalsStore((s) => s.yearlyGoals[String(year)] ?? 0);
  const setYearlyGoal = useGoalsStore((s) => s.setYearlyGoal);
  // Kept = manually-entered Krungsri balance, now per-month. Display the
  // annual sum here. Editing the rolled-up annual figure doesn't make sense
  // (it's a derived total), so this number is read-only on this card —
  // per-month edits live on the Monthly page.
  const keptYearBucket = useGoalsStore((s) => s.keptBalances[String(year)]);
  const kept = sumAnnualKept(keptYearBucket);

  const [editing, setEditing] = useState(false);

  const streak = useMemo(() => calculateStreak(monthlyRows), [monthlyRows]);

  // Progress + shortfall — guard against goal=0 to avoid division by zero
  // and a misleading "100%" or "Infinity%" being rendered.
  const hasGoal = goal > 0;
  const progressFraction = hasGoal ? Math.min(1, Math.max(0, kept / goal)) : 0;
  const shortfall = hasGoal ? Math.max(0, goal - kept) : 0;
  const goalReached = hasGoal && kept >= goal;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-base text-savings"
          >
            🎯
          </span>
          <h3 className="text-base font-semibold text-slate-900">
            เป้าหมายออม — {year}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-primary hover:text-primary-dark"
        >
          {hasGoal ? 'แก้ไข ✏️' : 'ตั้งเป้า ✏️'}
        </button>
      </div>

      {/* Body */}
      {hasGoal ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500">Kept (กรุงศรี)</div>
              <div
                className="financial-number text-xl font-bold tabular-nums text-slate-900"
                title="ผลรวมรายเดือนของบัญชี Kept ปีนี้"
              >
                {formatTHB(kept)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                แก้ไขรายเดือนที่หน้า Monthly
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">เป้าหมาย</div>
              <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
                {formatTHB(goal)}
              </div>
            </div>
          </div>

          <div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuenow={Math.round(progressFraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="ความคืบหน้าเป้าออม"
            >
              <div
                className="h-full rounded-full bg-savings transition-all duration-500"
                style={{ width: `${progressFraction * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-semibold tabular-nums text-savings">
                {formatPercent(progressFraction)}
              </span>
              <span className="text-slate-500">
                {goalReached
                  ? 'ถึงเป้าแล้ว 🎉'
                  : `ขาดอีก ${formatTHB(shortfall)}`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">Kept (YTD)</div>
            <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
              {formatTHB(kept)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary"
          >
            ตั้งเป้าออมปีนี้เพื่อเริ่มติดตามความคืบหน้า
          </button>
        </div>
      )}

      {/* Streak badge — based on monthly เหลือจริง > 0 (derived) */}
      <div className="border-t border-slate-100 pt-3 text-xs">
        {streak >= 2 ? (
          <span className="font-medium text-slate-700">
            <span aria-hidden="true">🔥</span> Streak:{' '}
            <span className="tabular-nums">{streak}</span> เดือนต่อกันที่
            เหลือจริง &gt; 0
          </span>
        ) : streak === 1 ? (
          <span className="font-medium text-slate-700">
            <span aria-hidden="true">✨</span> เริ่ม streak แล้ว 1 เดือน — ไปต่อ!
          </span>
        ) : (
          <span className="text-slate-500">เริ่มออมเดือนนี้กันเถอะ</span>
        )}
      </div>

      <GoalEditModal
        open={editing}
        onClose={() => setEditing(false)}
        initialAmount={goal}
        year={year}
        onSave={(amount) => setYearlyGoal(year, amount)}
      />
    </div>
  );
};

export default SavingsGoalCard;
