/**
 * AnomalyAlerts — F15 visible card on the Analytics page.
 *
 * Lists every detected spike from `useAnomalies()`, lets Tom dismiss
 * individual rows (persisted via `useAnomalyStore`), and shows a header
 * badge with the count + max severity of UNDISMISSED alerts.
 *
 * Filter UI is local component state (severity); the dismissal toggle is
 * also local (whether to display dismissed alongside active). Sorting is
 * already newest-first from `detectAnomalies`.
 */

import { useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { useAnomalies } from '@/hooks/useAnomalies';
import { useAnomalyStore } from '@/stores/anomalyStore';
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
import {
  anomalyFingerprint,
  type Anomaly,
} from '@/utils/anomalyDetection';
import { THAI_MONTHS_LONG, formatTHB } from '@/utils/formatters';

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type SeverityFilter = 'all' | 'high';

const FILTER_OPTIONS: ReadonlyArray<{ value: SeverityFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'high', label: 'รุนแรงเท่านั้น' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AnomalyAlerts = (): ReactNode => {
  const anomalies = useAnomalies();
  const dismissed = useAnomalyStore((s) => s.dismissed);
  const dismiss = useAnomalyStore((s) => s.dismiss);
  const undismiss = useAnomalyStore((s) => s.undismiss);

  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [showDismissed, setShowDismissed] = useState(false);

  const partitioned = useMemo(() => {
    const active: Anomaly[] = [];
    const inactive: Anomaly[] = [];
    for (const a of anomalies) {
      if (dismissed.has(anomalyFingerprint(a))) inactive.push(a);
      else active.push(a);
    }
    return { active, inactive };
  }, [anomalies, dismissed]);

  const visibleActive = useMemo(() => {
    if (filter === 'high') return partitioned.active.filter((a) => a.severity === 'high');
    return partitioned.active;
  }, [partitioned.active, filter]);

  const visibleDismissed = useMemo(() => {
    if (!showDismissed) return [];
    if (filter === 'high') return partitioned.inactive.filter((a) => a.severity === 'high');
    return partitioned.inactive;
  }, [partitioned.inactive, filter, showDismissed]);

  const undismissedCount = partitioned.active.length;
  const dismissedCount = partitioned.inactive.length;
  const maxSeverity: Anomaly['severity'] | null = useMemo(() => {
    if (partitioned.active.some((a) => a.severity === 'high')) return 'high';
    if (partitioned.active.length > 0) return 'medium';
    return null;
  }, [partitioned.active]);

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setFilter(event.target.value as SeverityFilter);
  };

  return (
    <section
      aria-label="แจ้งเตือนผิดปกติ"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-900">แจ้งเตือนผิดปกติ</h2>
          <CountBadge count={undismissedCount} severity={maxSeverity} />
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

      <p className="mt-3 text-xs text-slate-500">
        เกณฑ์: ค่าใช้จ่าย &gt; ค่าเฉลี่ย + 2σ (rolling 12 เดือน) และ &gt;
        1.5× ค่าเฉลี่ย
      </p>

      <AnomalyList
        rows={visibleActive}
        emptyMessage={
          partitioned.active.length === 0
            ? '✨ ไม่มี anomaly = สบายใจได้'
            : 'ไม่มีรายการตามตัวกรองนี้'
        }
        onDismiss={dismiss}
      />

      {dismissedCount > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            {showDismissed
              ? `ซ่อนที่ปิดแล้ว (${dismissedCount})`
              : `[ปิดแล้ว ${dismissedCount} — ดู]`}
          </button>
          {showDismissed ? (
            <ul className="mt-3 space-y-2">
              {visibleDismissed.map((a) => (
                <DismissedRow
                  key={anomalyFingerprint(a)}
                  anomaly={a}
                  onUndismiss={undismiss}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default AnomalyAlerts;

// ---------------------------------------------------------------------------
// Count badge
// ---------------------------------------------------------------------------

interface CountBadgeProps {
  count: number;
  severity: Anomaly['severity'] | null;
}

const CountBadge = ({ count, severity }: CountBadgeProps): ReactNode => {
  if (count === 0) {
    return (
      <span className="rounded-full bg-income-light px-2.5 py-0.5 text-xs font-medium text-income">
        พบ 0
      </span>
    );
  }
  const tone =
    severity === 'high'
      ? 'bg-expense-light text-expense'
      : 'bg-warning/10 text-warning';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      พบ {count}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Active list
// ---------------------------------------------------------------------------

interface AnomalyListProps {
  rows: Anomaly[];
  emptyMessage: string;
  onDismiss: (fingerprint: string) => void;
}

const AnomalyList = ({
  rows,
  emptyMessage,
  onDismiss,
}: AnomalyListProps): ReactNode => {
  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
        <p className="text-base font-medium text-slate-900">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <ul className="mt-5 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
      {rows.map((row) => (
        <AnomalyRow
          key={anomalyFingerprint(row)}
          anomaly={row}
          onDismiss={onDismiss}
        />
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface AnomalyRowProps {
  anomaly: Anomaly;
  onDismiss: (fingerprint: string) => void;
}

const SEVERITY_TAG: Record<Anomaly['severity'], { label: string; className: string; dot: string }> = {
  high: {
    label: 'รุนแรง',
    className: 'bg-expense-light text-expense',
    dot: '🔴',
  },
  medium: {
    label: 'ปานกลาง',
    className: 'bg-warning/10 text-warning',
    dot: '🟡',
  },
};

const AnomalyRow = ({ anomaly, onDismiss }: AnomalyRowProps): ReactNode => {
  const cat = EXPENSE_CATEGORIES[anomaly.category];
  const tag = SEVERITY_TAG[anomaly.severity];
  const monthLabel = THAI_MONTHS_LONG[anomaly.month - 1] ?? '';
  const sigmaLabel = Number.isFinite(anomaly.zScore)
    ? `+${anomaly.zScore.toFixed(1)}σ`
    : '∞σ';
  const fingerprint = anomalyFingerprint(anomaly);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 bg-white px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true">{tag.dot}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${tag.className}`}
          >
            {tag.label}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-900">
            <span aria-hidden="true">{cat.icon}</span>
            <span>{cat.label}</span>
          </span>
          <span className="text-sm text-slate-500">
            — {monthLabel} {anomaly.year}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
          <span className="text-base font-semibold text-slate-900">
            {formatTHB(anomaly.amount)}
          </span>
          <span aria-hidden="true">•</span>
          <span>
            ค่าเฉลี่ย {formatTHB(anomaly.baseline)} ± {formatTHB(anomaly.stddev)}
          </span>
          <span aria-hidden="true">•</span>
          <span className="font-semibold text-slate-700">{sigmaLabel}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {anomaly.monthsOfHistory} เดือนของประวัติ
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(fingerprint)}
        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      >
        ปิด
      </button>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Dismissed row (compact)
// ---------------------------------------------------------------------------

interface DismissedRowProps {
  anomaly: Anomaly;
  onUndismiss: (fingerprint: string) => void;
}

const DismissedRow = ({
  anomaly,
  onUndismiss,
}: DismissedRowProps): ReactNode => {
  const cat = EXPENSE_CATEGORIES[anomaly.category];
  const monthLabel = THAI_MONTHS_LONG[anomaly.month - 1] ?? '';
  const fingerprint = anomalyFingerprint(anomaly);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
      <span className="flex items-center gap-1">
        <span aria-hidden="true">{cat.icon}</span>
        <span>{cat.label}</span>
        <span>—</span>
        <span>{monthLabel} {anomaly.year}</span>
        <span aria-hidden="true">•</span>
        <span className="tabular-nums">{formatTHB(anomaly.amount)}</span>
      </span>
      <button
        type="button"
        onClick={() => onUndismiss(fingerprint)}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        คืนค่า
      </button>
    </li>
  );
};
