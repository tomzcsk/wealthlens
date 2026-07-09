/**
 * WealthLens — แปลงรายได้รายเดือนเป็นยอดฝากเข้าบัญชี (F39).
 *
 * เงินเดือนเข้าบัญชีเป็นยอด "หลังหัก" (สลิปหักภาษี/ประกันสังคม/กองทุน/กยศ
 * ก่อนโอน) ส่วนโบนัส/คอม/รายได้อื่นๆ เข้าเต็มจำนวนตามช่องที่ผู้ใช้เลือก.
 *
 * ยอด 0 ไม่สร้าง ref — เขียน delta 0 ลงบัญชีไม่มีความหมาย มีแต่จะสร้าง
 * key เดือนเปล่าๆ ทิ้งไว้.
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now.
 */
import type {
  IncomeDepositRef,
  MonthlyDeductions,
  MonthlyIncome,
} from '@/types';

/** ยอดหักรวมทั้งสลิป. (`investment` ย้ายไป savings แล้ว — อย่าบวกกลับ.) */
export const sumIncomeDeductions = (d: MonthlyDeductions): number =>
  d.tax + d.socialSecurity + d.providentFund + d.gsl;

/** เงินเดือนหลังหัก — clamp ที่ 0 ไม่ให้ฝากยอดติดลบ. */
export const netSalaryForDeposit = (income: MonthlyIncome): number =>
  Math.max(0, income.salary - sumIncomeDeductions(income.deductions));

/** true เมื่อยอดหักมากกว่าเงินเดือน — UI เตือนก่อนบันทึก. */
export const isSalaryUnderwater = (income: MonthlyIncome): boolean =>
  income.salary - sumIncomeDeductions(income.deductions) < 0;

/** ยอดฝากที่ควรเกิดจากรายได้ก้อนนี้ — clamp ที่ 0, ข้ามช่องที่ไม่เลือกบัญชี. */
export const computeIncomeDeposits = (
  income: MonthlyIncome,
): IncomeDepositRef[] => {
  const targets = income.deposits;
  if (!targets) return [];

  const rows: ReadonlyArray<{
    source: IncomeDepositRef['source'];
    accountId: string | undefined;
    amount: number;
  }> = [
    { source: 'salary', accountId: targets.salary, amount: netSalaryForDeposit(income) },
    { source: 'bonus', accountId: targets.bonus, amount: income.bonus },
    { source: 'commission', accountId: targets.commission, amount: income.commission },
    { source: 'otherIncome', accountId: targets.otherIncome, amount: income.otherIncome ?? 0 },
  ];

  const refs: IncomeDepositRef[] = [];
  for (const row of rows) {
    if (!row.accountId || row.amount <= 0) continue;
    refs.push({ source: row.source, accountId: row.accountId, amount: row.amount });
  }
  return refs;
};
