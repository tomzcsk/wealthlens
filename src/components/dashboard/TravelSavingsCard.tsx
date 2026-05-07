/**
 * WealthLens — TravelSavingsCard (F11).
 *
 * Standalone tracker for "ออมเที่ยว" (travel savings) — a 2026+ category
 * where Tom carves out a slice each month for a future trip. The total
 * sums every expense item in the active year whose category is `savings`
 * AND whose name includes the literal "เที่ยว" (case-insensitive). The
 * goal lives in `goalsStore.travelSavingsGoal` (single value, not per-year)
 * because the trip is a one-shot target, not an annual quota.
 *
 * Visual parity with SavingsGoalCard so the two read as a matched pair on
 * the Overview page. When the active year has no travel savings rows we
 * render the card in a muted state instead of hiding it entirely — this
 * keeps the layout grid stable as Tom navigates through earlier years.
 */

import { useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';
import {
  useSelectedYear,
  useTravelSavingsTotal,
} from '@/hooks/useFinanceData';
import { useGoalsStore } from '@/stores/goalsStore';
import { formatNumber, formatPercent, formatTHB } from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Goal edit modal — small variant for a single value
// ---------------------------------------------------------------------------

interface TravelGoalEditModalProps {
  open: boolean;
  onClose: () => void;
  initialAmount: number;
  onSave: (amount: number) => void;
}

const TravelGoalEditModal = ({
  open,
  onClose,
  initialAmount,
  onSave,
}: TravelGoalEditModalProps): ReactNode => {
  const [text, setText] = useState<string>(
    initialAmount > 0 ? formatNumber(initialAmount) : '',
  );

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
    <Modal open={open} onClose={onClose} title="ตั้งเป้าออมเที่ยว" size="sm">
      <div className="px-6 py-5 space-y-4">
        <label className="block">
          <span className="text-sm text-slate-600">
            เป้าหมายออมเที่ยว (บาท)
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="เช่น 100,000"
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

export const TravelSavingsCard = (): ReactNode => {
  const year = useSelectedYear();
  const saved = useTravelSavingsTotal(year);
  const goal = useGoalsStore((s) => s.travelSavingsGoal);
  const setTravelSavingsGoal = useGoalsStore((s) => s.setTravelSavingsGoal);

  const [editing, setEditing] = useState(false);

  const hasGoal = goal > 0;
  const hasActivity = saved > 0;
  const progressFraction = hasGoal
    ? Math.min(1, Math.max(0, saved / goal))
    : 0;
  const shortfall = hasGoal ? Math.max(0, goal - saved) : 0;
  const goalReached = hasGoal && saved >= goal;

  // Muted styling when no rows exist for the active year — communicates
  // "this category isn't active for this year yet" without yanking the
  // card out of the layout grid.
  const wrapperOpacity = hasActivity ? '' : 'opacity-60';

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 ${wrapperOpacity}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-base"
          >
            ✈️
          </span>
          <h3 className="text-base font-semibold text-slate-900">
            ออมเที่ยว — {year}
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
              <div className="text-xs text-slate-500">ออมแล้ว</div>
              <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
                {formatTHB(saved)}
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
              aria-label="ความคืบหน้าออมเที่ยว"
            >
              <div
                className="h-full rounded-full bg-cat-savings transition-all duration-500"
                style={{ width: `${progressFraction * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-semibold tabular-nums text-emerald-600">
                {formatPercent(progressFraction)}
              </span>
              <span className="text-slate-500">
                {goalReached
                  ? 'พร้อมออกเดินทาง 🎉'
                  : `ขาดอีก ${formatTHB(shortfall)}`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-slate-500">ออมแล้ว</div>
            <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
              {formatTHB(saved)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary"
          >
            ตั้งเป้าทริปต่อไปเพื่อเริ่มติดตาม
          </button>
        </div>
      )}

      {!hasActivity && (
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          ยังไม่มีรายการ &quot;ออมเที่ยว&quot; ปีนี้
        </div>
      )}

      <TravelGoalEditModal
        open={editing}
        onClose={() => setEditing(false)}
        initialAmount={goal}
        onSave={setTravelSavingsGoal}
      />
    </div>
  );
};

export default TravelSavingsCard;
