/**
 * WealthLens — แปลงยอดที่กรอกไว้ก่อนมีสมุดรายการ ให้กลายเป็นบรรทัดจริง (F41).
 *
 * **ห้ามใช้ applyBankMovement กับงานนี้** ฟังก์ชันนั้นเขียนทั้งยอดและรายการ
 * ส่วน backfill ต้องเขียนแค่รายการ เพราะยอดมีอยู่แล้ว — ถ้าเผลอใช้ ยอดจะเบิ้ล.
 *
 * สูตรเดียวที่ทำให้ทั้งฟีเจอร์ปลอดภัย:
 *     ส่วนต่าง = ยอดของเดือน − Σ รายการที่มีอยู่ในเดือนนั้น
 * ผลพลอยได้ที่ได้มาฟรี:
 *   • idempotent — รันซ้ำได้ ส่วนต่างเป็น 0 ก็ไม่สร้างอะไร
 *   • เดือนผสม (ยอดเก่า + รายการใหม่) ได้บรรทัดเท่าส่วนที่ขาด ไม่นับซ้ำ
 *   • ยอดเงินไม่มีวันเปลี่ยน เพราะเราไม่แตะมันเลย
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now, id ส่งเข้ามาเพื่อความ deterministic.
 */
import type { BankTransaction } from '@/types';
import type { BankLedger } from '@/utils/bankMovements';

/** ป้ายบนบรรทัดที่ backfill สร้าง — ผู้ใช้ต้องรู้ว่ามันไม่ใช่ธุรกรรมจริง. */
export const BACKFILL_LABEL = 'ยอดที่กรอกไว้เดิม';

export interface BackfillLine {
  accountId: string;
  year: number;
  month: number;
  /** ส่วนต่าง — ไม่มีวันเป็น 0 (เซลล์ที่ส่วนต่าง 0 ถูกข้าม). */
  amount: number;
}

export interface BackfillPlan {
  lines: BackfillLine[];
  /** จำนวนเซลล์ (บัญชี×เดือน) ที่จะได้บรรทัดใหม่. */
  cellCount: number;
  /** จำนวนบัญชีที่ได้รับผลกระทบ. */
  accountCount: number;
}

/** ปัดสองตำแหน่งก่อนเทียบ — ยอดเงินไทยละเอียดสุดแค่สตางค์ ไม่ใช่เศษ float. */
const cents = (n: number): number => Math.round(n * 100);

/** วางแผนอย่างเดียว ไม่เขียนอะไร — UI เอาไป preview ก่อนผู้ใช้กดยืนยัน. */
export const planBackfill = (ledger: BankLedger): BackfillPlan => {
  const txSums = new Map<string, number>();
  for (const tx of ledger.transactions) {
    const key = `${tx.accountId}|${tx.year}|${tx.month}`;
    txSums.set(key, (txSums.get(key) ?? 0) + tx.amount);
  }

  const lines: BackfillLine[] = [];
  const accounts = new Set<string>();
  for (const account of ledger.accounts) {
    for (const [yearKey, months] of Object.entries(account.balances)) {
      for (const [monthKey, balance] of Object.entries(months)) {
        const key = `${account.id}|${yearKey}|${monthKey}`;
        const diff = balance - (txSums.get(key) ?? 0);
        if (cents(diff) === 0) continue;
        lines.push({
          accountId: account.id,
          year: Number(yearKey),
          month: Number(monthKey),
          amount: diff,
        });
        accounts.add(account.id);
      }
    }
  }
  return { lines, cellCount: lines.length, accountCount: accounts.size };
};

/** สร้าง BankTransaction จากแผน (ต้องส่ง id เข้ามาเพื่อความ deterministic ตอนเทส). */
export const buildBackfillTransactions = (
  plan: BackfillPlan,
  makeId: (line: BackfillLine, index: number) => string,
): BankTransaction[] =>
  plan.lines.map((line, index) => ({
    id: makeId(line, index),
    accountId: line.accountId,
    year: line.year,
    month: line.month,
    amount: line.amount,
    label: BACKFILL_LABEL,
    source: { type: 'backfill' },
  }));
