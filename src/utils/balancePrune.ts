/**
 * WealthLens — เก็บกวาดเซลล์ยอดที่เหลือ 0 แบบกำพร้า (F49).
 *
 * revert รายการที่หักบัญชีไว้ → ยอดเดือนนั้นกลับเป็น 0 แต่ **คีย์ยังค้างอยู่**
 * ({'2027': {'7': 0}}). F44/F45 ตัดสินให้ปล่อยไว้ เพราะตอนนั้นไม่มีใครอ่าน
 * "รายชื่อคีย์" มีแต่คนอ่านค่า (บวก 0 = ไม่มีผล)
 *
 * F48 อ่านรายชื่อคีย์: netWorthHistory.firstMonthOf() ใช้ Object.keys(balances)
 * หา "เดือนแรกที่บัญชีนี้มีตัวเลข" → คีย์ศูนย์กำพร้าทำให้บัญชีดูเหมือนเริ่มถูก
 * ติดตามก่อนความจริง → หมุด "เริ่มติดตามบัญชีใหม่" เลื่อนผิดเดือน
 *
 * ── กฎที่ผิด: "ยอดเป็น 0 → ลบคีย์" ──
 * เดือนที่ฝาก ฿1,000 แล้วถอน ฿1,000 ก็ได้ยอด 0 เหมือนกัน แต่มัน **มีรายการ**
 * ลบคีย์ทิ้ง = พัง invariant ของ F40 (ทุก (บัญชี,ปี,เดือน) ที่มีรายการ →
 * Σ tx.amount === balance)
 *
 * ── กฎที่ถูก: ลบเฉพาะเซลล์ที่ยอด 0 **และไม่มีรายการรองรับ** ──
 * ผูกการลบเข้ากับสมุดรายการ ซึ่งเป็นแหล่งความจริงของเซลล์นั้นอยู่แล้ว
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 */
import type { BankAccount, BankTransaction } from '@/types';

/** คีย์ของเซลล์ที่มีรายการรองรับ: `${accountId}|${year}|${month}` */
const cellsWithTransactions = (
  transactions: readonly BankTransaction[],
): Set<string> => {
  const cells = new Set<string>();
  for (const t of transactions) {
    cells.add(`${t.accountId}|${t.year}|${t.month}`);
  }
  return cells;
};

/**
 * ลบเซลล์ยอด 0 ที่ไม่มีรายการรองรับ (และปีที่ว่างเปล่าหลังลบ)
 *
 * คืน **array เดิม** เมื่อไม่มีอะไรต้องเก็บกวาด — ให้ผู้เรียกเทียบ identity
 * ได้ว่า state เปลี่ยนจริงไหม (Zustand จะได้ไม่ re-render ฟรี ๆ)
 */
export const pruneEmptyBalanceKeys = (
  accounts: readonly BankAccount[],
  transactions: readonly BankTransaction[],
): BankAccount[] => {
  const backed = cellsWithTransactions(transactions);
  let touched = false;

  const next = accounts.map((account) => {
    const years: BankAccount['balances'] = {};
    let accountTouched = false;

    for (const [year, months] of Object.entries(account.balances ?? {})) {
      const keptMonths: Record<string, number> = {};

      for (const [month, amount] of Object.entries(months)) {
        const orphanZero =
          amount === 0 && !backed.has(`${account.id}|${year}|${month}`);
        if (orphanZero) {
          accountTouched = true;
          continue;
        }
        keptMonths[month] = amount;
      }

      // ปีที่เหลือแต่เซลล์กำพร้า → ไม่ต้องเก็บเปลือกปีว่างไว้
      if (Object.keys(keptMonths).length > 0) years[year] = keptMonths;
      else if (Object.keys(months).length > 0) accountTouched = true;
    }

    if (!accountTouched) return account;
    touched = true;
    return { ...account, balances: years };
  });

  return touched ? next : (accounts as BankAccount[]);
};
