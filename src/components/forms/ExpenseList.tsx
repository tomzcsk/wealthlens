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
import type { BankAccount, ExpenseCategory, ExpenseItem } from '@/types';
import { formatTHB, formatThaiDate } from '@/utils/formatters';
import { buildRecurringExpenseLibrary } from '@/utils/recurringTemplate';

import ExpenseForm from './ExpenseForm';
import InstallmentForm from './InstallmentForm';
import RecurringFillModal, {
  type RecurringFillDraft,
  type RecurringFillItem,
} from './RecurringFillModal';

/** Category dropdown options for the recurring-fill modal (stable order). */
const EXPENSE_CATEGORY_OPTIONS = CATEGORY_ORDER.map((c) => ({
  value: c,
  label: EXPENSE_CATEGORIES[c].label,
  icon: EXPENSE_CATEGORIES[c].icon,
}));

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
  /** Toggle reimbursement.status pending ⇄ received in place. */
  onToggleReimbursement: (item: ExpenseItem) => void;
  /** Show the leading category icon. Suppressed inside grouped view. */
  showIcon?: boolean;
  /** Bank accounts for resolving `item.paymentAccountId` → display name. */
  accounts: BankAccount[];
}

const ExpenseRow = ({
  item,
  onEdit,
  onDelete,
  onToggleReimbursement,
  showIcon = true,
  accounts,
}: ExpenseRowProps): ReactNode => {
  const meta = EXPENSE_CATEGORIES[item.category];
  const reimbursement = item.reimbursement;
  const installment = item.installment;
  // Installment rows never deduct (F34), so don't imply a payment source on them.
  const paymentAccount =
    item.paymentAccountId != null && installment == null
      ? accounts.find((a) => a.id === item.paymentAccountId)
      : undefined;
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
          {installment != null && (
            <span
              title={`ผ่อนทั้งหมด ${formatTHB(installment.totalAmount)} ÷ ${installment.totalMonths} งวด`}
              className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-full"
            >
              ผ่อน {installment.sequence}/{installment.totalMonths}
            </span>
          )}
          {item.isRecurring && installment == null && (
            <span
              title="รายการประจำเดือน"
              className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary-light rounded"
            >
              ประจำ
            </span>
          )}
          {reimbursement != null && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleReimbursement(item);
              }}
              title={
                reimbursement.status === 'pending'
                  ? 'รอเบิกคืนจากบริษัท — คลิกเพื่อทำเครื่องหมายว่าได้เงินแล้ว'
                  : `เบิกแล้ว${reimbursement.receivedDate != null ? ` (${reimbursement.receivedDate})` : ''} — คลิกเพื่อเปลี่ยนกลับเป็นรอเบิก`
              }
              className={`ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border transition cursor-pointer ${
                reimbursement.status === 'pending'
                  ? 'text-amber-800 bg-amber-100 border-amber-200 hover:bg-amber-200'
                  : 'text-emerald-800 bg-emerald-100 border-emerald-200 hover:bg-emerald-200'
              }`}
            >
              {reimbursement.status === 'pending' ? '🟡 รอเบิก' : '🟢 เบิกแล้ว'}
            </button>
          )}
          {paymentAccount != null && (
            <span
              title={`จ่ายผ่าน ${paymentAccount.name}`}
              className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 bg-slate-100"
            >
              💳 {paymentAccount.name}
            </span>
          )}
        </p>
        {item.date != null && item.date !== '' && (
          <p className="text-[11px] text-slate-400 tabular-nums">
            🗓️ {formatThaiDate(item.date)}
          </p>
        )}
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
  // Subscribe to the stable `data` ref and derive items via useMemo —
  // selectMonthExpenses returns a fresh `[]` when the month is empty,
  // which would break Zustand's Object.is equality and infinite-loop.
  const data = useFinanceStore((state) => state.data);
  const items = useMemo(
    () => selectMonthExpenses({ data }, year, month),
    [data, year, month],
  );
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);
  const deleteExpense = useFinanceStore((s) => s.deleteExpense);
  const deleteInstallmentPlan = useFinanceStore((s) => s.deleteInstallmentPlan);
  const untagInstallmentPlan = useFinanceStore((s) => s.untagInstallmentPlan);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const updateExpense = useFinanceStore((s) => s.updateExpense);
  const pushToast = useToastStore((s) => s.push);

  /**
   * Flip an expense's reimbursement status without opening the full form.
   * Pending → received stamps today's date; received → pending clears the
   * date so the field doesn't lie about when it was received.
   */
  const handleToggleReimbursement = (item: ExpenseItem): void => {
    if (item.reimbursement == null) return;
    if (item.reimbursement.status === 'pending') {
      updateExpense(year, month, item.id, {
        reimbursement: {
          status: 'received',
          receivedDate: new Date().toISOString().slice(0, 10),
        },
      });
      pushToast({
        message: `เบิกแล้ว: ${item.name}`,
        tone: 'success',
      });
    } else {
      updateExpense(year, month, item.id, {
        reimbursement: { status: 'pending' },
      });
      pushToast({
        message: `กลับเป็นรอเบิก: ${item.name}`,
        tone: 'info',
      });
    }
  };

  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [fillItems, setFillItems] = useState<RecurringFillItem[]>([]);

  // Open the picker instead of writing immediately. The library shows every
  // recurring item Tom has ever used (active pre-checked, history tickable,
  // present shown as "มีแล้ว") so he can add without retyping.
  const handleFillRecurring = (): void => {
    const data = useFinanceStore.getState().data;
    setFillItems(buildRecurringExpenseLibrary(data, year, month));
    setFillModalOpen(true);
  };

  const handleConfirmFill = (items: ReadonlyArray<RecurringFillDraft>): void => {
    // Newly created rows default to today's date (same rule as the entry form);
    // Tom can edit any row afterwards to set the real day.
    const today = new Date().toISOString().slice(0, 10);
    for (const it of items) {
      addExpense(year, month, {
        category: it.category as ExpenseCategory,
        name: it.name,
        amount: it.amount,
        isRecurring: true,
        date: today,
      });
    }
    setFillModalOpen(false);
    pushToast({
      message: `เติม ${items.length} รายการแล้ว`,
      tone: 'success',
    });
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<
    ExpenseCategory | undefined
  >(undefined);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  /** Item pending an installment-aware delete decision (only set for งวด rows). */
  const [pendingInstallmentDelete, setPendingInstallmentDelete] =
    useState<ExpenseItem | null>(null);

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
    // Installment row → defer to the 3-option dialog (this งวด vs whole plan).
    if (item.installment != null) {
      setPendingInstallmentDelete(item);
      return;
    }
    if (window.confirm(`ลบรายการ '${item.name}'?`)) {
      deleteExpense(year, month, item.id);
    }
  };

  const confirmDeleteSingleInstallment = (): void => {
    const item = pendingInstallmentDelete;
    if (!item) return;
    deleteExpense(year, month, item.id);
    setPendingInstallmentDelete(null);
    pushToast({
      message: `ลบงวดนี้ของ '${item.name}' แล้ว`,
      tone: 'info',
    });
  };

  const confirmDeleteEntirePlan = (): void => {
    const item = pendingInstallmentDelete;
    if (!item?.installment) return;
    const planId = item.installment.planId;
    deleteInstallmentPlan(planId);
    setPendingInstallmentDelete(null);
    pushToast({
      message: `ลบแผนผ่อน '${item.name}' (${item.installment.totalMonths} งวด) แล้ว`,
      tone: 'info',
    });
  };

  const confirmUntagPlan = (): void => {
    const item = pendingInstallmentDelete;
    if (!item?.installment) return;
    untagInstallmentPlan(item.installment.planId);
    setPendingInstallmentDelete(null);
    pushToast({
      message: `ยกเลิกสถานะผ่อนของ '${item.name}' แล้ว (เก็บทุกรายการไว้)`,
      tone: 'info',
    });
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
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleFillRecurring}
            className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary-light transition"
          >
            📋 เติมรายการประจำ
          </button>
          <button
            type="button"
            onClick={() => setInstallmentModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition"
          >
            💳 ผ่อนของ
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
              onSaved={(_item, continueAdding) => {
                // Button click → close; Enter quick-add → keep open.
                if (!continueAdding) handleClose();
              }}
              onCancel={handleClose}
            />
          </div>
        </Modal>
        <Modal
          open={installmentModalOpen}
          onClose={() => setInstallmentModalOpen(false)}
          title="สร้างแผนผ่อน"
          size="md"
        >
          <div className="px-6 py-5">
            <InstallmentForm
              defaultYear={year}
              defaultMonth={month}
              onSaved={() => {
                setInstallmentModalOpen(false);
                pushToast({
                  message: 'สร้างแผนผ่อนแล้ว ✓',
                  tone: 'success',
                });
              }}
              onCancel={() => setInstallmentModalOpen(false)}
            />
          </div>
        </Modal>
        <RecurringFillModal
          open={fillModalOpen}
          onClose={() => setFillModalOpen(false)}
          title="เติมรายการประจำ"
          initialItems={fillItems}
          categories={EXPENSE_CATEGORY_OPTIONS}
          defaultCategory="other"
          onConfirm={handleConfirmFill}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showAddButton && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
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
            onClick={() => setInstallmentModalOpen(true)}
            title="ผ่อน 0% หรือผ่อนหลายงวด — ระบบจะกระจายงวดให้ในเดือนต่อๆ ไปอัตโนมัติ"
            className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition"
          >
            💳 ผ่อนของ
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
                      onToggleReimbursement={handleToggleReimbursement}
                      showIcon={false}
                      accounts={accounts}
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
                onToggleReimbursement={handleToggleReimbursement}
                accounts={accounts}
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
            onSaved={(_item, continueAdding) => {
              // Edit always closes. Add: button click closes (continueAdding
              // false); Enter quick-add keeps the modal open for batch entry.
              if (editing != null || !continueAdding) handleClose();
            }}
            onCancel={handleClose}
          />
        </div>
      </Modal>

      <Modal
        open={installmentModalOpen}
        onClose={() => setInstallmentModalOpen(false)}
        title="สร้างแผนผ่อน"
        size="md"
      >
        <div className="px-6 py-5">
          <InstallmentForm
            defaultYear={year}
            defaultMonth={month}
            onSaved={() => {
              setInstallmentModalOpen(false);
              pushToast({
                message: 'สร้างแผนผ่อนแล้ว ✓',
                tone: 'success',
              });
            }}
            onCancel={() => setInstallmentModalOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={pendingInstallmentDelete != null}
        onClose={() => setPendingInstallmentDelete(null)}
        title="ลบรายการผ่อน"
        size="sm"
      >
        {pendingInstallmentDelete?.installment != null && (
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">{pendingInstallmentDelete.name}</span>{' '}
                — งวด {pendingInstallmentDelete.installment.sequence}/
                {pendingInstallmentDelete.installment.totalMonths}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                ยอดรวมแผน {formatTHB(pendingInstallmentDelete.installment.totalAmount)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmDeleteSingleInstallment}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 text-left transition"
              >
                <span className="block">ลบเฉพาะเดือนนี้</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  คงเหลืออีก {pendingInstallmentDelete.installment.totalMonths - 1} งวดในเดือนอื่น
                </span>
              </button>
              <button
                type="button"
                onClick={confirmUntagPlan}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 text-left transition"
              >
                <span className="block">ยกเลิกสถานะผ่อน (เก็บทุกรายการ)</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  เอา badge ผ่อนออก แต่เก็บรายการรายจ่ายทุกเดือนไว้
                </span>
              </button>
              <button
                type="button"
                onClick={confirmDeleteEntirePlan}
                className="px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-red-700 text-left transition"
              >
                <span className="block">
                  ลบทั้งแผน ({pendingInstallmentDelete.installment.totalMonths} งวด)
                </span>
                <span className="block text-xs text-red-100 mt-0.5">
                  ลบทุกงวดของ '{pendingInstallmentDelete.name}' ออกจากทุกเดือน
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingInstallmentDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </Modal>

      <RecurringFillModal
        open={fillModalOpen}
        onClose={() => setFillModalOpen(false)}
        title="เติมรายการประจำ"
        initialItems={fillItems}
        categories={EXPENSE_CATEGORY_OPTIONS}
        defaultCategory="other"
        onConfirm={handleConfirmFill}
      />
    </div>
  );
};

export default ExpenseList;
