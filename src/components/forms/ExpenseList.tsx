/**
 * WealthLens — Expense list with inline edit/delete (F08 + UXUI.md §6.3).
 *
 * Renders all `ExpenseItem` rows for a given (year, month) with a footer
 * total that matches "รวมจ่าย" in the Monthly Detail mock. Supports two
 * shapes via the `groupByCategory` prop:
 *
 *   • grouped (default) — category sub-headers with per-category subtotals,
 *     mirroring the Monthly Detail page sketch in UXUI.md §5.3.
 *   • flat — single list, useful inside narrow columns or quick previews.
 *
 * Edit/Delete:
 *   - ✏️ opens `ExpenseForm` inside a Modal pre-populated with the row.
 *   - 🗑️ confirms via `window.confirm` then calls `deleteExpense`.
 *
 * The Zustand subscription means deletes/edits propagate without manual
 * re-fetching — the list re-renders automatically when the store changes.
 */

import { useMemo, useState, type ReactNode } from 'react';

import Modal from '@/components/ui/Modal';
import { useFinanceStore } from '@/stores/financeStore';
import { selectMonthExpenses } from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import {
  CATEGORY_ORDER,
  EXPENSE_CATEGORIES,
} from '@/types/expense-categories';
import type { ExpenseCategory, ExpenseItem } from '@/types';
import { formatTHB, formatThaiMonth } from '@/utils/formatters';
import { findRecurringTemplate } from '@/utils/recurringTemplate';

import ExpenseForm from './ExpenseForm';

export interface ExpenseListProps {
  year: number;
  /** Calendar month, 1-12. */
  month: number;
  /** Group rows under category headers (with subtotals). Default true. */
  groupByCategory?: boolean;
  /** Show the top-right "+ เพิ่มค่าใช้จ่าย" button. Default true. */
  showAddButton?: boolean;
}

interface ExpenseRowProps {
  item: ExpenseItem;
  onEdit: (item: ExpenseItem) => void;
  onDelete: (item: ExpenseItem) => void;
  /** Show the leading category icon. Suppressed inside grouped view. */
  showIcon?: boolean;
}

const ExpenseRow = ({
  item,
  onEdit,
  onDelete,
  showIcon = true,
}: ExpenseRowProps): ReactNode => {
  const meta = EXPENSE_CATEGORIES[item.category];
  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition">
      {showIcon && (
        <span aria-hidden="true" className="text-base w-6 text-center">
          {meta.icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">
          {item.name}
          {item.isRecurring && (
            <span
              title="รายการประจำเดือน"
              className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary-light rounded"
            >
              ประจำ
            </span>
          )}
        </p>
      </div>
      <span className="text-sm financial-number text-slate-900 tabular-nums">
        {formatTHB(item.amount)}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(item)}
          aria-label={`แก้ไข ${item.name}`}
          className="p-1 text-slate-400 hover:text-primary transition"
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          aria-label={`ลบ ${item.name}`}
          className="p-1 text-slate-400 hover:text-expense transition"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

export const ExpenseList = ({
  year,
  month,
  groupByCategory = true,
  showAddButton = true,
}: ExpenseListProps): ReactNode => {
  // Subscribe to the slice we render so the list updates after add/edit/delete.
  const items = useFinanceStore((state) =>
    selectMonthExpenses({ data: state.data }, year, month),
  );
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const pushToast = useToastStore((s) => s.push);

  const handleFillRecurring = (): void => {
    const data = useFinanceStore.getState().data;
    const template = findRecurringTemplate(data, year, month);
    if (!template) {
      pushToast({
        message: 'ไม่มีรายการประจำให้เติม (หรือเติมครบแล้ว)',
        tone: 'info',
      });
      return;
    }
    for (const item of template.items) {
      addExpense(year, month, item);
    }
    pushToast({
      message: `เติม ${template.items.length} รายการจาก ${formatThaiMonth(template.sourceMonth)} ${template.sourceYear}`,
      tone: 'success',
    });
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<
    ExpenseCategory | undefined
  >(undefined);

  // Group items in stable category order. Empty categories are dropped from
  // the rendered list so the grouped view doesn't spam empty headers.
  const grouped = useMemo(() => {
    const map = new Map<ExpenseCategory, ExpenseItem[]>();
    for (const cat of CATEGORY_ORDER) {
      const filtered = items.filter((it) => it.category === cat);
      if (filtered.length > 0) map.set(cat, filtered);
    }
    return map;
  }, [items]);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + it.amount, 0),
    [items],
  );

  const openAdd = (cat?: ExpenseCategory): void => {
    setEditing(null);
    setDefaultCategory(cat);
    setModalOpen(true);
  };

  const openEdit = (item: ExpenseItem): void => {
    setEditing(item);
    setDefaultCategory(undefined);
    setModalOpen(true);
  };

  const handleDelete = (item: ExpenseItem): void => {
    // Native confirm keeps the dependency footprint zero. If we ever want a
    // designed dialog, swap in <Modal> + a small <ConfirmDialog> wrapper.
    if (window.confirm(`ลบรายการ '${item.name}'?`)) {
      deleteExpense(year, month, item.id);
    }
  };

  const handleClose = (): void => {
    setModalOpen(false);
    setEditing(null);
    setDefaultCategory(undefined);
  };

  // Empty state: short prompt + primary CTA that opens the add modal.
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500 mb-4">ยังไม่มีรายการค่าใช้จ่าย</p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleFillRecurring}
            className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary-light transition"
          >
            📋 เติมรายการประจำ
          </button>
          <button
            type="button"
            onClick={() => openAdd()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition"
          >
            + เพิ่มค่าใช้จ่าย
          </button>
        </div>
        <Modal
          open={modalOpen}
          onClose={handleClose}
          title="เพิ่มค่าใช้จ่าย"
          size="sm"
        >
          <div className="px-6 py-5">
            <ExpenseForm
              year={year}
              month={month}
              defaultCategory={defaultCategory}
              onSaved={() => {
                /* keep modal open for quick-add — Form handles state reset */
              }}
              onCancel={handleClose}
            />
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showAddButton && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleFillRecurring}
            title="เติมรายการประจำจากเดือนล่าสุดที่มี (ข้ามรายการที่มีแล้ว)"
            className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            📋 เติมรายการประจำ
          </button>
          <button
            type="button"
            onClick={() => openAdd()}
            className="px-3 py-1.5 text-sm font-medium text-primary bg-primary-light rounded-md hover:bg-primary hover:text-white transition"
          >
            + เพิ่มค่าใช้จ่าย
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {groupByCategory ? (
          [...grouped.entries()].map(([cat, rows]) => {
            const meta = EXPENSE_CATEGORIES[cat];
            const subtotal = rows.reduce((acc, it) => acc + it.amount, 0);
            return (
              <div key={cat} className="py-2">
                <div className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{meta.icon}</span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {meta.label}
                    </h3>
                  </div>
                  <span className="text-xs financial-number text-slate-500 tabular-nums">
                    {formatTHB(subtotal)}
                  </span>
                </div>
                <div className="px-1">
                  {rows.map((item) => (
                    <ExpenseRow
                      key={item.id}
                      item={item}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      showIcon={false}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-2 px-1">
            {items.map((item) => (
              <ExpenseRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Footer total — matches "รวมจ่าย:" in UXUI.md §5.3. */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
          <span className="text-sm font-semibold text-slate-700">รวมจ่าย</span>
          <span className="text-base font-semibold text-slate-900 financial-number tabular-nums">
            {formatTHB(total)}
          </span>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editing != null ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}
        size="sm"
      >
        <div className="px-6 py-5">
          <ExpenseForm
            year={year}
            month={month}
            initialValues={editing}
            defaultCategory={defaultCategory}
            onSaved={() => {
              // Edit mode → close immediately. Add mode → keep open so the
              // quick-add flow inside ExpenseForm can take over.
              if (editing != null) handleClose();
            }}
            onCancel={handleClose}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ExpenseList;
