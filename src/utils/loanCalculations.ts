/**
 * WealthLens — pure loan-tracker selectors.
 *
 * The Loan model stores the lender's schedule verbatim plus two payment
 * ledgers — `scheduledPayments` (monthly auto-debits confirmed by the
 * lender's portal) and `extraPayments` (voluntary โปะ on top). Both are
 * the source of truth; the salary slip's `deductions.gsl` is no longer
 * consulted for the loan log because the paycheck line and the amount
 * that actually reached the lender can diverge.
 *
 * All functions are pure and total: no throws, no side effects, no
 * date-now dependence (callers pass `referenceDate`). Selectors degrade
 * to safe defaults rather than throwing on missing data.
 */

import type { ExtraPayment, Loan, LoanInstallment } from '@/types';

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

/**
 * `ScheduledPayment` ที่มี id ขึ้นต้นด้วย prefix นี้ถูก derive มาจาก
 * `ExpenseItem` ที่ผูกกับหนี้ (F37) — ไม่ใช่รายการที่ผู้ใช้บันทึกเอง.
 * ประกาศไว้ที่นี่เพื่อให้ dependency ชี้ทางเดียว: loanPayments → loanCalculations.
 */
export const EXPENSE_PAYMENT_PREFIX = 'expense:';

/**
 * งวดที่ครบกำหนดแล้ว ณ `referenceDate` — ว่างเสมอเมื่อ `assumeOnSchedule`
 * ปิด/ไม่มี (หนี้ที่บันทึกการจ่ายเอง เช่น กยศ).
 */
const dueInstallments = (
  loan: Loan,
  referenceDate: Date,
): LoanInstallment[] => {
  if (!loan.assumeOnSchedule) return [];
  const refMs = referenceDate.getTime();
  return loan.schedule.filter((i) => toMs(i.dueDate) <= refMs);
};

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
 * Merge `scheduledPayments` (auto-debits) with `extraPayments` (โปะ) into
 * one date-sorted log.
 */
export const getMergedPaymentLog = (
  loan: Loan,
  referenceDate: Date = new Date(),
): PaymentLogEntry[] => {
  const out: PaymentLogEntry[] = [];

  for (const i of dueInstallments(loan, referenceDate)) {
    out.push({
      date: i.dueDate,
      amount: i.totalAmount,
      source: 'auto',
      label: 'หักตามตาราง',
    });
  }

  for (const sp of loan.scheduledPayments) {
    const fromExpense = sp.id.startsWith(EXPENSE_PAYMENT_PREFIX);
    out.push({
      date: sp.date,
      amount: sp.amount,
      source: 'auto',
      label: fromExpense ? 'จ่ายผ่านรายจ่าย' : 'งวดเดือน',
      ...(sp.reference ? { reference: sp.reference } : {}),
      ...(sp.notes ? { notes: sp.notes } : {}),
    });
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
export const getTotalPaid = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  let total = 0;
  for (const i of dueInstallments(loan, referenceDate)) total += i.totalAmount;
  for (const sp of loan.scheduledPayments) total += sp.amount;
  for (const ep of loan.extraPayments) total += ep.amount;
  return total;
};

export const getRemainingBalance = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number =>
  Math.max(0, getScheduleTotal(loan) - getTotalPaid(loan, referenceDate));

/**
 * เงินต้นที่ยังไม่ได้ชำระ.
 *
 * เงินที่จ่ายผ่านตาราง (งวดที่ถือว่าจ่ายจาก `assumeOnSchedule` +
 * `scheduledPayments` ซึ่งรวมรายจ่ายที่ผูกไว้ผ่าน `materializeLoanPayments`)
 * ถูกไล่ลงงวด 1→N ตามลำดับ: งวดที่จ่ายครบตัดเงินต้นเต็ม งวดที่จ่ายไม่ครบ
 * ตัดตามสัดส่วน. เงินก้อนจากรายจ่ายจริงไม่จำเป็นต้องเท่าค่างวด — waterfall
 * จึงถูกต้องกว่าการนับงวดที่ครบกำหนด.
 *
 * โปะ (`extraPayments`) ตัดเงินต้นเต็มจำนวน นอก waterfall — เป็นสิ่งที่
 * ผู้โปะคาดหวัง (เงินลงต้นล้วน ไม่ใช่ต้น+ดอกของงวดถัดไป).
 */
export const getPrincipalRemaining = (
  loan: Loan,
  referenceDate: Date = new Date(),
): number => {
  const sorted = [...loan.schedule].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  const totalPrincipal = sorted.reduce((acc, i) => acc + i.principalAmount, 0);

  let pool = 0;
  for (const i of dueInstallments(loan, referenceDate)) pool += i.totalAmount;
  for (const sp of loan.scheduledPayments) pool += sp.amount;

  let paidPrincipal = 0;
  for (const inst of sorted) {
    if (pool <= 0) break;
    if (pool >= inst.totalAmount) {
      paidPrincipal += inst.principalAmount;
      pool -= inst.totalAmount;
    } else {
      paidPrincipal +=
        inst.totalAmount > 0
          ? inst.principalAmount * (pool / inst.totalAmount)
          : 0;
      pool = 0;
    }
  }

  for (const ep of loan.extraPayments) paidPrincipal += ep.amount;
  return Math.max(0, totalPrincipal - paidPrincipal);
};

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
  for (const i of dueInstallments(loan, referenceDate)) {
    if (parseIso(i.dueDate).getFullYear() === calendarYear) {
      paidThisYear += i.totalAmount;
    }
  }
  for (const sp of loan.scheduledPayments) {
    if (parseIso(sp.date).getFullYear() === calendarYear) {
      paidThisYear += sp.amount;
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
  /** เงินต้นที่ยังไม่ได้ชำระ (ไม่รวมดอกเบี้ยในอนาคต). */
  principalRemaining: number;
  /** Fraction in [0, 1]. */
  progressFraction: number;
  yearsRemaining: number;
  /** Last installment's calendar year (CE). */
  endYear: number | null;
  thisYear: ThisYearProgress;
}

export const getLoanSummary = (
  loan: Loan,
  referenceDate: Date = new Date(),
): LoanSummary => {
  const scheduleTotal = getScheduleTotal(loan);
  const totalPaid = getTotalPaid(loan, referenceDate);
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
    principalRemaining: getPrincipalRemaining(loan, referenceDate),
    progressFraction,
    yearsRemaining: getYearsRemaining(loan, referenceDate),
    endYear,
    thisYear: getThisYearProgress(loan, referenceDate),
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
