# F40 — รายการเดินบัญชี Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุกการขยับเงินในบัญชีถูกจดเป็นบรรทัด (วันไหน · อะไร · เข้า/ออก · เท่าไหร่) และบรรทัดตรงกับยอดเสมอ — แก้ต้นทางแล้วบรรทัดเปลี่ยนตาม ไม่ใช่เพิ่มบรรทัดใหม่

**Architecture:** ประตูเดียว — `applyBankMovement()` เขียน `balances` และ `bankTransactions` พร้อมกันในคราวเดียว ทำอย่างหนึ่งโดยลืมอีกอย่างไม่ได้ในเชิงโครงสร้าง. ทั้ง 5 จุดที่เคยเรียก `applyBankDelta` ตรงๆ ถูก rewire มาที่ประตูนี้. Invariant ที่ verify บังคับ: ทุก (บัญชี, ปี, เดือน) ที่มีรายการ → `Σ tx.amount === balance`

**Tech Stack:** TypeScript strict · React 19 · Zustand · Tailwind · verification ด้วย `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` (โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite)

**Spec:** `docs/superpowers/specs/2026-07-09-bank-transactions-design.md`

---

## Facts ที่ต้องรู้ก่อนเขียนโค้ด (อ่านไฟล์จริงยืนยันเสมอ)

- **ปุ่ม "ฝาก / ถอน" ไม่มี action ของตัวเอง** — `BankActionForm.tsx:114` เรียก `setBankBalance(id, y, m, curBalance + delta)` คือเซ็ตยอดสัมบูรณ์ ดังนั้น store แยกไม่ออกว่าเป็นการฝากหรือการปรับยอด **ต้องเพิ่ม `depositBank` / `withdrawBank` ก่อน** ไม่งั้นทุกการฝากจะถูกจดเป็น "ปรับยอดเอง"
- `applyBankDelta(accounts, accountId, year, month, delta)` อยู่ใน `src/utils/bankAccounts.ts:121` — ยังใช้ต่อ **ภายใน** `applyBankMovement` เท่านั้น หลังงานนี้ห้ามมีใครเรียกมันตรงๆ จาก store อีก
- ทองซื้อด้วย Kept (`financeStore.ts:~990`) เขียน `balances` ด้วยมือแบบ inline (ไม่ผ่าน `applyBankDelta` ด้วยซ้ำ) — ต้อง rewire
- `reconcileIncomeDeposits` (F39) และ `reconcileBankDeduction` (F34) คือ reconcile ยอดอย่างเดียว ต้องอัปเกรดให้จดรายการด้วย
- `depositSideEffects` (F39) / `sideEffects` (F34/F25) **คงไว้** — spec §7 อธิบายเหตุผล อย่าไปลบ

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/utils/bankMovements.ts` | ประตูเดียว: `applyBankMovement` / `revokeBankMovements` / `reconcileBankMovements` / `findLedgerMismatches` (pure) | **สร้างใหม่** |
| `scripts/verify-bank-transactions.ts` | assertions + invariant ทุกเคส | **สร้างใหม่** |
| `src/components/accounts/MonthTransactionList.tsx` | ตารางรายการย่อยใต้แถวเดือน | **สร้างใหม่** |
| `src/types/index.ts` | `BankTxSource`, `BankTransaction`, `WealthLensData.bankTransactions?` | แก้ |
| `src/stores/financeStore.ts` | `depositBank`/`withdrawBank` ใหม่ + rewire 5 จุด | แก้ |
| `src/components/accounts/BankActionForm.tsx` | ใช้ action ใหม่แทน `setBankBalance` | แก้ |
| `src/components/accounts/BankAccountDetail.tsx` | แถวเดือนกางได้ | แก้ |
| `src/utils/exportImport.ts` | preserve `bankTransactions` | แก้ |
| `features.json` | บันทึก F40 | แก้ |

**TDD:** เขียน assertion → รันให้ fail → implement → รันให้ pass → commit ทุก task

---

## Task 1: Types + `utils/bankMovements.ts`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/bankMovements.ts`
- Create: `scripts/verify-bank-transactions.ts`

- [ ] **Step 1: เขียน verify script ที่ยังไม่ผ่าน**

```ts
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
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts`
Expected: FAIL — `Cannot find module '../src/utils/bankMovements'`

- [ ] **Step 3: เพิ่ม types ใน `src/types/index.ts`**

ใต้ `interface BankAccount`:

```ts
/**
 * ที่มาของรายการเดินบัญชี — ใช้ทั้งแสดงผลและเป็น "คีย์" ตอน reconcile
 * (ลบ/แทนที่บรรทัดเดิมของต้นทางเดียวกัน). Discriminated union เพราะแต่ละ
 * ที่มามีคีย์ต่างกัน: รายได้ระบุด้วย (ปี, เดือน, ช่อง) รายจ่ายด้วย expenseId.
 */
export type BankTxSource =
  | { type: 'manual' }
  | { type: 'adjustment' }
  | { type: 'transfer'; counterpartAccountId: string }
  | {
      type: 'income';
      year: number;
      month: number;
      field: 'salary' | 'bonus' | 'commission' | 'otherIncome';
    }
  | { type: 'expense'; expenseId: string }
  | { type: 'gold'; holdingId: string };

export interface BankTransaction {
  id: string;
  accountId: string;
  /**
   * bucket เดียวกับ `BankAccount.balances` — ไม่ derive จาก `date` เพราะ
   * ยอดถูกจัดเข้าเดือนตามที่ผู้ใช้เลือก ไม่ใช่ตามวันที่จริงเสมอ. derive
   * เมื่อไหร่ invariant พังทันที.
   */
  year: number;
  month: number;
  /** ISO yyyy-mm-dd เมื่อรู้วันจริง (รายจ่ายมี, เงินเดือนไม่มี). */
  date?: string;
  /** + เข้าบัญชี, − ออกจากบัญชี. ไม่มีวันเป็น 0. */
  amount: number;
  label: string;
  source: BankTxSource;
}
```

ใน `interface WealthLensData` เพิ่ม:
```ts
  /**
   * สมุดรายการเดินบัญชี (F40). Optional — ข้อมูลก่อนฟีเจอร์นี้ไม่มี และเดือน
   * ที่ไม่มีรายการเลยจะแสดงยอดเฉยๆ โดยไม่ถือว่าผิด invariant.
   */
  bankTransactions?: BankTransaction[];
```

- [ ] **Step 4: implement `src/utils/bankMovements.ts`**

```ts
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
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npm run typecheck
```
Expected: `✅ ผ่านทั้งหมด` + exit 0

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/bankMovements.ts scripts/verify-bank-transactions.ts
git commit -m "feat(bank): ประตูเดียว applyBankMovement + invariant (F40)"
```

---

## Task 2: Store — manual actions (ฝาก/ถอน/โอน/ปรับยอด)

**Files:**
- Modify: `src/stores/financeStore.ts`
- Modify: `src/components/accounts/BankActionForm.tsx`
- Modify: `scripts/verify-bank-transactions.ts`

- [ ] **Step 1: เพิ่ม store assertions**

ทำตาม pattern การ drive store ใน `scripts/verify-installment-deduction.ts` แล้วเพิ่ม (imports บนสุดไฟล์):

```ts
import { useFinanceStore } from '../src/stores/financeStore';

const store = useFinanceStore;
const ledgerOf = (): BankLedger => ({
  accounts: store.getState().data.bankAccounts ?? [],
  transactions: store.getState().data.bankTransactions ?? [],
});
const balOf = (id: string, y: number, m: number): number =>
  store.getState().data.bankAccounts?.find((a) => a.id === id)
    ?.balances[String(y)]?.[String(m)] ?? 0;
const txCount = (): number => store.getState().data.bankTransactions?.length ?? 0;

store.setState((s) => ({
  data: {
    ...s.data,
    years: {},
    bankTransactions: [],
    bankAccounts: [
      { id: 'acc-1', name: 'หนึ่ง', type: 'salary', balances: {} },
      { id: 'acc-2', name: 'สอง', type: 'cash', balances: {} },
    ],
  },
}));

// --- ฝาก ---
store.getState().depositBank('acc-1', 2026, 7, 1000);
eq('ฝาก → ยอด', balOf('acc-1', 2026, 7), 1000);
eq('ฝาก → 1 บรรทัด', txCount(), 1);
eq('ฝาก → source manual', store.getState().data.bankTransactions?.[0].source.type, 'manual');
eq('ฝาก → invariant', findLedgerMismatches(ledgerOf()).length, 0);

// --- ถอน ---
store.getState().withdrawBank('acc-1', 2026, 7, 400);
eq('ถอน → ยอด', balOf('acc-1', 2026, 7), 600);
eq('ถอน → 2 บรรทัด', txCount(), 2);
eq('ถอน → amount ติดลบ', store.getState().data.bankTransactions?.[1].amount, -400);

// --- โอน: 2 บรรทัดคู่กัน ---
store.getState().transferBankBalance('acc-1', 'acc-2', 2026, 7, 100);
eq('โอน → ต้นทางลด', balOf('acc-1', 2026, 7), 500);
eq('โอน → ปลายทางเพิ่ม', balOf('acc-2', 2026, 7), 100);
eq('โอน → 4 บรรทัด', txCount(), 4);
eq('โอน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

// --- ปรับยอดเองในเดือนที่มีรายการ → บรรทัด adjustment = ส่วนต่าง ---
store.getState().setBankBalance('acc-1', 2026, 7, 900);
const adj = store.getState().data.bankTransactions?.filter((t) => t.source.type === 'adjustment') ?? [];
eq('ปรับยอด → 1 บรรทัด adjustment', adj.length, 1);
eq('ปรับยอด → ส่วนต่าง +400', adj[0].amount, 400);
eq('ปรับยอด → ยอดตรง', balOf('acc-1', 2026, 7), 900);
eq('ปรับยอด → invariant', findLedgerMismatches(ledgerOf()).length, 0);

// ปรับซ้ำ → แทนที่บรรทัดเดิม ไม่เพิ่มใหม่
store.getState().setBankBalance('acc-1', 2026, 7, 1000);
const adj2 = store.getState().data.bankTransactions?.filter((t) => t.source.type === 'adjustment') ?? [];
eq('ปรับซ้ำ → ยังมี 1 บรรทัด', adj2.length, 1);
eq('ปรับซ้ำ → ส่วนต่างใหม่', adj2[0].amount, 500);

// --- ปรับยอดในเดือนที่ไม่มีรายการเลย → ไม่สร้างบรรทัด (เดือนเก่า) ---
store.getState().setBankBalance('acc-2', 2025, 3, 17250);
const marchTx = store.getState().data.bankTransactions?.filter((t) => t.year === 2025) ?? [];
eq('เดือนเก่า → ไม่มีบรรทัด', marchTx.length, 0);
eq('เดือนเก่า → ยอดยังเขียนได้', balOf('acc-2', 2025, 3), 17250);
eq('เดือนเก่า → invariant ยังผ่าน', findLedgerMismatches(ledgerOf()).length, 0);

// --- clearBankBalance → รายการเดือนนั้นหายหมด ---
store.getState().clearBankBalance('acc-1', 2026, 7);
eq('clear → ไม่มีรายการเดือนนั้น',
  (store.getState().data.bankTransactions ?? []).filter((t) => t.accountId === 'acc-1' && t.year === 2026 && t.month === 7).length, 0);
eq('clear → ยอดหาย', balOf('acc-1', 2026, 7), 0);
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts`
Expected: FAIL — `depositBank is not a function`

- [ ] **Step 3: implement ใน `financeStore.ts`**

เพิ่ม helper ระดับไฟล์:

```ts
/**
 * อ่าน ledger ออกจาก state, ให้ mutator ทำงาน, แล้วเขียนกลับ — ทุก action ที่
 * ขยับเงินต้องผ่านทางนี้ จะได้ไม่มีใครลืมอัปเดต `bankTransactions`.
 */
const withLedger = (
  data: WealthLensData,
  mutate: (ledger: BankLedger) => BankLedger,
): Pick<WealthLensData, 'bankAccounts' | 'bankTransactions'> => {
  const next = mutate({
    accounts: data.bankAccounts ?? [],
    transactions: data.bankTransactions ?? [],
  });
  return { bankAccounts: next.accounts, bankTransactions: next.transactions };
};
```

actions ใหม่ (เพิ่มใน interface ด้วย):

```ts
      depositBank: (id, year, month, amount, label = 'ฝากเงิน') =>
        set((state) => {
          if (amount <= 0) return state;
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              ...withLedger(state.data, (l) =>
                applyBankMovement(l, {
                  accountId: id, year, month, amount,
                  label, source: { type: 'manual' },
                }),
              ),
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      withdrawBank: (id, year, month, amount, label = 'ถอนเงิน') =>
        set((state) => {
          if (amount <= 0) return state;
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              ...withLedger(state.data, (l) =>
                applyBankMovement(l, {
                  accountId: id, year, month, amount: -amount,
                  label, source: { type: 'manual' },
                }),
              ),
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),
```

`transferBankBalance` — แทนที่ body ให้ลง 2 บรรทัดผ่านประตูเดียว (ยังคง guard เดิม: `fromId === toId` → no-op, ต้องมีทั้งสองบัญชี):

```ts
          const fromName = accounts.find((a) => a.id === fromId)?.name ?? '';
          const toName = accounts.find((a) => a.id === toId)?.name ?? '';
          ...withLedger(state.data, (l) => {
            const afterOut = applyBankMovement(l, {
              accountId: fromId, year, month, amount: -amount,
              label: `โอนไป ${toName}`,
              source: { type: 'transfer', counterpartAccountId: toId },
            });
            return applyBankMovement(afterOut, {
              accountId: toId, year, month, amount,
              label: `โอนจาก ${fromName}`,
              source: { type: 'transfer', counterpartAccountId: fromId },
            });
          }),
```

`setBankBalance` — เดือนที่มีรายการ → ลง/แทนที่บรรทัด `adjustment` เท่าส่วนต่าง; เดือนที่ไม่มีรายการ → เขียนยอดตรงๆ เหมือนเดิม:

```ts
      setBankBalance: (id, year, month, amount) =>
        set((state) => {
          const accounts = state.data.bankAccounts ?? [];
          if (!accounts.some((a) => a.id === id)) return state;
          const txs = state.data.bankTransactions ?? [];
          const isSameCell = (t: BankTransaction): boolean =>
            t.accountId === id && t.year === year && t.month === month;
          const stamp = nowIso();

          const hasTx = txs.some(isSameCell);
          if (!hasTx) {
            // เดือนเก่า/เดือนว่าง — เขียนยอดตรงๆ ไม่สร้างประวัติย้อนหลังปลอมๆ
            return { data: { ...state.data, bankAccounts: setRawBalance(accounts, id, year, month, amount), lastUpdated: stamp }, lastUpdated: stamp };
          }
          // ส่วนต่างจากผลรวมของบรรทัด "อื่น" (ไม่นับ adjustment เดิม)
          const others = txs
            .filter((t) => isSameCell(t) && t.source.type !== 'adjustment')
            .reduce((acc, t) => acc + t.amount, 0);
          return {
            data: {
              ...state.data,
              ...withLedger(state.data, (l) =>
                reconcileBankMovements(
                  l,
                  (t) => isSameCell(t) && t.source.type === 'adjustment',
                  [{ accountId: id, year, month, amount: amount - others,
                     label: 'ปรับยอดเอง', source: { type: 'adjustment' } }],
                ),
              ),
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),
```

> `setRawBalance(accounts, id, year, month, amount)` = โค้ดเขียนยอดสัมบูรณ์ที่ `setBankBalance` เดิมใช้อยู่ — ยกออกมาเป็น helper ระดับไฟล์ อย่าคัดลอกซ้ำสองที่

`clearBankBalance` — revoke รายการของเซลล์นั้นก่อน แล้วลบยอด (ลำดับสำคัญ: revoke จะไปปรับยอด ถ้าลบยอดก่อนจะเหลือค่าติดลบ):

```ts
            ...withLedger(state.data, (l) =>
              revokeBankMovements(l, (t) => t.accountId === id && t.year === year && t.month === month),
            ),
```
แล้วค่อยลบ key เดือนนั้นออกจาก balances เหมือนเดิม

- [ ] **Step 4: `BankActionForm.tsx` ใช้ action ใหม่**

`BankActionForm.tsx:114` เดิม:
```ts
      setBankBalance(account.id, curYear, curMonth, curBalance + delta);
```
เปลี่ยนเป็น (อ่านไฟล์เพื่อดูว่า `delta` มาจาก mode ไหน):
```ts
      if (mode === 'deposit') depositBank(account.id, curYear, curMonth, amount);
      else withdrawBank(account.id, curYear, curMonth, amount);
```
เอา `setBankBalance` ออกจาก component นี้ (ยังใช้ใน `BankBalanceEditForm` ซึ่งคือ "ใส่ยอด/แก้ยอด" — ที่นั่นถูกแล้ว)

- [ ] **Step 5: รันให้ผ่าน + regression**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts
npm run typecheck && npm run lint && npm run build
```
Expected: exit 0 ทุกคำสั่ง

- [ ] **Step 6: Commit**

```bash
git add src/stores/financeStore.ts src/components/accounts/BankActionForm.tsx scripts/verify-bank-transactions.ts
git commit -m "feat(bank): depositBank/withdrawBank + โอน/ปรับยอด จดรายการ (F40)"
```

---

## Task 3: rewire รายได้ (F39) · รายจ่าย (F34/F35) · ทอง (F25)

**Files:**
- Modify: `src/stores/financeStore.ts`
- Modify: `scripts/verify-bank-transactions.ts`

- [ ] **Step 1: เพิ่ม assertions (หัวใจของฟีเจอร์อยู่ข้อ "แก้แล้วแทนที่")**

```ts
// --- รายได้: บรรทัดเดียว แก้แล้วแทนที่ ---
store.setState((s) => ({ data: { ...s.data, years: {}, bankTransactions: [],
  bankAccounts: [{ id: 'acc-1', name: 'หนึ่ง', type: 'salary', balances: {} }] } }));

const baseIncome = {
  month: 7, salary: 80000, bonus: 0, commission: 0,
  deductions: { tax: 20000, socialSecurity: 0, providentFund: 0, gsl: 0 },
  deposits: { salary: 'acc-1' },
};
store.getState().addIncome(2026, baseIncome);
const incomeTx = () => (store.getState().data.bankTransactions ?? []).filter((t) => t.source.type === 'income');
eq('รายได้ → 1 บรรทัด', incomeTx().length, 1);
eq('รายได้ → +60,000', incomeTx()[0].amount, 60000);
eq('รายได้ → invariant', findLedgerMismatches(ledgerOf()).length, 0);

store.getState().addIncome(2026, { ...baseIncome, salary: 90000 });
eq('แก้เงินเดือน → ยังมี 1 บรรทัด', incomeTx().length, 1);
eq('แก้เงินเดือน → +70,000 ไม่บวกทบ', incomeTx()[0].amount, 70000);
eq('แก้เงินเดือน → ยอด 70,000', balOf('acc-1', 2026, 7), 70000);
eq('แก้เงินเดือน → invariant', findLedgerMismatches(ledgerOf()).length, 0);

store.getState().addIncome(2026, { ...baseIncome, salary: 90000, deposits: {} });
eq('ถอดบัญชี → ไม่มีบรรทัด', incomeTx().length, 0);
eq('ถอดบัญชี → ยอดคืน 0', balOf('acc-1', 2026, 7), 0);

// --- รายจ่ายจ่ายผ่านบัญชี ---
store.setState((s) => ({ data: { ...s.data, years: {}, bankTransactions: [],
  bankAccounts: [{ id: 'acc-1', name: 'หนึ่ง', balances: {} }] } }));
store.getState().addExpense(2026, 7, {
  category: 'housing', name: 'ค่าบ้าน', amount: 30000, isRecurring: false,
  paymentAccountId: 'acc-1',
});
const expTx = () => (store.getState().data.bankTransactions ?? []).filter((t) => t.source.type === 'expense');
eq('รายจ่าย → 1 บรรทัด', expTx().length, 1);
eq('รายจ่าย → −30,000', expTx()[0].amount, -30000);
eq('รายจ่าย → label ชื่อรายการ', expTx()[0].label, 'ค่าบ้าน');
eq('รายจ่าย → invariant', findLedgerMismatches(ledgerOf()).length, 0);

const expenseId = store.getState().data.years['2026'].expenses.find((e) => e.month === 7)!.items[0].id;
store.getState().updateExpense(2026, 7, expenseId, { amount: 35000 });
eq('แก้ยอดรายจ่าย → ยังมี 1 บรรทัด', expTx().length, 1);
eq('แก้ยอดรายจ่าย → −35,000', expTx()[0].amount, -35000);
eq('แก้ยอดรายจ่าย → invariant', findLedgerMismatches(ledgerOf()).length, 0);

store.getState().deleteExpense(2026, 7, expenseId);
eq('ลบรายจ่าย → ไม่มีบรรทัด', expTx().length, 0);
eq('ลบรายจ่าย → ยอดคืน', balOf('acc-1', 2026, 7), 0);
```

> ทอง (F25): เขียน assertion เพิ่มโดยอ่าน signature จริงของ `addGoldHolding` / `deleteGoldHolding` ใน `src/stores/financeStore.ts` ก่อน — ใช้ `paymentMethod: 'kept'` และบัญชี id `KRUNGSRI_ACCOUNT_ID` (import จาก `@/utils/bankAccounts`). ยืนยัน: ซื้อ → 1 บรรทัด `source.type === 'gold'` ยอดติดลบ = `totalCost`; ลบ holding → บรรทัดหาย ยอดคืน; invariant ผ่านทุกขั้น

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts`
Expected: FAIL ที่ `รายได้ → 1 บรรทัด` (ได้ 0) — store ยังปรับยอดโดยไม่จดรายการ

- [ ] **Step 3: rewire `reconcileIncomeDeposits` (F39)**

เปลี่ยนให้ทำงานบน ledger แทน accounts อย่างเดียว:

```ts
const INCOME_FIELD_LABEL: Record<IncomeDepositRef['source'], string> = {
  salary: 'เงินเดือน (หลังหัก)',
  bonus: 'โบนัส',
  commission: 'คอมมิชชั่น',
  otherIncome: 'รายได้อื่นๆ',
};

/**
 * คืนบรรทัดเก่าของเดือนนั้น แล้วลงบรรทัดใหม่ — ยอดที่ revert คือยอดที่บรรทัด
 * เคยลงไว้จริง (เก็บใน tx.amount) ไม่ใช่คำนวณใหม่จากรายได้ปัจจุบัน.
 */
const reconcileIncomeLedger = (
  ledger: BankLedger,
  year: number,
  month: number,
  refs: readonly IncomeDepositRef[],
): BankLedger =>
  reconcileBankMovements(
    ledger,
    (tx) => tx.source.type === 'income' && tx.source.year === year && tx.source.month === month,
    refs.map((ref) => ({
      accountId: ref.accountId, year, month, amount: ref.amount,
      label: INCOME_FIELD_LABEL[ref.source],
      source: { type: 'income' as const, year, month, field: ref.source },
    })),
  );
```
เรียกใน `addIncome` / `updateIncome` แทน `reconcileIncomeDeposits` เดิม (ยังเก็บ `depositSideEffects` ไว้เหมือนเดิม — spec §7)

- [ ] **Step 4: rewire รายจ่าย (F34/F35)**

`addExpense` / `updateExpense` / `deleteExpense` — เดิมเรียก `reconcileBankDeduction(accounts, oldDed, newDed)` เปลี่ยนเป็น:

```ts
const reconcileExpenseLedger = (
  ledger: BankLedger,
  expenseId: string,
  deduction: ExpenseSideEffectRefs | undefined,
  label: string,
  date?: string,
): BankLedger =>
  reconcileBankMovements(
    ledger,
    (tx) => tx.source.type === 'expense' && tx.source.expenseId === expenseId,
    deduction
      ? [{
          accountId: deduction.accountId,
          year: deduction.deductYear,
          month: deduction.deductMonth,
          amount: -deduction.deductAmount,
          label,
          source: { type: 'expense' as const, expenseId },
          ...(date ? { date } : {}),
        }]
      : [],
  );
```
`deleteExpense` → เรียกด้วย `deduction: undefined` (revoke ล้วน)

- [ ] **Step 5: rewire ทอง (F25)**

บล็อก inline ที่ `financeStore.ts:~990` (Kept decrement) แทนด้วย:

```ts
            ...withLedger(state.data, (l) =>
              applyBankMovement(l, {
                accountId: KRUNGSRI_ACCOUNT_ID, year, month,
                amount: -input.totalCost,
                label: `ซื้อทอง ${input.weightBaht} บาททอง`,
                source: { type: 'gold', holdingId: holding.id },
                date: input.purchaseDate,
              }),
            ),
```
`deleteGoldHolding` (เมื่อ revert side-effect) → `revokeBankMovements(l, (tx) => tx.source.type === 'gold' && tx.source.holdingId === id)`

หลังงานนี้ **ห้ามมี `applyBankDelta` ถูกเรียกจาก `financeStore.ts` อีก** ตรวจด้วย:
```bash
grep -n "applyBankDelta" src/stores/financeStore.ts
```
Expected: ไม่มีผลลัพธ์ (นอกจากบรรทัด import ที่ต้องลบทิ้งด้วย)

- [ ] **Step 6: รันให้ผ่าน + regression ทั้งหมด**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
for f in scripts/verify-*.ts; do npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null || echo "FAILED $f"; done
npm run typecheck && npm run lint && npm run build
```
Expected: ไม่มี `FAILED`, exit 0 ทุกคำสั่ง — `verify-expense-payment` / `verify-installment-deduction` / `verify-income-deposit` / `verify-net-worth` ต้องผ่านหมด (ยอดบัญชีไหลไปถึงหน้าความมั่งคั่ง)

- [ ] **Step 7: Commit**

```bash
git add src/stores/financeStore.ts scripts/verify-bank-transactions.ts
git commit -m "feat(bank): รายได้/รายจ่าย/ทอง จดรายการผ่านประตูเดียว (F40)"
```

---

## Task 4: Export / Import

**Files:**
- Modify: `src/utils/exportImport.ts`
- Modify: `scripts/verify-bank-transactions.ts`

- [ ] **Step 1: เพิ่ม assertion round-trip**

อ่าน `validateBackup` ก่อน (F37 preserve `loanId`, F39 preserve `deposits` — ใช้เป็นต้นแบบ) แล้วเขียน: payload ที่มี `bankTransactions` 2 บรรทัด → หลัง `validateBackup` ต้องยังอยู่ครบทั้ง 2 พร้อม `source` ที่ถูกต้อง; payload เก่าที่ไม่มี field → import ได้ปกติ

- [ ] **Step 2: รันให้ fail แล้ว preserve**

`bankAccounts` ถูก preserve แบบ wholesale อยู่แล้ว (F39 พบว่าไม่ต้องเขียนโค้ด) — ตรวจว่า `bankTransactions` เป็นแบบเดียวกันไหม ถ้าไม่ ให้เพิ่ม:
```ts
  if (Array.isArray(raw.bankTransactions)) {
    data.bankTransactions = raw.bankTransactions as unknown as BankTransaction[];
  }
```
ถ้ารอดอยู่แล้ว ไม่ต้องเพิ่มโค้ด — เก็บ assertion ไว้กันพลาดในอนาคต และรายงานว่าไม่ต้องแก้

- [ ] **Step 3: รันให้ผ่าน + commit**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npm run typecheck
git add src/utils/exportImport.ts scripts/verify-bank-transactions.ts
git commit -m "feat(bank): preserve bankTransactions ตอน import (F40)"
```

---

## Task 5: UI — แถวเดือนกางดูรายการ

**Files:**
- Create: `src/components/accounts/MonthTransactionList.tsx`
- Modify: `src/components/accounts/BankAccountDetail.tsx`

- [ ] **Step 1: `MonthTransactionList.tsx`**

```tsx
/**
 * WealthLens — รายการเดินบัญชีของเดือนหนึ่ง (F40).
 *
 * รายการที่มาจากต้นทาง (รายได้/รายจ่าย/ทอง) แก้ที่นี่ไม่ได้ — ถ้าแก้สองทางได้
 * ต้นทางกับสมุดรายการจะไม่ตรงกันทันที. แสดงป้ายบอกที่มาแล้วให้ไปแก้ที่ต้นทาง.
 * ลบได้เฉพาะรายการที่ผู้ใช้สร้างเอง: manual / transfer / adjustment.
 */
import type { ReactNode } from 'react';

import type { BankTransaction } from '@/types';
import { formatTHB, formatThaiDate } from '@/utils/formatters';

const SOURCE_BADGE: Record<BankTransaction['source']['type'], string | null> = {
  manual: null,
  adjustment: '✏️ ปรับยอดเอง',
  transfer: '⇄ โอน',
  income: '💰 รายได้',
  expense: '🧾 รายจ่าย',
  gold: '🪙 ทอง',
};

interface MonthTransactionListProps {
  transactions: ReadonlyArray<BankTransaction>;
  /** ยอดของเดือนนั้น — ใช้แสดงแถวรวมและพิสูจน์ว่าตรงกับผลรวมรายการ. */
  monthTotal: number;
  onDelete: (txId: string) => void;
}
```

เนื้อใน: ถ้า `transactions.length === 0` → `<p className="text-xs text-slate-400">ยอดที่กรอกไว้ ไม่มีรายละเอียดรายการ</p>`
ไม่งั้น ตารางแถวละ: วันที่ (ถ้ามี) · label + badge ที่มา · จำนวน (เขียวถ้า +, แดงถ้า −) · ปุ่มลบ (เฉพาะ manual/transfer/adjustment)
ปิดท้ายด้วยแถว "รวม" = `monthTotal`

- [ ] **Step 2: `BankAccountDetail.tsx` — แถวเดือนกางได้**

- state: `const [openMonth, setOpenMonth] = useState<number | null>(null);`
- แถวเดือนกลายเป็นปุ่มกาง (`aria-expanded`) พร้อม badge `N รายการ` เมื่อมีรายการ
- ดึงรายการ: `useFinanceStore((s) => s.data.bankTransactions ?? [])` แล้ว filter `accountId + year + month` (memoize)
- ปุ่มลบเรียก action ใหม่ `deleteBankTransaction(txId)` — เพิ่มใน store:

```ts
      deleteBankTransaction: (txId) =>
        set((state) => {
          const tx = (state.data.bankTransactions ?? []).find((t) => t.id === txId);
          // ลบได้เฉพาะรายการที่ผู้ใช้สร้างเอง — ของที่มาจากต้นทางต้องไปลบที่ต้นทาง
          // ไม่งั้นต้นทางกับสมุดรายการจะไม่ตรงกัน.
          if (!tx || tx.source.type === 'income' || tx.source.type === 'expense' || tx.source.type === 'gold') {
            return state;
          }
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              ...withLedger(state.data, (l) => revokeBankMovements(l, (t) => t.id === txId)),
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),
```

> ขาโอนคู่กัน: ลบขาเดียวจะทำให้เงินหายจากระบบ — ให้ `deleteBankTransaction` ลบทั้งคู่เมื่อ `source.type === 'transfer'` โดย match ด้วย (ปี, เดือน, จำนวนตรงข้าม, counterpart) เขียน assertion กำกับใน verify script: ลบขาโอน → ทั้ง 2 บรรทัดหาย ยอดทั้งสองบัญชีคืน invariant ผ่าน

- [ ] **Step 3: ยืนยัน**

```bash
npm run typecheck && npm run lint && npm run build
for f in scripts/verify-*.ts; do npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null || echo "FAILED $f"; done
```
Expected: exit 0, ไม่มี `FAILED`

- [ ] **Step 4: Commit**

```bash
git add src/components/accounts/MonthTransactionList.tsx src/components/accounts/BankAccountDetail.tsx src/stores/financeStore.ts scripts/verify-bank-transactions.ts
git commit -m "feat(bank): กางแถวเดือนดูรายการเดินบัญชี (F40)"
```

---

## Task 6: ทดสอบในแอปจริง + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: ขับ UI จริง** (ใช้เดือนที่ไม่มีข้อมูลจริง เช่น ธ.ค. 2026 แล้วล้างทีหลัง)

```bash
npm run dev
```
1. `/accounts` → บัญชีเงินเดือน → กด ฝาก ฿1,000 → กางแถวเดือน → เห็น "ฝากเงิน +฿1,000"
2. หน้ารายเดือน → กรอกเงินเดือน 80,000 หัก 20,000 ลงบัญชีเงินเดือน → กลับมากางแถวเดือน → เห็น "เงินเดือน (หลังหัก) +฿60,000" พร้อมป้าย 💰 รายได้ และ **ลบไม่ได้**
3. กลับไปแก้เงินเดือนเป็น 90,000 → กางอีกครั้ง → บรรทัดเดิมเปลี่ยนเป็น +฿70,000 **ไม่ใช่มีสองบรรทัด**
4. โอนเงินไปอีกบัญชี → เห็น "โอนไป X" ที่ต้นทาง และ "โอนจาก Y" ที่ปลายทาง
5. ลบขาโอนหนึ่งขา → ทั้งคู่หาย ยอดคืนทั้งสองบัญชี
6. เดือนเก่า (เช่น ก.ค. 2026 ของกสิกร ฿17,250) → กางแล้วขึ้น "ยอดที่กรอกไว้ ไม่มีรายละเอียดรายการ"
7. แถวรวมของทุกเดือนที่มีรายการต้องเท่ากับยอดเดือนนั้นเป๊ะ

**ล้างข้อมูลทดลองทั้งหมดหลังเทส** (รายการ + ยอด + รายได้ที่กรอก)

- [ ] **Step 2: อัปเดต `features.json`**

เพิ่มใน `phases[4].features` ต่อจาก F39:

```json
        {
          "id": "F40",
          "name": "รายการเดินบัญชี (Bank Transaction Journal)",
          "description": "ทุกการขยับเงินจดเป็นบรรทัด (ที่มา · เข้า/ออก · จำนวน) ผ่านประตูเดียว applyBankMovement — แก้ต้นทางแล้วบรรทัดเปลี่ยนตาม ไม่เพิ่มบรรทัดใหม่",
          "status": "completed",
          "priority": "P1",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "WealthLensData.bankTransactions?: BankTransaction[] (optional, backward-compat)",
            "utils/bankMovements.ts: applyBankMovement/revokeBankMovements/reconcileBankMovements/findLedgerMismatches (pure)",
            "Invariant: ทุก (บัญชี,ปี,เดือน) ที่มีรายการ → Σ tx.amount === balance; เดือนที่ไม่มีรายการได้รับการยกเว้น",
            "financeStore ไม่เรียก applyBankDelta ตรงๆ อีกเลย — ทั้ง 5 จุดไหลผ่าน applyBankMovement",
            "depositBank/withdrawBank actions ใหม่ (เดิมปุ่มฝาก/ถอนเรียก setBankBalance จึงแยกจากปรับยอดไม่ได้)",
            "setBankBalance ในเดือนที่มีรายการ → บรรทัด 'ปรับยอดเอง' เท่าส่วนต่าง (แทนที่ของเดิม); เดือนที่ไม่มีรายการ → เขียนยอดตรงๆ",
            "แก้เงินเดือน/ยอดรายจ่าย → บรรทัดเดิมถูกแทนที่ ไม่เพิ่มบรรทัดใหม่",
            "รายการจากต้นทาง (income/expense/gold) ลบจากหน้าบัญชีไม่ได้; โอนลบแล้วหายทั้งคู่",
            "Verified: scripts/verify-bank-transactions.ts (invariant ทุกเคส) + verify เดิมทั้ง 14 ตัวไม่ regress + typecheck + lint + build + UI run จริง"
          ],
          "estimatedHours": 10,
          "dependencies": ["F25", "F33", "F34", "F35", "F39"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-07-09",
            "notes": "Spec: docs/superpowers/specs/2026-07-09-bank-transactions-design.md | Plan: docs/superpowers/plans/2026-07-09-bank-transactions.md | Files: utils/bankMovements.ts (ใหม่), components/accounts/MonthTransactionList.tsx (ใหม่), types/index.ts, stores/financeStore.ts (withLedger + rewire 5 จุด), components/accounts/{BankActionForm,BankAccountDetail}.tsx, utils/exportImport.ts | หมายเหตุ: depositSideEffects (F39) / sideEffects (F34/F25) คงไว้ — รื้อทีหลังได้ ไม่คุ้มเสี่ยงตอนนี้; migrate เดือนเก่าเป็น 'ยอดยกมา' = นอก scope"
          }
        }
```

และแก้ `progressSummary`: `totalFeatures` 47 → 48, `completed` 47 → 48

- [ ] **Step 3: Commit**

```bash
git add features.json
git commit -m "docs: F40 รายการเดินบัญชี — completed"
```

---

## Self-Review Notes

- **§3 spec (ประตูเดียว + invariant)** → Task 1 (util) + Task 3 Step 5 (grep ยืนยันไม่มี `applyBankDelta` เหลือใน store)
- **§5 spec (data model)** → Task 1 (types) + Task 4 (import preservation)
- **§6 spec (bankMovements.ts)** → Task 1 (ครบ 4 ฟังก์ชัน ชื่อตรงสเปก)
- **§7 spec (rewire 5 จุด)** → Task 2 (manual/transfer/adjustment/clear) + Task 3 (income/expense/gold)
- **§8 spec (UI)** → Task 5 (MonthTransactionList + แถวกางได้ + ลบเฉพาะ manual/transfer/adjustment)
- **§9 spec (verification 14 ข้อ)** → assertions กระจายใน Task 1/2/3/4 + Task 5 (ลบขาโอน) + regression sweep + UI run ใน Task 6
- ชื่อ/ชนิดตรงกันทุก task: `applyBankMovement`, `revokeBankMovements`, `reconcileBankMovements`, `findLedgerMismatches`, `BankLedger`, `BankMovement`, `withLedger`, `BankTxSource`, `bankTransactions`, `depositBank`, `withdrawBank`, `deleteBankTransaction`
- ลำดับบังคับ: 1 → 2 → 3 (store พึ่ง util; Task 3 พึ่ง `withLedger` ที่สร้างใน Task 2) → 4 → 5 → 6
