# F49 — เก็บหนี้เทคนิค 5 ข้อ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดกับดัก 5 จุดที่จดสะสมมาระหว่าง F44–F48 — และปิดด้วยประตูตรวจ ไม่ใช่ด้วยความจำ

**Architecture:** สี่ในห้าข้อคือ "กฎที่เขียนไว้แต่ไม่มีอะไรบังคับ" → แก้โค้ดแล้วเพิ่ม assertion ที่จะแดงถ้ามันกลับมา. ข้อที่ห้า (focus trap) เขียนเองใน ui primitive ไม่เพิ่ม dependency. **การเก็บกวาดคีย์ยอดศูนย์คือข้อเดียวที่แตะข้อมูล** — และมันผูกกับสมุดรายการ (F40) เพื่อไม่ให้ลบผิด

**Tech Stack:** React 18 + Vite + Zustand + Recharts + Playwright (devDep). verify script รันด้วย `npx tsx --tsconfig tsconfig.app.json scripts/<file>.ts`

**Spec:** `docs/superpowers/specs/2026-07-13-tech-debt-sweep-design.md`

---

## กฎเหล็ก

1. **ห้ามลบคีย์ยอดศูนย์มั่ว** — เดือนที่มีรายการเดินบัญชีรวมกันได้ 0 (ฝาก ฿1,000 → ถอน ฿1,000) **ต้องเก็บคีย์ไว้** ไม่งั้นพัง invariant ของ F40: *ทุก (บัญชี,ปี,เดือน) ที่มีรายการ → Σ tx.amount === balance*. `scripts/verify-bank-transactions.ts` จะแดงทันทีถ้าทำผิด
2. **ห้ามลบชื่อ `addRawBalance`** — มันไม่ใช่ก๊อปปี้ที่ใครลืมลบ มันคือป้ายบอกว่า "ทางนี้จงใจไม่จดรายการ" (ใช้กู้ยอด gold รุ่นเก่าที่หักไว้นอกสมุด) ยุบทิ้ง = ลบเจตนาทิ้ง
3. **ตัวเลขห้ามขยับ** — งานนี้ไม่มีข้อไหนควรทำให้ยอดเงินของ Tom เปลี่ยน. verify เดิม 30 ตัวต้องเขียวทั้งหมด

---

## File Structure

**สร้างใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/utils/balancePrune.ts` | pure: `pruneEmptyBalanceKeys(accounts, transactions)` — ลบเซลล์ยอด 0 ที่ไม่มีรายการรองรับ |
| `scripts/verify-tech-debt.ts` | T1–T6 |

**แก้**
| ไฟล์ | แก้อะไร |
|---|---|
| `src/stores/financeStore.ts` | `addRawBalance` เรียก `applyBankDelta`; `withLedger` เรียก prune ท้ายทุก mutation |
| `src/components/dashboard/ExpensePieChart.tsx` · `src/components/analytics/TrendAnalysis.tsx` · `src/components/analytics/MultiYearComparison.tsx` | เลิกถือสำเนาสีหมวด ดึงจาก `EXPENSE_CATEGORIES` |
| `scripts/verify-mobile.ts` | `ROUTES` derive จาก `NAV_ITEMS` |
| `src/components/ui/Modal.tsx` | focus trap |

---

## Task 1: เก็บกวาดคีย์ยอดศูนย์ (ข้อ 1)

**Files:** Create `src/utils/balancePrune.ts`, Create `scripts/verify-tech-debt.ts`

- [ ] **Step 1: เขียน verify ที่ยังแดง — `scripts/verify-tech-debt.ts`**

```ts
/**
 * Verification for F49 — หนี้เทคนิค.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts
 */
import type { BankAccount, BankTransaction } from '../src/types';
import { pruneEmptyBalanceKeys } from '../src/utils/balancePrune';

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

const acct = (
  id: string,
  balances: Record<string, Record<string, number>>,
): BankAccount => ({ id, name: id, balances }) as BankAccount;

const tx = (
  accountId: string,
  year: number,
  month: number,
  amount: number,
): BankTransaction =>
  ({ id: `${accountId}-${year}-${month}-${amount}`, accountId, year, month, amount }) as BankTransaction;

console.log('\n— T1: เซลล์ยอด 0 ที่ไม่มีรายการ → หายไป —');
{
  const accounts = [acct('a1', { '2026': { '7': 1000, '8': 0 } })];
  const [pruned] = pruneEmptyBalanceKeys(accounts, []);
  assert('เดือน 8 (ยอด 0, ไม่มีรายการ) หายไป', pruned.balances['2026']?.['8'] === undefined);
  assert('เดือน 7 (ยอดจริง) ยังอยู่', pruned.balances['2026']?.['7'] === 1000);
}

console.log('\n— T2: เซลล์ยอด 0 ที่ "มีรายการ" → ต้องอยู่ต่อ (invariant F40) —');
{
  // ฝาก 1,000 แล้วถอน 1,000 ในเดือนเดียวกัน → ยอดเดือนนั้น = 0 แต่มีรายการ 2 บรรทัด
  // ลบเซลล์นี้ = Σ tx (0) ไม่มีเซลล์ให้เทียบ → invariant พัง
  const accounts = [acct('a1', { '2026': { '7': 0 } })];
  const txs = [tx('a1', 2026, 7, 1000), tx('a1', 2026, 7, -1000)];
  const [pruned] = pruneEmptyBalanceKeys(accounts, txs);
  assert('เซลล์ยอด 0 ที่มีรายการ ยังอยู่', pruned.balances['2026']?.['7'] === 0);
}

console.log('\n— ปีที่ว่างเปล่าหลังเก็บกวาด ต้องไม่เหลือเป็นเปลือกว่าง —');
{
  const accounts = [acct('a1', { '2026': { '7': 100 }, '2027': { '7': 0 } })];
  const [pruned] = pruneEmptyBalanceKeys(accounts, []);
  assert('ปี 2027 (เหลือแต่เซลล์ 0) หายทั้งปี', pruned.balances['2027'] === undefined);
  assert('ปี 2026 ยังอยู่', pruned.balances['2026']?.['7'] === 100);
}

console.log('\n— ไม่มีอะไรให้เก็บกวาด → คืน array เดิม (identity) —');
{
  const accounts = [acct('a1', { '2026': { '7': 100 } })];
  const out = pruneEmptyBalanceKeys(accounts, []);
  assert('คืน reference เดิม ไม่สร้าง object ใหม่ทิ้ง ๆ ขว้าง ๆ', out === accounts);
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts`
Expected: `Cannot find module '../src/utils/balancePrune'`

- [ ] **Step 3: `src/utils/balancePrune.ts`**

```ts
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
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts` → ✅ ทั้งหมด (6 ข้อ)
Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: commit**

```bash
git add src/utils/balancePrune.ts scripts/verify-tech-debt.ts
git commit -m "feat(accounts): เก็บกวาดเซลล์ยอดศูนย์กำพร้า (pure) + verify (F49)"
```

---

## Task 2: ต่อ prune เข้าประตูเดียวของ F40

**Files:** Modify `src/stores/financeStore.ts`

`withLedger` (`financeStore.ts:403`) คือประตูที่ F40 สร้างไว้ให้ **ทุก** mutation ของบัญชีวิ่งผ่าน — วาง prune ไว้ท้ายสุดที่นั่นแล้วครอบทุกเส้นทางในคราวเดียว ไม่ต้องไล่แปะทีละ action

- [ ] **Step 1: แก้ `withLedger`**

```ts
const withLedger = (
  data: WealthLensData,
  mutate: (ledger: BankLedger) => BankLedger,
): Pick<WealthLensData, 'bankAccounts' | 'bankTransactions'> => {
  const next = mutate({
    accounts: data.bankAccounts ?? [],
    transactions: data.bankTransactions ?? [],
  });
  // F49 — เก็บกวาดเซลล์ยอด 0 ที่ไม่มีรายการรองรับ ท้ายทุก mutation.
  // วางที่นี่จุดเดียวเพราะ withLedger คือประตูที่ F40 บังคับให้ทุกเส้นทางวิ่งผ่าน
  // (ไล่แปะทีละ action = ลืมสักอันแล้วคีย์กำพร้าโผล่กลับมาเงียบ ๆ)
  return {
    bankAccounts: pruneEmptyBalanceKeys(next.accounts, next.transactions),
    bankTransactions: next.transactions,
  };
};
```
(เพิ่ม `import { pruneEmptyBalanceKeys } from '@/utils/balancePrune';`)

- [ ] **Step 2: `addRawBalance` / `setRawBalance` ไม่ได้วิ่งผ่าน `withLedger` — ตรวจว่าต้องเก็บกวาดด้วยไหม**

`grep -n "addRawBalance\|setRawBalance" src/stores/financeStore.ts` แล้วดูทุก call site:
- ถ้ามัน**อยู่ข้างใน** `withLedger` (เป็นส่วนหนึ่งของ mutate) → prune ครอบให้แล้ว ไม่ต้องทำอะไร
- ถ้ามัน**เขียน `bankAccounts` ตรง ๆ นอก `withLedger`** → เซลล์กำพร้าจากเส้นทางนั้นจะรอด → ต้องเก็บกวาดด้วย

**รายงานสิ่งที่เจอ** — อย่าเดา และอย่าแปะ prune ลงไปมั่ว ๆ ถ้ามันซ้ำซ้อน

- [ ] **Step 3: verify เดิมต้องไม่ regress — โดยเฉพาะ invariant ของ F40**

```bash
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-income-deposit.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts
```
ทั้งหมดต้องเขียว **`verify-bank-transactions.ts` คือตัวที่จะแดงถ้าเก็บกวาดผิด** (มันเช็ค Σ tx === balance ทุกเซลล์)

- [ ] **Step 4: ยืนยันกับข้อมูลจริงของ Tom**

ข้อมูลจริงมีคีย์กำพร้าอยู่ **2 ช่อง**: `กสิกรไทย 2027-07 = 0` และ `เงินสด 2027-07 = 0` (ยืนยันแล้วว่าไม่มีรายการรองรับ)

รันแอป (`VITE_GOOGLE_CLIENT_ID= npm run dev` เพื่อข้าม login gate — ข้อมูลจริงอยู่ใน LocalStorage ของเบราว์เซอร์เจ้าของ repo) แล้ว:
1. อ่าน `localStorage['wealthlens_data']` → ยืนยันว่าคีย์ 2027-07 ทั้งสองยังอยู่
2. ทำ mutation อะไรก็ได้ที่แตะบัญชี (เช่น ฝากเงิน ฿1 เข้ากสิกรไทยแล้วลบรายการนั้นทิ้ง)
3. อ่านซ้ำ → **คีย์กำพร้าต้องหายไป และยอดเงินทุกบัญชีต้องเท่าเดิมเป๊ะ**

ถ้าคีย์ไม่หาย = วาง prune ผิดที่ **รายงาน อย่าเงียบ**

- [ ] **Step 5: commit**

```bash
git commit -am "feat(accounts): prune เซลล์กำพร้าท้ายทุก mutation ผ่าน withLedger (F49)"
```

---

## Task 3: เลขคณิตบวกยอดเหลือที่เดียว (ข้อ 2)

**Files:** Modify `src/stores/financeStore.ts`, Modify `scripts/verify-tech-debt.ts`

**ห้ามลบ `addRawBalance`** — มันไม่ใช่ก๊อปปี้ที่ใครลืมลบ. คอมเมนต์เหนือมันอธิบายไว้ว่า: *กู้ยอด gold holding รุ่นเก่า (ซื้อก่อน F40) ที่หักยอดแบบ inline ไม่มีบรรทัดใน journal ให้ revoke ไปคืน — การหักเดิมอยู่นอกสมุด การคืนจึงต้องอยู่นอกสมุดเช่นกัน*
**ชื่อกับคอมเมนต์คือป้ายบอกเจตนา ยุบทิ้ง = ลบเจตนาทิ้ง** สิ่งที่ซ้ำคือแค่เลขคณิตข้างใน

- [ ] **Step 1: เพิ่ม T4 ลง `scripts/verify-tech-debt.ts`**

```ts
import { readFileSync } from 'node:fs';

console.log('\n— T4: สูตรบวกยอดอยู่ที่เดียว —');
{
  // ไม่ได้เทียบ "ชื่อฟังก์ชัน" แต่เทียบ "สูตร" — addRawBalance ยังต้องมีอยู่ (มันคือ
  // ป้ายบอกว่าทางนี้จงใจไม่จดรายการ) แค่ต้องไม่เขียนเลขคณิตซ้ำเอง
  const store = readFileSync('src/stores/financeStore.ts', 'utf8');
  const formula = /balances\[\w+\]\?\.\[\w+\]\s*\?\?\s*0\)\s*\+\s*delta/g;
  const hits = [...store.matchAll(formula)].length;
  assert(
    `financeStore ไม่เขียนสูตรบวกยอดเอง (เจอ ${hits} ที่)`,
    hits === 0,
    'ต้องเรียก applyBankDelta แทน',
  );

  const utils = readFileSync('src/utils/bankAccounts.ts', 'utf8');
  assert('สูตรอยู่ใน bankAccounts.ts', formula.test(utils));
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts`
Expected: T4 แดง (`financeStore ไม่เขียนสูตรบวกยอดเอง (เจอ 1 ที่)`)

- [ ] **Step 3: `addRawBalance` เรียก `applyBankDelta`**

แทนบอดี้ (คอมเมนต์เดิมเหนือฟังก์ชัน **คงไว้ทั้งหมด**):

```ts
const addRawBalance = (
  accounts: readonly BankAccount[],
  id: string,
  year: number,
  month: number,
  delta: number,
): BankAccount[] =>
  // เลขคณิตเดียวกับทุกที่ในแอป — อยู่ที่ utils/bankAccounts.ts ที่เดียว (F49).
  // ต่างกันที่ "ใครเรียก": ทางนี้จงใจไม่จดรายการลงสมุด (ดูคอมเมนต์ด้านบน)
  applyBankDelta(accounts, id, year, month, delta);
```
(เพิ่ม `applyBankDelta` เข้า import จาก `@/utils/bankAccounts`)

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts` → ✅
Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts` → เขียว (gold รุ่นเก่ายังคืนยอดได้เหมือนเดิม)
Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: commit**

```bash
git commit -am "refactor(accounts): addRawBalance เรียก applyBankDelta — สูตรเหลือที่เดียว (F49)"
```

---

## Task 4: สีหมวดเหลือแหล่งเดียว (ข้อ 3)

**Files:** Modify `src/components/dashboard/ExpensePieChart.tsx`, `src/components/analytics/TrendAnalysis.tsx`, `src/components/analytics/MultiYearComparison.tsx`, Modify `scripts/verify-tech-debt.ts`

canonical อยู่ที่ `src/types/expense-categories.ts` — `EXPENSE_CATEGORIES[cat].hex` (มี `CATEGORY_ORDER` ให้ด้วย)
กราฟ 3 ตัวถือสำเนาส่วนตัว และ `TrendAnalysis.tsx:65` เขียนคอมเมนต์ยอมรับเองว่า *"duplicated rather than centralised"*

**หมายเหตุ:** `MultiYearComparison.tsx` มี `YEAR_COLORS` (สีของ**ปี** ไม่ใช่สีของ**หมวด**) — **นั่นไม่ใช่หนี้ ห้ามแตะ** ตรวจให้ดีว่า hex ตัวไหนเป็นสีหมวด ตัวไหนเป็นสีปี

- [ ] **Step 1: เพิ่ม T5 ลง `scripts/verify-tech-debt.ts`**

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EXPENSE_CATEGORIES } from '../src/types/expense-categories';

console.log('\n— T5: ไม่มี hex ของสีหมวดใน src/components —');
{
  const categoryHexes = new Set(
    Object.values(EXPENSE_CATEGORIES).map((meta) => meta.hex.toLowerCase()),
  );

  const files: string[] = [];
  const walk = (p: string): void => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      files.push(p);
    }
  };
  walk('src/components');

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [, hex] of src.matchAll(/(#[0-9a-fA-F]{6})/g)) {
      if (categoryHexes.has(hex.toLowerCase())) offenders.push(`${file} ${hex}`);
    }
  }
  assert(
    `ไม่มีสำเนาสีหมวดใน component (เจอ ${offenders.length})`,
    offenders.length === 0,
    offenders.slice(0, 5).join(' · '),
  );
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts`
Expected: T5 แดง — พิมพ์ไฟล์ที่ถือสำเนาออกมา

- [ ] **Step 3: กราฟ 3 ตัวดึงจาก canonical**

ในแต่ละไฟล์ ลบ `CATEGORY_HEX_COLORS` (หรือชื่อที่ใช้จริงในไฟล์นั้น) แล้วใช้:
```ts
import { EXPENSE_CATEGORIES } from '@/types/expense-categories';
...
fill={EXPENSE_CATEGORIES[cat].hex}
```
สำหรับ `style={{ backgroundColor: ... }}` ของ swatch ก็ดึงจากที่เดียวกัน

**ระวัง:** สีที่ส่งเข้า Recharts ต้องเป็น **hex ตัวจริง** ห้ามเป็น `var(--cat-housing)` — Recharts เขียนลง SVG presentation attribute ซึ่งไม่รับ `var()` (เส้นหายเงียบ ๆ ไม่มี error, กฎ F46)

- [ ] **Step 4: รันให้เขียว + ดูด้วยตา**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts` → T5 ✅
Run: `npm run typecheck && npm run lint && npm run build`
เปิด `/` และ `/analytics` (`VITE_GOOGLE_CLIENT_ID= npm run dev`) → **สีในกราฟวงกลม กราฟแท่งซ้อน และตารางเทียบปี ต้องเหมือนเดิมทุกหมวด** (ถ้าสีเปลี่ยน แปลว่าสำเนาที่ลบไปมีค่าไม่ตรงกับ canonical — นั่นคือหลักฐานว่าหนี้ข้อนี้กัดไปแล้ว **รายงานทันที**)

- [ ] **Step 5: commit**

```bash
git commit -am "refactor(charts): สีหมวดดึงจาก EXPENSE_CATEGORIES แหล่งเดียว (F49)"
```

---

## Task 5: `verify-mobile` รู้จักหน้าใหม่เอง (ข้อ 4)

**Files:** Modify `scripts/verify-mobile.ts`, Modify `scripts/verify-tech-debt.ts`

วันนี้ `ROUTES` เป็นรายการพิมพ์มือ — เพิ่มหน้าใหม่แล้วไม่มีใครตรวจว่ามันพังบนมือถือไหม (F48 รอดมาได้เพราะไปเติมชื่อหน้าเองด้วยมือ)
ทะเบียนเมนู `src/lib/nav.ts` (F47) มี `NAV_ITEMS` อยู่แล้ว และ `scripts/verify-nav.ts` import จาก `../src/lib/nav` ได้อยู่แล้ว — ใช้ตัวนั้น

- [ ] **Step 1: เพิ่ม T6 ลง `scripts/verify-tech-debt.ts`**

```ts
import { NAV_ITEMS } from '../src/lib/nav';

console.log('\n— T6: verify-mobile ตรวจทุกหน้าในทะเบียนเมนู —');
{
  const mobile = readFileSync('scripts/verify-mobile.ts', 'utf8');
  assert(
    'ROUTES derive จาก NAV_ITEMS ไม่ใช่พิมพ์มือ',
    mobile.includes('NAV_ITEMS'),
    'เพิ่มหน้าใหม่แล้วจะหลุดการตรวจเงียบ ๆ',
  );
  // กันเคสที่ import มาแต่ยังพิมพ์รายการมือทิ้งไว้ข้าง ๆ
  assert(
    'ไม่มีรายการ path พิมพ์มือหลงเหลือ',
    !/const ROUTES\s*=\s*\[\s*'\//.test(mobile),
  );
  console.log(`   (ทะเบียนมี ${NAV_ITEMS.length} หน้า)`);
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts` → T6 แดงทั้งสองข้อ

- [ ] **Step 3: แก้ `scripts/verify-mobile.ts`**

แทน `const ROUTES = [...]` ด้วย:
```ts
import { NAV_ITEMS } from '../src/lib/nav';

/**
 * ทุกหน้าในทะเบียนเมนู (F49) — เดิมเป็นรายการพิมพ์มือ เพิ่มหน้าใหม่แล้วมันหลุด
 * การตรวจเงียบ ๆ. `/report/:year` ไม่อยู่ในทะเบียนโดยตั้งใจ (มันคือกระดาษ A4
 * ไม่ใช่หน้าจอ — F47 spec)
 */
const ROUTES = NAV_ITEMS.map((item) => item.path);
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts` → T6 ✅
Run: `npm run verify:mobile` → **ผ่านทั้งหมด และต้องวิ่งครบ 10 หน้า** (นับ `── /` ที่มันพิมพ์ออกมา)

- [ ] **Step 5: commit**

```bash
git commit -am "test(mobile): ROUTES derive จากทะเบียนเมนู — หน้าใหม่ถูกตรวจอัตโนมัติ (F49)"
```

---

## Task 6: focus trap ใน `Modal` (ข้อ 5)

**Files:** Modify `src/components/ui/Modal.tsx`

คอมเมนต์ที่ `Modal.tsx:17` ยอมรับไว้เอง: *"Focus trapping is intentionally NOT implemented in v1"* — งานนี้คือ v2

**ห้ามแตะ `aria-hidden`** — คอมเมนต์ที่บรรทัด ~124 อธิบายไว้ว่าทำไมถึงจงใจไม่ใส่ (ตอนปิด โฟกัสอาจยังอยู่ใน subtree; `aria-hidden` บน ancestor ของ element ที่โฟกัสอยู่ = ผิด a11y เอง)

- [ ] **Step 1: เขียน focus trap**

เพิ่มใน `Modal`:
```tsx
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // จำว่าใครเปิด modal นี้ เพื่อคืนโฟกัสให้ตอนปิด (F49).
  // ไม่คืน = โฟกัสเด้งไปต้น <body> ผู้ใช้คีย์บอร์ดต้อง Tab ใหม่ทั้งหน้า
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

  // Tab/Shift+Tab วนอยู่ในกรอบ — ไม่งั้นโฟกัสไหลไปปุ่มที่อยู่ "ข้างหลัง" modal
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null); // มองไม่เห็น = ข้าม

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // โฟกัสหลุดออกไปแล้ว (คลิกข้างนอก) — ดึงกลับเข้ากรอบ
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
```
แล้วผูก `ref={panelRef}` เข้ากับ `motion.div` ของ panel (ตัวที่มี `role="dialog"`)

`useRef` ต้องเพิ่มเข้า import จาก react

- [ ] **Step 2: อัปเดตคอมเมนต์หัวไฟล์**

คอมเมนต์ที่บอกว่า "intentionally NOT implemented in v1" **ต้องถูกลบ/แก้** — คอมเมนต์ที่บรรยายสิ่งที่ไม่จริงแล้ว แย่กว่าไม่มีคอมเมนต์ เขียนแทนว่ามี focus trap แล้ว และอธิบายว่าทำไมยังไม่ใส่ `aria-hidden`

- [ ] **Step 3: ตรวจ**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 4: ขับจริง (T7 — Playwright)**

Playwright เป็น devDependency อยู่แล้ว. เขียนสคริปต์ชั่วคราว (หรือต่อท้าย `verify-tech-debt.ts` เป็นส่วน UI แยก) ที่:
1. build ด้วย `vite build --mode verify` (auth ปิด) แล้วเสิร์ฟ `dist/`
2. เปิด `/monthly` → กดปุ่ม "+ เพิ่มค่าใช้จ่าย" ให้ modal เปิด
3. กด Tab ซ้ำ ๆ 15 ครั้ง → **`document.activeElement` ต้องอยู่ใน panel ทุกครั้ง** (ไม่หลุดออกไปข้างหลัง)
4. กด Shift+Tab จาก element แรก → ต้องวนไป element สุดท้าย
5. กด Escape → modal ปิด **และโฟกัสต้องกลับไปที่ปุ่มที่เปิดมัน**

รายงานผลจริงทั้ง 5 ข้อ **อย่าสรุปว่าผ่านโดยไม่ได้วัด**

- [ ] **Step 5: commit**

```bash
git commit -am "feat(a11y): focus trap ใน Modal + คืนโฟกัสให้ปุ่มที่เปิด (F49)"
```

---

## Task 7: ปิดงาน

- [ ] **Step 1: verify ทั้งชุด**

```bash
for f in scripts/verify-*.ts; do
  case "$f" in *verify-mobile.ts) continue;; esac
  npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null 2>&1 && echo "✅ $f" || echo "❌ $f"
done
npm run verify:mobile
npm run typecheck && npm run lint && npm run build
```
verify เดิม 30 ตัว + `verify-tech-debt` ใหม่ = 31 ตัว ต้องเขียวหมด

- [ ] **Step 2: ยืนยันว่าตัวเลขของ Tom ไม่ขยับ**

เปิดแอปด้วยข้อมูลจริง เทียบก่อน/หลัง: ยอดทุกบัญชี · net worth บน `/wealth` · `/growth`
**ต้องเท่าเดิมทุกตัว** (งานนี้ไม่มีข้อไหนควรทำให้ยอดเงินเปลี่ยน)
ยกเว้นสิ่งเดียวที่ควรเปลี่ยน: คีย์กำพร้า 2 ช่อง (`กสิกรไทย 2027-07`, `เงินสด 2027-07`) หายไป — **และยอดยังเท่าเดิม** เพราะมันเป็น 0 อยู่แล้ว

- [ ] **Step 3: เอกสาร**

- `features.json` — F49 ใน phase_6 (สร้าง phase ใหม่: `"name": "Phase 6 — Debt & Polish"`, `status: "in_progress"`, 1 จาก 3)
- `CLAUDE.md` — Data Quirks: *"เซลล์ยอด 0 ที่ไม่มีรายการรองรับ ถูกเก็บกวาดอัตโนมัติท้ายทุก mutation (F49) — เซลล์ 0 ที่ **มี** รายการ (ฝาก+ถอนหักล้างกัน) ต้องอยู่ต่อ ไม่งั้นพัง invariant ของ F40"*

- [ ] **Step 4: commit**

```bash
git add features.json CLAUDE.md
git commit -m "docs: F49 เก็บหนี้เทคนิค 5 ข้อเสร็จ"
```

---

## สิ่งที่ไม่ทำโดยตั้งใจ

- **ไม่ลบชื่อ `addRawBalance`** — ป้ายบอกเจตนา (§1.2 ของ spec)
- **ไม่แตะ `aria-hidden` ของ Modal** — คอมเมนต์เดิมอธิบายไว้แล้วว่าทำไม
- **ไม่เขียน migration แยก** — คีย์กำพร้าถูกเก็บกวาดเองในการ mutation ครั้งถัดไป
- **ไม่แตะ `YEAR_COLORS`** ใน `MultiYearComparison` — สีของปี ไม่ใช่สีของหมวด
