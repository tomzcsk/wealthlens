# F53 — รายการออมระบุ "จ่ายผ่าน" บัญชี Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รายการออม (`SavingsItem`) ระบุบัญชีที่จ่ายได้และหักยอดบัญชีจริงผ่าน ledger เหมือนรายจ่ายทุกประการ

**Architecture:** ลอกแพทเทิร์น expense: `paymentAccountId` + `sideEffects` บน item, บรรทัด `BankTransaction` source ใหม่ `{type:'savings', savingsId}`, ทุกการเขียนจบที่ `ledgerPatch()` (F49). Generalize `reconcileExpenseLedger` เป็น `reconcileItemDeduction` แล้วให้ทั้งสอง flow ใช้ร่วม

**Tech Stack:** React 19 + TypeScript strict + Zustand. ไม่มี unit test runner — ประตูตรวจคือ `scripts/verify-*.ts` รันด้วย `npx tsx --tsconfig tsconfig.app.json`

**Spec:** `docs/superpowers/specs/2026-07-15-savings-payment-account-design.md`

---

## บริบทที่ต้องรู้ก่อนแตะโค้ด

- `withLedger(data, mutate)` (`src/stores/financeStore.ts:391`) อ่าน ledger จาก state → mutate → `ledgerPatch()` (prune เซลล์ 0 กำพร้า, F49). ทุก action ที่ขยับเงินผ่านทางนี้
- `reconcileExpenseLedger` (`financeStore.ts:318`) คือแม่แบบ: revoke บรรทัดเก่าของ item (คืนด้วย `tx.amount` ที่ลงจริง ห้าม recompute) แล้ว apply บรรทัดใหม่ยอดติดลบ. มี legacy branch (pre-F40: มี `sideEffects` แต่ไม่มีบรรทัด → คืนนอกสมุดผ่าน `addRawBalance`)
- Savings ไม่มี legacy (ไม่เคยหักบัญชีมาก่อน) แต่ branch นี้ generalize ไปด้วยได้ ไม่มีโทษ
- `SavingsItem` อยู่ `src/types/index.ts:409`, `BankTxSource` อยู่ `index.ts` (~658), `ExpenseSideEffectRefs` อยู่ `index.ts:322`
- Recurring fill (`src/utils/recurringTemplate.ts`) build item ใหม่จาก field ที่ระบุชัด (`category/name/amount/isRecurring`) — **ไม่ spread `...it`** จึงไม่พา `paymentAccountId`/`sideEffects` ติดมา (พฤติกรรมเดียวกับ expense — ไม่ต้องแก้อะไร)
- Commit ตรง main ทีละ task, ข้อความ commit ภาษาไทยตามสไตล์ repo (`git log --oneline -20` ดูตัวอย่าง)

---

### Task 1: Verify script (แดงก่อน)

**Files:**
- Create: `scripts/verify-savings-payment.ts`

- [ ] **Step 1.1: เขียน script ทั้งไฟล์**

```ts
/**
 * Store-level verification for F53 — savings "จ่ายผ่าน" deduction.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
 * Shims localStorage first, then dynamically imports the store so zustand
 * persist creates cleanly in node (same pattern as verify-installment-deduction).
 */
let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- localStorage shim (must be set BEFORE importing the store) ---
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const run = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const { findBankAccountUsage, isBankAccountDeletable } = await import(
    '../src/utils/bankAccountUsage'
  );
  const s = () => useFinanceStore.getState();
  const bal = (id: string, y: number, m: number): number =>
    (s().data.bankAccounts ?? []).find((a) => a.id === id)?.balances[String(y)]?.[
      String(m)
    ] ?? 0;
  const cell = (id: string, y: number, m: number): number | undefined =>
    (s().data.bankAccounts ?? []).find((a) => a.id === id)?.balances[String(y)]?.[
      String(m)
    ];
  const savingsTxs = (savingsId: string) =>
    (s().data.bankTransactions ?? []).filter(
      (tx) => tx.source.type === 'savings' && tx.source.savingsId === savingsId,
    );
  const itemOf = (y: number, m: number, id: string) =>
    s()
      .data.years[String(y)]?.savings.find((r) => r.month === m)
      ?.items.find((it) => it.id === id);
  const lastSavingsId = (y: number, m: number): string => {
    const items =
      s().data.years[String(y)]?.savings.find((r) => r.month === m)?.items ?? [];
    return items[items.length - 1]!.id;
  };

  const acctA = s().addBankAccount('บัญชี A');
  const acctB = s().addBankAccount('บัญชี B');

  // --- 1) add + บัญชี → หักยอด + บรรทัด savings + sideEffects ---
  s().addSavings(2026, 7, {
    category: 'travel',
    name: 'ออมเที่ยว',
    amount: 5000,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id1 = lastSavingsId(2026, 7);
  eq('1. add หักบัญชี A', bal(acctA, 2026, 7), -5000);
  eq('1. มีบรรทัด savings 1 บรรทัด', savingsTxs(id1).length, 1);
  eq('1. tx ติดลบ', savingsTxs(id1)[0]?.amount, -5000);
  eq('1. sideEffects.deductAmount', itemOf(2026, 7, id1)?.sideEffects?.deductAmount, 5000);

  // --- 2) add ไม่ระบุบัญชี → bank state ไม่ขยับเลย (reference เดิม) ---
  const beforeAccounts = s().data.bankAccounts;
  const beforeTxs = s().data.bankTransactions;
  s().addSavings(2026, 7, {
    category: 'general',
    name: 'ออมเฉยๆ',
    amount: 999,
    isRecurring: false,
  });
  eq('2. ไม่ระบุบัญชี → bankAccounts ref เดิม', s().data.bankAccounts === beforeAccounts, true);
  eq('2. ไม่ระบุบัญชี → bankTransactions ref เดิม', s().data.bankTransactions === beforeTxs, true);

  // --- 3) แก้ยอด → revoke เก่า apply ใหม่ เหลือบรรทัดเดียว ---
  s().updateSavings(2026, 7, id1, { amount: 7000 });
  eq('3. แก้ยอด → หักใหม่', bal(acctA, 2026, 7), -7000);
  eq('3. ยังมีบรรทัดเดียว', savingsTxs(id1).length, 1);

  // --- 4) ย้ายบัญชี A→B ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: acctB });
  eq('4. ย้าย: A คืนยอด', bal(acctA, 2026, 7), 0);
  eq('4. ย้าย: B โดนหัก', bal(acctB, 2026, 7), -7000);

  // --- 5) ถอดบัญชีออก → คืนยอด + sideEffects/บรรทัดหาย ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: undefined });
  eq('5. ถอดบัญชี: B คืนยอด', bal(acctB, 2026, 7), 0);
  eq('5. sideEffects หาย', itemOf(2026, 7, id1)?.sideEffects, undefined);
  eq('5. บรรทัดหาย', savingsTxs(id1).length, 0);
  // F49: เซลล์ 0 ที่ไม่มีรายการรองรับต้องถูกกวาด
  eq('5. เซลล์ 0 กำพร้าของ B ถูกกวาด', cell(acctB, 2026, 7), undefined);

  // --- 6) ลบรายการ → คืนยอด, บรรทัดหาย, แถวเดือน (ว่างได้) ยังอยู่ ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: acctA });
  eq('6. ผูกกลับ → หัก', bal(acctA, 2026, 7), -7000);
  s().deleteSavings(2026, 7, id1);
  eq('6. ลบ → คืนยอด', bal(acctA, 2026, 7), 0);
  eq('6. บรรทัดหาย', savingsTxs(id1).length, 0);
  eq(
    '6. แถวเดือนยังอยู่',
    s().data.years['2026'].savings.some((r) => r.month === 7),
    true,
  );

  // --- 7) F44: บัญชีที่มีออมผูกลบไม่ได้ ---
  s().addSavings(2026, 8, {
    category: 'travel',
    name: 'ออมสิงหา',
    amount: 100,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id7 = lastSavingsId(2026, 8);
  eq('7. usage.savings นับถูก', findBankAccountUsage(s().data, acctA).savings.length, 1);
  eq('7. ลบบัญชีไม่ได้', isBankAccountDeletable(s().data, acctA), false);
  s().updateSavings(2026, 8, id7, { paymentAccountId: undefined });
  eq('7. ถอดแล้วลบได้', isBankAccountDeletable(s().data, acctA), true);

  // --- 8) ทอง: item ที่ทองสร้าง (cash) ถูกแก้ให้ผูกบัญชี → ลบทองต้องคืนครบ ---
  const goldId = s().addGoldHolding({
    purchaseDate: '2026-09-10',
    brand: 'ทดสอบ',
    type: 'bar',
    purity: '96.5',
    weightBaht: 1,
    totalCost: 40000,
    paymentMethod: 'cash',
  });
  const goldItemId = lastSavingsId(2026, 9);
  s().updateSavings(2026, 9, goldItemId, { paymentAccountId: acctA });
  eq('8. ออมทองผูกบัญชี → หัก', bal(acctA, 2026, 9), -40000);
  s().deleteGoldHolding(goldId, { revertSideEffects: true });
  eq('8. ลบทอง → ยอดคืนครบ', bal(acctA, 2026, 9), 0);
  eq('8. ไม่มีบรรทัดค้าง', savingsTxs(goldItemId).length, 0);
  eq(
    '8. item ออมของทองถูกลบ',
    itemOf(2026, 9, goldItemId) === undefined,
    true,
  );

  // --- 9) ลบบรรทัด savings จากสมุดตรง = no-op (ต้องไปลบที่ต้นทาง) ---
  s().addSavings(2026, 10, {
    category: 'travel',
    name: 'ออมตุลา',
    amount: 500,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id9 = lastSavingsId(2026, 10);
  const tx9 = savingsTxs(id9)[0]!;
  s().deleteBankTransaction(tx9.id);
  eq('9. ลบ tx จากสมุดตรง = no-op', savingsTxs(id9).length, 1);
  eq('9. ยอดไม่ขยับ', bal(acctA, 2026, 10), -500);

  // --- 10) เซลล์ 0 ที่ "มีรายการรองรับ" ต้องอยู่ต่อ (F49) ---
  // ฝาก 600 (manual) + ออมหัก 600 ในเดือนเดียวกัน → เซลล์ = 0 แต่มี 2 บรรทัด
  s().depositBank(acctB, 2026, 11, 600);
  s().addSavings(2026, 11, {
    category: 'general',
    name: 'ออมพฤศจิกา',
    amount: 600,
    isRecurring: false,
    paymentAccountId: acctB,
  });
  eq('10. เซลล์ = 0', bal(acctB, 2026, 11), 0);
  eq('10. เซลล์ 0 ที่มีรายการต้องอยู่ต่อ', cell(acctB, 2026, 11), 0);

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
};
void run();
```

- [ ] **Step 1.2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts`
Expected: FAIL — `addSavings` ยังไม่รับ `paymentAccountId` (tsx ไม่ typecheck จึงรันได้ แต่ balance เป็น 0, `findBankAccountUsage(...).savings` เป็น `undefined` → เคสส่วนใหญ่ ✗). ถ้า crash ด้วยเหตุอื่น (import พัง) ให้แก้ script ก่อน

- [ ] **Step 1.3: Commit**

```bash
git add scripts/verify-savings-payment.ts
git commit -m "test(savings): ประตูตรวจ F53 — ออมระบุจ่ายผ่านบัญชี (แดงก่อน implement)"
```

---

### Task 2: Types + SOURCE_BADGE

**Files:**
- Modify: `src/types/index.ts` (SavingsItem ~409, BankTxSource ~658)
- Modify: `src/components/accounts/MonthTransactionList.tsx:19-29`

- [ ] **Step 2.1: เพิ่ม `SavingsSideEffectRefs` + fields บน `SavingsItem`**

ใน `src/types/index.ts` แก้ `SavingsItem` และเพิ่ม interface ใหม่ต่อท้าย (ก่อน `MonthlySavings`):

```ts
export interface SavingsItem {
  /** UUID v4 generated client-side. */
  id: string;
  category: SavingsCategory;
  /** Free-form Thai label (e.g. "ลงทุน Dime", "ออมเที่ยว"). */
  name: string;
  amount: number;
  isRecurring: boolean;
  /** บัญชีที่จ่ายรายการออมนี้ (F53). ไม่ระบุ = ไม่หักบัญชี. */
  paymentAccountId?: string;
  /** Ref เพื่อ revert การหักยอดบัญชี — store เขียนเท่านั้น form ห้ามแตะ. */
  sideEffects?: SavingsSideEffectRefs;
}

/**
 * Mirror ของการหักบัญชีที่รายการออมนี้เขียนไว้ (F53) — โครงเดียวกับ
 * `ExpenseSideEffectRefs` แต่ประกาศแยกเพื่อให้สอง flow วิวัฒน์อิสระ.
 */
export interface SavingsSideEffectRefs {
  /** BankAccount.id ที่ถูกหัก. */
  accountId: string;
  deductYear: number;
  deductMonth: number;
  /** จำนวนที่หักไป (revert = บวกกลับ). */
  deductAmount: number;
}
```

- [ ] **Step 2.2: เพิ่ม variant ใน `BankTxSource`**

แทรกหลังบรรทัด `| { type: 'expense'; expenseId: string }`:

```ts
  | { type: 'expense'; expenseId: string }
  /** รายการออมที่ระบุ "จ่ายผ่าน" บัญชี (F53) — คีย์ reconcile คือ savingsId. */
  | { type: 'savings'; savingsId: string }
  | { type: 'gold'; holdingId: string }
```

- [ ] **Step 2.3: เพิ่ม badge ใน `MonthTransactionList.tsx`**

`SOURCE_BADGE` เป็น `Record` ครบทุก type — typecheck จะบังคับอยู่แล้ว. เพิ่มบรรทัดหลัง `expense`:

```ts
  expense: '🧾 รายจ่าย',
  savings: '💎 ออม',
  gold: '🪙 ทอง',
```

**ห้าม**เพิ่ม `'savings'` ใน `DELETABLE` (บรรทัด 32) — รายการจากต้นทางลบจากสมุดตรงไม่ได้

- [ ] **Step 2.4: typecheck**

Run: `npm run typecheck`
Expected: PASS (ถ้ามีที่อื่น switch ตาม source type แบบ exhaustive จะโผล่ตรงนี้ — แก้ให้ครบ)

- [ ] **Step 2.5: Commit**

```bash
git add src/types/index.ts src/components/accounts/MonthTransactionList.tsx
git commit -m "feat(types): SavingsItem รับ paymentAccountId + BankTxSource 'savings' (F53)"
```

---

### Task 3: Store — generalize reconcile + ต่อท่อ savings actions

**Files:**
- Modify: `src/stores/financeStore.ts` — `reconcileExpenseLedger` (~318), `expenseDeductionOf` (~257), `addSavings`/`updateSavings`/`deleteSavings` (~2288-2369), `deleteBankTransaction` (~2189)

- [ ] **Step 3.1: generalize `reconcileExpenseLedger` → `reconcileItemDeduction`**

แทนที่ฟังก์ชัน `reconcileExpenseLedger` เดิมทั้งก้อน (financeStore.ts:310-363 รวม docstring) ด้วย:

```ts
/**
 * Refs ของการหักหนึ่งรายการ — โครงร่วมของ `ExpenseSideEffectRefs` และ
 * `SavingsSideEffectRefs` (structural type เดียวกัน).
 */
interface ItemDeductionRefs {
  accountId: string;
  deductYear: number;
  deductMonth: number;
  deductAmount: number;
}

/**
 * จดรายการหักของ item หนึ่งผ่านประตูเดียว (F34/F35/F40/F53) — reconcile คีย์
 * ตาม `match`: แก้ยอด/ย้ายบัญชี → บรรทัดเดิมของ item ถูกแทนที่; ลบ (deduction
 * ว่าง) → บรรทัดหาย. amount ติดลบเพราะเงินออกจากบัญชี. ใช้ร่วมทั้งรายจ่าย
 * และรายการออม — logic เดียวกัน ต่างแค่คีย์/ที่มาของบรรทัด.
 *
 * WHY revert ด้วย tx.amount ที่เก็บไว้ ไม่ recompute: ยอดที่หักไปจริงคือ
 * ความจริงเดียวที่คืนได้ถูก (บทเรียน F34/F39, spec §7).
 */
const reconcileItemDeduction = (
  ledger: BankLedger,
  match: (tx: BankTransaction) => boolean,
  source: BankTxSource,
  oldDeduction: ItemDeductionRefs | undefined,
  newDeduction: ItemDeductionRefs | undefined,
  label: string,
  date?: string,
): BankLedger => {
  // รายการรุ่นเก่า (F34→F40): หักยอดนอกสมุดไปแล้ว (มี sideEffects) แต่ไม่มี
  // บรรทัดให้ revoke → คืนยอดนอกสมุดก่อน (mirror gold addRawBalance). ถ้ามี
  // บรรทัดจริง เชื่อบรรทัด (revoke คืน tx.amount ที่ลงจริง) ไม่แตะ oldDeduction —
  // บรรทัดคือ source of truth เมื่อมี. savings ไม่มีรุ่นเก่า (เกิดหลัง F40)
  // branch นี้จึงเป็น no-op สำหรับมัน.
  const hasLine = ledger.transactions.some(match);
  const base: BankLedger =
    !hasLine && oldDeduction
      ? {
          ...ledger,
          accounts: addRawBalance(
            ledger.accounts,
            oldDeduction.accountId,
            oldDeduction.deductYear,
            oldDeduction.deductMonth,
            oldDeduction.deductAmount,
          ),
        }
      : ledger;
  return reconcileBankMovements(
    base,
    match,
    newDeduction
      ? [
          {
            accountId: newDeduction.accountId,
            year: newDeduction.deductYear,
            month: newDeduction.deductMonth,
            amount: -newDeduction.deductAmount,
            label,
            source,
            ...(date ? { date } : {}),
          },
        ]
      : [],
  );
};

/** จดรายการหักรายจ่าย/งวดผ่อน — wrapper คีย์ตาม expenseId. */
const reconcileExpenseLedger = (
  ledger: BankLedger,
  expenseId: string,
  oldDeduction: ExpenseSideEffectRefs | undefined,
  newDeduction: ExpenseSideEffectRefs | undefined,
  label: string,
  date?: string,
): BankLedger =>
  reconcileItemDeduction(
    ledger,
    (tx) => tx.source.type === 'expense' && tx.source.expenseId === expenseId,
    { type: 'expense', expenseId },
    oldDeduction,
    newDeduction,
    label,
    date,
  );

/** จดรายการหักรายการออม (F53) — wrapper คีย์ตาม savingsId. ออมไม่มีวันจริง จึงไม่มี date. */
const reconcileSavingsLedger = (
  ledger: BankLedger,
  savingsId: string,
  oldDeduction: SavingsSideEffectRefs | undefined,
  newDeduction: SavingsSideEffectRefs | undefined,
  label: string,
): BankLedger =>
  reconcileItemDeduction(
    ledger,
    (tx) => tx.source.type === 'savings' && tx.source.savingsId === savingsId,
    { type: 'savings', savingsId },
    oldDeduction,
    newDeduction,
    label,
  );
```

เพิ่ม import type ให้ครบที่หัวไฟล์ (ถ้ายังไม่มี): `BankTxSource`, `SavingsSideEffectRefs` — `BankTransaction`, `SavingsItem` มีอยู่แล้ว (บรรทัด ~49)

- [ ] **Step 3.2: เพิ่ม `savingsDeductionOf`**

วางถัดจาก `expenseDeductionOf` (~269):

```ts
/** The deduction a savings item SHOULD have (none when no payment account is set). */
const savingsDeductionOf = (
  item: Pick<SavingsItem, 'paymentAccountId' | 'amount'>,
  year: number,
  month: number,
): SavingsSideEffectRefs | undefined =>
  item.paymentAccountId
    ? {
        accountId: item.paymentAccountId,
        deductYear: year,
        deductMonth: month,
        deductAmount: item.amount,
      }
    : undefined;
```

- [ ] **Step 3.3: ต่อท่อ `addSavings`** (financeStore.ts:2288)

แทนที่ทั้ง action ด้วย (mirror `addExpense:837` — ตัวแปรชื่อ `ledgerPatch` shadow ฟังก์ชันเหมือนที่ expense ทำ ไม่เป็นไร):

```ts
      addSavings: (year, month, item) =>
        set((state) => {
          const years = ensureYear(state.data.years, year);
          const key = String(year);
          const current = normalizeYear(years[key]);
          const newItem: SavingsItem = { ...item, id: uuidv4() };
          const newDed = savingsDeductionOf(newItem, year, month);
          if (newDed) newItem.sideEffects = newDed;
          // จ่ายผ่านบัญชี → จดรายการหักผ่านประตูเดียว (F40/F53). ไม่มีบัญชี
          // จ่าย = ไม่แตะ ledger.
          const ledgerPatch = newDed
            ? withLedger(state.data, (l) =>
                reconcileSavingsLedger(l, newItem.id, undefined, newDed, newItem.name),
              )
            : {};
          const monthRow = current.savings.find((s) => s.month === month);
          const nextSavings: MonthlySavings[] = monthRow
            ? current.savings.map((s) =>
                s.month === month ? { ...s, items: [...s.items, newItem] } : s,
              )
            : [...current.savings, { month, items: [newItem] }];
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...years,
                [key]: { ...current, savings: nextSavings },
              },
              ...ledgerPatch,
            },
            lastUpdated: stamp,
          };
        }),
```

- [ ] **Step 3.4: ต่อท่อ `updateSavings`**

แทนที่ทั้ง action (mirror `updateExpense:893` — เพิ่ม early-return เมื่อไม่เจอ item เหมือน expense):

```ts
      updateSavings: (year, month, itemId, patch) =>
        set((state) => {
          const key = String(year);
          const raw = state.data.years[key];
          if (!raw) return state;
          const current = normalizeYear(raw);
          const monthRow = current.savings.find((s) => s.month === month);
          const old = monthRow?.items.find((it) => it.id === itemId);
          if (!old) return state;

          const merged: SavingsItem = { ...old, ...patch, id: old.id };
          const newDed = savingsDeductionOf(merged, year, month);
          if (newDed) merged.sideEffects = newDed;
          else delete merged.sideEffects;

          // แก้ยอด/ย้ายบัญชี/ถอดบัญชี → บรรทัดเดิมของ itemId ถูกแทนที่ (หรือ
          // หาย) ผ่านประตูเดียว (F40/F53); revoke คืนยอดด้วย tx.amount ที่ลงจริง.
          const ledgerPatch =
            state.data.bankAccounts !== undefined
              ? withLedger(state.data, (l) =>
                  reconcileSavingsLedger(l, itemId, old.sideEffects, newDed, merged.name),
                )
              : {};

          const nextSavings = current.savings.map((row) =>
            row.month === month
              ? {
                  ...row,
                  items: row.items.map((it) => (it.id === itemId ? merged : it)),
                }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, savings: nextSavings },
              },
              ...ledgerPatch,
            },
            lastUpdated: stamp,
          };
        }),
```

- [ ] **Step 3.5: ต่อท่อ `deleteSavings`**

แทนที่ทั้ง action (mirror `deleteExpense:946`):

```ts
      deleteSavings: (year, month, itemId) =>
        set((state) => {
          const key = String(year);
          const raw = state.data.years[key];
          if (!raw) return state;
          const current = normalizeYear(raw);
          const monthRow = current.savings.find((s) => s.month === month);
          const target = monthRow?.items.find((it) => it.id === itemId);
          // ลบ = reconcile ด้วย movement ว่าง → revoke บรรทัดของ itemId ทิ้ง +
          // คืนยอดด้วย tx.amount ที่เคยหักจริง (F53). ไม่มี target/บัญชี → ไม่แตะ.
          const ledgerPatch =
            target && state.data.bankAccounts !== undefined
              ? withLedger(state.data, (l) =>
                  reconcileSavingsLedger(l, itemId, target.sideEffects, undefined, target.name),
                )
              : {};
          // Mirror the expense-delete pattern: preserve the (possibly empty)
          // month row to retain the "this month was tracked" signal.
          const nextSavings = current.savings.map((row) =>
            row.month === month
              ? { ...row, items: row.items.filter((it) => it.id !== itemId) }
              : row,
          );
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              years: {
                ...state.data.years,
                [key]: { ...current, savings: nextSavings },
              },
              ...ledgerPatch,
            },
            lastUpdated: stamp,
          };
        }),
```

- [ ] **Step 3.6: กัน `deleteBankTransaction` ลบบรรทัด savings** (financeStore.ts:~2197)

เพิ่ม `'savings'` ใน guard (คอมเมนต์เดิมอธิบายอยู่แล้ว: ของที่มาจากต้นทางต้องไปลบที่ต้นทาง):

```ts
          if (
            !tx ||
            tx.source.type === 'income' ||
            tx.source.type === 'expense' ||
            tx.source.type === 'savings' ||
            tx.source.type === 'gold' ||
            tx.source.type === 'backfill'
          ) {
            return state;
          }
```

- [ ] **Step 3.7: typecheck + รัน verify script + ประตูเดิมของ expense**

```bash
npm run typecheck
npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-installment-deduction.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-legacy-expense-deduction.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
```

Expected: typecheck PASS. verify-savings-payment: เคส 1-6, 9, 10 ✓ (เคส 7 F44 กับเคส 8 ทองยังแดง — Task 4/5). expense/installment/legacy/bank-transactions ต้องเขียวหมด — ถ้าแดงแปลว่า refactor เปลี่ยนพฤติกรรม expense: **หยุดแก้จนเขียว**

- [ ] **Step 3.8: Commit**

```bash
git add src/stores/financeStore.ts
git commit -m "feat(savings): จ่ายผ่านบัญชี — หัก/คืนยอดผ่าน ledger ประตูเดียว (F53)"
```

---

### Task 4: F44 — รายการออมผูกบัญชีต้องบล็อกการลบบัญชี

**Files:**
- Modify: `src/utils/bankAccountUsage.ts`
- Modify: `src/utils/actionMessages.ts:83-108`
- Modify: `src/pages/BankAccountsPage.tsx:57-64`
- Modify: `scripts/verify-action-messages.ts:69-75`

- [ ] **Step 4.1: `bankAccountUsage.ts` — เพิ่ม `savings`**

Interface: เพิ่มหลัง `expenses`:

```ts
  /** id ของรายจ่ายที่จ่ายผ่านบัญชีนี้. */
  expenses: readonly string[];
  /** id ของรายการออมที่จ่ายผ่านบัญชีนี้ (F53). */
  savings: readonly string[];
```

ใน `findBankAccountUsage`: ประกาศ `const savings: string[] = [];` คู่กับ `expenses`, แล้วในลูป years เพิ่มหลังลูป expenses:

```ts
    // savings อาจไม่มีบน year scaffold รุ่นเก่า — treat as empty.
    for (const month of year.savings ?? []) {
      for (const item of month.items) {
        if (item.paymentAccountId === accountId || item.sideEffects?.accountId === accountId) {
          savings.push(item.id);
        }
      }
    }
```

คืน `savings` ใน return object และเพิ่มใน `isBankAccountDeletable`:

```ts
  return (
    usage.incomeMonths.length === 0 &&
    usage.expenses.length === 0 &&
    usage.savings.length === 0 &&
    usage.goldHoldings.length === 0 &&
    usage.transfers === 0
  );
```

- [ ] **Step 4.2: `actionMessages.ts` — เหตุผลบล็อกนับออมด้วย**

`BankAccountBlockedInput` เพิ่ม `savings: number;` หลัง `expenses`. ใน `bankAccountBlockedReason` เพิ่มบรรทัดหลัง expenses:

```ts
    expenses > 0 ? `รายจ่าย ${expenses} รายการ` : null,
    savings > 0 ? `รายการออม ${savings} รายการ` : null,
    goldHoldings > 0 ? `ทองคำ ${goldHoldings} รายการ` : null,
```

(อย่าลืมเพิ่ม `savings` ใน destructured params ของฟังก์ชัน)

- [ ] **Step 4.3: `BankAccountsPage.tsx` ส่งค่าเพิ่ม**

```ts
  const blockedReason = pendingUsage
    ? bankAccountBlockedReason({
        incomeMonths: pendingUsage.incomeMonths.length,
        expenses: pendingUsage.expenses.length,
        savings: pendingUsage.savings.length,
        goldHoldings: pendingUsage.goldHoldings.length,
        transfers: pendingUsage.transfers,
      })
    : '';
```

- [ ] **Step 4.4: อัปเดต `scripts/verify-action-messages.ts`**

call sites สามที่ (บรรทัด 69/72/75) เพิ่ม `savings: 0` และเพิ่มเคสใหม่หนึ่งบรรทัดถัดจากเคสบรรทัด 72 (ดู `eq` signature ของไฟล์นั้นแล้วเขียนให้เข้ารูปแบบเดิม):

```ts
eq(
  'blocked มีออม',
  bankAccountBlockedReason({ incomeMonths: 0, expenses: 0, savings: 2, goldHoldings: 0, transfers: 0 }),
  'รายการออม 2 รายการ',
);
```

- [ ] **Step 4.5: รันตรวจ**

```bash
npm run typecheck
npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-delete-bank-account.ts
```

Expected: verify-savings-payment เคส 7 เขียวเพิ่ม (เหลือเคส 8 ทอง). อีกสองไฟล์เขียวหมด (verify-delete-bank-account ถ้า construct usage เองแล้ว TS/รันพัง ให้เติม `savings` ตามรูปแบบเดิมของไฟล์)

- [ ] **Step 4.6: Commit**

```bash
git add src/utils/bankAccountUsage.ts src/utils/actionMessages.ts src/pages/BankAccountsPage.tsx scripts/verify-action-messages.ts scripts/verify-delete-bank-account.ts
git commit -m "fix(accounts): รายการออมที่ผูกบัญชีบล็อกการลบบัญชี (F44×F53)"
```

(ถ้าไม่ได้แตะ verify-delete-bank-account.ts ก็ไม่ต้อง add)

---

### Task 5: ลบทองต้อง revoke บรรทัดออมของ item ที่มันสร้าง

**Files:**
- Modify: `src/stores/financeStore.ts` — `deleteGoldHolding` branch `se.savingsItemId` (~1338-1365)

- [ ] **Step 5.1: เพิ่ม revoke ใน branch ลบ savings item**

ใน `deleteGoldHolding`, ภายใน `if (se.savingsItemId && se.savingsYear != null && se.savingsMonth != null)` — **หลัง**โค้ดที่สร้าง `nextYears` (การลบ item เดิม) เพิ่ม:

```ts
              // F53: item ออมที่ทองสร้างอาจถูกแก้ให้ผูกบัญชีทีหลัง — การลบ
              // inline ตรงนี้ไม่ผ่าน deleteSavings จึงต้อง revoke บรรทัดหัก
              // ของมันเองด้วย ไม่งั้นยอดหักค้างโดยไม่เหลือต้นทางให้ตามลบ.
              // (savings เกิดหลัง F40 — มี sideEffects เมื่อไหร่มีบรรทัดเสมอ)
              const savingsId = se.savingsItemId;
              const hasSavingsLine = (state.data.bankTransactions ?? []).some(
                (tx) => tx.source.type === 'savings' && tx.source.savingsId === savingsId,
              );
              if (hasSavingsLine) {
                const patch = withLedger(state.data, (l) =>
                  revokeBankMovements(
                    l,
                    (tx) => tx.source.type === 'savings' && tx.source.savingsId === savingsId,
                  ),
                );
                nextBankAccounts = patch.bankAccounts;
                nextBankTransactions = patch.bankTransactions;
              }
```

(`revokeBankMovements` และ `withLedger` ถูก import/ประกาศแล้วในไฟล์ — branch `kept` ข้างล่างใช้อยู่. ตัวแปร `nextBankAccounts`/`nextBankTransactions` ประกาศเป็น `let` อยู่แล้วที่ ~1335-1336. ที่ต้องดึง `se.savingsItemId` ลง `const savingsId` ก่อนเพราะ TS narrow ไม่ทะลุเข้า closure ของ callback)

- [ ] **Step 5.2: รันตรวจ**

```bash
npm run typecheck
npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
```

Expected: **✅ ALL PASS ทั้ง 10 เคส**

- [ ] **Step 5.3: Commit**

```bash
git add src/stores/financeStore.ts
git commit -m "fix(gold): ลบทองแล้ว revoke บรรทัดหักของ item ออมที่มันสร้างด้วย (F53)"
```

---

### Task 6: SavingsForm — dropdown "จ่ายผ่าน"

**Files:**
- Modify: `src/components/forms/SavingsForm.tsx`

- [ ] **Step 6.1: เพิ่ม state + selector**

Imports: เพิ่ม `EMPTY_BANK_ACCOUNTS` จาก `@/stores/emptyRefs` (ดูชื่อ export จริงในไฟล์นั้นก่อน — ExpenseForm.tsx:136 ใช้อยู่ ลอก import จากตรงนั้น)

ใน component body (ใต้ `const updateSavings = ...`):

```ts
  const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);
```

State (ใต้ `isRecurring`):

```ts
  const [paymentAccountId, setPaymentAccountId] = useState<string>(
    initialValues?.paymentAccountId ?? '',
  );
```

Id (ใต้ `recurringId`): `const paymentAccountFieldId = useId();`

- [ ] **Step 6.2: เพิ่ม dropdown ใน JSX**

แทรกระหว่างบล็อก `{/* Amount */}` กับ `{/* Recurring toggle */}` — ซ่อนทั้งก้อนเมื่อยังไม่มีบัญชี (เหมือนยังไม่มีฟีเจอร์):

```tsx
      {/* Payment account (F53) — mirror ExpenseForm's "จ่ายผ่าน" */}
      {accounts.length > 0 && (
        <div>
          <label htmlFor={paymentAccountFieldId} className={labelClass}>
            จ่ายผ่าน
          </label>
          <select
            id={paymentAccountFieldId}
            value={paymentAccountId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setPaymentAccountId(e.target.value)
            }
            className={inputBaseClass}
          >
            <option value="">ไม่ระบุ (ไม่หักบัญชี)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
```

- [ ] **Step 6.3: ส่งค่าเข้า store ใน `persist`**

ทั้งสอง call site (update + add) เพิ่ม field เดียวกัน:

```ts
      updateSavings(year, month, initialValues.id, {
        category,
        name: trimmedName,
        amount,
        isRecurring,
        paymentAccountId: paymentAccountId || undefined,
      });
```

```ts
    addSavings(year, month, {
      category,
      name: trimmedName,
      amount,
      isRecurring,
      paymentAccountId: paymentAccountId || undefined,
    });
```

(payload ของ `onSaved` สอง call site ไม่ต้องเพิ่ม field — ผู้บริโภคใช้แค่ toast/ปิด modal; ถ้า typecheck บ่นเรื่อง exactOptionalPropertyTypes ให้ใช้ spread แบบมีเงื่อนไข `...(paymentAccountId ? { paymentAccountId } : {})` แทน)

Quick-add reset (ใน `if (continueAdding)`) — **ไม่ reset** `paymentAccountId` (เหมือน category ที่คงไว้: กรอกหลายรายการจากบัญชีเดียวกันติดกันเป็นเคสปกติ)

- [ ] **Step 6.4: ตรวจ + ดูจริงในแอป**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: PASS ทั้งสาม. แล้วเปิด `npm run dev` เช็คด้วยตาหรือขอ Tom เช็ค: หน้า รายเดือน → เพิ่ม/แก้รายการออม → เห็น dropdown "จ่ายผ่าน", เลือกบัญชีแล้วบันทึก → ยอดบัญชีในหน้า บัญชีธนาคาร ลดลง + มีบรรทัด "💎 ออม" ในรายการเดินบัญชี (ไม่มีปุ่มลบ)

- [ ] **Step 6.5: Commit**

```bash
git add src/components/forms/SavingsForm.tsx
git commit -m "feat(savings): ฟอร์มออมมี dropdown จ่ายผ่าน — เลือกบัญชีแล้วหักยอดจริง (F53)"
```

---

### Task 7: features.json + ประตูรวม

**Files:**
- Modify: `features.json`

- [ ] **Step 7.1: เพิ่ม F53**

อ่านโครง entry ล่าสุดก่อน: `grep -n '"F52"' features.json` แล้วดู entry นั้นเต็ม ๆ เป็นแม่แบบ. เพิ่ม F53 ต่อท้ายรายการ features ด้วยโครงเดียวกัน:
- id `F53`, ชื่อ: `รายการออมระบุ "จ่ายผ่าน" บัญชี — หักยอดจริงเหมือนรายจ่าย`
- `status: "completed"`, `completedAt`: วันนี้ (ISO)
- acceptance criteria ตาม spec: (1) SavingsForm มี dropdown จ่ายผ่าน (2) add/edit/delete หัก-คืนยอดผ่าน `ledgerPatch()` ครบ (3) บรรทัด `{type:'savings'}` ลบตรงจากสมุดไม่ได้ (4) บัญชีที่มีออมผูกลบไม่ได้ (F44) (5) ลบทองแล้ว revoke บรรทัดออมของ item ที่มันสร้าง (6) `scripts/verify-savings-payment.ts` เขียว 10 เคส
- อัปเดต `progressSummary` ถ้ามีตัวนับ

- [ ] **Step 7.2: ประตูรวมรอบสุดท้าย**

```bash
npm run typecheck && npm run lint && npm run build
npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-installment-deduction.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-legacy-expense-deduction.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-transactions.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-delete-bank-account.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-journal-backfill.ts
```

Expected: เขียวทั้งหมด (diff นี้ไม่แตะ mobile/analytics/pwa — ไม่ต้องรัน gate พวกนั้น)

- [ ] **Step 7.3: Commit**

```bash
git add features.json
git commit -m "docs: F53 เสร็จ — รายการออมระบุจ่ายผ่านบัญชี หักยอดจริง"
```
