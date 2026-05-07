/**
 * SubscriptionManager — F12
 *
 * Lists every recurring expense for the active year, grouped by name with
 * a per-row monthly average and annualised total. Sits inside the
 * Analytics page; the orchestrator that owns AnalyticsPage composes this
 * card alongside F10 / F11 / F13.
 *
 * Definition of "subscription" (per task brief):
 *   `ExpenseItem.isRecurring === true` — across ALL categories. The PRD's
 *   examples (Netflix, ChatGPT, Claude AI, AIS, 3BB) deliberately span
 *   `subscription` and `utilities`, so the recurring flag is the only
 *   property they all share. Aggregation lives in `useSubscriptions`.
 *
 * Header summary always reflects the FULL roster (not the filtered view),
 * so toggling "Active only" doesn't make the totals jump around — the
 * filter changes which rows you see, not what the year cost.
 */

import { useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import {
  useSelectedYear,
  useSubscriptions,
  useYearSummary,
  type SubscriptionRow,
} from '@/hooks/useFinanceData';
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
import { formatPercent, formatTHB } from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityFilter = 'all' | 'active' | 'inactive';

const FILTER_OPTIONS: ReadonlyArray<{ value: ActivityFilter; label: string }> =
  [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'active', label: 'ใช้งาน' },
    { value: 'inactive', label: 'ไม่ใช้งาน' },
  ];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SubscriptionManager = (): ReactNode => {
  const year = useSelectedYear();
  const subscriptions = useSubscriptions();
  const yearSummary = useYearSummary();
  const [filter, setFilter] = useState<ActivityFilter>('all');

  // Header totals are derived from ALL subscriptions, never the filtered
  // subset — the filter is purely a viewing aid.
  const totals = useMemo(() => {
    let monthly = 0;
    let annual = 0;
    for (const sub of subscriptions) {
      monthly += sub.averageMonthlyAmount;
      annual += sub.totalAmount;
    }
    const shareOfExpenses =
      yearSummary.totalExpenses > 0 ? annual / yearSummary.totalExpenses : 0;
    return { monthly, annual, shareOfExpenses };
  }, [subscriptions, yearSummary.totalExpenses]);

  const visibleRows = useMemo(() => {
    if (filter === 'all') return subscriptions;
    if (filter === 'active') return subscriptions.filter((s) => s.isActive);
    return subscriptions.filter((s) => !s.isActive);
  }, [subscriptions, filter]);

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setFilter(event.target.value as ActivityFilter);
  };

  const isFiltered = filter !== 'all';

  return (
    <section
      aria-label={`Subscription รายเดือน ${year}`}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Subscription รายเดือน
          </h2>
          <p className="text-xs text-slate-400">
            รายการที่ตั้งสถานะ recurring สำหรับปี {year}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <span className="sr-only">ตัวกรอง</span>
          <select
            value={filter}
            onChange={handleFilterChange}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                ตัวกรอง: {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <SummaryRow
        monthly={totals.monthly}
        annual={totals.annual}
        share={totals.shareOfExpenses}
        isFiltered={isFiltered}
      />

      <SubscriptionList rows={visibleRows} totalRows={subscriptions.length} />
    </section>
  );
};

export default SubscriptionManager;

// ---------------------------------------------------------------------------
// Header summary
// ---------------------------------------------------------------------------

interface SummaryRowProps {
  monthly: number;
  annual: number;
  share: number;
  isFiltered: boolean;
}

const SummaryRow = ({
  monthly,
  annual,
  share,
  isFiltered,
}: SummaryRowProps): ReactNode => (
  <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl bg-slate-50 px-4 py-3">
    <Stat label="รวมต่อเดือน" value={formatTHB(monthly)} />
    <Stat label="รวมต่อปี" value={formatTHB(annual)} />
    <Stat label="% ของจ่าย" value={formatPercent(share)} />
    {isFiltered ? (
      <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
        (กรองแล้ว)
      </span>
    ) : null}
  </div>
);

interface StatProps {
  label: string;
  value: string;
}

const Stat = ({ label, value }: StatProps): ReactNode => (
  <div className="flex flex-col">
    <span className="text-xs uppercase tracking-wide text-slate-400">
      {label}
    </span>
    <span className="text-base font-semibold tabular-nums text-slate-900">
      {value}
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// Subscription list
// ---------------------------------------------------------------------------

interface SubscriptionListProps {
  rows: SubscriptionRow[];
  /** Total recurring rows in the year, before the filter — drives empty copy. */
  totalRows: number;
}

const SubscriptionList = ({
  rows,
  totalRows,
}: SubscriptionListProps): ReactNode => {
  if (totalRows === 0) {
    return (
      <EmptyState
        title="ยังไม่มี subscription รายเดือนปีนี้"
        body="เปิด toggle “ค่าใช้จ่ายรายเดือน” บนรายการในหน้า Monthly เพื่อให้รายการนั้นโผล่ขึ้นมาที่นี่"
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState title="ไม่มีรายการตามตัวกรองนี้" />;
  }
  return (
    <ul className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
      {rows.map((row) => (
        <SubscriptionRowView key={row.key} row={row} />
      ))}
    </ul>
  );
};

interface SubscriptionRowViewProps {
  row: SubscriptionRow;
}

const SubscriptionRowView = ({
  row,
}: SubscriptionRowViewProps): ReactNode => {
  const meta = EXPENSE_CATEGORIES[row.category];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 transition-colors hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-slate-900">
            {row.name}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <span aria-hidden="true">{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums">
          <span className="font-semibold text-slate-900">
            {formatTHB(row.averageMonthlyAmount)} / เดือน
          </span>
          <span aria-hidden="true">•</span>
          <span>พบใน {row.monthsSeen} เดือน</span>
          <span aria-hidden="true">•</span>
          <span>รวม {formatTHB(row.totalAmount)}</span>
        </div>
      </div>
      <ActivityBadge isActive={row.isActive} />
    </li>
  );
};

const ActivityBadge = ({ isActive }: { isActive: boolean }): ReactNode =>
  isActive ? (
    <span className="rounded-full bg-income-light px-2 py-0.5 text-xs font-medium text-income">
      ใช้งาน
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      ไม่ใช้งาน
    </span>
  );

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string;
  body?: string;
}

const EmptyState = ({ title, body }: EmptyStateProps): ReactNode => (
  <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
    <p className="text-base font-medium text-slate-900">{title}</p>
    {body ? (
      <p className="mt-1 text-xs text-slate-500">{body}</p>
    ) : null}
  </div>
);
