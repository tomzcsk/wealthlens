# Design — จ่ายผ่านบัญชี → หักยอดอัตโนมัติ (Expense Payment Source)

**วันที่:** 2026-07-08
**Feature id:** F34 — Expense payment source + account deduction
**สถานะ:** approved design, รอ implementation plan

---

## 1. ปัญหา

รายจ่ายแต่ละรายการ (บ้าน, Netflix, ยางรถ, ฯลฯ) ไม่รู้ว่า "จ่ายผ่านอะไร" และไม่หักออกจากยอดบัญชีธนาคาร/เงินสด Tom อยากเลือกแหล่งจ่ายต่อรายการ แล้วให้ยอดในบัญชีนั้นลดอัตโนมัติ (double-entry เหมือน gold 'kept' side-effect ที่มีอยู่)

**เป้าหมาย:** รายจ่ายเลือก "จ่ายผ่าน" (เงินสด/บัญชีธนาคาร) แบบ optional → หักยอดบัญชีเดือนนั้นให้ · แก้/ลบรายจ่าย → คืน/ปรับยอดถูกต้อง · ข้อมูลเดิมไม่กระทบ

---

## 2. Data model (เพิ่ม optional, ไม่แตะของเดิม) — `src/types/index.ts`

เพิ่มบน `ExpenseItem` (หลัง `installment?`):
```ts
/** บัญชีที่จ่ายรายการนี้ (BankAccount.id — รวมบัญชี 'เงินสด'). ไม่ระบุ = ไม่หักบัญชี. */
paymentAccountId?: string;
/** Side-effect ref สำหรับ revert การหักยอดบัญชี (mirror GoldSideEffectRefs). */
sideEffects?: ExpenseSideEffectRefs;
```
type ใหม่:
```ts
export interface ExpenseSideEffectRefs {
  /** บัญชีที่ถูกหัก. */
  accountId: string;
  /** ปี/เดือนที่หัก = ปี/เดือนของ MonthlyExpense ที่รายการอยู่. */
  deductYear: number;
  deductMonth: number;
  /** ยอดที่หักไป (revert = บวกกลับเท่านี้เป๊ะ). */
  deductAmount: number;
}
```
Backward-compat: รายการเก่าไม่มี field → ไม่หัก, hydrate ได้ปกติ (optional).

---

## 3. หักยอด — mirror gold dual-write (`src/stores/financeStore.ts`)

ปี/เดือน มาจาก args ของ action เสมอ (`addExpense(year, month, ...)`) — ไม่ต้อง parse `date`.

**หลักการหักได้ก็ต่อเมื่อ:** `paymentAccountId` ถูกตั้ง **และ** ไม่ใช่รายการผ่อน (`!item.installment`).

### 3.1 `addExpense`
หลังสร้าง `newItem`: ถ้าเข้าเงื่อนไขหัก → หา account ตาม id, `balances[year][month] -= amount` (immutable, pattern เดียวกับ `setBankBalance`), แล้ว `newItem.sideEffects = { accountId, deductYear: year, deductMonth: month, deductAmount: amount }`. ถ้าไม่พบ account → ไม่หัก, ไม่ตั้ง sideEffects (fallback แบบ gold). Return `data` เพิ่ม `bankAccounts` ที่อัปเดต.

### 3.2 `updateExpense` (จุดยากสุด — reconcile)
Form เป็น delta editor (แก้ยอดบ่อย) และมีการแก้สถานะเบิก (reimbursement) ที่ **ไม่ควรหักซ้ำ**. ใช้วิธี **revert เก่า + apply ใหม่** ครอบทุกกรณี:
1. หา `old` item + `old.sideEffects`.
2. คำนวณ `merged` = apply patch ลง old.
3. `oldDeduction` = old.sideEffects (ถ้ามี).
4. `newDeduction` = (merged.paymentAccountId && !merged.installment) ? `{ accountId: merged.paymentAccountId, deductYear: year, deductMonth: month, deductAmount: merged.amount }` : none.
5. อัปเดต bankAccounts: **คืน oldDeduction** (บวก `deductAmount` กลับที่ `accountId/deductYear/deductMonth`) → แล้ว **หัก newDeduction** (ลบ `deductAmount` ที่บัญชีใหม่).
6. ตั้ง `merged.sideEffects = newDeduction` (หรือลบทิ้งถ้า none).

ผลลัพธ์: แก้ยอด → net delta ถูก · เปลี่ยนบัญชี → ย้ายยอด · แก้สถานะเบิก (ยอด/บัญชีเดิม) → คืนแล้วหักเท่าเดิม = ยอดไม่ขยับ (ไม่หักซ้ำ). ถ้า old==new account/month → รวมยอดสองสเต็ปที่บัญชีเดียวกันให้ถูก (ทำ immutable ต่อเนื่องบน array เดียว).

### 3.3 `deleteExpense`
อ่าน `target.sideEffects` ก่อน filter → คืน `deductAmount` ที่ `accountId/deductYear/deductMonth` (skip เงียบถ้าบัญชีถูกลบไปแล้ว, แบบ gold). Return `data` เพิ่ม bankAccounts.

### 3.4 `addInstallmentPlan` — ไม่แตะ
ผ่อน = ไม่หัก (ตามที่ตัดสินใจ). งวดผ่อนไม่ตั้ง paymentAccountId, addInstallmentPlan ไม่ยุ่ง bankAccounts. (deleteInstallmentPlan ก็ไม่ต้อง revert อะไร)

---

## 4. UI

### 4.1 `ExpenseForm.tsx`
- เพิ่ม state + dropdown **"จ่ายผ่าน"** (optional): ตัวเลือก = "ไม่ระบุ (ไม่หักบัญชี)" + ทุก `data.bankAccounts` (เงินสดจะอยู่ในลิสต์อยู่แล้ว, เรียงเงินสดบนสุด). ค่า = accountId หรือ `''` (ไม่ระบุ).
- ส่ง `paymentAccountId` (ถ้าเลือก) เข้า addExpense/updateExpense payload.
- **ซ่อน dropdown เมื่อเป็นรายการผ่อน** (edit item ที่มี installment) — ผ่อนไม่รองรับ.
- edit mode: preload paymentAccountId เดิม.

### 4.2 `ExpenseList.tsx`
- แสดง badge เล็ก **"💳 [ชื่อบัญชี]"** ข้างรายการ (resolve paymentAccountId → account.name จาก store) เมื่อมี. วางกลุ่มเดียวกับ badge วันที่/เบิก.

---

## 5. Backward-compat & data safety
- schema เพิ่ม optional → payload เก่า hydrate ได้
- seed/ข้อมูลเดิมไม่มี paymentAccountId → ไม่หัก, ยอดบัญชี/ยอดรวมเดิมไม่เพี้ยน
- bankAccounts ริมิวเทเบิลทุก action, bump lastUpdated (Drive sync ตามปกติ)
- side-effect ref แบบ self-sufficient (เก็บ accountId/year/month/amount) → revert ถูกแม้แก้/ลบภายหลัง

---

## 6. Verification (`scripts/verify-expense-payment.ts`)
- add expense มี paymentAccountId → บัญชีลดลงเท่ายอด + sideEffects ถูก
- delete → บัญชีคืนเท่าเดิม
- update แก้ยอด (100→150) → บัญชีลดเพิ่ม 50 (net)
- update เปลี่ยนบัญชี A→B → A คืน, B หัก
- update ลบ paymentAccountId → คืนเต็ม, ไม่มี sideEffects
- update สถานะเบิก (ยอด/บัญชีเดิม) → ยอดบัญชีไม่ขยับ (ไม่หักซ้ำ)
- installment item → ไม่หัก
- ยอด seed เดิมไม่เพี้ยน (verify multi-loan/income/bank ไม่ regress)
- typecheck + build + browser smoke

---

## 7. ไฟล์ที่แตะ
**แก้:** `types/index.ts` (+2 field, +ExpenseSideEffectRefs), `stores/financeStore.ts` (addExpense/updateExpense/deleteExpense deduct+revert), `components/forms/ExpenseForm.tsx` (dropdown), `components/forms/ExpenseList.tsx` (badge)
**ใหม่:** `scripts/verify-expense-payment.ts`
**ไม่แตะ:** installment plan logic, gold, income, loans, savings model

**นอก scope:** ผ่อนหักรายงวด, budget/forecast รับรู้แหล่งจ่าย, รายงานสรุปตามแหล่งจ่าย
