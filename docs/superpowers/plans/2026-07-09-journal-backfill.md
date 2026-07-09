# F41 — แปลงยอดเก่าเป็นรายการเดินบัญชี Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปุ่มเดียวที่แปลงยอดบัญชีเก่าให้กลายเป็นบรรทัด "ยอดที่กรอกไว้เดิม" ในสมุดรายการ โดยยอดเงินไม่ขยับแม้แต่บาทเดียว — และย้อนกลับได้

**Architecture:** ต่างจากทุกอย่างใน F40 ตรงที่ **ไม่ผ่าน `applyBankMovement`** เพราะฟังก์ชันนั้นเขียนทั้งยอดและรายการ ส่วน backfill ต้องเขียนแค่รายการ (ยอดมีอยู่แล้ว) สูตรคือ `ส่วนต่าง = ยอดเดือน − Σ รายการที่มีอยู่` ทำให้ idempotent และรองรับเดือนผสมโดยอัตโนมัติ

**Tech Stack:** TypeScript strict · React 19 · Zustand · Tailwind · verification ด้วย `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts` (โปรเจกต์นี้ไม่มี test runner — verify script คือ test suite)

**Spec:** `docs/superpowers/specs/2026-07-09-journal-backfill-design.md`

---

## Facts ที่ต้องรู้ก่อนเขียนโค้ด (อ่านไฟล์จริงยืนยันเสมอ)

- `applyBankMovement` / `revokeBankMovements` (`src/utils/bankMovements.ts`) **เขียน balances ด้วย** → **ห้ามใช้กับ backfill** ไม่งั้นยอดจะเบิ้ล ใส่คอมเมนต์เตือนไว้ในโค้ด
- `withLedger(data, mutate)` ใน `financeStore.ts` คืน `{bankAccounts, bankTransactions}` — backfill ใช้ได้ แต่ mutate ต้องคืน `accounts` ชุดเดิม (ref เดิม) ไม่แตะ
- `deleteBankTransaction` (`financeStore.ts:2059`) ปฏิเสธ `income`/`expense`/`gold` อยู่แล้ว — ต้องเพิ่ม `backfill`
- `MonthTransactionList.tsx:60` คำนวณ `opening = monthTotal − txSum` เอง — หลัง backfill ค่านี้จะเป็น 0 เอง บรรทัดจะหายไปโดยไม่ต้องแก้โค้ด
- `SettingsPage.tsx` วาง section เรียงกัน (`IncomeDefaultsSection`, `BackupSection`, …) — วาง section ใหม่ตามแบบเดียวกัน **ไม่ใช่ใน DangerZone** เพราะยอดไม่เปลี่ยน จึงไม่อันตราย
- verify script ที่ drive store ใช้ localStorage shim + dynamic `await import()` — ดู `scripts/verify-bank-transactions.ts`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/utils/journalBackfill.ts` | `planBackfill` / `buildBackfillTransactions` (pure, ไม่แตะยอด) | **สร้างใหม่** |
| `scripts/verify-journal-backfill.ts` | assertions + กฎเหล็ก "ยอดก่อน = ยอดหลัง" | **สร้างใหม่** |
| `src/components/settings/JournalBackfillSection.tsx` | preview + ปุ่มแปลง/ย้อนกลับ | **สร้างใหม่** |
| `src/types/index.ts` | `BankTxSource` เพิ่ม `{ type: 'backfill' }` | แก้ |
| `src/stores/financeStore.ts` | `applyJournalBackfill` / `undoJournalBackfill` + guard ใน `deleteBankTransaction` | แก้ |
| `src/pages/SettingsPage.tsx` | mount section ใหม่ | แก้ |
| `features.json` | บันทึก F41 | แก้ |

**TDD:** เขียน assertion → รันให้ fail → implement → รันให้ pass → commit ทุก task

---

## Task 1: Types + `utils/journalBackfill.ts`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/journalBackfill.ts`
- Create: `scripts/verify-journal-backfill.ts`

- [ ] **Step 1: เขียน verify script ที่ยังไม่ผ่าน**

```ts
/**
 * Verification for F41 — journal backfill.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
 *
 * กฎเหล็ก: ยอดทุกบัญชี "ก่อน" ต้องเท่ากับ "หลัง" ทุกเคส — เครื่องมือนี้เขียน
 * คำอธิบายให้ยอดที่มีอยู่ ไม่ใช่เพิ่มเงิน.
 */
import { findLedgerMismatches, type BankLedger } from '../src/utils/bankMovements';
import {
  buildBackfillTransactions,
  planBackfill,
} from '../src/utils/journalBackfill';
import type { BankAccount, BankTransaction } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

/** snapshot ยอดทุกบัญชีแบบ deep เพื่อพิสูจน์ว่าไม่ถูกแตะ. */
const balancesSnapshot = (accounts: readonly BankAccount[]): string =>
  JSON.stringify(accounts.map((a) => [a.id, a.balances]));

const tx = (
  id: string,
  accountId: string,
  year: number,
  month: number,
  amount: number,
  source: BankTransaction['source'],
): BankTransaction => ({ id, accountId, year, month, amount, label: 'x', source });

// --- เดือนที่มียอด ไม่มีรายการ → 1 บรรทัดเท่ายอด ---
const l1: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2025': { '3': 17250 } } }],
  transactions: [],
};
const before1 = balancesSnapshot(l1.accounts);
const p1 = planBackfill(l1);
eq('1 บรรทัด', p1.lines.length, 1);
eq('amount = ยอดเดือน', p1.lines[0].amount, 17250);
eq('cellCount', p1.cellCount, 1);
eq('accountCount', p1.accountCount, 1);
eq('planBackfill ไม่แตะยอด', balancesSnapshot(l1.accounts), before1);

// --- เดือนผสม: ยอด 5,000 + บรรทัดทอง −100,000 → backfill +105,000 ---
const l2: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 5000 } } }],
  transactions: [tx('t1', 'a', 2026, 7, -100000, { type: 'gold', holdingId: 'g1' })],
};
const p2 = planBackfill(l2);
eq('เดือนผสม → ส่วนต่าง', p2.lines[0].amount, 105000);

// --- invariant หลังเติมบรรทัด ---
const filled: BankLedger = {
  accounts: l2.accounts,
  transactions: [
    ...l2.transactions,
    ...buildBackfillTransactions(p2, (_l, i) => `bf-${i}`),
  ],
};
eq('เติมแล้ว invariant ผ่าน', findLedgerMismatches(filled).length, 0);

// --- เดือนที่รายการครบแล้ว → ไม่สร้าง ---
const l3: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 1000 } } }],
  transactions: [tx('t1', 'a', 2026, 7, 1000, { type: 'manual' })],
};
eq('ส่วนต่าง 0 → ไม่สร้าง', planBackfill(l3).lines.length, 0);

// --- ยอด 0 → ไม่สร้าง ---
const l4: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '7': 0 } } }],
  transactions: [],
};
eq('ยอด 0 → ไม่สร้าง', planBackfill(l4).lines.length, 0);

// --- ยอดติดลบ → บรรทัดติดลบ ---
const l5: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '2': -3000 } } }],
  transactions: [],
};
eq('ยอดติดลบ', planBackfill(l5).lines[0].amount, -3000);

// --- เศษทศนิยม: ยอด 711366.21 กับรายการ 711366.21 → ไม่เกิดบรรทัดจากเศษ float ---
const l6: BankLedger = {
  accounts: [{ id: 'a', name: 'A', balances: { '2026': { '1': 711366.21 } } }],
  transactions: [tx('t1', 'a', 2026, 1, 711366.21, { type: 'manual' })],
};
eq('เศษ float ไม่สร้างบรรทัด', planBackfill(l6).lines.length, 0);

// --- หลายบัญชี หลายเดือน ---
const l7: BankLedger = {
  accounts: [
    { id: 'a', name: 'A', balances: { '2025': { '1': 100, '2': 200 } } },
    { id: 'b', name: 'B', balances: { '2025': { '1': 300 } } },
  ],
  transactions: [],
};
const p7 = planBackfill(l7);
eq('3 เซลล์', p7.cellCount, 3);
eq('2 บัญชี', p7.accountCount, 2);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts`
Expected: FAIL — `Cannot find module '../src/utils/journalBackfill'`

- [ ] **Step 3: เพิ่ม `backfill` ใน `BankTxSource` (`src/types/index.ts`)**

ต่อท้าย union:

```ts
  /**
   * บรรทัดที่สร้างจากยอดที่กรอกไว้ก่อนมีสมุดรายการ (F41). ตอนสร้าง **ไม่แตะ
   * balances** — มันคือคำอธิบายของยอดที่มีอยู่แล้ว ไม่ใช่เงินก้อนใหม่.
   * ลบเดี่ยวไม่ได้ (Σรายการ จะไม่เท่ายอด); ย้อนทั้งชุดผ่าน undoJournalBackfill.
   */
  | { type: 'backfill' };
```

- [ ] **Step 4: implement `src/utils/journalBackfill.ts`**

```ts
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
  cellCount: number;
  accountCount: number;
}

/** ปัดสองตำแหน่งก่อนเทียบ — ยอดเงินไทยละเอียดสุดแค่สตางค์ ไม่ใช่เศษ float. */
const cents = (n: number): number => Math.round(n * 100);

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
```

- [ ] **Step 5: รันให้ผ่าน**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
npm run typecheck
```
Expected: `✅ ผ่านทั้งหมด` + exit 0

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/journalBackfill.ts scripts/verify-journal-backfill.ts
git commit -m "feat(bank): planBackfill — แปลงยอดเก่าเป็นรายการ โดยไม่แตะยอด (F41)"
```

---

## Task 2: Store — apply / undo

**Files:**
- Modify: `src/stores/financeStore.ts`
- Modify: `scripts/verify-journal-backfill.ts`

- [ ] **Step 1: เพิ่ม store assertions**

ใช้ harness เดียวกับ `scripts/verify-bank-transactions.ts` (localStorage shim + dynamic import) แล้วเพิ่ม:

```ts
const store = useFinanceStore;
const snap = (): string =>
  JSON.stringify((store.getState().data.bankAccounts ?? []).map((a) => [a.id, a.balances]));
const txs = (): BankTransaction[] => store.getState().data.bankTransactions ?? [];
const backfills = (): BankTransaction[] => txs().filter((t) => t.source.type === 'backfill');

store.setState((s) => ({
  data: {
    ...s.data,
    years: {},
    bankTransactions: [
      // เดือนผสม: กรุงศรีมียอด 5,000 และบรรทัดทอง −100,000
      { id: 'g1', accountId: 'acc-1', year: 2026, month: 7, amount: -100000,
        label: 'ซื้อทอง', source: { type: 'gold', holdingId: 'h1' } },
    ],
    bankAccounts: [
      { id: 'acc-1', name: 'หนึ่ง', balances: { '2025': { '3': 17250 }, '2026': { '7': 5000 } } },
      { id: 'acc-2', name: 'สอง', balances: { '2026': { '1': -3000 } } },
    ],
  },
}));

const before = snap();

// --- apply ---
store.getState().applyJournalBackfill();
eq('สร้าง 3 บรรทัด', backfills().length, 3);
eq('ยอดไม่ขยับเลย', snap(), before);
eq('invariant ทั้งระบบ', findLedgerMismatches({
  accounts: store.getState().data.bankAccounts ?? [],
  transactions: txs(),
}).length, 0);
const mixed = backfills().find((t) => t.year === 2026 && t.month === 7);
eq('เดือนผสม → +105,000', mixed?.amount, 105000);

// --- idempotent ---
store.getState().applyJournalBackfill();
eq('รันซ้ำ → จำนวนบรรทัดเท่าเดิม', backfills().length, 3);
eq('รันซ้ำ → ยอดเท่าเดิม', snap(), before);

// --- deleteBankTransaction ปฏิเสธ backfill ---
const bfId = backfills()[0].id;
store.getState().deleteBankTransaction(bfId);
eq('ลบ backfill ไม่ได้', backfills().length, 3);

// --- undo ---
store.getState().undoJournalBackfill();
eq('undo → ไม่เหลือ backfill', backfills().length, 0);
eq('undo → บรรทัดทองยังอยู่', txs().length, 1);
eq('undo → ยอดเท่าเดิม', snap(), before);

// --- round-trip ---
store.getState().applyJournalBackfill();
store.getState().undoJournalBackfill();
store.getState().applyJournalBackfill();
eq('round-trip → 3 บรรทัด', backfills().length, 3);
eq('round-trip → ยอดเท่าเดิม', snap(), before);
```

- [ ] **Step 2: รันให้ fail**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts`
Expected: FAIL — `applyJournalBackfill is not a function`

- [ ] **Step 3: implement ใน `financeStore.ts`**

interface:
```ts
  /**
   * แปลงยอดที่กรอกไว้ก่อนมีสมุดรายการ ให้กลายเป็นบรรทัด `backfill`.
   * **ไม่แตะ balances** — ดู utils/journalBackfill. no-op เมื่อไม่มีส่วนต่าง.
   */
  applyJournalBackfill: () => void;
  /** ลบบรรทัด `backfill` ทั้งหมด. ไม่แตะ balances เช่นกัน. */
  undoJournalBackfill: () => void;
```

implementation:
```ts
      applyJournalBackfill: () =>
        set((state) => {
          const accounts = state.data.bankAccounts ?? [];
          const transactions = state.data.bankTransactions ?? [];
          const plan = planBackfill({ accounts, transactions });
          if (plan.lines.length === 0) return state;
          // สังเกตว่าเราคืน `bankAccounts` ชุดเดิม (ref เดิม) — ยอดต้องไม่ขยับ.
          const created = buildBackfillTransactions(plan, () => uuidv4());
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              bankTransactions: [...transactions, ...created],
              lastUpdated: stamp,
            },
            lastUpdated: stamp,
          };
        }),

      undoJournalBackfill: () =>
        set((state) => {
          const transactions = state.data.bankTransactions ?? [];
          const kept = transactions.filter((t) => t.source.type !== 'backfill');
          if (kept.length === transactions.length) return state;
          const stamp = nowIso();
          return {
            data: { ...state.data, bankTransactions: kept, lastUpdated: stamp },
            lastUpdated: stamp,
          };
        }),
```

import เพิ่ม:
```ts
import { buildBackfillTransactions, planBackfill } from '@/utils/journalBackfill';
```

`deleteBankTransaction` — เพิ่ม `'backfill'` เข้าไปในรายการที่ปฏิเสธ (อ่านโค้ดจริงที่บรรทัด ~2059 แล้วเติม):
```ts
          // backfill ลบเดี่ยวไม่ได้ — ยอดจะไม่ตรงกับผลรวมรายการทันที
          // (ใช้ undoJournalBackfill ล้างทั้งชุดแทน)
```

- [ ] **Step 4: รันให้ผ่าน + regression**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-net-worth.ts
npm run typecheck && npm run lint
```
Expected: exit 0 ทุกคำสั่ง

- [ ] **Step 5: Commit**

```bash
git add src/stores/financeStore.ts scripts/verify-journal-backfill.ts
git commit -m "feat(bank): applyJournalBackfill / undoJournalBackfill (F41)"
```

---

## Task 3: Export/Import + UI

**Files:**
- Modify: `scripts/verify-journal-backfill.ts`
- Create: `src/components/settings/JournalBackfillSection.tsx`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: assertion round-trip**

`bankTransactions` ถูก preserve แล้วตอน F40 (ดู `validateBackup` ใน `src/utils/exportImport.ts`) — เขียน assertion ยืนยันว่า `source: {type:'backfill'}` รอด round-trip ถ้ารอดอยู่แล้วไม่ต้องเพิ่มโค้ด ให้รายงานว่าไม่ต้องแก้

- [ ] **Step 2: `JournalBackfillSection.tsx`**

```tsx
/**
 * WealthLens — แปลงยอดเก่าเป็นรายการเดินบัญชี (F41).
 *
 * อยู่ในหน้า Settings ไม่ใช่ DangerZone: ยอดเงินไม่เปลี่ยนแม้แต่บาทเดียว
 * เครื่องมือนี้เขียนคำอธิบายให้ยอดที่มีอยู่ ไม่ได้เพิ่มเงิน — และย้อนกลับได้.
 */
import { useMemo, useState, type ReactNode } from 'react';

import { useFinanceStore } from '@/stores/financeStore';
import { EMPTY_BANK_ACCOUNTS, EMPTY_BANK_TRANSACTIONS } from '@/stores/emptyRefs';
import { useToastStore } from '@/stores/toastStore';
import { planBackfill } from '@/utils/journalBackfill';
```

- อ่าน accounts/transactions ผ่าน selector ที่ fallback เป็นค่าคงที่ (ห้าม `?? []` — `scripts/verify-stable-selectors.ts` จะ fail)
- `const plan = useMemo(() => planBackfill({ accounts, transactions }), [accounts, transactions])`
- `const existing = transactions.filter((t) => t.source.type === 'backfill').length`
- 3 สถานะ:
  - `existing > 0` → "แปลงแล้ว {existing} บรรทัด" + ปุ่ม "ย้อนกลับ" (inline confirm 2 จังหวะ ไม่ใช่ `window.confirm` — มันค้าง automation และเป็น pattern ที่ repo เลิกใช้แล้ว ดู `RecurringFillModal`)
  - `plan.cellCount === 0` → "ทุกเดือนมีรายการครบแล้ว ไม่ต้องแปลง" ปุ่ม disabled
  - อื่นๆ → "จะสร้าง {plan.cellCount} บรรทัด ใน {plan.accountCount} บัญชี · **ยอดเงินทุกบัญชีไม่เปลี่ยน**" + ปุ่ม "แปลงยอดเก่าเป็นรายการ"
- กดแล้ว → เรียก action + `pushToast`
- โครง card ให้เหมือน `src/components/settings/BackupSection.tsx` (อ่านก่อน คัดลอกโครง ไม่ใช่คิดใหม่)

- [ ] **Step 3: mount ใน `SettingsPage.tsx`**

วางต่อจาก `<DailyBackupSection />`:
```tsx
      <JournalBackfillSection />
```

- [ ] **Step 4: ยืนยัน**

```bash
npm run typecheck && npm run lint && npm run build
for f in scripts/verify-*.ts; do npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null || echo "FAILED $f"; done
```
Expected: exit 0, ไม่มี `FAILED` (รวม `verify-stable-selectors.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/JournalBackfillSection.tsx src/pages/SettingsPage.tsx scripts/verify-journal-backfill.ts
git commit -m "feat(bank): ปุ่มแปลงยอดเก่า + ย้อนกลับ ในหน้า Settings (F41)"
```

---

## Task 4: ทดสอบในแอปจริง + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: ขับ UI จริง**

```bash
npm run dev
```
1. บันทึกยอดรวมทุกบัญชีไว้ก่อน (อ่านจาก hero บนหน้า `/accounts`)
2. `/settings` → เห็น "จะสร้าง N บรรทัด ใน M บัญชี · ยอดเงินทุกบัญชีไม่เปลี่ยน"
3. กดแปลง → toast
4. `/accounts` → **ยอดรวมต้องเท่าเดิมเป๊ะ** → กางเดือนเก่า → เห็นบรรทัด "ยอดที่กรอกไว้เดิม" และแถวรวมตรงยอด → บรรทัดนี้ **ไม่มีปุ่มลบ**
5. เดือนที่มีรายการอยู่แล้ว → ไม่มีบรรทัด backfill เกินมา
6. `/settings` → กดย้อนกลับ → `/accounts` ยอดรวมยังเท่าเดิม บรรทัด backfill หายหมด

**ล้างสถานะให้กลับเป็นก่อนทดสอบ** (ถ้ากดแปลงค้างไว้ ให้กดย้อนกลับ)

- [ ] **Step 2: อัปเดต `features.json`**

เพิ่มใน `phases[4].features` ต่อจาก F40:

```json
        {
          "id": "F41",
          "name": "แปลงยอดเก่าเป็นรายการเดินบัญชี (Journal Backfill)",
          "description": "ปุ่มเดียวแปลงยอดที่กรอกไว้ก่อนมีสมุดรายการ ให้กลายเป็นบรรทัด 'ยอดที่กรอกไว้เดิม' — ยอดเงินไม่ขยับ และย้อนกลับได้",
          "status": "completed",
          "priority": "P2",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "BankTxSource เพิ่ม { type: 'backfill' }",
            "utils/journalBackfill.ts: planBackfill/buildBackfillTransactions (pure) — ส่วนต่าง = ยอดเดือน − Σ รายการที่มี",
            "ไม่ใช้ applyBankMovement (ฟังก์ชันนั้นเขียน balances ด้วย) — backfill เขียนแค่รายการ",
            "idempotent: รันซ้ำไม่สร้างบรรทัดเพิ่ม; เดือนผสมได้บรรทัดเท่าส่วนต่าง",
            "undoJournalBackfill ลบทั้งชุด; deleteBankTransaction ปฏิเสธบรรทัด backfill",
            "กฎเหล็ก: ยอดทุกบัญชีก่อน = หลัง ทุกเคส (deep snapshot เทียบใน verify)",
            "UI ใน Settings (ไม่ใช่ DangerZone) พร้อม preview + inline confirm ตอนย้อนกลับ",
            "Verified: scripts/verify-journal-backfill.ts + verify เดิมทั้ง 16 ตัวไม่ regress + typecheck + lint + build + UI run จริง"
          ],
          "estimatedHours": 4,
          "dependencies": ["F40"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-07-09",
            "notes": "Spec: docs/superpowers/specs/2026-07-09-journal-backfill-design.md | Plan: docs/superpowers/plans/2026-07-09-journal-backfill.md | Files: utils/journalBackfill.ts (ใหม่), components/settings/JournalBackfillSection.tsx (ใหม่), types/index.ts, stores/financeStore.ts, pages/SettingsPage.tsx | หมายเหตุ: MonthTransactionList ไม่ต้องแก้ — บรรทัด 'ยอดก่อนมีรายการ' หายเองเมื่อ opening = 0"
          }
        }
```

และแก้ `progressSummary`: `totalFeatures` 48 → 49, `completed` 48 → 49

- [ ] **Step 3: Commit**

```bash
git add features.json
git commit -m "docs: F41 แปลงยอดเก่าเป็นรายการ — completed"
```

---

## Self-Review Notes

- **§3 spec (หลักการปลอดภัย)** → Task 1 (สูตรส่วนต่าง + คอมเมนต์ห้ามใช้ applyBankMovement) + Task 2 (store คืน accounts ref เดิม)
- **§5 spec (data model)** → Task 1 (`{type:'backfill'}`) + Task 3 (import round-trip)
- **§6 spec (journalBackfill.ts)** → Task 1 (ชื่อฟังก์ชันตรงสเปก: `planBackfill`, `buildBackfillTransactions`, `BackfillPlan`, `BackfillLine`)
- **§7 spec (store)** → Task 2 (`applyJournalBackfill`, `undoJournalBackfill`, guard ใน `deleteBankTransaction`)
- **§8 spec (UI)** → Task 3 (3 สถานะ + inline confirm + ไม่อยู่ใน DangerZone)
- **§9 spec (verification 12 ข้อ)** → assertions ใน Task 1 (pure, 8 ข้อ) + Task 2 (store, idempotent/undo/round-trip) + Task 3 (import) + regression sweep + UI run ใน Task 4
- ชื่อ/ชนิดตรงกันทุก task: `planBackfill`, `buildBackfillTransactions`, `BackfillPlan.cellCount/accountCount`, `BACKFILL_LABEL`, `applyJournalBackfill`, `undoJournalBackfill`
- ลำดับบังคับ: 1 → 2 (store พึ่ง util) → 3 (UI พึ่ง store) → 4
