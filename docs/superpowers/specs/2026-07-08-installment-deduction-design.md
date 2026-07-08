# Design — ผ่อนหักรายงวด (optional) — Installment per-งวด deduction

**วันที่:** 2026-07-08
**Feature id:** F35 — Optional installment deduction
**สถานะ:** approved (Tom: "ทำต่อเลย ทำ optional ไว้ก่อน") — เปิดสิ่งที่ F34 defer ไว้

---

## 1. ปัญหา / เป้าหมาย

F34 จงใจ **กันรายการผ่อนไม่ให้หักบัญชี**. Tom อยากเปิดให้ **ผ่อนหักรายงวดได้แบบ optional** — แผนผ่อน (เช่น รถ 40/60, AirPod 1/10) เลือก "จ่ายผ่าน" บัญชีได้ แล้วแต่ละงวดหักยอดบัญชีในเดือนของงวดนั้น. ถ้าไม่เลือก = ไม่หัก (เหมือนเดิม).

---

## 2. เปลี่ยนกฎการหัก

`expenseDeductionOf` เดิม: `paymentAccountId && !item.installment`. **ตัด `!item.installment` ออก** → หักเมื่อไหร่ก็ตามที่มี `paymentAccountId` (ผ่อนหรือไม่ผ่อนก็ได้). "optional" = มี paymentAccountId หรือไม่.

ผลข้างเคียง: gate `isCarInstallmentRow` ใน `addExpense` (ที่กันรถไม่ให้หัก) **เอาออก** — ตอนนี้ผ่อนหักได้ ถ้ารถมี paymentAccountId ก็หักถูกต้อง (F34 machinery add/update/delete reconcile ทำงานกับ installment ได้ทันทีเมื่อกฎเปลี่ยน).

---

## 3. Store

### 3.1 `InstallmentPlanInput` += `paymentAccountId?: string`
### 3.2 `addInstallmentPlan` (batch)
ในลูปสร้าง N งวด: ถ้ามี `paymentAccountId` → set `newItem.paymentAccountId` + `newItem.sideEffects = { accountId, deductYear: year, deductMonth: month, deductAmount: amount }` (ยอดของงวดนั้น) และ **หักบัญชี** — thread `let nextBankAccounts` ผ่านลูป (`reconcileBankDeduction(nextBankAccounts, undefined, ded)` ต่องวด), return `data` เพิ่ม bankAccounts. หักแต่ละงวดเข้าเดือนของงวดนั้น (รวมงวดอนาคต = planned outflow).
### 3.3 `deleteInstallmentPlan`
ตอน filter งวดออก: เก็บ `sideEffects` ของงวดที่ถูกลบ → `reconcileBankDeduction(nextBankAccounts, se, undefined)` (คืน) ต่องวด. return bankAccounts ที่อัปเดต.
### 3.4 add/update/deleteExpense (งวดเดี่ยว)
ไม่ต้องแก้เพิ่ม — F34 machinery ทำงานกับ installment ได้เมื่อ `expenseDeductionOf` ไม่กันผ่อนแล้ว. (แก้ยอดงวด → reconcile; ลบงวดเดี่ยว → คืน).

---

## 4. UI
- **InstallmentForm** (`src/components/forms/InstallmentForm.tsx`): เพิ่ม dropdown "จ่ายผ่าน" optional (ไม่ระบุ + bankAccounts) → ส่ง `paymentAccountId` เข้า addInstallmentPlan input.
- **ExpenseForm**: **โชว์** dropdown "จ่ายผ่าน" กับรายการผ่อนด้วย (เอา `!isInstallmentRow` hide ออก) — แก้ payment ต่องวดได้.
- **ExpenseList**: **โชว์** badge แหล่งจ่ายกับรายการผ่อนด้วย (เอา guard `installment == null` ออก).

---

## 5. Backward-compat & data safety
- `paymentAccountId` บนแผนผ่อน optional → แผนเดิม/รายการเดิมไม่มี → ไม่หัก, ยอดเดิมไม่เพี้ยน
- backup/import เก็บ paymentAccountId+sideEffects อยู่แล้ว (F34 fix) → งวดผ่อน round-trip ปลอดภัย
- bankAccounts immutable, bump lastUpdated ตามปกติ

---

## 6. Verify (`scripts/verify-installment-deduction.ts` หรือต่อใน verify-expense-payment)
- expenseDeductionOf: installment + paymentAccountId → คืน deduction (ไม่ใช่ undefined)
- addInstallmentPlan mock: 3 งวด + paymentAccountId → บัญชีถูกหัก 3 เดือน, ยอดต่อเดือน = amount ของงวด, sideEffects ครบ
- deleteInstallmentPlan → คืนครบทุกงวด
- ไม่มี paymentAccountId → ไม่หัก
- verify อื่นไม่ regress (expense-payment/bank/loan/income)

---

## 7. ไฟล์
**แก้:** `stores/financeStore.ts` (expenseDeductionOf, InstallmentPlanInput, addInstallmentPlan, deleteInstallmentPlan, addExpense เอา car gate ออก), `components/forms/{InstallmentForm,ExpenseForm,ExpenseList}.tsx`
**ใหม่:** verify script
**นอก scope:** หักงวดเฉพาะที่ "ถึงกำหนด/จ่ายแล้ว" (ตอนนี้หักทุกงวดเข้าเดือนของมัน = planned), เปลี่ยนบัญชีทั้งแผนทีเดียว (ทำต่องวดได้ผ่าน ExpenseForm)
