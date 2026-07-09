/**
 * Verification for F40 — bank transaction journal.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
 */
import {
  applyBankMovement,
  findLedgerMismatches,
  reconcileBankMovements,
  revokeBankMovements,
  type BankLedger,
} from '../src/utils/bankMovements';
import type { BankAccount } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

const accounts: BankAccount[] = [
  { id: 'a', name: 'A', balances: {} },
  { id: 'b', name: 'B', balances: {} },
];
const empty: BankLedger = { accounts, transactions: [] };
const bal = (l: BankLedger, id: string, y = 2026, m = 7): number =>
  l.accounts.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;

// --- apply: ยอด + รายการ เขียนพร้อมกัน ---
const l1 = applyBankMovement(empty, {
  accountId: 'a', year: 2026, month: 7, amount: 1000,
  label: 'ฝากเงิน', source: { type: 'manual' },
});
eq('ยอดขึ้น', bal(l1, 'a'), 1000);
eq('มี 1 บรรทัด', l1.transactions.length, 1);
eq('บรรทัดถูกบัญชี', l1.transactions[0].accountId, 'a');
eq('invariant', findLedgerMismatches(l1).length, 0);

// --- amount 0 → ไม่สร้างบรรทัด ---
const l0 = applyBankMovement(empty, {
  accountId: 'a', year: 2026, month: 7, amount: 0,
  label: 'ว่าง', source: { type: 'manual' },
});
eq('amount 0 → ไม่มีบรรทัด', l0.transactions.length, 0);
eq('amount 0 → ยอดไม่ขยับ', bal(l0, 'a'), 0);

// --- revoke: ลบบรรทัด + คืนยอด ---
const l2 = revokeBankMovements(l1, (tx) => tx.source.type === 'manual');
eq('revoke ลบบรรทัด', l2.transactions.length, 0);
eq('revoke คืนยอด', bal(l2, 'a'), 0);
eq('invariant หลัง revoke', findLedgerMismatches(l2).length, 0);

// --- reconcile: แทนที่ของเดิม ไม่ใช่เพิ่มใหม่ (หัวใจของฟีเจอร์) ---
const salaryMatch = (tx: { source: { type: string } }): boolean =>
  tx.source.type === 'income';
const first = reconcileBankMovements(empty, salaryMatch, [
  { accountId: 'a', year: 2026, month: 7, amount: 60000, label: 'เงินเดือน (หลังหัก)',
    source: { type: 'income', year: 2026, month: 7, field: 'salary' } },
]);
const second = reconcileBankMovements(first, salaryMatch, [
  { accountId: 'a', year: 2026, month: 7, amount: 70000, label: 'เงินเดือน (หลังหัก)',
    source: { type: 'income', year: 2026, month: 7, field: 'salary' } },
]);
eq('reconcile → ยังมี 1 บรรทัด', second.transactions.length, 1);
eq('reconcile → ยอดใหม่ ไม่บวกทบ', bal(second, 'a'), 70000);
eq('reconcile → invariant', findLedgerMismatches(second).length, 0);

// --- reconcile ด้วย movements ว่าง = revoke ---
const cleared = reconcileBankMovements(second, salaryMatch, []);
eq('reconcile ว่าง → ลบบรรทัด', cleared.transactions.length, 0);
eq('reconcile ว่าง → คืนยอด', bal(cleared, 'a'), 0);

// --- findLedgerMismatches จับยอดที่ไม่ตรงได้จริง ---
const broken: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 999 } } }],
  transactions: [
    { id: 't1', accountId: 'a', year: 2026, month: 7, amount: 100,
      label: 'x', source: { type: 'manual' } },
  ],
};
eq('จับ mismatch ได้', findLedgerMismatches(broken).length, 1);

// --- เดือนที่ไม่มีรายการเลย ไม่ถูกตรวจ (เดือนเก่า) ---
const legacy: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2025': { '3': 17250 } } }],
  transactions: [],
};
eq('เดือนเก่าไม่มีรายการ → ไม่ถือว่าผิด', findLedgerMismatches(legacy).length, 0);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
