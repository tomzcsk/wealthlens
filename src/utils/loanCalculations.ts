/**
 * WealthLens — pure loan-tracker selectors.
 *
 * The Loan model stores the lender's schedule verbatim plus a log of
 * out-of-band lump-sum payments. Monthly recurring payments are NOT
 * duplicated here — they live in `years[*].income[*].deductions.gsl`,
 * keeping a single source of truth. This module rolls those two
 * sources together so the UI can paint progress without knowing the
 * split.
 *
 * All functions are pure and total: no throws, no side effects, no
 * date-now dependence (callers pass `referenceDate`). Selectors degrade
 * to safe defaults rather than throwing on missing data.
 */

import type {
  ExtraPayment,
  Loan,
  LoanInstallment,
  MonthlyDeductions,
  WealthLensData,
} from '@/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const parseIso = (iso: string): Date => new Date(`${iso}T00:00:00`);

/** Date as ms-since-epoch; `0` for unparseable input (sorts to the front). */
const toMs = (iso: string): number => {
  const d = parseIso(iso);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const monthlyGslFor = (d: MonthlyDeductions, field: 'gsl'): number => d[field];

// ---------------------------------------------------------------------------
// Schedule selectors
// ---------------------------------------------------------------------------

/**
 * Sum of every installment's `totalAmount` — the loan's full obligation.
 * Used as the denominator for progress % and "ยอดรวมต้น+ดอก" labels.
 */
export const getScheduleTotal = (loan: Loan): number =>
  loan.schedule.reduce((acc, i) => acc + i.totalAmount, 0);

/**
 * Find the installment that is "currently active" at `referenceDate`:
 * the earliest installment whose `dueDate` is ON or AFTER the reference.
 * Falls back to the last installment when every row is in the past
 * (the loan is overdue or fully paid) and to the first row when every
 * row is in the future (the loan hasn't started yet).
 */
export const getCurrentInstallment = (
  loan: Loan,
  referenceDate: Date = new Date(),
): LoanInstallment | null => {
  if (loan.schedule.length === 0) return null;
  const refMs = referenceDate.getTime();
  const sorted = [...loan.schedule].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  const next = sorted.find((i) => toMs(i.dueDate) >= refMs);
  return next ?? sorted[sorted.length - 1];
};

// ---------------------------------------------------------------------------
// Payment selectors
// ---------------------------------------------------------------------------

/** One row in the merged payment log. */
export interface PaymentLogEntry {
  /** ISO yyyy-mm-dd. */
  date: string;
  amount: number;
  /** Where the row came from — drives the badge in the UI. */
  source: 'auto' | 'extra';
  /** Free-form label ("งวดเดือน ม.ค.", "โปะพิเศษ", …). */
  label: string;
  /** Original record id — present on extras for delete callbacks. */
  extraId?: string;
  reference?: string;
  notes?: string;
}

/**
 * Merge the monthly deduction stream (auto-payments) with `extraPayments`
 * into a single date-sorted log. The auto-payment date is synthesised as
 * the 25th of the month, matching the typical กยศ debit day — purely a
 * presentation choice; the underlying number is what matters.
 */
export const getMergedPaymentLog = (
  loan: Loan,
  data: WealthLensData,
): PaymentLogEntry[] => {
  const out: PaymentLogEntry[] = [];

  if (loan.linkedDeductionField) {
    const field = loan.linkedDeductionField;
    for (const [yearKey, yr] of Object.entries(data.years)) {
      for (const inc of yr.income) {
        const amount = monthlyGslFor(inc.deductions, field);
        if (amount <= 0) continue;
        const yyyy = yearKey.padStart(4, '0');
        const mm = String(inc.month).padStart(2, '0');
        out.push({
          date: `${yyyy}-${mm}-25`,
          amount,
          source: 'auto',
          label: 'งวดเดือน',
        });
      }
    }
  }

  for (const ep of loan.extraPayments) {
    out.push({
      date: ep.date,
      amount: ep.amount,
      source: 'extra',
      label: 'โปะพิเศษ',
      extraId: ep.id,
      ...(ep.reference ? { reference: ep.reference } : {}),
      ...(ep.notes ? { notes: ep.notes } : {}),
    });
  }

  out.sort((a, b) => toMs(b.date) - toMs(a.date));
  return out;
};

/**
 * Total paid against the loan across all time. Same data as
 * `getMergedPaymentLog().reduce(...)` but avoids building the intermediate
 * array for callers that only need the number.
 */
export const getTotalPaid = (loan: Loan, data: WealthLensData): number => {
  let total = 0;
  if (loan.linkedDeductionField) {
    const field = loan.linkedDeductionField;
    for (const yr of Object.values(data.years)) {
      for (const inc of yr.income) {
        total += monthlyGslFor(inc.deductions, field);
      }
    }
  }
  for (const ep of loan.extraPayments) total += ep.amount;
  return total;
};

export const getRemainingBalance = (
  loan: Loan,
  data: WealthLensData,
): number => Math.max(0, getScheduleTotal(loan) - getTotalPaid(loan, data));

// ---------------------------------------------------------------------------
// Progress selectors — relative to "today"
// ---------------------------------------------------------------------------

export interface ThisYearProgress {
  /** Current installment as decided by `getCurrentInstallment`. */
  installment: LoanInstallment | null;
  /** Calendar year (CE) of the installment, or `null` if no installment. */
  calendarYear: number | null;
  /** Sum of payments made within `calendarYear` to date. */
  paidThisYear: number;
  /** installment.totalAmount, or 0 when `installment === null`. */
  dueThisYear: number;
  /** Fraction in [0, 1]. 0 when no installment / dueThisYear is 0. */
  fraction: number;
}

export const getThisYearProgress = (
  loan: Loan,
  data: WealthLensData,
  referenceDate: Date = new Date(),
): ThisYearProgress => {
  const installment = getCurrentInstallment(loan, referenceDate);
  if (!installment) {
    return {
      installment: null,
      calendarYear: null,
      paidThisYear: 0,
      dueThisYear: 0,
      fraction: 0,
    };
  }
  const calendarYear = parseIso(installment.dueDate).getFullYear();

  let paidThisYear = 0;
  if (loan.linkedDeductionField) {
    const yr = data.years[String(calendarYear)];
    if (yr) {
      const field = loan.linkedDeductionField;
      for (const inc of yr.income) {
        paidThisYear += monthlyGslFor(inc.deductions, field);
      }
    }
  }
  for (const ep of loan.extraPayments) {
    if (parseIso(ep.date).getFullYear() === calendarYear) {
      paidThisYear += ep.amount;
    }
  }

  const dueThisYear = installment.totalAmount;
  const fraction =
    dueThisYear > 0 ? Math.min(1, paidThisYear / dueThisYear) : 0;

  return {
    installment,
    calendarYear,
    paidThisYear,
    dueThisYear,
    fraction,
  };
};

/**
 * Years between today and the final installment's due date, rounded up
 * to the nearest whole year so "ปลายปีนี้" reads as 1 year remaining,
 * not 0. Returns 0 for a fully-paid (past-final) loan.
 */
export const getYearsRemaining = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  if (loan.schedule.length === 0) return 0;
  const lastDue = loan.schedule[loan.schedule.length - 1].dueDate;
  const lastMs = toMs(lastDue);
  const refMs = referenceDate.getTime();
  if (lastMs <= refMs) return 0;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return Math.ceil((lastMs - refMs) / msPerYear);
};

// ---------------------------------------------------------------------------
// Top-level summary — one struct the LoansPage hero can consume directly
// ---------------------------------------------------------------------------

export interface LoanSummary {
  scheduleTotal: number;
  totalPaid: number;
  remaining: number;
  /** Fraction in [0, 1]. */
  progressFraction: number;
  yearsRemaining: number;
  /** Last installment's calendar year (CE). */
  endYear: number | null;
  thisYear: ThisYearProgress;
}

export const getLoanSummary = (
  loan: Loan,
  data: WealthLensData,
  referenceDate: Date = new Date(),
): LoanSummary => {
  const scheduleTotal = getScheduleTotal(loan);
  const totalPaid = getTotalPaid(loan, data);
  const remaining = Math.max(0, scheduleTotal - totalPaid);
  const progressFraction =
    scheduleTotal > 0 ? Math.min(1, totalPaid / scheduleTotal) : 0;
  const endYear =
    loan.schedule.length > 0
      ? parseIso(loan.schedule[loan.schedule.length - 1].dueDate).getFullYear()
      : null;
  return {
    scheduleTotal,
    totalPaid,
    remaining,
    progressFraction,
    yearsRemaining: getYearsRemaining(loan, referenceDate),
    endYear,
    thisYear: getThisYearProgress(loan, data, referenceDate),
  };
};

// ---------------------------------------------------------------------------
// Schedule helpers — cumulative paid column ("จ่ายไปแล้ว" in the lender sheet)
// ---------------------------------------------------------------------------

/**
 * Running total of installment `totalAmount` from row 1 → row k. Used by
 * the schedule table to render the "สะสม" / "จ่ายไปแล้ว" column.
 */
export const getCumulativeBySchedule = (loan: Loan): number[] => {
  const sorted = [...loan.schedule].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  let running = 0;
  return sorted.map((i) => {
    running += i.totalAmount;
    return running;
  });
};

// ---------------------------------------------------------------------------
// ExtraPayment helpers
// ---------------------------------------------------------------------------

/** Stable comparator for extras — newest first. */
export const sortExtraPaymentsDesc = (a: ExtraPayment, b: ExtraPayment): number =>
  toMs(b.date) - toMs(a.date);
