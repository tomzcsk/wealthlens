/**
 * WealthLens — "ข้อมูลว่างจริงไหม" (ใช้ในการ reconcile กับ Google Drive).
 *
 * "ว่าง" = ไม่มีเนื้อหาที่ผู้ใช้กรอกเลย = สถานะเริ่มต้นของ browser ที่เพิ่งโหลด. ใช้ตัด
 * สินใจ 2 อย่างที่ห้ามพลาด:
 *   1. ห้าม push local ที่ว่างทับ remote (timestamp local มาจาก nowIso() ตอน init
 *      ไม่ใช่การแก้จริง — ไม่งั้น session ใหม่ล้างข้อมูล Drive ก่อนผู้ใช้ล็อกอิน)
 *   2. ต้องนับข้อมูล "บัญชีธนาคาร" (F33) ด้วย — ผู้ใช้ที่มีแต่ยอด/รายการบัญชี (ยังไม่กรอก
 *      รายรับ/จ่าย) ต้องไม่ถูกนับว่าว่าง ไม่งั้น reconciliation เลือก remote มาทับ (บัญชี
 *      หาย) หรือข้ามการอัปโหลดครั้งแรก (บัญชีไม่ขึ้น Drive).
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้.
 */
import type { WealthLensData } from '@/types';

export const isDataEmpty = (data: WealthLensData): boolean => {
  if ((data.bankTransactions ?? []).length > 0) return false;
  for (const acct of data.bankAccounts ?? []) {
    for (const months of Object.values(acct.balances ?? {})) {
      if (Object.keys(months).length > 0) return false;
    }
  }
  for (const yr of Object.values(data.years)) {
    if (yr.income.length > 0) return false;
    if (yr.expenses.some((m) => m.items.length > 0)) return false;
    if ((yr.savings ?? []).some((m) => m.items.length > 0)) return false;
  }
  return true;
};
