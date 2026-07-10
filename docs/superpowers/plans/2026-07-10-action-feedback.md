# Action Feedback (F43) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุก action ที่เขียนข้อมูลบอกผู้ใช้ว่าเกิดอะไรขึ้น — และบอกผลข้างเคียงที่มองไม่เห็น (เงินขยับในอีกหน้าหนึ่ง) ด้วย

**Architecture:** ข้อความ toast ทั้งหมดมาจาก pure functions ใน `src/utils/actionMessages.ts` (ไม่ import React ไม่ import store) component แค่เรียกแล้วส่งเข้า `pushToast` ที่มีอยู่แล้ว ทดสอบข้อความด้วย verify script แบบ node ล้วน ตัว UI ตรวจด้วย Playwright

**Tech Stack:** React 19, Zustand, TypeScript strict, verify scripts รันด้วย `npx tsx`

**Spec:** `docs/superpowers/specs/2026-07-10-action-feedback-design.md`

---

## หมายเหตุก่อนเริ่ม

**ไม่มี test runner** ในโปรเจกต์นี้ ทดสอบด้วย `scripts/verify-*.ts` รันด้วย
`npx tsx --tsconfig tsconfig.app.json scripts/verify-x.ts` แล้ว `process.exit(failures)`
อ่าน `scripts/verify-motion.ts` เพื่อดู house style ก่อนเริ่ม

**กฎที่รู้มาแล้วจาก F42 — อย่าเสียเวลาเรียนใหม่:**
- eslint `react-hooks/refs`: ห้ามอ่าน/เขียน ref ระหว่าง render
- eslint `react-refresh/only-export-components`: ไฟล์ `.tsx` export เฉพาะ component
- เงินทุกก้อน format ผ่าน `utils/formatters.ts` (`formatTHB`) เดือนไทยผ่าน `formatThaiMonth`

**สิ่งที่มีอยู่แล้ว (อย่าสร้างใหม่):**
- `useToastStore((s) => s.push)` → `pushToast({ message, tone })` โดย tone = `'success' | 'error' | 'info'`
- `ExpenseForm` เรียก `onSaved(item, continueAdding)` — `item: ExpenseItem` มี `.name`, `.amount`, `.paymentAccountId?`
- `SavingsForm` เรียก `onSaved(item, continueAdding)` — `item: SavingsItem` มี `.name`, `.amount`
- component อ่านบัญชีด้วย `useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS)` (ดู `ExpenseForm.tsx:136`)
- `MonthTransactionList.tsx` มี `DELETABLE` set (บรรทัด 32) และ `canDelete` (บรรทัด 83) — ปุ่ม ✕ โผล่เฉพาะแถวที่ลบได้อยู่แล้ว **ห้ามทำให้ปุ่มโผล่ในแถวที่ห้ามลบ**

---

## File Structure

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `src/utils/actionMessages.ts` (ใหม่) | ปั้นข้อความ toast ทุกอัน — pure, ไม่รู้จัก React |
| `scripts/verify-action-messages.ts` (ใหม่) | ทดสอบข้อความ |
| `src/components/forms/ExpenseList.tsx` | toast: เพิ่ม/แก้/ลบ รายจ่าย |
| `src/components/forms/IncomeForm.tsx` | toast: บันทึก/ลบ รายได้ (ยิงทุกครั้ง) |
| `src/components/forms/SavingsList.tsx` | toast: เพิ่ม/แก้/ลบ เงินออม |
| `src/components/accounts/MonthTransactionList.tsx` | inline confirm + ส่ง callback ที่ toast ได้ |
| `src/components/accounts/BankAccountDetail.tsx` | toast: ลบรายการเดินบัญชี |

---

### Task 1: `actionMessages.ts` + verify (pure, TDD)

**Files:**
- Create: `src/utils/actionMessages.ts`
- Test: `scripts/verify-action-messages.ts`

- [ ] **Step 1: เขียน verify script ก่อน (ต้องล้มเหลว)**

```ts
/**
 * Verification for F43 — action feedback messages.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts
 */
import {
  bankTransactionDeletedMessage,
  expenseDeletedMessage,
  expenseSavedMessage,
  incomeDeletedMessage,
  incomeSavedMessage,
  savingDeletedMessage,
  savingSavedMessage,
} from '../src/utils/actionMessages';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}\n    got:      ${String(a)}\n    expected: ${String(b)}`);
};

// --- รายจ่าย ---------------------------------------------------------------
eq(
  'เพิ่มรายจ่าย ไม่ผูกบัญชี',
  expenseSavedMessage({ mode: 'add', amount: 1200 }),
  'บันทึกรายจ่ายแล้ว',
);
eq(
  'เพิ่มรายจ่าย ผูกบัญชี → บอกว่าหักจากไหน เท่าไร',
  expenseSavedMessage({ mode: 'add', amount: 1200, accountName: 'กรุงศรี' }),
  'บันทึกรายจ่ายแล้ว · หักจากกรุงศรี ฿1,200',
);
eq(
  'แก้รายจ่าย ผูกบัญชี',
  expenseSavedMessage({ mode: 'edit', amount: 1200.5, accountName: 'เงินสด' }),
  'แก้ไขรายจ่ายแล้ว · หักจากเงินสด ฿1,200.50',
);
eq(
  'ลบรายจ่าย ไม่ผูกบัญชี',
  expenseDeletedMessage({ name: 'ค่าไฟ' }),
  "ลบ 'ค่าไฟ' แล้ว",
);
eq(
  'ลบรายจ่าย ผูกบัญชี → บอกว่าคืนยอดให้บัญชีไหน',
  expenseDeletedMessage({ name: 'ค่าไฟ', accountName: 'กรุงศรี' }),
  "ลบ 'ค่าไฟ' แล้ว · คืนยอดกรุงศรี",
);

// --- รายได้ ---------------------------------------------------------------
eq(
  'บันทึกรายได้ ไม่มีเงินเข้าบัญชี',
  incomeSavedMessage({ mode: 'add', depositedAccounts: [] }),
  'บันทึกรายได้แล้ว',
);
eq(
  'บันทึกรายได้ เข้าบัญชีเดียว',
  incomeSavedMessage({ mode: 'add', depositedAccounts: ['กรุงศรี'] }),
  'บันทึกรายได้แล้ว · เงินเข้ากรุงศรี',
);
eq(
  'บันทึกรายได้ เข้าสองบัญชี',
  incomeSavedMessage({ mode: 'edit', depositedAccounts: ['กรุงศรี', 'เงินสด'] }),
  'แก้ไขรายได้แล้ว · เงินเข้ากรุงศรี, เงินสด',
);
eq(
  'ลบรายได้ ไม่มีบัญชีให้คืน',
  incomeDeletedMessage({ month: 3, revertedAccounts: [] }),
  'ลบรายได้ เม.ย. แล้ว',
);
eq(
  'ลบรายได้ คืนยอดบัญชี',
  incomeDeletedMessage({ month: 0, revertedAccounts: ['กรุงศรี'] }),
  'ลบรายได้ ม.ค. แล้ว · คืนยอดกรุงศรี',
);

// --- เงินออม --------------------------------------------------------------
eq('เพิ่มเงินออม', savingSavedMessage({ mode: 'add' }), 'บันทึกเงินออมแล้ว');
eq('แก้เงินออม', savingSavedMessage({ mode: 'edit' }), 'แก้ไขเงินออมแล้ว');
eq('ลบเงินออม', savingDeletedMessage({ name: 'ออมเที่ยว' }), "ลบ 'ออมเที่ยว' แล้ว");

// --- รายการเดินบัญชี ------------------------------------------------------
eq(
  'ลบรายการเดินบัญชี → บอกยอดที่ขยับ',
  bankTransactionDeletedMessage({ amount: -500 }),
  'ลบรายการแล้ว · ยอดบัญชีปรับ ฿500',
);
eq(
  'ลบรายการเดินบัญชี ฝั่งเข้า',
  bankTransactionDeletedMessage({ amount: 500 }),
  'ลบรายการแล้ว · ยอดบัญชีปรับ ฿500',
);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts`
Expected: FAIL — `Cannot find module '../src/utils/actionMessages'`

- [ ] **Step 3: เขียน `src/utils/actionMessages.ts`**

```ts
/**
 * WealthLens — ข้อความ toast ของทุก action ที่เขียนข้อมูล (F43).
 *
 * pure ทั้งไฟล์: ไม่ import React ไม่ import store ไม่เรียก toast เอง
 * component เป็นคนเรียก `pushToast({ message: ..., tone: 'success' })`
 *
 * หลักการ: **พูดถึงผลข้างเคียงเฉพาะเมื่อมันเกิดขึ้นจริง**
 * รายจ่ายที่ไม่ผูกบัญชี ก็บอกแค่ "บันทึกรายจ่ายแล้ว" ไม่ต้องต่อท้ายอะไร
 * เพราะสิ่งที่ผู้ใช้ต้องรู้คือเงินที่ขยับในหน้าที่เขามองไม่เห็น
 */

import { formatTHB, formatThaiMonth } from './formatters';

/** เพิ่มใหม่ หรือ แก้ของเดิม — คุมคำกริยาขึ้นต้นประโยค */
export type SaveMode = 'add' | 'edit';

const VERB: Record<SaveMode, string> = {
  add: 'บันทึก',
  edit: 'แก้ไข',
};

/** ต่อท้ายประโยคหลักด้วย ' · ' เฉพาะเมื่อมีอะไรจะต่อจริง ๆ */
const withSideEffect = (main: string, sideEffect?: string): string =>
  sideEffect ? `${main} · ${sideEffect}` : main;

// ---------------------------------------------------------------------------
// รายจ่าย
// ---------------------------------------------------------------------------

export interface ExpenseSavedInput {
  mode: SaveMode;
  amount: number;
  /** ชื่อบัญชีที่ถูกหัก — ไม่ส่งมาแปลว่ารายจ่ายนี้ไม่ผูกบัญชี */
  accountName?: string;
}

export const expenseSavedMessage = ({
  mode,
  amount,
  accountName,
}: ExpenseSavedInput): string =>
  withSideEffect(
    `${VERB[mode]}รายจ่ายแล้ว`,
    accountName ? `หักจาก${accountName} ${formatTHB(amount)}` : undefined,
  );

export interface ExpenseDeletedInput {
  name: string;
  /** ชื่อบัญชีที่ได้ยอดคืน — ไม่ส่งมาแปลว่ารายจ่ายนี้ไม่ผูกบัญชี */
  accountName?: string;
}

export const expenseDeletedMessage = ({
  name,
  accountName,
}: ExpenseDeletedInput): string =>
  withSideEffect(
    `ลบ '${name}' แล้ว`,
    accountName ? `คืนยอด${accountName}` : undefined,
  );

// ---------------------------------------------------------------------------
// รายได้
// ---------------------------------------------------------------------------

export interface IncomeSavedInput {
  mode: SaveMode;
  /** ชื่อบัญชีที่มีเงินเข้าจริง (ยอด > 0) — ว่างได้ */
  depositedAccounts: readonly string[];
}

export const incomeSavedMessage = ({
  mode,
  depositedAccounts,
}: IncomeSavedInput): string =>
  withSideEffect(
    `${VERB[mode]}รายได้แล้ว`,
    depositedAccounts.length > 0
      ? `เงินเข้า${depositedAccounts.join(', ')}`
      : undefined,
  );

export interface IncomeDeletedInput {
  /** 0-based ตามที่ทั้งแอปใช้ */
  month: number;
  /** ชื่อบัญชีที่ถูกคืนยอด — ว่างได้ */
  revertedAccounts: readonly string[];
}

export const incomeDeletedMessage = ({
  month,
  revertedAccounts,
}: IncomeDeletedInput): string =>
  withSideEffect(
    `ลบรายได้ ${formatThaiMonth(month)} แล้ว`,
    revertedAccounts.length > 0
      ? `คืนยอด${revertedAccounts.join(', ')}`
      : undefined,
  );

// ---------------------------------------------------------------------------
// เงินออม
// ---------------------------------------------------------------------------

export const savingSavedMessage = ({ mode }: { mode: SaveMode }): string =>
  `${VERB[mode]}เงินออมแล้ว`;

export const savingDeletedMessage = ({ name }: { name: string }): string =>
  `ลบ '${name}' แล้ว`;

// ---------------------------------------------------------------------------
// รายการเดินบัญชี
// ---------------------------------------------------------------------------

/**
 * ลบรายการเดินบัญชีแล้วยอดเดือนนั้นขยับเท่ากับจำนวนของรายการ (กลับทิศ)
 * บอกเป็นขนาดของการขยับ ไม่ต้องบอกทิศ — ผู้ใช้เพิ่งเห็นแถวที่ตัวเองลบ
 */
export const bankTransactionDeletedMessage = ({
  amount,
}: {
  amount: number;
}): string =>
  withSideEffect('ลบรายการแล้ว', `ยอดบัญชีปรับ ${formatTHB(Math.abs(amount))}`);
```

**ตรวจก่อนรัน:** `formatTHB(1200)` คืน `฿1,200` หรือ `฿1,200.00`? และ `formatTHB(1200.5)` คืนอะไร? อ่าน `src/utils/formatters.ts:94` ให้เข้าใจ default `decimals` ก่อน ถ้า default ไม่ตรงกับที่ verify คาดไว้ (`฿1,200` และ `฿1,200.50`) ให้ **แก้ที่การเรียก `formatTHB` ใน `actionMessages.ts`** ให้ได้ผลตามนั้น — ห้ามแก้ค่าที่ verify คาดหวัง และห้ามแก้ `formatters.ts`

- [ ] **Step 4: รัน verify ให้ผ่าน**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-action-messages.ts`
Expected: `✅ ALL PASS`, exit 0

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/utils/actionMessages.ts scripts/verify-action-messages.ts
git commit -m "feat(feedback): actionMessages — ข้อความ toast แหล่งเดียว (F43)"
```

---

### Task 2: รายจ่าย — เพิ่ม/แก้/ลบ

**Files:**
- Modify: `src/components/forms/ExpenseList.tsx`

`pushToast` มีอยู่แล้วในไฟล์นี้ (ใช้ใน `confirmDeleteSingleInstallment`) ไม่ต้อง import ใหม่

- [ ] **Step 1: อ่านบัญชีเพื่อแปลง id → ชื่อ**

เพิ่ม import และ selector (ดู pattern จาก `ExpenseForm.tsx:136`):

```tsx
import { expenseDeletedMessage, expenseSavedMessage } from '@/utils/actionMessages';
```

ในตัว component เพิ่ม:
```tsx
const accounts = useFinanceStore((s) => s.data.bankAccounts ?? EMPTY_BANK_ACCOUNTS);
const accountNameOf = (id: string | undefined): string | undefined =>
  id ? accounts.find((a) => a.id === id)?.name : undefined;
```

`EMPTY_BANK_ACCOUNTS` เป็น const ระดับ module ที่ `ExpenseForm.tsx` ใช้ **ตรวจก่อนว่ามัน export หรือไม่** — ถ้าไม่ ให้ประกาศ const ว่างระดับ module ในไฟล์นี้เอง (`const EMPTY_BANK_ACCOUNTS: BankAccount[] = [];`) อย่าเขียน `?? []` inline เพราะ array ใหม่ทุก render จะทำให้ zustand re-render ไม่รู้จบ

- [ ] **Step 2: toast ตอนบันทึก**

`ExpenseForm` เรียก `onSaved(item, continueAdding)` เปลี่ยน `onSaved` ของ ExpenseList เป็น:

```tsx
              onSaved={(item, continueAdding) => {
                pushToast({
                  message: expenseSavedMessage({
                    mode: editing != null ? 'edit' : 'add',
                    amount: item.amount,
                    accountName: accountNameOf(item.paymentAccountId),
                  }),
                  tone: 'success',
                });
                // Button click → close; Enter quick-add → keep open.
                if (!continueAdding) handleClose();
              }}
```

**ระวัง:** อ่าน `editing` ก่อน `handleClose()` จะเคลียร์มัน — บรรทัด `pushToast` อยู่ก่อนแล้ว ถูกต้อง

- [ ] **Step 3: toast ตอนลบ**

```tsx
  const handleDelete = (item: ExpenseItem): void => {
    // Installment row → defer to the 3-option dialog (this งวด vs whole plan).
    if (item.installment != null) {
      setPendingInstallmentDelete(item);
      return;
    }
    if (window.confirm(`ลบรายการ '${item.name}'?`)) {
      const accountName = accountNameOf(item.paymentAccountId);
      deleteExpense(year, month, item.id);
      pushToast({
        message: expenseDeletedMessage({ name: item.name, accountName }),
        tone: 'success',
      });
    }
  };
```

**อ่านชื่อบัญชีก่อนลบ** — หลังลบแล้ว `item` ยังอยู่ในตัวแปร แต่เขียนแบบนี้ชัดกว่าว่าเจตนา

- [ ] **Step 4: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/ExpenseList.tsx
git commit -m "feat(feedback): toast เพิ่ม/แก้/ลบ รายจ่าย + บอกบัญชีที่ถูกหัก (F43)"
```

---

### Task 3: รายได้ — บันทึกทุกครั้ง + ลบ

**Files:**
- Modify: `src/components/forms/IncomeForm.tsx`

ปัจจุบัน (บรรทัด ~608): ถ้าไม่มีเงินเข้าบัญชี → `addIncome` แล้ว `return` **โดยไม่ toast**
ส่วน `confirmSave` (บรรทัด ~640) toast ว่า `'บันทึกรายได้แล้ว'` ตายตัว ไม่บอกว่าเงินเข้าบัญชีไหน

- [ ] **Step 1: import**

```tsx
import {
  incomeDeletedMessage,
  incomeSavedMessage,
} from '@/utils/actionMessages';
```

- [ ] **Step 2: helper แปลง deposits → ชื่อบัญชีที่มีเงินเข้าจริง**

`computeIncomeDeposits(income)` (import อยู่แล้วในไฟล์) คืนรายการเงินเข้าบัญชี **เฉพาะที่ยอด > 0**
อ่าน `src/utils/incomeDeposits.ts` เพื่อดู shape ที่มันคืนจริง แล้วเขียน:

```tsx
  const depositedAccountNames = useCallback(
    (income: MonthlyIncome): string[] => {
      const deposits = computeIncomeDeposits(income);
      const names = deposits.map(
        (d) => accounts.find((a) => a.id === d.accountId)?.name ?? 'บัญชี',
      );
      // บัญชีเดียวรับหลายช่อง (เงินเดือน+โบนัส) ไม่ควรถูกพูดถึงสองครั้ง
      return [...new Set(names)];
    },
    [accounts],
  );
```

**`accounts` มีอยู่แล้วในไฟล์นี้หรือยัง?** ตรวจก่อน — ถ้ายังไม่มี ให้ดึงแบบเดียวกับ `ExpenseForm.tsx:136`
และถ้า field ของ `computeIncomeDeposits` ไม่ได้ชื่อ `accountId` ให้ใช้ชื่อจริง อย่าเดา

- [ ] **Step 3: toast ในเส้นทาง "ไม่มีเงินเข้าบัญชี"**

```tsx
    // Nothing will actually land in a bank account → save straight through
    // rather than nagging the user with an empty confirmation modal.
    if (computeIncomeDeposits(income).length === 0) {
      addIncome(year, income);
      pushToast({
        message: incomeSavedMessage({
          mode: isEdit ? 'edit' : 'add',
          depositedAccounts: [],
        }),
        tone: 'success',
      });
      onSaved?.(income);
      return;
    }
```

เพิ่ม `pushToast` และ `isEdit` เข้า dependency array ของ `useCallback` ตัวนี้

- [ ] **Step 4: toast ใน `confirmSave` ให้บอกบัญชีที่เงินเข้า**

แทนบรรทัด `pushToast({ message: 'บันทึกรายได้แล้ว', tone: 'success' });` ด้วย:

```tsx
    pushToast({
      message: incomeSavedMessage({
        mode: isEdit ? 'edit' : 'add',
        depositedAccounts: depositedAccountNames(income),
      }),
      tone: 'success',
    });
```

**สำคัญ:** ใช้ `income` (ตัวที่ resolve id บัญชีเงินสดแล้ว) ไม่ใช่ `pending` — ไม่งั้นบัญชีเงินสดที่เพิ่งถูกสร้างจะหาชื่อไม่เจอ
เพิ่ม `depositedAccountNames`, `isEdit` เข้า dependency array

- [ ] **Step 5: toast ตอนลบรายได้**

```tsx
  const handleDelete = useCallback((): void => {
    if (!onDelete || !isEdit) return;
    const monthName = formatThaiMonth(month, { long: true });
    const confirmed = window.confirm(
      `ลบข้อมูลรายได้เดือน ${monthName} ${year}?`,
    );
    if (!confirmed) return;
    // อ่านชื่อบัญชีที่กำลังจะถูกคืนยอด ก่อนที่ข้อมูลจะหายไป
    const reverted = initialValues ? depositedAccountNames(initialValues) : [];
    deleteIncome(year, month);
    pushToast({
      message: incomeDeletedMessage({ month, revertedAccounts: reverted }),
      tone: 'success',
    });
    onDelete();
  }, [
    deleteIncome,
    depositedAccountNames,
    initialValues,
    isEdit,
    month,
    onDelete,
    pushToast,
    year,
  ]);
```

**ตรวจชื่อ prop:** ฟอร์มนี้รับข้อมูลเดิมมาทาง prop ชื่ออะไร? (`initialValues`? `income`?) อ่านไฟล์ก่อนแล้วใช้ชื่อจริง
ถ้าฟอร์มไม่มีข้อมูลรายได้เดิมในมือเลย ให้ดึงจาก store ด้วย selector ที่มีอยู่ **อย่าประดิษฐ์ selector ใหม่** — ถ้าหาไม่เจอ ให้รายงานกลับ อย่าเดา

- [ ] **Step 6: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/components/forms/IncomeForm.tsx
git commit -m "feat(feedback): toast รายได้ทุกครั้ง + บอกบัญชีที่เงินเข้า/คืน (F43)"
```

---

### Task 4: เงินออม — เพิ่ม/แก้/ลบ

**Files:**
- Modify: `src/components/forms/SavingsList.tsx`

`pushToast` มีอยู่แล้วในไฟล์นี้ (ใช้ในปุ่มเติม/หยุดรายการประจำ)

- [ ] **Step 1: import**

```tsx
import { savingDeletedMessage, savingSavedMessage } from '@/utils/actionMessages';
```

- [ ] **Step 2: toast ตอนบันทึก**

```tsx
            onSaved={(_item, continueAdding) => {
              pushToast({
                message: savingSavedMessage({
                  mode: editing != null ? 'edit' : 'add',
                }),
                tone: 'success',
              });
              // Edit always closes. Add: button click closes (continueAdding
              // false); Enter quick-add keeps the modal open for batch entry.
              if (editing != null || !continueAdding) handleClose();
            }}
```

- [ ] **Step 3: toast ตอนลบ**

```tsx
  const handleDelete = (item: SavingsItem): void => {
    if (window.confirm(`ลบรายการ '${item.name}'?`)) {
      deleteSavings(year, month, item.id);
      pushToast({
        message: savingDeletedMessage({ name: item.name }),
        tone: 'success',
      });
    }
  };
```

**เงินออมไม่มี `paymentAccountId`** (ดู `SavingsItem` ใน `src/types/index.ts:409`) จึงไม่มีผลข้างเคียงให้บอก

- [ ] **Step 4: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/SavingsList.tsx
git commit -m "feat(feedback): toast เพิ่ม/แก้/ลบ เงินออม (F43)"
```

---

### Task 5: รายการเดินบัญชี — inline confirm + toast

**Files:**
- Modify: `src/components/accounts/MonthTransactionList.tsx`
- Modify: `src/components/accounts/BankAccountDetail.tsx`

นี่คือปุ่มลบเดียวในแอปที่ **ไม่ถามก่อนลบ** — `onClick={() => onDelete(tx.id)}` ตรง ๆ (บรรทัด ~106)

- [ ] **Step 1: inline confirm 2 จังหวะใน `MonthTransactionList.tsx`**

ใช้ state เดียวเก็บ id ของแถวที่กำลังรอยืนยัน (ไม่ใช่ boolean — ต้องรู้ว่าแถวไหน):

```tsx
import { useState } from 'react';

// ในตัว component:
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
```

แทนบล็อกปุ่ม `{canDelete ? (...) : (...)}` ด้วย:

```tsx
            {canDelete ? (
              confirmingId === tx.id ? (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(tx.id);
                    setConfirmingId(null);
                  }}
                  onBlur={() => setConfirmingId(null)}
                  aria-label={`ยืนยันลบรายการ ${tx.note ?? ''}`}
                  className="shrink-0 rounded px-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  ยืนยัน?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(tx.id)}
                  aria-label="ลบรายการ"
                  className="w-5 shrink-0 text-slate-300 transition hover:text-red-600"
                >
                  ✕
                </button>
              )
            ) : (
              <span className="w-5 shrink-0" aria-hidden="true" />
            )}
```

**สามข้อที่ต้องคิด แล้วรายงานสิ่งที่ทำ:**
1. ปุ่ม "ยืนยัน?" กว้างกว่า `w-5` เดิม แถวจะขยับไหม? ถ้าขยับ ให้ตรึงความกว้างของช่องนี้ (เช่นครอบด้วย `<span className="flex w-14 justify-end">`) ไม่งั้นกดปุ่มแล้วแถวกระตุก
2. `onBlur` ยกเลิกการยืนยัน — ผู้ใช้กด ✕ แล้วเลื่อนไปทำอย่างอื่น ปุ่มไม่ควรค้างอยู่ในสถานะรอยืนยัน แต่ **`onBlur` จะยิงก่อน `onClick` ไหม** ตอนกดยืนยัน? ตรวจให้ชัด ถ้ายิงก่อนแล้วลบไม่ทำงาน ให้ใช้ `onMouseDown` ที่ปุ่มยืนยัน หรือถอด `onBlur` ออก — **ห้ามส่งงานที่ปุ่มยืนยันกดไม่ติด**
3. `tx.note` มีจริงไหม? อ่าน `BankTransaction` ใน `src/types/index.ts` แล้วใช้ field ที่มีจริงสำหรับ `aria-label` ถ้าไม่มีก็ใช้ `aria-label="ยืนยันลบรายการ"` เฉย ๆ

- [ ] **Step 2: toast ที่ `BankAccountDetail.tsx`**

ตอนนี้ส่ง `onDelete={deleteBankTransaction}` ตรง ๆ (บรรทัด ~199) เปลี่ยนเป็น handler ที่ toast ด้วย:

```tsx
import { bankTransactionDeletedMessage } from '@/utils/actionMessages';
import { useToastStore } from '@/stores/toastStore';

// ในตัว component:
  const pushToast = useToastStore((s) => s.push);

  const handleDeleteTransaction = (txId: string): void => {
    // อ่านยอดก่อนลบ — หลังลบแล้วหาไม่เจอ
    const tx = transactions.find((t) => t.id === txId);
    deleteBankTransaction(txId);
    if (tx) {
      pushToast({
        message: bankTransactionDeletedMessage({ amount: tx.amount }),
        tone: 'success',
      });
    }
  };
```

แล้วส่ง `onDelete={handleDeleteTransaction}`

**ตรวจชื่อจริง:** ตัวแปรที่ถือรายการของเดือนนั้นในไฟล์นี้ชื่ออะไร (`transactions`? `monthTransactions`?) และ `deleteBankTransaction` รับ argument กี่ตัว (แค่ `txId` หรือ `(accountId, txId)`)? อ่าน `financeStore.ts` แล้วใช้ signature จริง

- [ ] **Step 3: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/accounts/MonthTransactionList.tsx src/components/accounts/BankAccountDetail.tsx
git commit -m "feat(feedback): ลบรายการเดินบัญชี — ยืนยันก่อน บอกหลัง (F43)"
```

---

### Task 6: ตรวจทั้งระบบ + ขับ UI จริง

**Files:** ไม่แก้โค้ด (ยกเว้นเจอบั๊ก)

- [ ] **Step 1: verify scripts ทั้งหมด**

งานนี้ไม่แตะ store/logic ⇒ ทั้ง 19 ตัว (18 เดิม + `verify-action-messages`) ต้องผ่าน

```bash
for f in scripts/verify-*.ts; do
  npx tsx --tsconfig tsconfig.app.json "$f" > /dev/null 2>&1 && echo "✓ $f" || echo "✗ FAIL $f"
done
```

- [ ] **Step 2: gates**

```bash
npm run typecheck && npm run lint && npm run build
```

- [ ] **Step 3: ขับ UI จริง**

`npm run dev` แล้วตรวจ:

1. หน้ารายเดือน → เพิ่มรายจ่าย **ไม่เลือก** "จ่ายผ่าน" → toast = `บันทึกรายจ่ายแล้ว` (ไม่มีท่อนต่อท้าย)
2. เพิ่มรายจ่าย **เลือก** บัญชี → toast มีชื่อบัญชีและยอด เช่น `บันทึกรายจ่ายแล้ว · หักจากกรุงศรี ฿1,200`
3. ลบรายจ่ายที่ผูกบัญชี → toast บอก `คืนยอด<ชื่อบัญชี>`
4. บันทึกรายได้ที่ไม่ลงบัญชีเลย → toast โผล่ (เดิมเงียบ)
5. บันทึกรายได้ที่ลงสองบัญชี → toast บอกชื่อทั้งสอง ไม่ซ้ำกัน
6. ลบรายได้ทั้งเดือน → toast บอกเดือน + บัญชีที่คืนยอด
7. เพิ่ม/ลบ เงินออม → toast โผล่
8. หน้าบัญชีธนาคาร → กด ✕ ที่รายการหนึ่ง → **ยังไม่ลบ** ปุ่มเปลี่ยนเป็น "ยืนยัน?" → กดซ้ำ → ลบ + toast
9. กด ✕ แล้วคลิกที่อื่น → ปุ่มกลับเป็น ✕ (ไม่ค้าง)
10. แถวที่มาจากต้นทาง (income/expense/gold) → **ไม่มีปุ่ม ✕ เหมือนเดิม**

ข้อ 8 กับ 10 สำคัญที่สุด — ข้อ 8 คือเหตุผลของงานนี้ ข้อ 10 คือสิ่งที่ห้ามพัง

- [ ] **Step 4: ถ้าข้อไหนไม่ผ่าน หยุด แก้ แล้วรัน Step 1-3 ใหม่**

---

### Task 7: ปิดงาน

**Files:**
- Modify: `features.json`

- [ ] **Step 1: เพิ่ม F43 ใน `phases[4].features` ต่อจาก F42**

อ่าน entry ของ F42 ก่อน แล้วเขียนให้โทนเดียวกัน:

```json
{
  "id": "F43",
  "name": "Action Feedback (บอกผู้ใช้ว่าเกิดอะไรขึ้น)",
  "description": "เติม toast ให้ 9 action ที่เงียบ (ฟอร์มหลักรายเดือน) + inline confirm ให้ปุ่มลบรายการเดินบัญชี — toast บอกผลข้างเคียงที่มองไม่เห็นด้วย (เงินหัก/คืน บัญชีไหน เท่าไร)",
  "status": "completed",
  "priority": "P1",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "src/utils/actionMessages.ts — pure message builders แหล่งเดียว (ไม่ import React/store); component แค่เรียกแล้วส่งเข้า pushToast",
    "toast บอกผลข้างเคียงเฉพาะเมื่อเกิดขึ้นจริง: รายจ่ายผูกบัญชี → 'หักจากกรุงศรี ฿1,200'; ไม่ผูก → 'บันทึกรายจ่ายแล้ว' เฉยๆ",
    "รายได้ยิง toast ทุกครั้ง (เดิมยิงเฉพาะตอนมีเงินเข้าบัญชี — พฤติกรรมสองแบบในปุ่มเดียว)",
    "ลบรายได้ทั้งเดือน / ลบรายจ่ายผูกบัญชี → บอกบัญชีที่ถูกคืนยอด",
    "ปุ่ม ✕ ลบรายการเดินบัญชี: inline confirm 2 จังหวะ (เดิมลบทันทีโดยไม่ถาม) + toast บอกยอดที่ขยับ",
    "แถวจากต้นทาง (income/expense/gold/backfill) ยังลบไม่ได้เหมือนเดิม — DELETABLE set ไม่ถูกแตะ",
    "ไม่แตะ store/schema/business logic — presentation ล้วน",
    "Verified: scripts/verify-action-messages.ts + verify เดิมทั้ง 18 ตัวไม่ regress + typecheck + lint + build + ขับ UI จริง 10 ข้อ"
  ],
  "estimatedHours": 4,
  "dependencies": ["F34", "F39", "F40"],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-07-10",
    "notes": "Spec: docs/superpowers/specs/2026-07-10-action-feedback-design.md | Plan: docs/superpowers/plans/2026-07-10-action-feedback.md | Files: utils/actionMessages.ts (ใหม่), scripts/verify-action-messages.ts (ใหม่), components/forms/{ExpenseList,IncomeForm,SavingsList}.tsx, components/accounts/{MonthTransactionList,BankAccountDetail}.tsx | หมายเหตุ: ไม่ทำปุ่ม Undo (ต้องเก็บ snapshot ทุกจุดลบ = ฟีเจอร์คนละขนาด); window.confirm เดิมใน ExpenseList/SavingsList คงไว้"
  }
}
```

อัปเดต `progressSummary`: `totalFeatures` 50 → 51, `completed` 50 → 51

- [ ] **Step 2: ตรวจว่า JSON ยังใช้ได้**

```bash
node -e "const f=require('./features.json'); console.log('ok', f.progressSummary.totalFeatures, f.progressSummary.completed)"
```
Expected: `ok 51 51`

- [ ] **Step 3: Commit**

```bash
git add features.json
git commit -m "docs: F43 action feedback — completed"
```

---

## Self-Review

**Spec coverage:**

| ข้อใน spec | Task |
|---|---|
| `actionMessages.ts` pure + ไม่ให้ store ยิง toast | 1 |
| toast บอกผลข้างเคียงเฉพาะเมื่อเกิดจริง | 1 (`withSideEffect`) |
| เพิ่ม/แก้/ลบ รายจ่าย | 2 |
| รายได้ ยิงทุกครั้ง + ลบรายได้ | 3 |
| เพิ่ม/แก้/ลบ เงินออม | 4 |
| ลบรายการเดินบัญชี + inline confirm | 5 |
| ไม่แตะ `window.confirm` เดิม / ไม่ทำ Undo | ไม่มี task — YAGNI ตามสเปก |
| แถวห้ามลบยังห้ามลบ (`DELETABLE`) | 5 Step 1 ข้อ 3, 6 Step 3 ข้อ 10 |
| verify + UI drive | 6 |
| ปิดงาน | 7 |

ครบทุกข้อ

**Type consistency:** `SaveMode`, `expenseSavedMessage`, `expenseDeletedMessage`, `incomeSavedMessage`, `incomeDeletedMessage`, `savingSavedMessage`, `savingDeletedMessage`, `bankTransactionDeletedMessage` — ชื่อและ signature ตรงกันระหว่าง Task 1 (นิยาม), verify script, และ Task 2-5 (เรียกใช้)

**จุดที่ผมสั่งให้ผู้ทำ "ตรวจก่อน อย่าเดา" (เพราะผมไม่ได้อ่านโค้ดส่วนนั้นละเอียดพอ):**
- `formatTHB` default decimals (Task 1 Step 3)
- `EMPTY_BANK_ACCOUNTS` export หรือไม่ (Task 2 Step 1)
- shape ที่ `computeIncomeDeposits` คืน + prop ชื่อข้อมูลรายได้เดิมใน `IncomeForm` (Task 3)
- `BankTransaction` มี field `note` ไหม + `deleteBankTransaction` signature + ชื่อตัวแปรรายการ (Task 5)
- `onBlur` vs `onClick` ลำดับการยิง (Task 5 Step 1 ข้อ 2)

ทั้งห้าจุดสั่งให้รายงานกลับถ้าไม่ตรงกับที่แผนสมมติ ไม่ใช่ให้เดาแล้วเดินหน้า
