/**
 * WealthLens — Savings list with inline edit/delete.
 *
 * Mirrors `ExpenseList` so the Monthly Detail page reads as a consistent
 * pair of stacked sections. Renders all `SavingsItem` rows for a given
 * (year, month) grouped by category, with a footer total of "รวมออม".
 *
 * Edit/Delete:
 *   - ✏️ opens `SavingsForm` inside a Modal pre-populated with the row.
 *   - 🗑️ confirms via `window.confirm` then calls `deleteSavings`.
 */

import { useMemo, useState, type ReactNode } from 'react';

import Modal from '@/components/ui/Modal';
import { useFinanceStore } from '@/stores/financeStore';
import { selectMonthSavings } from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import {
  SAVINGS_CATEGORIES,
  SAVINGS_CATEGORY_ORDER,
} from '@/types/savings-categories';
import type { SavingsCategory, SavingsItem } from '@/types';
import { formatTHB, formatThaiMonth } from '@/utils/formatters';
import { findRecurringSavingsTemplate } from '@/utils/recurringTemplate';

import SavingsForm from './SavingsForm';

export interface SavingsListProps {
  year: number;
  /** Calendar month, 1-12. */
  month: number;
  /** Group rows under category headers (with subtotals). Default true. */
  groupByCategory?: boolean;
  /** Show the top-right "+ เพิ่มออม" button. Default true. */
  showAddButton?: boolean;
}

interface SavingsRowProps {
  item: SavingsItem;
  onEdit: (item: SavingsItem) => void;
  onDelete: (item: SavingsItem) => void;
  /** Show the leading category icon. Suppressed inside grouped view. */
  showIcon?: boolean;
}

const SavingsRow = ({
  item,
  onEdit,
  onDelete,
  showIcon = true,
}: SavingsRowProps): ReactNode => {
  const meta = SAVINGS_CATEGORIES[item.category];
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

export const SavingsList = ({
  year,
  month,
  groupByCategory = true,
  showAddButton = true,
}: SavingsListProps): ReactNode => {
  const items = useFinanceStore((state) =>
    selectMonthSavings({ data: state.data }, year, month),
  );
  const deleteSavings = useFinanceStore((s) => s.deleteSavings);
  const addSavings = useFinanceStore((s) => s.addSavings);
  const pushToast = useToastStore((s) => s.push);

  const handleFillRecurring = (): void => {
    const data = useFinanceStore.getState().data;
    const template = findRecurringSavingsTemplate(data, year, month);
    if (!template) {
      pushToast({
        message: 'ไม่มีรายการออมประจำให้เติม (หรือเติมครบแล้ว)',
        tone: 'info',
      });
      return;
    }
    for (const item of template.items) {
      addSavings(year, month, item);
    }
    pushToast({
      message: `เติม ${template.items.length} รายการออมจาก ${formatThaiMonth(template.sourceMonth)} ${template.sourceYear}`,
      tone: 'success',
    });
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsItem | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<
    SavingsCategory | undefined
  >(undefined);

  const grouped = useMemo(() => {
    const map = new Map<SavingsCategory, SavingsItem[]>();
    for (const cat of SAVINGS_CATEGORY_ORDER) {
      const filtered = items.filter((it) => it.category === cat);
      if (filtered.length > 0) map.set(cat, filtered);
    }
    return map;
  }, [items]);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + it.amount, 0),
    [items],
  );

  const openAdd = (cat?: SavingsCategory): void => {
    setEditing(null);
    setDefaultCategory(cat);
    setModalOpen(true);
  };

  const openEdit = (item: SavingsItem): void => {
    setEditing(item);
    setDefaultCategory(undefined);
    setModalOpen(true);
  };

  const handleDelete = (item: SavingsItem): void => {
    if (window.confirm(`ลบรายการ '${item.name}'?`)) {
      deleteSavings(year, month, item.id);
    }
  };

  const handleClose = (): void => {
    setModalOpen(false);
    setEditing(null);
    setDefaultCategory(undefined);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500 mb-4">ยังไม่มีรายการออม / ลงทุน</p>
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
            + เพิ่มรายการออม
          </button>
        </div>
        <Modal
          open={modalOpen}
          onClose={handleClose}
          title="เพิ่มรายการออม"
          size="sm"
        >
          <div className="px-6 py-5">
            <SavingsForm
              year={year}
              month={month}
              defaultCategory={defaultCategory}
              onSaved={() => {
                /* keep modal open for quick-add */
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
            title="เติมรายการออมประจำจากเดือนล่าสุดที่มี (ข้ามรายการที่มีแล้ว)"
            className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            📋 เติมรายการประจำ
          </button>
          <button
            type="button"
            onClick={() => openAdd()}
            className="px-3 py-1.5 text-sm font-medium text-primary bg-primary-light rounded-md hover:bg-primary hover:text-white transition"
          >
            + เพิ่มรายการออม
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {groupByCategory ? (
          [...grouped.entries()].map(([cat, rows]) => {
            const meta = SAVINGS_CATEGORIES[cat];
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
                    <SavingsRow
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
              <SavingsRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
          <span className="text-sm font-semibold text-slate-700">รวมออม</span>
          <span className="text-base font-semibold text-slate-900 financial-number tabular-nums">
            {formatTHB(total)}
          </span>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editing != null ? 'แก้ไขรายการออม' : 'เพิ่มรายการออม'}
        size="sm"
      >
        <div className="px-6 py-5">
          <SavingsForm
            year={year}
            month={month}
            initialValues={editing}
            defaultCategory={defaultCategory}
            onSaved={() => {
              if (editing != null) handleClose();
            }}
            onCancel={handleClose}
          />
        </div>
      </Modal>
    </div>
  );
};

export default SavingsList;
