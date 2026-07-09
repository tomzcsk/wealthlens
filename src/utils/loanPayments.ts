/**
 * WealthLens — แปลงรายจ่ายที่ผูกกับหนี้เป็นประวัติการชำระ (F37).
 *
 * ทิศทาง pointer: `ExpenseItem.loanId` ชี้ไปหา `Loan` — รายจ่ายคือสิ่งที่
 * เกิดขึ้นจริงและมีได้หลายรายการต่อหนึ่งหนี้. ที่นี่จึง *อ่าน* อย่างเดียว
 * แล้วคืน Loan ก้อนใหม่ที่มี payment เติมแล้ว ทำให้ selector ทุกตัวใน
 * loanCalculations.ts ทำงานต่อได้โดยไม่ต้องรู้จัก ExpenseItem
 * (dependency ชี้ทางเดียว: loanPayments → loanCalculations).
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now.
 */
import type { Loan, ScheduledPayment, WealthLensData } from '@/types';
import { EXPENSE_PAYMENT_PREFIX } from '@/utils/loanCalculations';

/**
 * เดือนที่ไม่มี `date` ผูกกับวันที่ 1 ของเดือนนั้น — `MonthlyExpense.month`
 * คือ source of truth ของ bucket อยู่แล้ว (ไม่ใช่ index ใน array).
 */
const firstOfMonth = (year: string, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}-01`;

export const materializeLoanPayments = (
  loan: Loan,
  years: WealthLensData['years'],
): Loan => {
  const derived: ScheduledPayment[] = [];

  for (const [yearKey, yearData] of Object.entries(years)) {
    for (const monthExpense of yearData.expenses ?? []) {
      for (const item of monthExpense.items ?? []) {
        if (item.loanId !== loan.id) continue;
        derived.push({
          // id ต้อง stable และไม่ชนกับ ScheduledPayment จริง — prefix ทำหน้าที่
          // เป็นทั้ง key ของ React และ discriminator ของ getMergedPaymentLog.
          id: `${EXPENSE_PAYMENT_PREFIX}${item.id}`,
          date: item.date ?? firstOfMonth(yearKey, monthExpense.month),
          amount: item.amount,
          notes: item.name,
        });
      }
    }
  }

  if (derived.length === 0) return loan;

  return {
    ...loan,
    // รายจ่ายจริงชนะการสมมติเสมอ — กันนับซ้ำเมื่อผู้ใช้ติ๊ก assumeOnSchedule
    // ไว้ก่อนแล้วมาผูกรายจ่ายทีหลัง.
    assumeOnSchedule: false,
    scheduledPayments: [...loan.scheduledPayments, ...derived],
  };
};

/** จำนวนรายจ่ายที่ผูกกับหนี้ก้อนนี้ — ใช้โชว์ที่หน้ารายละเอียด. */
export const countLinkedExpenses = (
  loan: Loan,
  years: WealthLensData['years'],
): number => {
  let count = 0;
  for (const yearData of Object.values(years)) {
    for (const monthExpense of yearData.expenses ?? []) {
      for (const item of monthExpense.items ?? []) {
        if (item.loanId === loan.id) count += 1;
      }
    }
  }
  return count;
};
