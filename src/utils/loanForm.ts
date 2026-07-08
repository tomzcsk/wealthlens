/**
 * WealthLens — pure helpers for the loan create/edit form.
 *
 * The lender's schedule is authoritative (see LoanInstallment doc), but a
 * user hand-entering a loan has no portal export. These helpers let the
 * form (1) scaffold N evenly-dated rows they can then edit, and (2)
 * finalize the edited rows into full `LoanInstallment[]` with the
 * denormalised `totalAmount` / `principalRatio` the selectors expect.
 *
 * Pure + total: no throws, no Date.now dependence (dates derive from the
 * caller-supplied startDate).
 */
import type { LoanInstallment } from '@/types';

export type ScheduleFrequency = 'monthly' | 'yearly';

/** Editable row the form binds to — amounts only, ratios computed on finalize. */
export interface LoanScheduleDraftRow {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
}

/** Last day of a given (year, month) — month is 1-based. */
const lastDayOfMonth = (year: number, month: number): number =>
  new Date(year, month, 0).getDate();

/**
 * Step an ISO yyyy-mm-dd date forward by `n` periods, clamping the day to
 * the target month's last day (so 2026-01-31 + 1 month → 2026-02-28).
 */
const stepDate = (
  iso: string,
  n: number,
  frequency: ScheduleFrequency,
): string => {
  const [y, m, d] = iso.split('-').map(Number);
  let year = y;
  let month = m; // 1-based
  if (frequency === 'yearly') {
    year += n;
  } else {
    const zeroBased = m - 1 + n;
    year += Math.floor(zeroBased / 12);
    month = (zeroBased % 12) + 1;
  }
  const day = Math.min(d, lastDayOfMonth(year, month));
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
};

/**
 * Build `count` draft rows dated from `startDate` (row 1 = startDate,
 * subsequent rows +1 period). Amounts start at 0 for the user to fill.
 */
export const scaffoldSchedule = (
  startDate: string,
  count: number,
  frequency: ScheduleFrequency,
): LoanScheduleDraftRow[] => {
  const n = Math.max(0, Math.floor(count));
  const rows: LoanScheduleDraftRow[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      installmentNumber: i + 1,
      dueDate: stepDate(startDate, i, frequency),
      principalAmount: 0,
      interestAmount: 0,
    });
  }
  return rows;
};

/**
 * Convert edited draft rows into full `LoanInstallment[]`:
 *   totalAmount   = principalAmount + interestAmount
 *   principalRatio = principalAmount / Σ(principalAmount)  (0 when sum is 0)
 * installmentNumber is re-sequenced 1..N in the given order.
 */
export const finalizeSchedule = (
  rows: LoanScheduleDraftRow[],
): LoanInstallment[] => {
  const sumPrincipal = rows.reduce((a, r) => a + r.principalAmount, 0);
  return rows.map((r, idx) => ({
    installmentNumber: idx + 1,
    dueDate: r.dueDate,
    principalRatio: sumPrincipal > 0 ? r.principalAmount / sumPrincipal : 0,
    principalAmount: r.principalAmount,
    interestAmount: r.interestAmount,
    totalAmount: r.principalAmount + r.interestAmount,
  }));
};
