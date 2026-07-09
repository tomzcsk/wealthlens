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

import BankAvatar from '@/components/accounts/BankAvatar';
import BankBalanceEditForm from '@/components/accounts/BankBalanceEditForm';
import Modal from '@/components/ui/Modal';
import { useFinanceStore } from '@/stores/financeStore';
import { EMPTY_BANK_ACCOUNTS } from '@/stores/emptyRefs';
import { selectMonthSavings } from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import {
  SAVINGS_CATEGORIES,
  SAVINGS_CATEGORY_ORDER,
} from '@/types/savings-categories';
import type { BankAccount, SavingsCategory, SavingsItem } from '@/types';
import { accountYearTotal, sumBankMonth } from '@/utils/bankAccounts';
import { formatTHB } from '@/utils/formatters';
import { buildRecurringSavingsLibrary } from '@/utils/recurringTemplate';

import RecurringFillModal, {
  type RecurringFillDraft,
  type RecurringFillItem,
} from './RecurringFillModal';
import SavingsForm from './SavingsForm';

/** Category dropdown options for the recurring-fill modal (stable order). */
const SAVINGS_CATEGORY_OPTIONS = SAVINGS_CATEGORY_ORDER.map((c) => ({
  value: c,
  label: SAVINGS_CATEGORIES[c].label,
  icon: SAVINGS_CATEGORIES[c].icon,
}));

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

// ---------------------------------------------------------------------------
// Bank account balance row
// ---------------------------------------------------------------------------

/**
 * Bank account balances live in `data.bankAccounts` (not in
 * `MonthlySavings.items`) but Tom thinks of them as just another savings
 * line, so we render one row per account inside SavingsList alongside Dime /
 * ออมเที่ยว. The row mirrors `SavingsRow`'s visuals — same icon column, same
 * right-aligned amount, same hover — with a click-to-edit prompt instead of
 * pencil/trash buttons because balances allow negative values (withdrawals)
 * and there's only one row per (account, year, month), so the open-modal
 * pattern would be overkill.
 */
interface BankBalanceRowProps {
  account: BankAccount;
  monthly: number | undefined;
  annual: number;
  onEdit: () => void;
}

const BankBalanceRow = ({
  account,
  monthly,
  annual,
  onEdit,
}: BankBalanceRowProps): ReactNode => {
  const hasValue = monthly !== undefined;
  const isNegative = hasValue && monthly < 0;
  return (
    <button
      type="button"
      onClick={onEdit}
      title={`ยอด ${account.name} เดือนนี้ — คลิกเพื่อแก้`}
      className="group w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition text-left"
    >
      <BankAvatar account={account} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">
          {account.name}
          <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-medium text-amber-800 bg-amber-100 rounded">
            รวมทั้งปี {formatTHB(annual)}
          </span>
        </p>
      </div>
      <span
        className={`text-sm financial-number tabular-nums ${
          !hasValue
            ? 'text-slate-400 italic'
            : isNegative
              ? 'text-red-700'
              : 'text-slate-900'
        }`}
      >
        {hasValue ? formatTHB(monthly) : '+ ใส่ยอด'}
      </span>
      <span
        aria-hidden="true"
        className="p-1 text-slate-400 group-hover:text-primary transition"
      >
        ✏️
      </span>
    </button>
  );
};

export const SavingsList = ({
  year,
  month,
  groupByCategory = true,
  showAddButton = true,
}: SavingsListProps): ReactNode => {
  // Subscribe to the stable `data` ref and derive via useMemo —
  // selectMonthSavings returns a fresh `[]` when empty, which would
  // break Zustand's Object.is equality and infinite-loop.
  const data = useFinanceStore((state) => state.data);
  const items = useMemo(
    () => selectMonthSavings({ data }, year, month),
    [data, year, month],
  );
  const deleteSavings = useFinanceStore((s) => s.deleteSavings);
  const addSavings = useFinanceStore((s) => s.addSavings);
  const stopRecurringSavings = useFinanceStore((s) => s.stopRecurringSavings);
  const pushToast = useToastStore((s) => s.push);

  // Bank accounts — manual per-month balance entry per account. Treated as
  // savings lines (one row each), same as the legacy Kept row.
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);

  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  // ยุบไว้ก่อน: ยอดบัญชีเป็นข้อมูลอ้างอิง ไม่ใช่สิ่งที่ต้องอ่านทุกครั้งที่เปิดเดือน
  // — หัวข้อยังโชว์ยอดรวมอยู่ กดกางเมื่อจะแก้ยอด
  const [bankCollapsed, setBankCollapsed] = useState(true);

  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [fillItems, setFillItems] = useState<RecurringFillItem[]>([]);

  // Open the picker instead of writing immediately. The library shows every
  // recurring savings item Tom has ever used (active pre-checked, history
  // tickable, present shown as "มีแล้ว") so he can add without retyping.
  const handleFillRecurring = (): void => {
    const data = useFinanceStore.getState().data;
    setFillItems(buildRecurringSavingsLibrary(data, year, month));
    setFillModalOpen(true);
  };

  const handleConfirmFill = (items: ReadonlyArray<RecurringFillDraft>): void => {
    for (const it of items) {
      addSavings(year, month, {
        category: it.category as SavingsCategory,
        name: it.name,
        amount: it.amount,
        isRecurring: true,
      });
    }
    setFillModalOpen(false);
    pushToast({
      message: `เติม ${items.length} รายการออมแล้ว`,
      tone: 'success',
    });
  };

  // Retire a recurring savings item for good — clears the flag on every
  // matching row across all months so the picker (rebuilt from the store each
  // open) stops resurrecting it. Amounts and rows are untouched.
  const handleStopRecurring = (name: string): void => {
    stopRecurringSavings(name);
    pushToast({
      message: `เลิกเป็นรายการประจำ: ${name}`,
      tone: 'info',
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

  // Total includes every bank account's monthly balance. Negative entries
  // net out (matches Tom's Sheet behaviour — "ออม" column is signed).
  const total = useMemo(
    () =>
      items.reduce((acc, it) => acc + it.amount, 0) +
      sumBankMonth(accounts, year, month),
    [items, accounts, year, month],
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
        {/* Bank accounts — always rendered, always editable, one row each.
            Sits as its own pseudo-category above Dime / ออมเที่ยว / etc. so
            Tom sees one unified savings list per month. */}
        {accounts.length > 0 && (
          <div className="py-2">
            <button
              type="button"
              onClick={() => setBankCollapsed((c) => !c)}
              aria-expanded={!bankCollapsed}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-3 text-[10px] text-slate-400"
                >
                  {bankCollapsed ? '▸' : '▾'}
                </span>
                <span aria-hidden="true">💼</span>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  บัญชีธนาคาร
                </h3>
                <span className="text-[10px] text-slate-400">
                  ({accounts.length})
                </span>
              </div>
              <span className="text-xs financial-number tabular-nums text-slate-500">
                {formatTHB(sumBankMonth(accounts, year, month))}
              </span>
            </button>
            {!bankCollapsed && (
              <div className="px-1">
                {accounts.map((account) => {
                  const monthly =
                    account.balances[String(year)]?.[String(month)];
                  const annual = accountYearTotal(account, year);
                  return (
                    <BankBalanceRow
                      key={account.id}
                      account={account}
                      monthly={monthly}
                      annual={annual}
                      onEdit={() => setEditAccountId(account.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

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

        {items.length === 0 && (
          <div className="px-4 py-3 text-center text-xs text-slate-400 italic">
            ยังไม่มีรายการออม/ลงทุนเพิ่มเติม — กด "+ เพิ่มรายการออม" ด้านบน
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
            onSaved={(_item, continueAdding) => {
              // Edit always closes. Add: button click closes (continueAdding
              // false); Enter quick-add keeps the modal open for batch entry.
              if (editing != null || !continueAdding) handleClose();
            }}
            onCancel={handleClose}
          />
        </div>
      </Modal>

      {editAccountId &&
        (() => {
          const acct = accounts.find((a) => a.id === editAccountId);
          if (!acct) return null;
          const current = acct.balances[String(year)]?.[String(month)];
          return (
            <Modal
              open
              onClose={() => setEditAccountId(null)}
              title={`ยอด ${acct.name} — เดือนนี้`}
              size="sm"
            >
              <div className="px-6 py-5">
                <BankBalanceEditForm
                  accountId={acct.id}
                  year={year}
                  month={month}
                  current={current}
                  onSaved={() => setEditAccountId(null)}
                  onCancel={() => setEditAccountId(null)}
                />
              </div>
            </Modal>
          );
        })()}

      <RecurringFillModal
        open={fillModalOpen}
        onClose={() => setFillModalOpen(false)}
        title="เติมรายการออมประจำ"
        initialItems={fillItems}
        categories={SAVINGS_CATEGORY_OPTIONS}
        defaultCategory="general"
        onConfirm={handleConfirmFill}
        onStopRecurring={handleStopRecurring}
      />
    </div>
  );
};

export default SavingsList;
