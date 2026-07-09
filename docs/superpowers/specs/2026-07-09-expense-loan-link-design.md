# F37 — ผูกรายจ่ายกับหนี้ (Expense → Loan payment link)

*Design · 2026-07-09*

## 1. ปัญหา

Tom จ่ายหนี้บ้านและสินเชื่อบุคคลผ่านรายจ่ายรายเดือนที่บันทึกอยู่แล้วในหน้ารายเดือน แต่หน้าหนี้สินไม่รู้เรื่องนั้น — ยอดคงเหลือขยับได้ทางเดียวคือกด "+ เพิ่มโปะ" หรือติ๊ก `assumeOnSchedule` (F36) ซึ่งเป็นการ *สมมติ* ว่าจ่ายตรงงวด ไม่ใช่ข้อมูลจริง

ผลคือข้อมูลเดียวกันถูกบันทึกสองที่ และหน้าหนี้สินไม่สะท้อนสิ่งที่เกิดขึ้นจริง

## 2. เป้าหมาย

รายจ่ายหนึ่งรายการชี้ได้ว่า "เงินก้อนนี้ไปจ่ายหนี้ก้อนไหน" แล้วหน้าหนี้สินหักยอดตามนั้นอัตโนมัติ โดย**รายจ่ายเป็น source of truth เดียว** — แก้ยอด/ลบรายจ่าย ยอดหนี้ขยับตามทันที ไม่มี state ซ้ำให้ reconcile

## 3. ขอบเขต

**In scope**
1. `ExpenseItem.loanId?: string` (optional, backward-compat)
2. `ExpenseForm` เพิ่ม dropdown **"ชำระหนี้"** ใต้หมวดหมู่ (optional) · `ExpenseList` โชว์ badge
3. Pure util `materializeLoanPayments(loan, years) → Loan` — แปลงรายจ่ายที่ผูกไว้เป็น payment rows
4. `getPrincipalRemaining` เปลี่ยนเป็น waterfall (ไล่เงินที่จ่ายลงงวด 1→N)
5. กันนับซ้ำ: หนี้ที่มีรายจ่ายผูกอยู่ → ไม่สน `assumeOnSchedule`
6. เปลี่ยนชื่อ checkbox F36 "หักบัญชีอัตโนมัติทุกเดือน" → **"ถือว่าจ่ายตามงวดอัตโนมัติ"**

**Out of scope (YAGNI)**
- ย้อนหลัง/auto-tag รายจ่ายเก่า — Tom แท็กเองไปข้างหน้า รายการเก่าไม่มี `loanId` = ถูกข้ามโดยธรรมชาติ
- แยกรายจ่าย "บ้าน" ฿60,000 → 2 รายการ — Tom แก้เองในหน้ารายเดือน
- 1 รายจ่าย จ่ายหลายหนี้ (split) — หนึ่งรายการ = หนึ่งหนี้
- หักยอดบัญชีธนาคาร — ยังเป็นงานของ `paymentAccountId` (F34) แยกกันชัดเจน

## 4. Data model

```ts
// types/index.ts — ExpenseItem
export interface ExpenseItem {
  // ...เดิมทั้งหมด
  /**
   * รายจ่ายนี้เป็นการชำระหนี้ก้อนไหน (Loan.id). Optional — รายการทั่วไป
   * ไม่มี field นี้. หน้าหนี้สินอ่าน field นี้เพื่อ derive ประวัติชำระ
   * โดยไม่เขียนอะไรกลับ (รายจ่ายคือ source of truth เดียว).
   */
  loanId?: string;
}
```

ไม่แตะ `Loan` — ทิศทางของ pointer สำคัญ: รายจ่ายชี้ไปหาหนี้ ไม่ใช่หนี้ชี้มาหารายจ่าย เพราะรายจ่ายคือสิ่งที่เกิดขึ้นจริงและมีหลายรายการต่อหนึ่งหนี้

**Backward-compat:** payload เดิมไม่มี field → ไม่มี payment ถูก derive → ทุกยอดเท่าเดิม

**Dangling reference:** ลบหนี้ทิ้งแต่รายจ่ายยังชี้ค้าง → `materializeLoanPayments` ไม่เจอเจ้าของ ก็ไม่มีผล; `ExpenseList` แสดง badge เฉพาะเมื่อ resolve ชื่อหนี้ได้ ไม่ throw

## 5. `src/utils/loanPayments.ts` (ใหม่ · pure)

```ts
/**
 * แปลงรายจ่ายที่ผูกกับหนี้ก้อนนี้เป็น ScheduledPayment แล้วคืน Loan ก้อนใหม่
 * — ทำให้ selector ทุกตัวใน loanCalculations.ts ทำงานต่อได้โดยไม่ต้องรู้จัก
 * ExpenseItem เลย (dependency ชี้ทางเดียว: loanPayments → loanCalculations)
 */
export const materializeLoanPayments = (
  loan: Loan,
  years: WealthLensData['years'],
): Loan
```

- กวาดทุกปี/เดือน หา `ExpenseItem` ที่ `loanId === loan.id`
- แต่ละรายการ → `{ date, amount, reference: 'expense:<id>', notes: <ชื่อรายการ> }`
  - `date` ใช้ `expense.date` ถ้ามี ไม่งั้น derive จาก (ปี, เดือน) เป็นวันที่ 1 ของเดือน (`MonthlyExpense.month` คือ source of truth ของ bucket อยู่แล้ว)
- คืน `{ ...loan, scheduledPayments: [...loan.scheduledPayments, ...derived] }`
- **ถ้ามี derived อย่างน้อย 1 รายการ → บังคับ `assumeOnSchedule: false`** (รายจ่ายจริงชนะการสมมติ)
- ไม่มีรายการผูก → คืน `loan` ตัวเดิม (referential equality, `useMemo` ไม่ต้องคำนวณซ้ำ)

**จุดเรียก:** `LoansPage` และ `LoanSummaryCard` (Overview) ผ่าน hook `useResolvedLoans()` ใน `hooks/useFinanceData.ts` — resolve ครั้งเดียวแล้วส่ง Loan ที่ materialize แล้วลงไปให้ `LoanCard` / `LoanDetail` / `PaymentLogTable` เหมือนเดิม ไม่ต้องแก้ component ลูก

## 6. `getPrincipalRemaining` → waterfall

ปัจจุบันคิดจาก "งวดที่ dueDate ≤ วันนี้" ซึ่งใช้ไม่ได้เมื่อเงินเข้ามาเป็นก้อนจากรายจ่าย (จ่ายมากกว่า/น้อยกว่าค่างวด, จ่ายช้า)

กติกาใหม่ — เงินที่จ่ายผ่านตาราง (`scheduledPayments` รวมที่ derive มา + งวดที่ถือว่าจ่ายจาก `assumeOnSchedule`) ถูกไล่ลงงวดตามลำดับ 1→N:

```
เหลือ = Σ scheduledPaid
สำหรับแต่ละงวด i:
  ถ้า เหลือ ≥ งวด_i.totalAmount  → ตัดต้นเต็ม principal_i, เหลือ -= totalAmount_i
  ไม่งั้น                        → ตัดต้นตามสัดส่วน principal_i × (เหลือ / totalAmount_i), จบ
principalRemaining = Σ principal − ต้นที่ตัดไป − Σ extraPayments   (floor 0)
```

โปะ (`extraPayments`) ยังตัดเงินต้นเต็มจำนวนเหมือนเดิม — เป็นพฤติกรรมที่ Tom คาดหวังจากการโปะ

โหมด `assumeOnSchedule` ให้ผลเท่าเดิมเป๊ะ เพราะเงินที่ "จ่ายแล้ว" คือผลรวม `totalAmount` ของงวดที่ครบกำหนดพอดี — waterfall จึงตัดต้นได้เท่ากับผลรวม `principalAmount` ของงวดเดียวกัน (มี verify กำกับ)

## 7. UI

**`ExpenseForm`** — dropdown "ชำระหนี้" ใต้ "หมวดหมู่"
- ตัวเลือก: `— ไม่ระบุ —` + รายชื่อหนี้ทุกก้อน (`data.loans`)
- ซ่อนทั้งช่องเมื่อยังไม่มีหนี้สักก้อน (ไม่รกสำหรับผู้ใช้ที่ไม่มีหนี้)
- แสดงในรายการผ่อน (installment) ด้วย — ต่างจาก "จ่ายผ่าน" ตรงที่การชำระหนี้ไม่เกี่ยวกับกลไกผ่อน

**`ExpenseList`** — badge `💰 สินเชื่อบ้าน` ข้างชื่อรายการ (แสดงเมื่อ resolve ชื่อได้)

**`PaymentLogTable`** — payment ที่ derive มาโผล่เป็น `source: 'auto'` label `จ่ายผ่านรายจ่าย` + ชื่อรายการใน notes

**`LoanForm`** — checkbox เดิมเปลี่ยน label เป็น **"ถือว่าจ่ายตามงวดอัตโนมัติ"**
helper: *"ยอดคงเหลือลดตามงวดที่ถึงกำหนด โดยไม่ต้องบันทึกอะไร · ถ้าผูกรายจ่ายรายเดือนกับหนี้ก้อนนี้แล้ว ไม่ต้องติ๊ก (รายจ่ายจริงมาก่อนเสมอ)"*

**`LoanDetail`** — เมื่อ `assumeOnSchedule` ถูก override โดยรายจ่ายที่ผูก แสดงบรรทัดเล็ก: *"ยอดคำนวณจากรายจ่ายที่ผูกไว้ N รายการ"*

## 8. Verification — `scripts/verify-expense-loan-link.ts`

1. รายจ่าย 3 รายการ × ฿30,000 ผูกหนี้บ้าน → `totalPaid` = 90,000, `remaining` = scheduleTotal − 90,000
2. ยอดรายจ่ายไม่เท่าค่างวด (จ่าย 35,000) → หักตามจริง 35,000
3. waterfall: จ่าย 90,000 (= 3 งวดแรกพอดี) → `principalRemaining` = Σต้น − ต้น 3 งวดแรก
4. waterfall เศษ: จ่าย 45,000 (งวด 1 เต็ม + ครึ่งงวด 2) → ตัดต้น = ต้น₁ + ต้น₂ × (15,000/30,000)
5. `assumeOnSchedule` + ไม่มีรายจ่ายผูก → ผลเท่ากับ F36 เป๊ะ (regression)
6. `assumeOnSchedule: true` + มีรายจ่ายผูก → นับเฉพาะรายจ่าย (ไม่นับซ้ำ)
7. ไม่มี `loanId` ที่ไหนเลย → `materializeLoanPayments` คืน loan ตัวเดิม (===) และ กยศ seed คำนวณเท่าเดิม
8. `loanId` ชี้หนี้ที่ถูกลบไปแล้ว → ไม่ throw, ไม่มีผลกับหนี้ก้อนอื่น
9. รายจ่ายไม่มี `date` → payment ใช้วันที่ 1 ของเดือนนั้น
10. Export/Import round-trip เก็บ `loanId`; backup เก่าไม่มี field ยัง import ได้

บวก `npm run typecheck` + `npm run lint` + `npm run build` + verify scripts เดิมทั้ง 11 ตัวไม่ regress + ขับ UI จริง (ผูกรายจ่าย → ยอดหนี้ลด → ลบรายจ่าย → ยอดเด้งกลับ)
