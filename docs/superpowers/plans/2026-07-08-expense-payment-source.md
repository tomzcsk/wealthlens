# Expense Payment Source (F34) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ให้รายจ่ายเลือก "จ่ายผ่าน" บัญชี (เงินสด/ธนาคาร) แบบ optional แล้วหักยอดบัญชีเดือนนั้นอัตโนมัติ + แก้/ลบ คืนยอดถูกต้อง โดยไม่กระทบข้อมูลเดิม (ผ่อน = ไม่หัก)

**Architecture:** mirror gold 'kept' dual-write. เพิ่ม optional `paymentAccountId` + `sideEffects` บน `ExpenseItem`. ตรรกะหัก/คืนย้ายเป็น pure helper (`applyBankDelta`, `reconcileBankDeduction`) ใน `utils/bankAccounts.ts` เพื่อ test ได้ — store แค่เรียกใช้. ปี/เดือน มาจาก args ของ action เสมอ.

**Tech Stack:** React 18 + TS strict, Zustand. Verify = `npx tsx --tsconfig tsconfig.app.json scripts/verify-*.ts`.

**Spec:** docs/superpowers/specs/2026-07-08-expense-payment-source-design.md

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|------|---------|-------|
| `src/types/index.ts` | +`ExpenseSideEffectRefs`, +`paymentAccountId?`/`sideEffects?` บน ExpenseItem | แก้ |
| `src/utils/bankAccounts.ts` | +`applyBankDelta`, `reconcileBankDeduction`, `expenseDeductionOf` (pure) | แก้ |
| `scripts/verify-expense-payment.ts` | verify pure reconcile logic ทุกเคส | ใหม่ |
| `src/stores/financeStore.ts` | addExpense/updateExpense/deleteExpense หัก+คืน | แก้ |
| `src/components/forms/ExpenseForm.tsx` | dropdown "จ่ายผ่าน" | แก้ |
| `src/components/forms/ExpenseList.tsx` | badge แหล่งจ่าย | แก้ |
| `features.json` | F34 | แก้ |

---

## Task 1: Types + pure helpers + verify

**Files:** Modify `src/types/index.ts`, `src/utils/bankAccounts.ts`; Create `scripts/verify-expense-payment.ts`.

- [ ] **Step 1: Types** — in `src/types/index.ts`:
  - Add interface (near ExpenseItem):
    ```ts
    export interface ExpenseSideEffectRefs {
      /** บัญชีที่ถูกหัก (BankAccount.id). */
      accountId: string;
      /** ปี/เดือนที่หัก = ของ MonthlyExpense ที่รายการอยู่. */
      deductYear: number;
      deductMonth: number;
      /** ยอดที่หักไป (revert = บวกกลับเท่านี้). */
      deductAmount: number;
    }
    ```
  - On `ExpenseItem`, after `installment?: InstallmentMeta;` add:
    ```ts
    /** บัญชีที่จ่ายรายการนี้ (รวมบัญชี 'เงินสด'). ไม่ระบุ = ไม่หักบัญชี. */
    paymentAccountId?: string;
    /** Ref เพื่อ revert การหักยอดบัญชี. */
    sideEffects?: ExpenseSideEffectRefs;
    ```

- [ ] **Step 2: Write verify FIRST** — Create `scripts/verify-expense-payment.ts`:
```ts
/**
 * Verification for expense payment-source deduction (F34).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
 */
import type { BankAccount, ExpenseSideEffectRefs } from '../src/types';
import {
  applyBankDelta,
  reconcileBankDeduction,
} from '../src/utils/bankAccounts';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};
const bal = (accts: BankAccount[], id: string, y: number, m: number): number =>
  accts.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;
const mk = (): BankAccount[] => [
  { id: 'A', name: 'A', balances: { '2026': { '7': 1000 } } },
  { id: 'B', name: 'B', balances: {} },
];
const ded = (
  accountId: string,
  amount: number,
): ExpenseSideEffectRefs => ({
  accountId,
  deductYear: 2026,
  deductMonth: 7,
  deductAmount: amount,
});

// --- applyBankDelta: immutable, creates month, no-op when account missing ---
const a1 = applyBankDelta(mk(), 'A', 2026, 7, -300);
eq('applyBankDelta หัก', bal(a1, 'A', 2026, 7), 700);
eq('applyBankDelta ไม่ mutate ต้นฉบับ', bal(mk(), 'A', 2026, 7), 1000);
const a2 = applyBankDelta(mk(), 'B', 2026, 8, -50);
eq('applyBankDelta สร้างเดือนใหม่', bal(a2, 'B', 2026, 8), -50);
const a3 = applyBankDelta(mk(), 'ghost', 2026, 7, -999);
eq('applyBankDelta บัญชีหาย = ไม่เปลี่ยน', bal(a3, 'A', 2026, 7), 1000);

// --- reconcile: add (old=undefined, new=ded) ---
const add = reconcileBankDeduction(mk(), undefined, ded('A', 200));
eq('add หัก A', bal(add, 'A', 2026, 7), 800);

// --- reconcile: delete (old=ded, new=undefined) → คืนเต็ม ---
const del = reconcileBankDeduction(add, ded('A', 200), undefined);
eq('delete คืน A', bal(del, 'A', 2026, 7), 1000);

// --- reconcile: แก้ยอด 200→350 (net −150 เพิ่ม) ---
const chg = reconcileBankDeduction(add, ded('A', 200), ded('A', 350));
eq('แก้ยอด A', bal(chg, 'A', 2026, 7), 650);

// --- reconcile: เปลี่ยนบัญชี A→B ---
const mv = reconcileBankDeduction(add, ded('A', 200), ded('B', 200));
eq('ย้าย: A คืน', bal(mv, 'A', 2026, 7), 1000);
eq('ย้าย: B หัก', bal(mv, 'B', 2026, 7), -200);

// --- reconcile: reimbursement flip (old==new) → ยอดไม่ขยับ ---
const same = reconcileBankDeduction(add, ded('A', 200), ded('A', 200));
eq('เบิก flip ไม่หักซ้ำ', bal(same, 'A', 2026, 7), 800);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
```
Run → FAIL (helpers ไม่มี). Expected.

- [ ] **Step 3: Implement helpers** — append to `src/utils/bankAccounts.ts`:
```ts
import type { ExpenseSideEffectRefs } from '@/types';

/**
 * Immutably add `delta` to `accounts[accountId].balances[year][month]`.
 * Creates the year/month entry if missing. Returns a NEW array (a shallow
 * copy when the account isn't found — silent no-op, matching gold's revert).
 */
export const applyBankDelta = (
  accounts: readonly BankAccount[],
  accountId: string,
  year: number,
  month: number,
  delta: number,
): BankAccount[] => {
  const yKey = String(year);
  const mKey = String(month);
  let found = false;
  const next = accounts.map((a) => {
    if (a.id !== accountId) return a;
    found = true;
    return {
      ...a,
      balances: {
        ...a.balances,
        [yKey]: {
          ...(a.balances[yKey] ?? {}),
          [mKey]: (a.balances[yKey]?.[mKey] ?? 0) + delta,
        },
      },
    };
  });
  return found ? next : accounts.slice();
};

/**
 * Reconcile a per-expense account deduction: revert `oldDed` (add its amount
 * back) then apply `newDed` (subtract its amount). Either may be undefined —
 * add = (undefined, new), delete = (old, undefined), edit = (old, new).
 * Correct even when old and new hit the same account/month (chained deltas).
 */
export const reconcileBankDeduction = (
  accounts: readonly BankAccount[],
  oldDed: ExpenseSideEffectRefs | undefined,
  newDed: ExpenseSideEffectRefs | undefined,
): BankAccount[] => {
  let next: BankAccount[] = accounts.slice();
  if (oldDed) {
    next = applyBankDelta(
      next,
      oldDed.accountId,
      oldDed.deductYear,
      oldDed.deductMonth,
      +oldDed.deductAmount,
    );
  }
  if (newDed) {
    next = applyBankDelta(
      next,
      newDed.accountId,
      newDed.deductYear,
      newDed.deductMonth,
      -newDed.deductAmount,
    );
  }
  return next;
};
```

- [ ] **Step 4: Run verify → PASS**; **Step 5: typecheck**; **Step 6: Commit**
```bash
git add src/types/index.ts src/utils/bankAccounts.ts scripts/verify-expense-payment.ts
git commit -m "feat(expense): payment-source types + pure deduction helpers + verify (F34)"
```

---

## Task 2: Store actions — deduct on add/update/delete

**Files:** Modify `src/stores/financeStore.ts` (addExpense ~481, updateExpense ~520, deleteExpense ~549).

Import at top (add to the `@/utils/bankAccounts` import or a new one, plus the type):
`import { applyBankDelta, reconcileBankDeduction } from '@/utils/bankAccounts';` and add `ExpenseSideEffectRefs` to the `@/types` import.

Add a small local helper near the top of the store module (after imports):
```ts
/** The deduction an expense SHOULD have (none for no-account or installment rows). */
const expenseDeductionOf = (
  item: Pick<ExpenseItem, 'paymentAccountId' | 'amount' | 'installment'>,
  year: number,
  month: number,
): ExpenseSideEffectRefs | undefined =>
  item.paymentAccountId && !item.installment
    ? {
        accountId: item.paymentAccountId,
        deductYear: year,
        deductMonth: month,
        deductAmount: item.amount,
      }
    : undefined;
```

- [ ] **Step 1: `addExpense`** — after `const newItem: ExpenseItem = { ...item, id: uuidv4() };` compute the deduction and (if any) stamp it + prepare bankAccounts:
```ts
const newDed = expenseDeductionOf(newItem, year, month);
if (newDed) newItem.sideEffects = newDed;
const nextBankAccounts = newDed
  ? reconcileBankDeduction(state.data.bankAccounts ?? [], undefined, newDed)
  : state.data.bankAccounts;
```
Then in the returned `data`, add `...(nextBankAccounts ? { bankAccounts: nextBankAccounts } : {})` alongside `years: finalYears`. (Keep the existing car-installment tagging untouched — it only mutates `years`.)

- [ ] **Step 2: `updateExpense`** — reconcile old vs new. Replace the body so it: finds the old item, builds `merged`, computes old/new deductions, updates bankAccounts, and writes `merged` (with corrected sideEffects) back:
```ts
updateExpense: (year, month, itemId, patch) =>
  set((state) => {
    const key = String(year);
    const current = state.data.years[key];
    if (!current) return state;
    const monthRow = current.expenses.find((e) => e.month === month);
    const old = monthRow?.items.find((it) => it.id === itemId);
    if (!old) return state;

    const merged: ExpenseItem = { ...old, ...patch, id: old.id };
    const oldDed = old.sideEffects;
    const newDed = expenseDeductionOf(merged, year, month);
    if (newDed) merged.sideEffects = newDed;
    else delete merged.sideEffects;

    const nextBankAccounts = reconcileBankDeduction(
      state.data.bankAccounts ?? [],
      oldDed,
      newDed,
    );

    const nextExpenses = current.expenses.map((row) =>
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
          [key]: { ...current, expenses: nextExpenses },
        },
        bankAccounts: nextBankAccounts,
      },
      lastUpdated: stamp,
    };
  }),
```
(Note: `reconcileBankDeduction(accounts, undefined, undefined)` returns a copy — harmless when neither side deducts. Always writing `bankAccounts` is fine since it's `?? []`→[] only when there were none; guard with `...(state.data.bankAccounts ? { bankAccounts: nextBankAccounts } : {})` if you prefer not to introduce an empty array — either is acceptable, keep it simple and always set it when `state.data.bankAccounts` exists.)

- [ ] **Step 3: `deleteExpense`** — read the target's sideEffects before filtering, then revert:
```ts
deleteExpense: (year, month, itemId) =>
  set((state) => {
    const key = String(year);
    const current = state.data.years[key];
    if (!current) return state;
    const monthRow = current.expenses.find((e) => e.month === month);
    const target = monthRow?.items.find((it) => it.id === itemId);
    const nextBankAccounts = target?.sideEffects
      ? reconcileBankDeduction(state.data.bankAccounts ?? [], target.sideEffects, undefined)
      : state.data.bankAccounts;
    const nextExpenses = current.expenses.map((row) =>
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
          [key]: { ...current, expenses: nextExpenses },
        },
        ...(nextBankAccounts ? { bankAccounts: nextBankAccounts } : {}),
      },
      lastUpdated: stamp,
    };
  }),
```

- [ ] **Step 4: verify + typecheck + build** (verify-expense-payment still ✅; also re-run verify-bank-accounts/multi-loan/income → no regress). **Step 5: Commit**
```bash
git add src/stores/financeStore.ts
git commit -m "feat(expense): หัก/คืน ยอดบัญชี ตาม paymentAccountId (add/update/delete) (F34)"
```

---

## Task 3: ExpenseForm — dropdown "จ่ายผ่าน"

**Files:** Modify `src/components/forms/ExpenseForm.tsx`.

READ the file first (fields, `useState`, the category `<select>`, the add vs edit `persist()` branch that calls addExpense/updateExpense).

- [ ] **Step 1:** add `const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);` and state `const [paymentAccountId, setPaymentAccountId] = useState<string>(initial?.paymentAccountId ?? '');` (preload in edit mode).
- [ ] **Step 2:** below the category select, add a "จ่ายผ่าน" `<select>` (mirror the category select markup). Options: a first `<option value="">ไม่ระบุ (ไม่หักบัญชี)</option>` then `accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>`. **Hide the whole control when editing an installment row** (`initial?.installment` present) — installments don't deduct.
- [ ] **Step 3:** in the persist payload for BOTH add and update, include `paymentAccountId: paymentAccountId || undefined`. (undefined clears it on update; `expenseDeductionOf` treats falsy as no-deduction.)
- [ ] **Step 4:** typecheck + build; browser smoke (add expense choosing an account → that account's balance drops on /accounts + monthly). **Commit**
```bash
git add src/components/forms/ExpenseForm.tsx
git commit -m "feat(expense): ExpenseForm dropdown 'จ่ายผ่าน' (บัญชี/เงินสด) (F34)"
```

---

## Task 4: ExpenseList — payment-source badge

**Files:** Modify `src/components/forms/ExpenseList.tsx`.

READ the row render (badge cluster near the name / date). 

- [ ] **Step 1:** read accounts `const accounts = useFinanceStore((s) => s.data.bankAccounts ?? []);` (or a lookup map). For a row with `item.paymentAccountId`, resolve the account name; render a small chip alongside the existing date/reimbursement badges, e.g.:
```tsx
{item.paymentAccountId && (() => {
  const acct = accounts.find((a) => a.id === item.paymentAccountId);
  return acct ? (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 bg-slate-100">
      💳 {acct.name}
    </span>
  ) : null;
})()}
```
- [ ] **Step 2:** typecheck + build; browser smoke (badge shows). **Commit**
```bash
git add src/components/forms/ExpenseList.tsx
git commit -m "feat(expense): badge แหล่งจ่ายในรายการรายจ่าย (F34)"
```

---

## Task 5: features.json F34 + final verify

- [ ] **Step 1:** add F34 to `phases[4].features` (completed, acceptanceCriteria จาก spec §6), bump `progressSummary` totals +1.
- [ ] **Step 2:** final gate — `verify-expense-payment` + `verify-bank-accounts` + `verify-multi-loan` + `verify-income-totals` ทั้งหมด ✅; `npm run typecheck && npm run build` เขียว; JSON valid.
- [ ] **Step 3:** Commit `docs: mark F34 completed`.

---

## Definition of Done
- [ ] verify-expense-payment ✅ (add/delete/แก้ยอด/ย้ายบัญชี/เบิก-ไม่หักซ้ำ/บัญชีหาย)
- [ ] เลือกจ่ายผ่านบัญชี → ยอดบัญชีลด; ลบ/แก้ → คืน/ปรับถูก; ผ่อนไม่มีช่องจ่ายผ่าน
- [ ] ข้อมูลเดิม (ไม่มี paymentAccountId) ไม่หัก, ยอดเดิมไม่เพี้ยน; verify อื่นไม่ regress
- [ ] typecheck + build เขียว
