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

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import Modal from '@/components/ui/Modal';
import { useFinanceStore } from '@/stores/financeStore';
import { sumAnnualKept, useGoalsStore } from '@/stores/goalsStore';
import { selectMonthSavings } from '@/stores/selectors';
import { useToastStore } from '@/stores/toastStore';
import {
  SAVINGS_CATEGORIES,
  SAVINGS_CATEGORY_ORDER,
} from '@/types/savings-categories';
import type { SavingsCategory, SavingsItem } from '@/types';
import {
  THAI_MONTHS_LONG,
  formatNumber,
  formatTHB,
  formatThaiMonth,
} from '@/utils/formatters';
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

// ---------------------------------------------------------------------------
// Kept edit form — styled twin of SavingsForm for one number field
// ---------------------------------------------------------------------------

interface KeptEditFormProps {
  year: number;
  month: number;
  /** Current persisted value, or `undefined` if no entry yet for this month. */
  initialAmount: number | undefined;
  onSave: (amount: number) => void;
  onClear: () => void;
  onCancel: () => void;
}

/**
 * Single-field editor for the (year, month) Kept entry. Visual parity with
 * SavingsForm — same input borders, same comma-formatted typing, same button
 * row (ยกเลิก + บันทึก + ลบ if existing). Replaces the previous
 * `window.prompt` UX so the experience matches "+ เพิ่มรายการออม" forms.
 */
const KeptEditForm = ({
  year,
  month,
  initialAmount,
  onSave,
  onClear,
  onCancel,
}: KeptEditFormProps): ReactNode => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState<string>(
    initialAmount !== undefined ? formatNumber(initialAmount) : '',
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const parsed = useMemo<number | null>(() => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }, [text]);

  const canSubmit = parsed !== null;
  const isEdit = initialAmount !== undefined;
  const monthLabel = THAI_MONTHS_LONG[month - 1];

  const handleChange = (raw: string): void => {
    // Allow optional leading minus, digits, single decimal, and commas
    // during typing. Re-format with commas every keystroke so the field
    // reads like real money — matches IncomeForm/ExpenseForm.
    const cleaned = raw.replace(/[^\d.,-]/g, '');
    const trimmed = cleaned.trim();
    if (trimmed === '' || trimmed === '-') {
      setText(trimmed);
      return;
    }
    const negative = trimmed.startsWith('-');
    const digits = trimmed.replace(/[^\d.]/g, '');
    if (digits === '') {
      setText(negative ? '-' : '');
      return;
    }
    const [intPart, decPart] = digits.split('.');
    const intNum = Number(intPart);
    const intFormatted = Number.isFinite(intNum) ? formatNumber(intNum) : '';
    const display =
      decPart !== undefined
        ? `${negative ? '-' : ''}${intFormatted}.${decPart}`
        : `${negative ? '-' : ''}${intFormatted}`;
    setText(display);
  };

  const handleSubmit = (e?: FormEvent): void => {
    if (e) e.preventDefault();
    if (parsed === null) return;
    onSave(parsed);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="kept-amount-input"
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          ยอด Kept (กรุงศรี) — {monthLabel} {year}
        </label>
        <input
          id="kept-amount-input"
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="เช่น 45,000 หรือ -9,000"
          className="w-full px-3 py-2 text-base tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          ค่าติดลบ = ถอนออกจากบัญชี · เว้นว่างแล้วกดลบเพื่อล้างค่าเดือนนี้
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          {isEdit && (
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-2 text-sm font-medium text-expense bg-white border border-red-200 rounded-md hover:bg-red-50 transition"
            >
              🗑️ ลบยอดเดือนนี้
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            บันทึก
          </button>
        </div>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Kept (Krungsri) row
// ---------------------------------------------------------------------------

/**
 * "Kept" lives in `preferences.keptBalances` (not in `MonthlySavings.items`)
 * but Tom thinks of it as just another savings line, so we render it inside
 * SavingsList alongside Dime / ออมเที่ยว. The row mirrors `SavingsRow`'s
 * visuals — same icon column, same right-aligned amount, same hover —
 * with a click-to-edit prompt instead of pencil/trash buttons because
 * Kept allows negative values (withdrawals) and there's only one row per
 * (year, month), so the open-modal pattern would be overkill.
 */
interface KeptRowProps {
  year: number;
  month: number;
  monthly: number | undefined;
  annual: number;
  onEdit: () => void;
  showIcon?: boolean;
}

const KeptRow = ({
  monthly,
  annual,
  onEdit,
  showIcon = true,
}: KeptRowProps): ReactNode => {
  const hasValue = monthly !== undefined;
  const isNegative = hasValue && monthly < 0;
  return (
    <button
      type="button"
      onClick={onEdit}
      title="ยอด Kept (กรุงศรี) เดือนนี้ — คลิกเพื่อแก้"
      className="group w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition text-left"
    >
      {showIcon && (
        <span aria-hidden="true" className="text-base w-6 text-center">
          💼
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">
          Kept (กรุงศรี)
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
  const pushToast = useToastStore((s) => s.push);

  // Kept (Krungsri) — manual per-month entry. Treated as a savings line.
  const keptYearBucket = useGoalsStore((s) => s.keptBalances[String(year)]);
  const keptMonthly = keptYearBucket?.[String(month)];
  const keptAnnual = sumAnnualKept(keptYearBucket);
  const setKeptBalance = useGoalsStore((s) => s.setKeptBalance);
  const clearKeptBalance = useGoalsStore((s) => s.clearKeptBalance);

  const [keptModalOpen, setKeptModalOpen] = useState(false);
  const handleEditKept = (): void => setKeptModalOpen(true);
  const handleCloseKept = (): void => setKeptModalOpen(false);

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

  // Total includes Kept's monthly value. Negative Kept entries net out
  // (matches Tom's Sheet behaviour — "ออม" column is signed).
  const total = useMemo(
    () => items.reduce((acc, it) => acc + it.amount, 0) + (keptMonthly ?? 0),
    [items, keptMonthly],
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
        {/* Kept (Krungsri) — always rendered, always editable. Sits as its
            own pseudo-category above Dime / ออมเที่ยว / etc. so Tom sees one
            unified savings list per month. */}
        <div className="py-2">
          <div className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">💼</span>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kept (กรุงศรี)
              </h3>
            </div>
            <span className="text-xs financial-number text-slate-500 tabular-nums">
              {keptAnnual !== 0 ? `รวมทั้งปี ${formatTHB(keptAnnual)}` : ''}
            </span>
          </div>
          <div className="px-1">
            <KeptRow
              year={year}
              month={month}
              monthly={keptMonthly}
              annual={keptAnnual}
              onEdit={handleEditKept}
              showIcon={false}
            />
          </div>
        </div>

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
            onSaved={() => {
              if (editing != null) handleClose();
            }}
            onCancel={handleClose}
          />
        </div>
      </Modal>

      <Modal
        open={keptModalOpen}
        onClose={handleCloseKept}
        title="แก้ไข Kept (กรุงศรี)"
        size="sm"
      >
        <div className="px-6 py-5">
          <KeptEditForm
            year={year}
            month={month}
            initialAmount={keptMonthly}
            onSave={(amount) => {
              setKeptBalance(year, month, amount);
              handleCloseKept();
            }}
            onClear={() => {
              clearKeptBalance(year, month);
              handleCloseKept();
            }}
            onCancel={handleCloseKept}
          />
        </div>
      </Modal>
    </div>
  );
};

export default SavingsList;
