/**
 * WealthLens — Recurring-fill preview/edit modal.
 *
 * Sits between the "📋 เติมรายการประจำ" button and the actual write. The parent
 * list builds the recurring checklist (via `buildRecurring*Library`) and hands
 * it here, so Tom never has to retype a known item:
 *
 *   🟢 ติ๊กไว้ให้ (active)  — recurring last month; default-checked, add on confirm
 *   🔒 "มีแล้ว"   (present) — already in this month; shown for context, never re-added
 *
 * Tom can still edit each actionable row (ชื่อ/หมวด/จำนวนเงิน), untick, delete,
 * or "+ เพิ่มรายการ" a brand-new one. Locked (present) rows are read-only.
 *
 * Generic over expense vs savings — it knows nothing about either domain. The
 * parent passes category options (label + icon) and an `onConfirm` receiving
 * only the kept rows (checked, unlocked, non-empty name). `isRecurring` is
 * stamped by the parent when it builds the store object, not here.
 *
 * Working rows live in local state, re-seeded each time the modal opens.
 * Closing (ESC / backdrop / ยกเลิก) discards everything — nothing is written
 * until "ยืนยันเติม".
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import Modal from '@/components/ui/Modal';
import type { RecurringLibraryStatus } from '@/utils/recurringTemplate';
import { formatTHB } from '@/utils/formatters';

export interface RecurringFillCategoryOption {
  /** ExpenseCategory | SavingsCategory string. */
  value: string;
  label: string;
  icon: string;
}

export interface RecurringFillDraft {
  category: string;
  name: string;
  amount: number;
}

/** A library item handed in to pre-fill the checklist. */
export interface RecurringFillItem extends RecurringFillDraft {
  /** Omitted ⇒ treated as a fresh actionable row (checked, unlocked). */
  status?: RecurringLibraryStatus;
}

/** Working row — adds local key + flags over the draft. */
interface DraftRow extends RecurringFillDraft {
  key: number;
  included: boolean;
  /** Already in this month → read-only context, excluded from confirm. */
  locked: boolean;
  status?: RecurringLibraryStatus;
  /**
   * The library name captured at seed time. The visible `name` field is
   * editable, so retiring a recurring item must key off THIS original name
   * (what the store actually stored) — not whatever Tom may have typed over
   * it. Only set for library rows (those with a `status`).
   */
  originalName?: string;
}

export interface RecurringFillModalProps {
  open: boolean;
  onClose: () => void;
  /** Header title, e.g. "เติมรายการประจำ" / "เติมรายการออมประจำ". */
  title: string;
  /** Library items pre-filling the checklist. Empty ⇒ start blank. */
  initialItems: ReadonlyArray<RecurringFillItem>;
  /** Category dropdown options (already ordered). */
  categories: ReadonlyArray<RecurringFillCategoryOption>;
  /** Category assigned to rows added via "เพิ่มรายการ". */
  defaultCategory: string;
  /** Fires on confirm with only the kept rows (checked, unlocked, non-empty). */
  onConfirm: (items: ReadonlyArray<RecurringFillDraft>) => void;
  /**
   * Fires when Tom retires a LIBRARY row via 🗑️ (after inline confirm):
   * the recurring flag for that name should be cleared everywhere so the row
   * can't reappear next open. Receives the ORIGINAL library name. Omit to
   * keep 🗑️ purely local (used for parents that don't own recurring state).
   */
  onStopRecurring?: (name: string) => void;
}

const GRID = 'grid grid-cols-[24px_1fr_140px_100px_28px] gap-2 items-center';

const seedRow = (it: RecurringFillItem, key: number): DraftRow => ({
  category: it.category,
  name: it.name,
  amount: it.amount,
  status: it.status,
  // Capture the library name before the field becomes editable — only library
  // rows (with a status) can be retired, so manual rows leave this undefined.
  originalName: it.status != null ? it.name : undefined,
  key,
  // present rows are in the month already → render checked but read-only,
  // excluded from confirm via `locked`. Active + manual rows default checked.
  locked: it.status === 'present',
  included: true,
});

export const RecurringFillModal = ({
  open,
  onClose,
  title,
  initialItems,
  categories,
  defaultCategory,
  onConfirm,
  onStopRecurring,
}: RecurringFillModalProps): ReactNode => {
  const [rows, setRows] = useState<DraftRow[]>([]);
  /** Key of the row currently showing the inline "retire?" confirm, if any. */
  const [confirmKey, setConfirmKey] = useState<number | null>(null);
  const keyRef = useRef(0);
  const seeded = useRef(false);

  const nextKey = (): number => {
    keyRef.current += 1;
    return keyRef.current;
  };

  // Seed once per open. Including `initialItems` in deps satisfies the hooks
  // lint rule; the `seeded` guard keeps mid-edit re-renders from wiping rows.
  useEffect(() => {
    if (open && !seeded.current) {
      seeded.current = true;
      setRows(initialItems.map((it) => seedRow(it, nextKey())));
      // Reset any lingering inline-confirm from a previous open. (Row keys are
      // monotonic and never reused, so a stale confirmKey can't match a fresh
      // row — but resetting here keeps the state honest.)
      setConfirmKey(null);
    } else if (!open) {
      seeded.current = false;
    }
  }, [open, initialItems]);

  const patchRow = (key: number, patch: Partial<DraftRow>): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: number): void => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  /**
   * 🗑️ dispatch. A library row (has a `status`) means "retire this recurring
   * item permanently" — that needs confirmation because it changes the store
   * everywhere, so we flip the row into inline-confirm mode (NEVER
   * `window.confirm`, which freezes this environment). A manual row is just a
   * local scratch entry: drop it silently, no store write.
   */
  const handleTrash = (r: DraftRow): void => {
    if (r.status != null) {
      setConfirmKey(r.key);
    } else {
      removeRow(r.key);
    }
  };

  /** Confirm retirement: clear the recurring flag everywhere, then drop the row. */
  const confirmStop = (r: DraftRow): void => {
    if (r.originalName != null) onStopRecurring?.(r.originalName);
    removeRow(r.key);
    setConfirmKey(null);
  };

  const addRow = (): void => {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        included: true,
        locked: false,
        name: '',
        category: defaultCategory,
        amount: 0,
      },
    ]);
  };

  const kept = useMemo(
    () => rows.filter((r) => !r.locked && r.included && r.name.trim() !== ''),
    [rows],
  );
  const total = useMemo(() => kept.reduce((acc, r) => acc + r.amount, 0), [kept]);

  const handleConfirm = (): void => {
    if (kept.length === 0) return;
    onConfirm(
      kept.map((r) => ({
        category: r.category,
        name: r.name.trim(),
        amount: r.amount,
      })),
    );
  };

  const hint =
    initialItems.length === 0
      ? 'ไม่พบรายการประจำเดิม — เพิ่มเองได้'
      : 'ติ๊กรายการที่จะเติมเข้าเดือนนี้ · 🔒 มีแล้ว = อยู่ในเดือนนี้แล้ว';

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="px-6 pt-3">
        <p
          className={`text-xs ${
            initialItems.length === 0 ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          {hint}
        </p>
      </div>

      <div className="px-6 py-3">
        {rows.length > 0 && (
          <div
            className={`${GRID} px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400`}
          >
            <span />
            <span>ชื่อรายการ</span>
            <span>หมวด</span>
            <span className="text-right">จำนวนเงิน</span>
            <span />
          </div>
        )}

        <div className="space-y-0.5">
          {rows.map((r) =>
            confirmKey === r.key ? (
              // Inline retire confirm — replaces the row in place. Speaks to
              // what it does ("stop being recurring"), and reassures no money
              // is removed, because 🗑️ here only clears the recurring flag.
              <div
                key={r.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-900 truncate">
                    เลิกเป็นรายการประจำ “{r.originalName ?? r.name}”?
                  </p>
                  <p className="text-[11px] text-amber-700">
                    เอาป้าย “ประจำ” ออกจากทุกเดือน — ไม่ลบยอดเงินหรือรายการเดิม
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => confirmStop(r)}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition"
                  >
                    ✓ เลิกเป็นรายการประจำ
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmKey(null)}
                    aria-label="ยกเลิก"
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
            <div
              key={r.key}
              className={`${GRID} rounded-md px-2 py-1.5 transition ${
                r.locked
                  ? 'opacity-55'
                  : r.included
                    ? 'hover:bg-slate-50'
                    : 'opacity-50 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={r.included}
                disabled={r.locked}
                onChange={(e) => patchRow(r.key, { included: e.target.checked })}
                aria-label={`เลือก ${r.name || 'รายการ'}`}
                className="h-[17px] w-[17px] accent-primary cursor-pointer disabled:cursor-not-allowed"
              />

              {/* Name (+ status badge) */}
              <div className="flex items-center gap-1.5 min-w-0">
                {r.locked ? (
                  <span className="flex-1 truncate text-sm text-slate-700">
                    {r.name}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={r.name}
                    placeholder="ชื่อรายการ"
                    onChange={(e) => patchRow(r.key, { name: e.target.value })}
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                  />
                )}
                {r.status === 'present' && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    🔒 มีแล้ว
                  </span>
                )}
              </div>

              <select
                value={r.category}
                disabled={r.locked}
                onChange={(e) => patchRow(r.key, { category: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 cursor-pointer focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={r.amount}
                min={0}
                disabled={r.locked}
                onChange={(e) =>
                  patchRow(r.key, { amount: Number(e.target.value) || 0 })
                }
                aria-label={`จำนวนเงิน ${r.name || 'รายการ'}`}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-right text-slate-900 tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light disabled:cursor-not-allowed disabled:bg-slate-50"
              />

              {/* Trash is available on EVERY row — including locked 'present'
                  rows — so Tom can retire an item he already has this month
                  (e.g. บ้าน) even though the rest of the row stays read-only. */}
              <button
                type="button"
                onClick={() => handleTrash(r)}
                aria-label={
                  r.status != null
                    ? `เลิกเป็นรายการประจำ ${r.originalName ?? (r.name || 'รายการ')}`
                    : `ลบ ${r.name || 'รายการ'}`
                }
                title={
                  r.status != null
                    ? 'เลิกเป็นรายการประจำ'
                    : 'ลบรายการนี้ออกจากรายการที่จะเติม'
                }
                className="text-slate-400 hover:text-expense transition text-sm"
              >
                🗑️
              </button>
            </div>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 w-full rounded-md border border-dashed border-primary bg-primary-light px-3 py-2 text-sm font-medium text-primary hover:bg-blue-100 transition"
        >
          + เพิ่มรายการ
        </button>
      </div>

      {/* Footer — sticky so it stays in view while the row list scrolls. */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3.5">
        <div className="text-sm text-slate-500">
          รวม (ที่เลือก):{' '}
          <span className="text-base font-semibold text-slate-900 tabular-nums">
            {formatTHB(total)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 transition"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={kept.length === 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            ยืนยันเติม {kept.length} รายการ
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RecurringFillModal;
