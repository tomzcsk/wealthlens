import { v4 as uuidv4 } from 'uuid';

import type {
  ExpenseCategory,
  InstallmentMeta,
  MonthlyExpense,
  WealthLensData,
} from '@/types';

/** Round to 2 decimals (moved from financeStore — single source of truth). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Add `offset` whole months to (year, month). Month overflow rolls years. */
export const advanceMonth = (
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } => {
  const zeroBased = month - 1 + offset;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
};

/** ผ่อนรถ 60 งวด เริ่ม เม.ย. 2023 งวดละ 23,722 (ค่าคงที่ที่เดียว). */
export const CAR_INSTALLMENT = {
  name: 'รถยนต์',
  category: 'vehicle' as ExpenseCategory,
  totalMonths: 60,
  perInstallment: 23722,
  totalAmount: 23722 * 60, // 1,423,320
  startYear: 2023,
  startMonth: 4,
} as const;

/** sequence (1..60) ของเดือนนี้ในแผนรถ ; null ถ้าอยู่นอกช่วงแผน. */
export const carSequenceFor = (year: number, month: number): number | null => {
  const seq =
    (year - CAR_INSTALLMENT.startYear) * 12 +
    month -
    (CAR_INSTALLMENT.startMonth - 1);
  return seq >= 1 && seq <= CAR_INSTALLMENT.totalMonths ? seq : null;
};

/**
 * คืน years ใหม่ที่ item "รถยนต์"/vehicle ถูกเติม `installment` metadata
 * โดยคำนวณ sequence จากปฏิทิน — ติดเฉพาะเดือนที่ sequence อยู่ใน 1..60.
 * ไม่แตะ `amount` และ `isRecurring`. Idempotent: ถ้ามีงวดที่ tag แล้ว
 * reuse planId เดิม (ไม่งั้นใช้ `planId` ที่ส่งมา หรือ uuid ใหม่).
 */
export const applyCarInstallmentTags = (
  years: WealthLensData['years'],
  planId: string = uuidv4(),
): WealthLensData['years'] => {
  let existingPlanId: string | undefined;
  for (const yr of Object.values(years)) {
    for (const row of yr.expenses) {
      for (const item of row.items) {
        if (
          item.name === CAR_INSTALLMENT.name &&
          item.category === CAR_INSTALLMENT.category &&
          item.installment
        ) {
          existingPlanId = item.installment.planId;
        }
      }
    }
  }
  const usePlanId = existingPlanId ?? planId;

  const next: WealthLensData['years'] = {};
  for (const [yearKey, yr] of Object.entries(years)) {
    const year = Number(yearKey);
    const nextExpenses: MonthlyExpense[] = yr.expenses.map((row) => {
      let touched = false;
      const items = row.items.map((item) => {
        if (
          item.name !== CAR_INSTALLMENT.name ||
          item.category !== CAR_INSTALLMENT.category
        ) {
          return item;
        }
        const seq = carSequenceFor(year, row.month);
        if (seq == null) return item;
        touched = true;
        const installment: InstallmentMeta = {
          planId: usePlanId,
          sequence: seq,
          totalMonths: CAR_INSTALLMENT.totalMonths,
          totalAmount: CAR_INSTALLMENT.totalAmount,
          startYear: CAR_INSTALLMENT.startYear,
          startMonth: CAR_INSTALLMENT.startMonth,
        };
        return { ...item, installment };
      });
      return touched ? { ...row, items } : row;
    });
    next[yearKey] = { ...yr, expenses: nextExpenses };
  }
  return next;
};

/** ลบ `installment` ออกจากทุกแถวของแผน planId แต่เก็บแถว expense ไว้. */
export const removeInstallmentTags = (
  years: WealthLensData['years'],
  planId: string,
): WealthLensData['years'] => {
  const next: WealthLensData['years'] = {};
  for (const [yearKey, yr] of Object.entries(years)) {
    const nextExpenses = yr.expenses.map((row) => {
      let touched = false;
      const items = row.items.map((item) => {
        if (item.installment?.planId !== planId) return item;
        touched = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { installment: _omit, ...rest } = item;
        return rest;
      });
      return touched ? { ...row, items } : row;
    });
    next[yearKey] = { ...yr, expenses: nextExpenses };
  }
  return next;
};
