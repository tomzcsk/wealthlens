/**
 * WealthLens — ไล่เดือน (F48).
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 * (หลักเดียวกับ lib/motion.ts, lib/theme.ts, lib/nav.ts)
 */
import type { WealthLensData } from '@/types';

/** '2025-07' */
export type Ym = string;

export const toYm = (year: number, month: number): Ym =>
  `${year}-${String(month).padStart(2, '0')}`;

export const parseYm = (ym: Ym): { year: number; month: number } => {
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
};

/** ทุกเดือนของทุกปีที่มีข้อมูล เรียงจากเก่าไปใหม่ */
export const monthsIn = (years: WealthLensData['years']): Ym[] => {
  const yearNums = Object.keys(years)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return yearNums.flatMap((y) =>
    Array.from({ length: 12 }, (_, i) => toYm(y, i + 1)),
  );
};

/**
 * วันสุดท้ายของเดือน (23:59:59.999) — ใช้เป็น referenceDate ให้
 * getPrincipalRemaining() ซึ่งนับงวดที่ dueDate ≤ วันนี้.
 * new Date(year, month, 0) = วันสุดท้ายของเดือนก่อนหน้า month (month เป็น 1-based
 * ที่นี่ จึงได้วันสุดท้ายของเดือนที่ต้องการพอดี) — ถูกทั้งเดือน 28/29/30/31
 */
export const endOfMonth = (ym: Ym): Date => {
  const { year, month } = parseYm(ym);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

/** เดือนนี้มาก่อน (หรือเท่ากับ) เดือนนั้นไหม — เทียบสตริงได้เพราะรูปแบบ zero-padded */
export const ymLte = (a: Ym, b: Ym): boolean => a <= b;
