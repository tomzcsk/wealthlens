/**
 * WealthLens — pure derived selectors.
 *
 * These functions take state (or a snapshot) and compute the views the UI
 * needs. They are intentionally NOT inside the Zustand store so:
 *  - The store stays a clean, serializable source of truth.
 *  - Selectors are trivially unit-testable in isolation.
 *  - CLAUDE.md's rule "ทุก calculation ต้อง derive จาก store" is enforced
 *    by construction — no number is hard-coded; everything flows from state.
 *
 * All numeric returns are RAW numbers; formatting (฿, comma, etc.) is the
 * responsibility of `utils/formatters.ts`. Selectors must never throw on
 * missing data — they degrade to zeros instead.
 */

import type {
  ExpenseCategory,
  ExpenseItem,
  GoldHolding,
  GoldPriceSnapshot,
  GoldPurity,
  GoldSpotPrice,
  InstallmentMeta,
  MonthlyDeductions,
  MonthlyIncome,
  MonthlySavings,
  SavingsCategory,
  SavingsItem,
  WealthLensData,
  YearData,
} from '@/types';
import {
  buildInstallmentSchedule,
  type ScheduledInstallment,
} from '@/utils/installments';
import { GRAMS_PER_BAHT } from '@/types';
import { CATEGORY_ORDER } from '@/types/expense-categories';
import { SAVINGS_CATEGORY_ORDER } from '@/types/savings-categories';
import type { FinanceState } from './financeStore';

/**
 * Anything from which we can derive — accept either the full Zustand state
 * or just the persisted blob, so selectors compose with snapshots too.
 */
export type Snapshot = Pick<FinanceState, 'data'> | { data: WealthLensData };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const sumDeductions = (d: MonthlyDeductions): number =>
  d.tax + d.socialSecurity + d.providentFund + d.gsl;

const sumExpenseItems = (items: readonly ExpenseItem[]): number =>
  items.reduce((acc, it) => acc + it.amount, 0);

const sumSavingsItems = (items: readonly SavingsItem[]): number =>
  items.reduce((acc, it) => acc + it.amount, 0);

const getYear = (state: Snapshot, year: number): YearData | undefined =>
  state.data.years[String(year)];

/**
 * Defensive accessor for the savings list — older persisted snapshots may
 * not have the `savings` field at all. Treat as empty array.
 */
const yearSavings = (yr: YearData | undefined): MonthlySavings[] =>
  yr?.savings ?? [];

// ---------------------------------------------------------------------------
// Per-month selectors
// ---------------------------------------------------------------------------

export const selectMonthIncome = (
  state: Snapshot,
  year: number,
  month: number,
): MonthlyIncome | null => {
  const yr = getYear(state, year);
  if (!yr) return null;
  return yr.income.find((i) => i.month === month) ?? null;
};

export const selectMonthExpenses = (
  state: Snapshot,
  year: number,
  month: number,
): ExpenseItem[] => {
  const yr = getYear(state, year);
  if (!yr) return [];
  return yr.expenses.find((e) => e.month === month)?.items ?? [];
};

export const selectMonthSavings = (
  state: Snapshot,
  year: number,
  month: number,
): SavingsItem[] => {
  const yr = getYear(state, year);
  if (!yr) return [];
  return yearSavings(yr).find((s) => s.month === month)?.items ?? [];
};

export interface MonthSummary {
  /** salary + bonus + commission */
  gross: number;
  /** sum of all deduction lines (Dime is no longer a deduction). */
  totalDeductions: number;
  /** "Net." — take-home from salary+bonus only, after deductions */
  netSalary: number;
  /** "Net. All" — netSalary + commission (the headline KPI) */
  netAll: number;
  /** Sum of itemized expenses for the month (consumption only). */
  totalExpenses: number;
  /** Sum of savings/investments for the month (Dime, ออมเที่ยว, ...). */
  totalSavings: number;
  /** "เหลือจริง" — netAll − totalExpenses (consumption-only). */
  remaining: number;
  /** "ใช้ได้จริง" — remaining − totalSavings (after both consumption + savings). */
  cashFree: number;
}

const ZERO_MONTH_SUMMARY: MonthSummary = {
  gross: 0,
  totalDeductions: 0,
  netSalary: 0,
  netAll: 0,
  totalExpenses: 0,
  totalSavings: 0,
  remaining: 0,
  cashFree: 0,
};

export const selectMonthSummary = (
  state: Snapshot,
  year: number,
  month: number,
): MonthSummary => {
  const income = selectMonthIncome(state, year, month);
  const items = selectMonthExpenses(state, year, month);
  const savings = selectMonthSavings(state, year, month);
  const totalSavings = sumSavingsItems(savings);

  if (!income) {
    const totalExpenses = sumExpenseItems(items);
    const remaining = -totalExpenses;
    return {
      ...ZERO_MONTH_SUMMARY,
      totalExpenses,
      totalSavings,
      remaining,
      cashFree: remaining - totalSavings,
    };
  }

  const gross = income.salary + income.bonus + income.commission + (income.otherIncome ?? 0);
  const totalDeductions = sumDeductions(income.deductions);
  const netSalary = income.salary + income.bonus - totalDeductions;
  const netAll = netSalary + income.commission + (income.otherIncome ?? 0);
  const totalExpenses = sumExpenseItems(items);
  const remaining = netAll - totalExpenses;

  return {
    gross,
    totalDeductions,
    netSalary,
    netAll,
    totalExpenses,
    totalSavings,
    remaining,
    cashFree: remaining - totalSavings,
  };
};

// ---------------------------------------------------------------------------
// Per-year selectors
// ---------------------------------------------------------------------------

export interface YearSummary {
  salary: number;
  bonus: number;
  commission: number;
  otherIncome: number;
  totalDeductions: number;
  /** Sum of monthly netSalary across the year */
  netSalary: number;
  /** Sum of monthly netAll across the year — matches Dashboard "Net All" */
  netAll: number;
  totalExpenses: number;
  /** Sum of savings/investments across the year. */
  totalSavings: number;
  remaining: number;
  /** Count of distinct months that have either income or expense data */
  monthsWithData: number;
}

const ZERO_YEAR_SUMMARY: YearSummary = {
  salary: 0,
  bonus: 0,
  commission: 0,
  otherIncome: 0,
  totalDeductions: 0,
  netSalary: 0,
  netAll: 0,
  totalExpenses: 0,
  totalSavings: 0,
  remaining: 0,
  monthsWithData: 0,
};

export const selectYearSummary = (
  state: Snapshot,
  year: number,
): YearSummary => {
  const yr = getYear(state, year);
  if (!yr) return ZERO_YEAR_SUMMARY;

  const monthsTouched = new Set<number>();
  for (const i of yr.income) monthsTouched.add(i.month);
  for (const e of yr.expenses) monthsTouched.add(e.month);
  for (const s of yearSavings(yr)) monthsTouched.add(s.month);

  let salary = 0;
  let bonus = 0;
  let commission = 0;
  let otherIncome = 0;
  let totalDeductions = 0;
  let netSalary = 0;
  let netAll = 0;
  let totalExpenses = 0;
  let totalSavings = 0;
  let remaining = 0;

  for (const month of monthsTouched) {
    const income = selectMonthIncome(state, year, month);
    if (income) {
      salary += income.salary;
      bonus += income.bonus;
      commission += income.commission;
      otherIncome += income.otherIncome ?? 0;
    }
    const summary = selectMonthSummary(state, year, month);
    totalDeductions += summary.totalDeductions;
    netSalary += summary.netSalary;
    netAll += summary.netAll;
    totalExpenses += summary.totalExpenses;
    totalSavings += summary.totalSavings;
    remaining += summary.remaining;
  }

  return {
    salary,
    bonus,
    commission,
    otherIncome,
    totalDeductions,
    netSalary,
    netAll,
    totalExpenses,
    totalSavings,
    remaining,
    monthsWithData: monthsTouched.size,
  };
};

// ---------------------------------------------------------------------------
// Cross-year — YoY KPI deltas
// ---------------------------------------------------------------------------

/** YoY-comparable numeric metrics on YearSummary. */
export type YoYMetric =
  | 'salary'
  | 'bonus'
  | 'commission'
  | 'otherIncome'
  | 'totalDeductions'
  | 'netSalary'
  | 'netAll'
  | 'totalExpenses'
  | 'totalSavings'
  | 'remaining';

/**
 * Percentage change vs previous year. Returns `null` if the prior year has
 * no data (so callers can render "—" instead of a misleading ∞%).
 */
export const selectYoYChange = (
  state: Snapshot,
  year: number,
  metric: YoYMetric,
): number | null => {
  const prior = getYear(state, year - 1);
  if (!prior) return null;
  const prev = selectYearSummary(state, year - 1)[metric];
  if (prev === 0) return null;
  const curr = selectYearSummary(state, year)[metric];
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// ---------------------------------------------------------------------------
// Expense breakdown by category
// ---------------------------------------------------------------------------

const emptyCategoryMap = (): Record<ExpenseCategory, number> =>
  CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<ExpenseCategory, number>,
  );

/**
 * Sum expenses by category, either for a specific month (when `month` given)
 * or aggregated across the entire year.
 */
export const selectExpenseByCategory = (
  state: Snapshot,
  year: number,
  month?: number,
): Record<ExpenseCategory, number> => {
  const yr = getYear(state, year);
  const totals = emptyCategoryMap();
  if (!yr) return totals;

  const rows =
    month === undefined
      ? yr.expenses
      : yr.expenses.filter((e) => e.month === month);

  for (const row of rows) {
    for (const item of row.items) {
      totals[item.category] += item.amount;
    }
  }
  return totals;
};

// ---------------------------------------------------------------------------
// Savings breakdown by category
// ---------------------------------------------------------------------------

const emptySavingsCategoryMap = (): Record<SavingsCategory, number> =>
  SAVINGS_CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<SavingsCategory, number>,
  );

/**
 * Sum savings/investment items by category, either for a specific month
 * (when `month` is given) or aggregated across the entire year.
 */
export const selectSavingsByCategory = (
  state: Snapshot,
  year: number,
  month?: number,
): Record<SavingsCategory, number> => {
  const yr = getYear(state, year);
  const totals = emptySavingsCategoryMap();
  if (!yr) return totals;

  const rows =
    month === undefined
      ? yearSavings(yr)
      : yearSavings(yr).filter((s) => s.month === month);

  for (const row of rows) {
    for (const item of row.items) {
      totals[item.category] += item.amount;
    }
  }
  return totals;
};

// ---------------------------------------------------------------------------
// Monthly summaries for table/chart rendering
// ---------------------------------------------------------------------------

export interface MonthlySummaryRow extends MonthSummary {
  month: number;
}

// ---------------------------------------------------------------------------
// Installment plan selectors
// ---------------------------------------------------------------------------

/**
 * One งวด of an installment plan, annotated with the year/month it lands
 * in. The InstallmentsPage uses these to render timelines and the
 * Manager's progress bars.
 */
export interface InstallmentInstance {
  year: number;
  month: number;
  /** The actual ExpenseItem.id — for "edit this งวด" callbacks. */
  itemId: string;
  amount: number;
  sequence: number;
  category: ExpenseCategory;
  name: string;
}

/**
 * Aggregated view of an installment plan — all งวด rolled up with progress
 * stats. `paidMonths` counts งวด whose calendar date is in the past
 * relative to `referenceDate` (defaults to today).
 */
export interface InstallmentPlanSummary {
  planId: string;
  /** Plan name (taken from the first งวด's ExpenseItem.name). */
  name: string;
  category: ExpenseCategory;
  totalAmount: number;
  totalMonths: number;
  startYear: number;
  startMonth: number;
  /** All งวด found in the data, sorted by sequence. */
  instances: InstallmentInstance[];
  /** ตารางงวดเต็ม (derive จาก metadata, overlay แถวจริง). */
  schedule: ScheduledInstallment[];
  /** Sum of งวด amounts up to and including `referenceDate`. */
  paidAmount: number;
  /** Count of งวด already due (schedule-wise). */
  paidMonths: number;
  /** Remaining balance = totalAmount - paidAmount. */
  remainingAmount: number;
  /** Next งวด due (first schedule entry with month > referenceDate), if any. */
  nextDue: ScheduledInstallment | null;
  /** งวดสุดท้ายของตาราง (จบเมื่อไหร่). */
  endYear: number;
  endMonth: number;
  /** True when every งวด of the plan is in the past. */
  isCompleted: boolean;
}

/**
 * Returns "year-month" as an integer key (e.g. 202605 for May 2026) — used
 * for cheap chronological comparisons.
 */
const ymKey = (year: number, month: number): number => year * 100 + month;

/**
 * Collect every ExpenseItem tagged with an installment plan, grouped by
 * planId. Walks every year/month so cross-year plans are caught.
 */
export const selectInstallmentPlans = (
  state: Snapshot,
  referenceDate: Date = new Date(),
): InstallmentPlanSummary[] => {
  const plans = new Map<string, InstallmentInstance[]>();
  // Track metadata separately — we want the FIRST installment's metadata
  // as the authoritative copy for the plan summary (in case งวด carry
  // diverging metadata from manual edits).
  const planMeta = new Map<
    string,
    { meta: InstallmentMeta; name: string; category: ExpenseCategory }
  >();

  for (const [yearKey, yr] of Object.entries(state.data.years)) {
    const year = Number(yearKey);
    for (const row of yr.expenses) {
      for (const item of row.items) {
        const inst = item.installment;
        if (!inst) continue;
        const list = plans.get(inst.planId) ?? [];
        list.push({
          year,
          month: row.month,
          itemId: item.id,
          amount: item.amount,
          sequence: inst.sequence,
          category: item.category,
          name: item.name,
        });
        plans.set(inst.planId, list);
        const existing = planMeta.get(inst.planId);
        if (!existing || inst.sequence < existing.meta.sequence) {
          planMeta.set(inst.planId, {
            meta: inst,
            name: item.name,
            category: item.category,
          });
        }
      }
    }
  }

  const refYm = ymKey(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
  );

  const summaries: InstallmentPlanSummary[] = [];
  for (const [planId, instances] of plans) {
    const sorted = [...instances].sort((a, b) => a.sequence - b.sequence);
    const meta = planMeta.get(planId);
    if (!meta) continue;
    const materializedBySeq = new Map(
      sorted.map((i) => [i.sequence, { amount: i.amount, itemId: i.itemId }]),
    );
    const schedule = buildInstallmentSchedule(meta.meta, materializedBySeq);
    if (schedule.length === 0) continue; // totalMonths === 0 is a data-integrity error; skip the plan
    const paid = schedule.filter((s) => ymKey(s.year, s.month) <= refYm);
    const paidAmount = paid.reduce((acc, s) => acc + s.amount, 0);
    const nextDue =
      schedule.find((s) => ymKey(s.year, s.month) > refYm) ?? null;
    const end = schedule[schedule.length - 1];
    summaries.push({
      planId,
      name: meta.name,
      category: meta.category,
      totalAmount: meta.meta.totalAmount,
      totalMonths: meta.meta.totalMonths,
      startYear: meta.meta.startYear,
      startMonth: meta.meta.startMonth,
      instances: sorted,
      schedule,
      paidAmount,
      paidMonths: paid.length,
      remainingAmount: Math.max(0, meta.meta.totalAmount - paidAmount),
      nextDue,
      endYear: end.year,
      endMonth: end.month,
      isCompleted: nextDue === null,
    });
  }

  // Sort: active plans first (by start date desc → newest at top),
  // completed plans after.
  summaries.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return (
      ymKey(b.startYear, b.startMonth) - ymKey(a.startYear, a.startMonth)
    );
  });
  return summaries;
};

/**
 * All 12 calendar months (1-12) for the given year, each with its computed
 * summary. Months with no data return zeros — UI decides whether to render
 * empty rows or skip them.
 */
export const selectMonthlySummariesForYear = (
  state: Snapshot,
  year: number,
): MonthlySummaryRow[] => {
  const rows: MonthlySummaryRow[] = [];
  for (let month = 1; month <= 12; month += 1) {
    rows.push({ month, ...selectMonthSummary({ data: state.data }, year, month) });
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Gold selectors
// ---------------------------------------------------------------------------

export interface GoldSummary {
  /** All holdings, newest purchaseDate first. */
  holdings: GoldHolding[];
  activeHoldings: GoldHolding[];
  soldHoldings: GoldHolding[];
  /** Sum of weight across ACTIVE holdings, in บาททอง. */
  totalWeightBaht: number;
  /** Same number expressed in grams (for display). */
  totalWeightGrams: number;
  /** Total ฿ invested in active holdings = sum of totalCost. */
  totalInvested: number;
  /** Cost basis ÷ weight (in ฿ per บาททอง). 0 when no holdings. */
  avgCostPerBaht: number;
  /** Sum of (active holdings × matching spot price). 0 when spot unset. */
  marketValue: number;
  /** marketValue - totalInvested. Negative = loss. */
  unrealizedPnl: number;
  /** Sum of (soldPrice - totalCost) across sold holdings. */
  realizedPnl: number;
  /** Active holding count. */
  activeCount: number;
  /** Sold holding count. */
  soldCount: number;
}

/**
 * Currently-active spot price for a given purity, or `null` if Tom hasn't
 * entered one yet. UI checks for `null` before rendering P&L numbers.
 */
const getSpotForPurity = (
  spot: GoldSpotPrice | undefined,
  purity: GoldPurity,
): number | null => {
  if (!spot) return null;
  const value = spot[purity];
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
};

export const selectGoldSummary = (state: Snapshot): GoldSummary => {
  const holdings = state.data.goldHoldings ?? [];
  const spot = state.data.preferences?.goldSpotPrice;

  // Sort: newest purchase first. Use ISO date string compare — ISO dates
  // are lexicographically chronological, no Date() construction needed.
  const sorted = [...holdings].sort((a, b) =>
    a.purchaseDate < b.purchaseDate ? 1 : a.purchaseDate > b.purchaseDate ? -1 : 0,
  );
  const active = sorted.filter((h) => h.sold == null);
  const sold = sorted.filter((h) => h.sold != null);

  let totalWeightBaht = 0;
  let totalInvested = 0;
  let marketValue = 0;
  for (const h of active) {
    totalWeightBaht += h.weightBaht;
    totalInvested += h.totalCost;
    const sp = getSpotForPurity(spot, h.purity);
    if (sp != null) marketValue += sp * h.weightBaht;
  }

  let realizedPnl = 0;
  for (const h of sold) {
    if (h.sold) realizedPnl += h.sold.soldPrice - h.totalCost;
  }

  return {
    holdings: sorted,
    activeHoldings: active,
    soldHoldings: sold,
    totalWeightBaht,
    totalWeightGrams: totalWeightBaht * GRAMS_PER_BAHT,
    totalInvested,
    avgCostPerBaht:
      totalWeightBaht > 0 ? totalInvested / totalWeightBaht : 0,
    marketValue,
    unrealizedPnl: marketValue > 0 ? marketValue - totalInvested : 0,
    realizedPnl,
    activeCount: active.length,
    soldCount: sold.length,
  };
};

/** Per-holding market value at the current spot, or `null` if spot unset. */
export const selectGoldHoldingMarketValue = (
  state: Snapshot,
  holding: GoldHolding,
): number | null => {
  const spot = getSpotForPurity(
    state.data.preferences?.goldSpotPrice,
    holding.purity,
  );
  return spot == null ? null : spot * holding.weightBaht;
};

// ---------------------------------------------------------------------------
// Gold assistant — rule-based context signals
// ---------------------------------------------------------------------------

/**
 * Display tone for an assistant signal. `buy` and `sell` are deliberate
 * leans, not advice — the UI tags every card with "ไม่ใช่คำแนะนำลงทุน".
 */
export type AssistantSignalTone =
  | 'buy'
  | 'sell'
  | 'neutral'
  | 'info'
  | 'warmup';

export interface AssistantSignal {
  /** Stable id for React keys + dedup. */
  id: string;
  tone: AssistantSignalTone;
  emoji: string;
  title: string;
  detail: string;
}

export interface GoldAssistantSnapshot {
  /** Live 96.5% spot used everywhere below. */
  spotPrice: number | null;
  /** Tom's weighted avg cost across active 96.5% holdings. */
  avgCostPerBaht: number;
  /** (spot - avgCost) / avgCost * 100. Negative = spot below cost. */
  spotVsCostPercent: number | null;
  /** Active-portfolio P&L %. */
  portfolioPnlPercent: number | null;
  /** Most recent buy → today, in days. */
  daysSinceLastBuy: number | null;
  /** Mean gap between consecutive buys (≥2 buys needed). */
  avgBuyIntervalDays: number | null;
  /** How many buy transactions there are. */
  buyCount: number;
  /** Total stored price observations (across all time). */
  snapshotCount: number;
  /** Snapshots within the last 30 days. */
  recentSnapshotCount: number;
  /** 30-day mean of price965, or null if too few data points. */
  ma30Price: number | null;
  /** (spot - ma30) / ma30 * 100. */
  spotVsMa30Percent: number | null;
  /** Highest price seen in last 30 days. */
  high30: number | null;
  /** Lowest price seen in last 30 days. */
  low30: number | null;
  /** Ordered list of cards to render. */
  signals: AssistantSignal[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_SNAPSHOTS_FOR_MA = 3;
const WINDOW_DAYS = 30;
const BUY_SIGNAL_PCT_BELOW_COST = -2;
const SELL_SIGNAL_PCT_PNL = 10;
const BUY_SIGNAL_PCT_BELOW_MA = -1.5;
const HIGH_LOW_TOLERANCE_PCT = 0.3;
const DCA_OVERDUE_MULTIPLIER = 1.5;

const daysBetween = (laterIso: string, earlierIso: string): number => {
  const ms = new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  return ms / MS_PER_DAY;
};

const computeAvgBuyInterval = (
  buys: readonly GoldHolding[],
): number | null => {
  if (buys.length < 2) return null;
  const sorted = [...buys].sort((a, b) =>
    a.purchaseDate < b.purchaseDate ? -1 : 1,
  );
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    totalGap += daysBetween(
      sorted[i].purchaseDate,
      sorted[i - 1].purchaseDate,
    );
  }
  return totalGap / (sorted.length - 1);
};

const filterRecentSnapshots = (
  history: readonly GoldPriceSnapshot[],
  windowDays: number,
): GoldPriceSnapshot[] => {
  const cutoff = Date.now() - windowDays * MS_PER_DAY;
  return history.filter((s) => new Date(s.fetchedAt).getTime() >= cutoff);
};

export const selectGoldAssistantSignals = (
  state: Snapshot,
): GoldAssistantSnapshot => {
  const spot = getSpotForPurity(
    state.data.preferences?.goldSpotPrice,
    '96.5',
  );
  const holdings = state.data.goldHoldings ?? [];
  const active965 = holdings.filter(
    (h) => h.sold == null && h.purity === '96.5',
  );

  const totalWeight = active965.reduce((a, h) => a + h.weightBaht, 0);
  const totalInvested = active965.reduce((a, h) => a + h.totalCost, 0);
  const avgCostPerBaht = totalWeight > 0 ? totalInvested / totalWeight : 0;

  const spotVsCostPercent =
    spot != null && avgCostPerBaht > 0
      ? ((spot - avgCostPerBaht) / avgCostPerBaht) * 100
      : null;

  const marketValue = spot != null ? spot * totalWeight : null;
  const portfolioPnlPercent =
    marketValue != null && totalInvested > 0
      ? ((marketValue - totalInvested) / totalInvested) * 100
      : null;

  const lastBuy = active965
    .map((h) => h.purchaseDate)
    .sort()
    .at(-1);
  const daysSinceLastBuy =
    lastBuy != null
      ? Math.floor(daysBetween(new Date().toISOString(), lastBuy))
      : null;
  const avgBuyIntervalDays = computeAvgBuyInterval(active965);

  const history = state.data.goldPriceHistory ?? [];
  const recent = filterRecentSnapshots(history, WINDOW_DAYS);
  const ma30Price =
    recent.length >= MIN_SNAPSHOTS_FOR_MA
      ? recent.reduce((a, s) => a + s.price965, 0) / recent.length
      : null;
  const spotVsMa30Percent =
    spot != null && ma30Price != null
      ? ((spot - ma30Price) / ma30Price) * 100
      : null;
  const high30 =
    recent.length > 0
      ? recent.reduce((a, s) => Math.max(a, s.price965), 0)
      : null;
  const low30 =
    recent.length > 0
      ? recent.reduce((a, s) => Math.min(a, s.price965), Infinity)
      : null;

  const signals: AssistantSignal[] = [];

  // ---- Early-out: no spot yet ---------------------------------------------
  if (spot == null) {
    signals.push({
      id: 'no-spot',
      tone: 'info',
      emoji: '🔍',
      title: 'ยังไม่มีราคา spot',
      detail:
        'กด "🔄 ดึงจาก สมาคมค้าทองคำ" ก่อน — แล้วผู้ช่วยจะวิเคราะห์ให้',
    });
    return {
      spotPrice: spot,
      avgCostPerBaht,
      spotVsCostPercent,
      portfolioPnlPercent,
      daysSinceLastBuy,
      avgBuyIntervalDays,
      buyCount: active965.length,
      snapshotCount: history.length,
      recentSnapshotCount: recent.length,
      ma30Price,
      spotVsMa30Percent,
      high30,
      low30,
      signals,
    };
  }

  // ---- Cost-basis signals (need active holdings) ---------------------------
  if (active965.length > 0 && spotVsCostPercent != null) {
    if (spotVsCostPercent <= BUY_SIGNAL_PCT_BELOW_COST) {
      signals.push({
        id: 'below-cost',
        tone: 'buy',
        emoji: '🟢',
        title: `Spot ต่ำกว่าต้นทุนเฉลี่ย ${Math.abs(spotVsCostPercent).toFixed(1)}%`,
        detail: `ราคา ${spot.toLocaleString()} vs ต้นทุน ${avgCostPerBaht.toLocaleString(undefined, { maximumFractionDigits: 0 })} /บาท — DCA opportunity?`,
      });
    } else if (
      portfolioPnlPercent != null &&
      portfolioPnlPercent >= SELL_SIGNAL_PCT_PNL
    ) {
      signals.push({
        id: 'pnl-high',
        tone: 'sell',
        emoji: '🟡',
        title: `พอร์ตกำไร +${portfolioPnlPercent.toFixed(1)}%`,
        detail:
          'ตามเกณฑ์ของผู้ช่วย (≥10%) — พิจารณาขายลอตเก่าบางส่วนเพื่อล็อกกำไร?',
      });
    } else if (portfolioPnlPercent != null) {
      signals.push({
        id: 'pnl-neutral',
        tone: 'neutral',
        emoji: '⚪',
        title: `พอร์ตอยู่ที่ ${portfolioPnlPercent >= 0 ? '+' : ''}${portfolioPnlPercent.toFixed(1)}%`,
        detail: 'ยังไม่ทะลุ ±เกณฑ์ของผู้ช่วย — hold ต่อไปก่อน',
      });
    }
  }

  // ---- DCA cadence signal --------------------------------------------------
  if (
    daysSinceLastBuy != null &&
    avgBuyIntervalDays != null &&
    avgBuyIntervalDays > 0 &&
    daysSinceLastBuy > avgBuyIntervalDays * DCA_OVERDUE_MULTIPLIER
  ) {
    signals.push({
      id: 'dca-overdue',
      tone: 'buy',
      emoji: '📅',
      title: `ครบรอบ DCA แล้ว — ${daysSinceLastBuy} วัน`,
      detail: `Tom ซื้อเฉลี่ยทุก ${avgBuyIntervalDays.toFixed(0)} วัน · ซื้อครั้งล่าสุด ${lastBuy ?? '?'}`,
    });
  }

  // ---- Price-history signals ----------------------------------------------
  if (recent.length < MIN_SNAPSHOTS_FOR_MA) {
    signals.push({
      id: 'history-warmup',
      tone: 'warmup',
      emoji: '⏳',
      title: `เก็บข้อมูลราคาแล้ว ${recent.length}/${MIN_SNAPSHOTS_FOR_MA} ครั้ง`,
      detail:
        'กดอัปเดตวันละครั้ง — ครบเมื่อไหร่ ผู้ช่วยจะเปิดสัญญาณ MA 30 วันให้',
    });
  } else {
    if (
      spotVsMa30Percent != null &&
      spotVsMa30Percent <= BUY_SIGNAL_PCT_BELOW_MA
    ) {
      signals.push({
        id: 'below-ma30',
        tone: 'buy',
        emoji: '📉',
        title: `Spot ต่ำกว่า MA 30 วัน ${Math.abs(spotVsMa30Percent).toFixed(1)}%`,
        detail: `ค่าเฉลี่ย 30 วัน ${ma30Price?.toLocaleString(undefined, { maximumFractionDigits: 0 })} /บาท — ราคา relatively ถูก`,
      });
    }
    if (
      high30 != null &&
      spot >= high30 * (1 - HIGH_LOW_TOLERANCE_PCT / 100)
    ) {
      signals.push({
        id: 'near-high30',
        tone: 'sell',
        emoji: '⛰️',
        title: 'แตะ peak 30 วัน',
        detail: `Spot ${spot.toLocaleString()} ≈ จุดสูงสุด 30 วัน ${high30.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      });
    }
    if (
      low30 != null &&
      low30 !== Infinity &&
      spot <= low30 * (1 + HIGH_LOW_TOLERANCE_PCT / 100)
    ) {
      signals.push({
        id: 'near-low30',
        tone: 'buy',
        emoji: '🪨',
        title: 'แตะ low 30 วัน',
        detail: `Spot ${spot.toLocaleString()} ≈ จุดต่ำสุด 30 วัน ${low30.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      });
    }
  }

  // ---- Default empty state --------------------------------------------------
  if (signals.length === 0) {
    signals.push({
      id: 'no-signal',
      tone: 'info',
      emoji: '🟦',
      title: 'ยังไม่มีสัญญาณเด่น',
      detail:
        active965.length === 0
          ? 'ยังไม่มีทองในพอร์ต — ดูราคาเฉย ๆ ได้'
          : 'ราคา + พอร์ตอยู่ในช่วงปกติ',
    });
  }

  return {
    spotPrice: spot,
    avgCostPerBaht,
    spotVsCostPercent,
    portfolioPnlPercent,
    daysSinceLastBuy,
    avgBuyIntervalDays,
    buyCount: active965.length,
    snapshotCount: history.length,
    recentSnapshotCount: recent.length,
    ma30Price,
    spotVsMa30Percent,
    high30: high30 === Infinity ? null : high30,
    low30: low30 === Infinity ? null : low30,
    signals,
  };
};
