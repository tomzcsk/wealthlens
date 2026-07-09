/**
 * WealthLens — ประตูเดียวที่ยอดบัญชีและรายการเดินบัญชีถูกเขียน (F40).
 *
 * ก่อนหน้านี้มี 5 จุดในสโตร์ที่ปรับ `balances` ได้อย่างอิสระ ไม่มีใครจดว่า
 * เกิดอะไรขึ้น. ที่นี่รวมทั้งสองอย่างไว้ในฟังก์ชันเดียว — ปรับยอดโดยลืมจด
 * รายการจึงเป็นไปไม่ได้เชิงโครงสร้าง ไม่ใช่แค่ "อย่าลืมนะ" ใน code review.
 *
 * Invariant ที่ทั้งระบบยึด: ทุก (บัญชี, ปี, เดือน) ที่มีรายการอย่างน้อย 1
 * บรรทัด → Σ amount ของรายการ = ยอดของเดือนนั้น. เดือนที่ไม่มีรายการเลย
 * (ข้อมูลเก่าก่อน F40) ได้รับการยกเว้น.
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now. id ของ tx ส่งเข้ามาได้เพื่อให้
 * ทดสอบซ้ำได้ (deterministic).
 */
import { v4 as uuidv4 } from 'uuid';

import type { BankAccount, BankTransaction, BankTxSource } from '@/types';
import { applyBankDelta } from '@/utils/bankAccounts';

export interface BankLedger {
  accounts: BankAccount[];
  transactions: BankTransaction[];
}

export interface BankMovement {
  accountId: string;
  year: number;
  month: number;
  /** + เข้า, − ออก. 0 → ไม่เกิดอะไรเลย. */
  amount: number;
  label: string;
  source: BankTxSource;
  date?: string;
  /** ระบุ id เองได้เพื่อความ deterministic; ไม่ระบุ → uuid. */
  id?: string;
}

/** เขียนยอด + จดรายการ ในคราวเดียว. amount 0 = no-op. */
export const applyBankMovement = (
  ledger: BankLedger,
  movement: BankMovement,
): BankLedger => {
  if (movement.amount === 0) return ledger;
  const accounts = applyBankDelta(
    ledger.accounts,
    movement.accountId,
    movement.year,
    movement.month,
    movement.amount,
  );
  const tx: BankTransaction = {
    id: movement.id ?? uuidv4(),
    accountId: movement.accountId,
    year: movement.year,
    month: movement.month,
    amount: movement.amount,
    label: movement.label,
    source: movement.source,
    ...(movement.date ? { date: movement.date } : {}),
  };
  return { accounts, transactions: [...ledger.transactions, tx] };
};

/** ลบทุกบรรทัดที่ตรง `match` แล้วคืนยอดที่บรรทัดนั้นเคยลงไว้. */
export const revokeBankMovements = (
  ledger: BankLedger,
  match: (tx: BankTransaction) => boolean,
): BankLedger => {
  const doomed = ledger.transactions.filter(match);
  if (doomed.length === 0) return ledger;
  let accounts = ledger.accounts;
  for (const tx of doomed) {
    accounts = applyBankDelta(accounts, tx.accountId, tx.year, tx.month, -tx.amount);
  }
  return {
    accounts,
    transactions: ledger.transactions.filter((tx) => !match(tx)),
  };
};

/**
 * ลบบรรทัดเก่าของต้นทางเดียวกัน แล้วลงชุดใหม่ — นี่คือเหตุผลที่แก้เงินเดือน
 * แล้วบรรทัดเดิม "เปลี่ยน" แทนที่จะมีสองบรรทัด.
 */
export const reconcileBankMovements = (
  ledger: BankLedger,
  match: (tx: BankTransaction) => boolean,
  movements: readonly BankMovement[],
): BankLedger => {
  let next = revokeBankMovements(ledger, match);
  for (const movement of movements) {
    next = applyBankMovement(next, movement);
  }
  return next;
};

export interface LedgerMismatch {
  accountId: string;
  year: number;
  month: number;
  balance: number;
  txSum: number;
}

/**
 * ตรวจ invariant. เดือนที่ไม่มีรายการเลยถูกข้าม — ยอดที่กรอกไว้ก่อน F40
 * ไม่ถือว่าผิด.
 */
export const findLedgerMismatches = (ledger: BankLedger): LedgerMismatch[] => {
  const sums = new Map<string, number>();
  for (const tx of ledger.transactions) {
    const key = `${tx.accountId}|${tx.year}|${tx.month}`;
    sums.set(key, (sums.get(key) ?? 0) + tx.amount);
  }
  const out: LedgerMismatch[] = [];
  for (const [key, txSum] of sums) {
    const [accountId, yearRaw, monthRaw] = key.split('|');
    const account = ledger.accounts.find((a) => a.id === accountId);
    const balance = account?.balances[yearRaw]?.[monthRaw] ?? 0;
    // ปัดทศนิยมกันเศษ float (ยอดเงินไทยละเอียดสุด 2 ตำแหน่ง)
    if (Math.round(balance * 100) !== Math.round(txSum * 100)) {
      out.push({
        accountId,
        year: Number(yearRaw),
        month: Number(monthRaw),
        balance,
        txSum,
      });
    }
  }
  return out;
};
