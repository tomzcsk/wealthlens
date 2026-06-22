/**
 * WealthLens — Recurring-fill preview/edit modal.
 *
 * Sits between the "📋 เติมรายการประจำ" button and the actual write. Instead
 * of looping `addExpense`/`addSavings` immediately, the parent list derives a
 * template (via `recurringTemplate.ts`) and hands it here so Tom can review and
 * tweak before anything lands in the month:
 *
 *   • ☑ ติ๊กเลือก/ไม่เอา  • แก้ชื่อ  • เปลี่ยนหมวด  • แก้จำนวนเงิน
 *   • + เพิ่มแถวใหม่       • 🗑️ ลบแถว
 *
 * Generic over expense vs savings — it knows nothing about either domain. The
 * parent passes the category options (label + icon) and an `onConfirm` that
 * receives only the kept rows (included && non-empty name). `isRecurring` is
 * stamped by the parent when it builds the store object, not here.
 *
 * The working rows live in local state, re-seeded each time the modal opens.
 * Closing (ESC / backdrop / ยกเลิก) discards everything — nothing is written
 * until "ยืนยันเติม".
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import Modal from '@/components/ui/Modal';
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

/** Working row — adds a local React key + include flag over the draft. */
interface DraftRow extends RecurringFillDraft {
  key: number;
  included: boolean;
}

export interface RecurringFillModalProps {
  open: boolean;
  onClose: () => void;
  /** Header title, e.g. "เติมรายการประจำ" / "เติมรายการออมประจำ". */
  title: string;
  /** Provenance line, e.g. "จาก มี.ค. 2026". Undefined ⇒ empty-template hint. */
  sourceLabel?: string;
  /** Template items pre-filling the list. Empty ⇒ start blank. */
  initialItems: ReadonlyArray<RecurringFillDraft>;
  /** Category dropdown options (already ordered). */
  categories: ReadonlyArray<RecurringFillCategoryOption>;
  /** Category assigned to rows added via "เพิ่มรายการ". */
  defaultCategory: string;
  /** Fires on confirm with only the kept rows (included && non-empty name). */
  onConfirm: (items: ReadonlyArray<RecurringFillDraft>) => void;
}

const GRID = 'grid grid-cols-[24px_1fr_148px_104px_28px] gap-2 items-center';

export const RecurringFillModal = ({
  open,
  onClose,
  title,
  sourceLabel,
  initialItems,
  categories,
  defaultCategory,
  onConfirm,
}: RecurringFillModalProps): ReactNode => {
  const [rows, setRows] = useState<DraftRow[]>([]);
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
      setRows(
        initialItems.map((it) => ({
          ...it,
          included: true,
          key: nextKey(),
        })),
      );
    } else if (!open) {
      seeded.current = false;
    }
  }, [open, initialItems]);

  const patchRow = (key: number, patch: Partial<DraftRow>): void => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const removeRow = (key: number): void => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const addRow = (): void => {
    setRows((prev) => [
      ...prev,
      { key: nextKey(), included: true, name: '', category: defaultCategory, amount: 0 },
    ]);
  };

  const kept = useMemo(
    () => rows.filter((r) => r.included && r.name.trim() !== ''),
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

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {/* Provenance / empty hint */}
      <div className="px-6 pt-3">
        {sourceLabel != null ? (
          <p className="text-xs text-slate-500">{sourceLabel}</p>
        ) : (
          <p className="text-xs text-amber-600">
            ไม่พบรายการประจำเดิม — เพิ่มเองได้
          </p>
        )}
      </div>

      {/* Rows */}
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
          {rows.map((r) => (
            <div
              key={r.key}
              className={`${GRID} rounded-md px-2 py-1.5 hover:bg-slate-50 transition ${
                r.included ? '' : 'opacity-45'
              }`}
            >
              <input
                type="checkbox"
                checked={r.included}
                onChange={(e) => patchRow(r.key, { included: e.target.checked })}
                aria-label={`เลือก ${r.name || 'รายการ'}`}
                className="h-[17px] w-[17px] accent-primary cursor-pointer"
              />
              <input
                type="text"
                value={r.name}
                placeholder="ชื่อรายการ"
                onChange={(e) => patchRow(r.key, { name: e.target.value })}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <select
                value={r.category}
                onChange={(e) => patchRow(r.key, { category: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 cursor-pointer focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
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
                onChange={(e) =>
                  patchRow(r.key, { amount: Number(e.target.value) || 0 })
                }
                aria-label={`จำนวนเงิน ${r.name || 'รายการ'}`}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-right text-slate-900 tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                aria-label={`ลบ ${r.name || 'รายการ'}`}
                className="text-slate-400 hover:text-expense transition text-sm"
              >
                🗑️
              </button>
            </div>
          ))}
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
