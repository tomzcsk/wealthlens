/**
 * WealthLens — อัตราการออมรายเดือน (F48).
 *
 * "เก็บได้กี่ % ของที่หาได้" — รายได้ของ Tom 45% มาจากคอมมิชชั่น เดือนคอมเยอะ
 * กับเดือนคอมน้อยจึงเทียบกันด้วยยอดบาทไม่ได้เลย ต้องเทียบด้วย %
 *
 * กฎเหล็ก: "ไม่มีข้อมูล" ≠ "เป็นศูนย์"
 *   ปี 2023 ของ Tom มีแต่รายได้ ไม่มีรายจ่ายรายการเลย (data quirk, CLAUDE.md)
 *   ถ้าคืน rate = 1.0 ปีนั้นจะกลายเป็นปีที่ "ออมเก่งที่สุด" ในกราฟ ทั้งที่มันคือ
 *   ปีที่เรารู้น้อยที่สุด → คืน null แล้วให้กราฟเว้นแท่งนั้นไว้
 *
 * Net.All มาจาก calculateNetAll() (utils/calculations.ts) แหล่งเดียว — ห้ามคำนวณเอง
 * (สองสำเนาของสูตรเดียวกันจะเพี้ยนออกจากกันวันหนึ่ง). ฟังก์ชันนั้นรับ
 * `totalDeductions` เป็นตัวเลข ไม่ใช่ก้อน MonthlyDeductions จึงต้องรวมยอดหักก่อนส่งเข้าไป
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 */
import type { MonthlyDeductions, WealthLensData } from '@/types';
import { calculateNetAll } from '@/utils/calculations';
import { monthsIn, parseYm, type Ym } from '@/utils/monthRange';

/** ยอดหักรวมของเดือน — สูตรเดียวกับ sumDeductions ใน stores/selectors.ts */
const sumDeductions = (d: MonthlyDeductions): number =>
  d.tax + d.socialSecurity + d.providentFund + d.gsl;

export interface SavingsRatePoint {
  ym: Ym;
  /** Net.All ของเดือนนั้น (เงินเดือน+โบนัส−หัก+คอม+อื่นๆ) */
  netAll: number;
  spent: number;
  /** netAll − spent — ติดลบได้ ห้าม clamp (กฎเดิม F44) */
  kept: number;
  /** null = ไม่มีข้อมูลรายจ่ายของเดือนนั้น (ไม่ใช่ "จ่าย 0") */
  rate: number | null;
}

export const buildSavingsRateSeries = (
  data: WealthLensData,
): SavingsRatePoint[] =>
  monthsIn(data.years).map((ym) => {
    const { year, month } = parseYm(ym);
    const yearData = data.years[String(year)];
    const income = yearData?.income?.find((i) => i.month === month);
    const expenseRow = yearData?.expenses?.find((e) => e.month === month);

    const netAll = income
      ? calculateNetAll({
          salary: income.salary,
          bonus: income.bonus,
          commission: income.commission,
          otherIncome: income.otherIncome,
          totalDeductions: sumDeductions(income.deductions),
        })
      : 0;
    const spent = (expenseRow?.items ?? []).reduce((s, i) => s + i.amount, 0);

    // ไม่มีแถวรายจ่ายของเดือนนั้นเลย = ไม่รู้ว่าจ่ายไปเท่าไร ≠ จ่าย 0
    const hasExpenseData = expenseRow !== undefined;
    const hasIncome = netAll !== 0;

    return {
      ym,
      netAll,
      spent,
      kept: netAll - spent,
      rate: hasExpenseData && hasIncome ? (netAll - spent) / netAll : null,
    };
  });

/**
 * ค่าเฉลี่ยเคลื่อนที่ — **ข้ามเดือนที่ rate เป็น null** ไม่นับมันเป็น 0
 * (นับเป็น 0 = ลากค่าเฉลี่ยลงด้วยข้อมูลที่ไม่มีอยู่จริง)
 * คืน null เมื่อไม่มีค่าจริงเลยในหน้าต่างนั้น
 */
export const rollingAverage = (
  points: readonly SavingsRatePoint[],
  window: number,
): (number | null)[] =>
  points.map((_, idx) => {
    const start = Math.max(0, idx - window + 1);
    const slice = points.slice(start, idx + 1);
    const real = slice.map((p) => p.rate).filter((r): r is number => r !== null);
    if (real.length === 0) return null;
    return real.reduce((s, r) => s + r, 0) / real.length;
  });
