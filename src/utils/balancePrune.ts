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

/**
 * ทิ้งเซลล์ยอด/รายการที่ค่าไม่ finite (NaN / ±Infinity / null-จาก-JSON) ตอนโหลด
 * ข้อมูลเก่า. `applyBankMovement` (F40) กันไม่ให้เขียน NaN ใหม่แล้ว — ฟังก์ชันนี้
 * ล้างของเสียที่ค้างอยู่ก่อนหน้า เพื่อให้ยอดสะสมกลับมา finite (การ์ดเลิกโชว์ ฿NaN).
 *
 * ต่างจาก pruneEmptyBalanceKeys: อันนั้นลบ "0 กำพร้า" (ค่าถูกต้องแต่ไม่มีรายการ),
 * อันนี้ลบ "ค่าเสีย" (ไม่ใช่ตัวเลขที่ใช้ได้เลย). เซลล์ 0 ที่ถูกต้องยังอยู่.
 * คืน object เดิมเมื่อทุกอย่างสะอาดอยู่แล้ว (identity คงที่ → ไม่ re-render ฟรี).
 */
export const sanitizeBankLedger = (
  accounts: readonly BankAccount[],
  transactions: readonly BankTransaction[],
): { accounts: BankAccount[]; transactions: BankTransaction[] } => {
  const cleanTx = transactions.filter((t) => Number.isFinite(t.amount));
  const txTouched = cleanTx.length !== transactions.length;

  // ผลรวมของรายการ *ที่ค่าดี* ต่อเซลล์ — ใช้ซ่อมเซลล์ค่าเสียที่ยังมีรายการดีรองรับ
  // (เช่นเดือนที่ฝาก ฿2,000 จริง แล้วมีรายการ NaN ปนเข้ามา → เซลล์กลายเป็น NaN
  // แต่ ฿2,000 ยังของจริง: ทิ้งทั้งเซลล์ = ยอดหาย + เหลือรายการกำพร้า พัง invariant F40).
  const goodSums = new Map<string, number>();
  for (const t of cleanTx) {
    const key = `${t.accountId}|${t.year}|${t.month}`;
    goodSums.set(key, (goodSums.get(key) ?? 0) + t.amount);
  }

  let accountsTouched = false;
  const nextAccounts = accounts.map((account) => {
    const years: BankAccount['balances'] = {};
    let touched = false;
    for (const [year, months] of Object.entries(account.balances ?? {})) {
      const kept: Record<string, number> = {};
      for (const [month, amount] of Object.entries(months)) {
        if (Number.isFinite(amount)) {
          kept[month] = amount; // เซลล์ปกติ (รวม legacy ที่ไม่มีรายการ) — ไม่แตะ
          continue;
        }
        // เซลล์ค่าเสีย: มีรายการดีรองรับ → ซ่อมเป็นผลรวมของรายการดี (คง invariant
        // + ไม่ทิ้งยอดจริง); ไม่มีรายการดีเลย → ทิ้ง (คือของเสียล้วน)
        const sum = goodSums.get(`${account.id}|${year}|${month}`);
        if (sum !== undefined) kept[month] = sum;
        touched = true;
      }
      if (Object.keys(kept).length > 0) years[year] = kept;
      else if (Object.keys(months).length > 0) touched = true;
    }
    if (!touched) return account;
    accountsTouched = true;
    return { ...account, balances: years };
  });

  return {
    accounts: accountsTouched ? nextAccounts : (accounts as BankAccount[]),
    transactions: txTouched ? cleanTx : (transactions as BankTransaction[]),
  };
};
