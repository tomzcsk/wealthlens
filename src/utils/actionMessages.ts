/**
 * WealthLens — ข้อความ toast ของทุก action ที่เขียนข้อมูล (F43).
 *
 * pure ทั้งไฟล์: ไม่ import React ไม่ import store ไม่เรียก toast เอง
 * component เป็นคนเรียก `pushToast({ message: ..., tone: 'success' })`
 *
 * หลักการ: **พูดถึงผลข้างเคียงเฉพาะเมื่อมันเกิดขึ้นจริง**
 * รายจ่ายที่ไม่ผูกบัญชี ก็บอกแค่ "บันทึกรายจ่ายแล้ว" ไม่ต้องต่อท้ายอะไร
 * เพราะสิ่งที่ผู้ใช้ต้องรู้คือเงินที่ขยับในหน้าที่เขามองไม่เห็น
 */

import { formatTHBAuto, formatThaiMonth } from './formatters';

/** เพิ่มใหม่ หรือ แก้ของเดิม — คุมคำกริยาขึ้นต้นประโยค */
export type SaveMode = 'add' | 'edit';

const VERB: Record<SaveMode, string> = { add: 'บันทึก', edit: 'แก้ไข' };

/** ต่อท้ายประโยคหลักด้วย ' · ' เฉพาะเมื่อมีอะไรจะต่อจริง ๆ */
const withSideEffect = (main: string, sideEffect?: string): string =>
  sideEffect ? `${main} · ${sideEffect}` : main;

export interface ExpenseSavedInput {
  mode: SaveMode;
  amount: number;
  /** ชื่อบัญชีที่ถูกหัก — ไม่ส่งมาแปลว่ารายจ่ายนี้ไม่ผูกบัญชี */
  accountName?: string;
}

export const expenseSavedMessage = ({ mode, amount, accountName }: ExpenseSavedInput): string =>
  withSideEffect(
    `${VERB[mode]}รายจ่ายแล้ว`,
    accountName ? `หักจาก${accountName} ${formatTHBAuto(amount)}` : undefined,
  );

export interface ExpenseDeletedInput {
  name: string;
  /** ชื่อบัญชีที่ได้ยอดคืน — ไม่ส่งมาแปลว่ารายจ่ายนี้ไม่ผูกบัญชี */
  accountName?: string;
}

export const expenseDeletedMessage = ({ name, accountName }: ExpenseDeletedInput): string =>
  withSideEffect(`ลบ '${name}' แล้ว`, accountName ? `คืนยอด${accountName}` : undefined);

export interface IncomeSavedInput {
  mode: SaveMode;
  /** ชื่อบัญชีที่มีเงินเข้าจริง (ยอด > 0) — ว่างได้ */
  depositedAccounts: readonly string[];
}

export const incomeSavedMessage = ({ mode, depositedAccounts }: IncomeSavedInput): string =>
  withSideEffect(
    `${VERB[mode]}รายได้แล้ว`,
    depositedAccounts.length > 0 ? `เงินเข้า${depositedAccounts.join(', ')}` : undefined,
  );

export interface IncomeDeletedInput {
  /** 0-based ตามที่ทั้งแอปใช้ */
  month: number;
  /** ชื่อบัญชีที่ถูกคืนยอด — ว่างได้ */
  revertedAccounts: readonly string[];
}

export const incomeDeletedMessage = ({ month, revertedAccounts }: IncomeDeletedInput): string =>
  withSideEffect(
    // formatThaiMonth เป็น 1-based (1→ม.ค.) แต่ทั้งแอปใช้ month แบบ 0-based
    `ลบรายได้ ${formatThaiMonth(month + 1)} แล้ว`,
    revertedAccounts.length > 0 ? `คืนยอด${revertedAccounts.join(', ')}` : undefined,
  );

export const savingSavedMessage = ({ mode }: { mode: SaveMode }): string =>
  `${VERB[mode]}เงินออมแล้ว`;

export const savingDeletedMessage = ({ name }: { name: string }): string => `ลบ '${name}' แล้ว`;

/**
 * ลบรายการเดินบัญชีแล้วยอดเดือนนั้นขยับเท่ากับจำนวนของรายการ (กลับทิศ)
 * บอกเป็นขนาดของการขยับ ไม่ต้องบอกทิศ — ผู้ใช้เพิ่งเห็นแถวที่ตัวเองลบ
 */
export const bankTransactionDeletedMessage = ({ amount }: { amount: number }): string =>
  withSideEffect('ลบรายการแล้ว', `ยอดบัญชีปรับ ${formatTHBAuto(Math.abs(amount))}`);
