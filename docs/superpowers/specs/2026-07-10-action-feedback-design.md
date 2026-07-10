# F43 — Action Feedback (บอกผู้ใช้ว่าเกิดอะไรขึ้น)

วันที่: 2026-07-10 · สถานะ: approved

## ปัญหา

แอปมี toast อยู่แล้ว (`src/stores/toastStore.ts` + `Toaster.tsx`) และ action ที่เขียนข้อมูล
41 จาก 51 ตัวก็ยิง toast แต่ **9 ตัวที่เงียบคือตัวที่ Tom ใช้บ่อยที่สุด** — ฟอร์มหลักรายเดือน
(เพิ่ม/แก้/ลบ รายจ่าย, เพิ่ม/ลบ รายได้, เพิ่ม/แก้/ลบ เงินออม) บวกกับปุ่มลบรายการเดินบัญชี

ของที่สร้างทีหลัง (ทอง, หนี้, ผ่อน, บัญชี, settings) toast ครบ ของที่สร้างแต่แรกไม่มี

สองข้อที่ร้ายกว่าความไม่สวย:

1. **ปุ่ม ✕ ลบรายการเดินบัญชี** (`MonthTransactionList.tsx`) ต่อตรงเข้า `deleteBankTransaction`
   — ไม่ถามก่อน ไม่บอกหลัง ทุกปุ่มลบอื่นในแอปมี confirm
2. **รายจ่ายที่เลือก "จ่ายผ่าน" บัญชี** (F34) หักยอดบัญชีในอีกหน้าหนึ่ง เงินขยับที่อื่นโดยไม่บอก
   เช่นเดียวกับ ลบรายได้ทั้งเดือน ที่ revert เงินฝากย้อนหลัง

`IncomeForm` ยิง toast เฉพาะตอน**มี**เงินเข้าบัญชี ไม่ยิงตอนไม่มี — พฤติกรรมสองแบบในปุ่มเดียว

## หลักการ

**toast บอกผลข้างเคียงเมื่อมันเกิดขึ้นจริง** ไม่ใช่ต่อท้ายทุกครั้ง
ถ้ารายจ่ายไม่ได้ผูกบัญชี ก็บอกแค่ "บันทึกรายจ่ายแล้ว"

## สถาปัตยกรรม

### `src/utils/actionMessages.ts` (ใหม่) — pure

ไม่ import React ไม่ import store ทดสอบได้ด้วย node ล้วน

```ts
expenseSavedMessage({ mode: 'add', amount: 1200, accountName: 'กรุงศรี' })
// → "บันทึกรายจ่ายแล้ว · หักจากกรุงศรี ฿1,200"

expenseSavedMessage({ mode: 'add', amount: 1200 })
// → "บันทึกรายจ่ายแล้ว"

incomeDeletedMessage({ month: 3, revertedAccounts: ['กรุงศรี'] })
// → "ลบรายได้ เม.ย. แล้ว · คืนยอดกรุงศรี"
```

เงินทุกก้อน format ผ่าน `utils/formatters.ts` เดือนไทยจาก `THAI_MONTHS_SHORT` (กฎ CLAUDE.md)

**ทำไมไม่ให้ store ยิง toast เอง:** store จะรู้จัก UI และ action เดียวกันจะยิง toast
แม้ถูกเรียกจาก import / restore / migration ซึ่งไม่ควรยิง

## ขอบเขต — 10 จุด

### เติม toast (9)

| จุด | ไฟล์ |
|---|---|
| เพิ่ม / แก้ รายจ่าย | `ExpenseList.tsx` (`onSaved`) |
| ลบรายจ่าย | `ExpenseList.tsx` (`handleDelete`) |
| เพิ่ม / แก้ รายได้ — **ยิงทุกครั้ง** | `IncomeForm.tsx` |
| ลบรายได้ทั้งเดือน | `IncomeForm.tsx` (`handleDelete`) |
| เพิ่ม / แก้ เงินออม | `SavingsList.tsx` (`onSaved`) |
| ลบเงินออม | `SavingsList.tsx` (`handleDelete`) |
| ลบรายการเดินบัญชี | `MonthTransactionList.tsx` |

รายได้: เดิมยิงเฉพาะตอนมีเงินเข้าบัญชี เปลี่ยนเป็นยิงทุกครั้ง แต่ข้อความต่างกันตามว่ามีเงินเข้าบัญชีไหม

### เติม confirm (1)

ปุ่ม ✕ ลบรายการเดินบัญชี → **inline confirm 2 จังหวะ** แบบเดียวกับ `JournalBackfillSection`
(ปุ่มเปลี่ยนเป็น "ยืนยัน?" แล้วกดซ้ำจึงลบ)

ไม่ใช้ `window.confirm` เพราะรายการเดินบัญชีลบทีละแถวเร็ว ๆ — modal จะขวาง

### ไม่ทำ (YAGNI)

- ไม่เปลี่ยน `window.confirm` ที่มีอยู่แล้วใน `ExpenseList` / `SavingsList` เป็น inline
  (refactor ที่ไม่เกี่ยวกับปัญหานี้)
- ไม่ทำปุ่ม Undo ใน toast (ต้องเก็บ snapshot ก่อนลบทุกจุด = ฟีเจอร์คนละขนาด)
- ไม่แตะ store, schema, business logic — งานนี้เป็น presentation ล้วน

## ข้อจำกัดที่ต้องรักษา

- รายการเดินบัญชีที่มาจากต้นทาง (income / expense / gold / backfill) **ลบจากหน้าบัญชีไม่ได้** อยู่แล้ว (F40/F41)
  ปุ่ม ✕ โผล่เฉพาะรายการที่ลบได้ — inline confirm ต้องไม่ทำให้ปุ่มโผล่ในแถวที่ห้ามลบ
- toast tone: สำเร็จ = `success`, ลบ = `success` (ไม่ใช่ `error` — การลบที่ตั้งใจไม่ใช่ความผิดพลาด)

## การตรวจสอบ

- `scripts/verify-action-messages.ts` — message builders: มี/ไม่มีบัญชี, format เงิน, เดือนไทย
- verify เดิมทั้ง 18 ตัวไม่ regress (งานนี้ไม่แตะ logic)
- `npm run typecheck` · `npm run lint` · `npm run build`
- ขับ UI จริง (Playwright):
  - บันทึกรายจ่ายที่ผูกบัญชี → toast มีชื่อบัญชี + ยอด
  - บันทึกรายจ่ายที่ไม่ผูกบัญชี → toast ไม่มีท่อนผลข้างเคียง
  - กด ✕ รายการเดินบัญชีครั้งแรก → ยังไม่ลบ; ครั้งที่สอง → ลบ + toast
