/**
 * WealthLens — ค่าว่างที่ reference คงที่ สำหรับใช้เป็น fallback ใน selector.
 *
 * Zustand เทียบ snapshot ด้วย `Object.is`. ถ้า selector เขียนว่า
 * `useFinanceStore((s) => s.data.bankAccounts ?? [])` ตัว `?? []` จะสร้าง
 * array ใหม่ทุกครั้งที่ field เป็น undefined → React เห็นค่าเปลี่ยนทุก render
 * → re-render → สร้าง array ใหม่อีก → วนไม่รู้จบ (React error #185
 * "Maximum update depth exceeded").
 *
 * กับดักคือมันพังเฉพาะผู้ใช้ที่ field นั้นยังเป็น undefined — คนที่มีข้อมูล
 * ครบอยู่แล้วจะไม่มีวันเจอ ทำให้บั๊กหลุด production ได้ง่ายมาก.
 *
 * ใช้แบบนี้แทน:
 *   useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS)
 *
 * `scripts/verify-stable-selectors.ts` คอยกันไม่ให้รูปแบบ `?? []` กลับมาอีก.
 */
import type { BankAccount, BankTransaction, Loan } from '@/types';

export const EMPTY_BANK_ACCOUNTS: readonly BankAccount[] = Object.freeze([]);
export const EMPTY_BANK_TRANSACTIONS: readonly BankTransaction[] =
  Object.freeze([]);
export const EMPTY_LOANS: readonly Loan[] = Object.freeze([]);
