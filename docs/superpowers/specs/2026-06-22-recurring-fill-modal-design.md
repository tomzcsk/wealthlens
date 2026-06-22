# Recurring-Fill Preview/Edit Modal — Design

**Date:** 2026-06-22
**Owner:** Tom
**Status:** ✅ Approved (pending implementation)

## Problem

ปุ่ม "📋 เติมรายการประจำ" บนหน้า Monthly (ทั้งส่วนรายจ่าย `ExpenseList` และส่วนออม/ลงทุน `SavingsList`)
ปัจจุบันกดแล้ว **เติมทันที** — วน `addExpense` / `addSavings` ตาม template ที่ derive จากเดือนล่าสุด
โดยไม่เปิดโอกาสให้ดูหรือแก้ก่อน

Tom ต้องการ "ตั้งค่าได้ทั้งหมดว่ามีรายการอะไรบ้าง" — แต่ในรูปแบบ **at-fill-time** ไม่ใช่หน้า settings แยก:
กดปุ่ม → เด้ง modal โชว์รายการที่จะเติม → แก้ได้ตรงนั้น → ถ้าไม่แก้ก็กดยืนยันใช้ได้ตามปกติ

## Goals

- กดปุ่ม "เติมรายการประจำ" → เปิด modal **เสมอ** (แทนการเติมทันที)
- ใน modal Tom แก้ได้ครบ: ติ๊กเลือก/ไม่เอา · แก้ชื่อ · เปลี่ยนหมวด · แก้จำนวนเงิน · เพิ่มแถวใหม่ · ลบแถว
- กด "ยืนยันเติม" → เขียนเฉพาะแถวที่ติ๊กไว้ลงเดือนปัจจุบัน (ผ่าน action เดิม)
- ใช้ได้ทั้งรายจ่าย (`ExpenseList`) และออม/ลงทุน (`SavingsList`)
- ไม่มี template เดิม (เดือนแรกสุด / เติมครบแล้ว) → เปิด modal เปล่าพร้อมปุ่ม "เพิ่มรายการ" ให้สร้างเอง

## Non-Goals

- ไม่สร้าง persistent config store แยก — template ยัง derive จากประวัติเหมือนเดิม
  (สิ่งที่ Tom ยืนยันเติมในเดือนนี้กลายเป็น source ของเดือนถัดไปเองอยู่แล้ว)
- ไม่แตะ `recurringTemplate.ts`, financeStore actions, หรือ schema
- ไม่ยุ่งกับปุ่ม "💳 ผ่อนของ" / installment flow
- ไม่ยุ่งกับ Kept (Krungsri) entry ใน SavingsList

## Approach (เลือก A)

**A — Generic `RecurringFillModal` ตัวเดียว ใช้ร่วมกันทั้ง 2 list.**
ParentList หา template (ของเดิม) → ส่ง initial items + category options เข้า modal →
modal คืน items ที่ผ่านการแก้ → parent วน action เดิม. DRY, UX ตรงกัน, แก้ที่เดียว.

(ทางเลือกที่ตัดทิ้ง: B = modal แยก 2 ตัว → โค้ดซ้ำ; C = reuse `ExpenseForm` วนซ้ำ → ไม่เข้ากับ single-item form)

## Components

### 1. `src/components/forms/RecurringFillModal.tsx` (ใหม่)

Generic, ไม่ผูกกับ expense/savings โดยตรง — รับ category options เป็น prop.

```ts
export interface RecurringFillCategoryOption {
  value: string;   // ExpenseCategory | SavingsCategory
  label: string;   // จาก *_CATEGORIES[x].label
  icon: string;    // จาก *_CATEGORIES[x].icon
}

export interface RecurringFillDraft {
  category: string;
  name: string;
  amount: number;
}

export interface RecurringFillModalProps {
  open: boolean;
  onClose: () => void;
  title: string;                 // เช่น "เติมรายการประจำ" / "เติมรายการออมประจำ"
  /** ป้ายบอกที่มา เช่น "จาก มี.ค. 2026" — undefined เมื่อไม่มี template */
  sourceLabel?: string;
  initialItems: ReadonlyArray<RecurringFillDraft>;
  categories: ReadonlyArray<RecurringFillCategoryOption>;
  /** หมวด default สำหรับแถวที่กด "เพิ่มรายการ" */
  defaultCategory: string;
  /** เรียกเมื่อกดยืนยัน — ส่งเฉพาะแถวที่ติ๊ก + ชื่อไม่ว่าง */
  onConfirm: (items: ReadonlyArray<RecurringFillDraft>) => void;
}
```

**Internal state:** working array ของ draft rows แต่ละแถวมี:
- `key: string` — local id (จาก index/counter) สำหรับ React key เท่านั้น ไม่เขียนลง store
- `included: boolean` — ติ๊กเลือก (default true)
- `category`, `name`, `amount`

ทุกครั้งที่ `open` เปลี่ยนจาก false→true ให้ re-seed working array จาก `initialItems`
(แถวที่ติ๊กไว้ default = true; amount/category/name ตาม initial).

**Layout (ในกรอบ `Modal size="md"`):**
- header section: title (จาก Modal) + บรรทัดเล็ก `sourceLabel` ถ้ามี / "ไม่พบรายการประจำเดิม — เพิ่มเองได้" ถ้าไม่มี
- ตารางแถว: `☑ checkbox | name text input | category <select> | amount number input | 🗑️`
  - amount ใช้ `tabular-nums` + format ตาม `utils/formatters` (input เป็น number ปกติ)
  - แถวที่ติ๊กออก → จาง (`opacity-50`) แต่ยังแก้ได้
- ปุ่ม "+ เพิ่มรายการ" (เพิ่มแถวว่าง: name="", category=defaultCategory, amount=0, included=true)
- footer: "รวม (ที่เลือก): ฿X" + ปุ่ม "ยกเลิก" / "ยืนยันเติม N รายการ"
  - N = จำนวนแถวที่ included && name.trim() ไม่ว่าง
  - ปุ่มยืนยัน disabled เมื่อ N = 0

**onConfirm payload:** กรอง `included && name.trim() !== ''` → map เป็น `{category, name: name.trim(), amount}`.
(`isRecurring: true` เติมโดย parent ตอน build object ให้ action — modal ไม่รู้จัก field นี้)

### 2. `ExpenseList.tsx` (แก้)

- เพิ่ม state: `fillModalOpen: boolean`, `fillDraft: { items: RecurringFillDraft[]; sourceLabel?: string }`
- `handleFillRecurring` เปลี่ยนเป็น:
  ```
  const template = findRecurringTemplate(data, year, month);
  setFillDraft(template
    ? { items: template.items.map(({category, name, amount}) => ({category, name, amount})),
        sourceLabel: `จาก ${formatThaiMonth(template.sourceMonth)} ${template.sourceYear}` }
    : { items: [], sourceLabel: undefined });
  setFillModalOpen(true);
  ```
  (ไม่มี toast "ไม่มีรายการประจำ" อีกแล้ว — เปิด modal เปล่าแทน)
- render `<RecurringFillModal>` ด้วย `categories` = `CATEGORY_ORDER.map(c => ({value:c, ...EXPENSE_CATEGORIES[c]}))`,
  `defaultCategory="other"`, `onConfirm`:
  ```
  items.forEach(it => addExpense(year, month, { ...it, isRecurring: true }));
  setFillModalOpen(false);
  pushToast({ message: `เติม ${items.length} รายการแล้ว`, tone: 'success' });
  ```
- ปุ่มทั้ง 2 จุด (empty state + ปกติ) ชี้ `handleFillRecurring` เหมือนเดิม

### 3. `SavingsList.tsx` (แก้)

เหมือน ExpenseList แต่:
- ใช้ `findRecurringSavingsTemplate`, `addSavings`
- `categories` = `SAVINGS_CATEGORY_ORDER.map(c => ({value:c, ...SAVINGS_CATEGORIES[c]}))`
- `defaultCategory="general"`
- title "เติมรายการออมประจำ"

## Data Flow

```
[กดปุ่มเติม] → findRecurring*Template(data, year, month)
   → setFillDraft({items, sourceLabel}) → เปิด RecurringFillModal
   → Tom แก้ (ติ๊ก/ชื่อ/หมวด/เงิน/เพิ่ม/ลบ) ใน local state ของ modal
   → [ยืนยันเติม] → onConfirm(filteredItems)
   → parent วน add*(year, month, {...it, isRecurring:true})
   → store update → list re-render + toast
```

## Edge Cases

- ไม่มี template / เติมครบแล้ว → modal เปล่า (items=[]) ไม่มี sourceLabel, ปุ่มยืนยัน disabled จนกว่าจะเพิ่มแถวที่มีชื่อ
- ติ๊กออกทุกแถว → ปุ่มยืนยัน disabled
- ชื่อว่าง → แถวนั้นไม่ถูกนับ/ไม่ถูกเขียน (ถูกกรองออกใน onConfirm)
- amount = 0 ยังเขียนได้ (เช่น ค่าไฟที่ยังไม่รู้ยอด — pattern เดิมก็ default 0)
- ชื่อซ้ำกับรายการที่มีในเดือนนั้นแล้ว: `findTemplate` กรอง duplicate ออกตั้งแต่ต้น (initial items ไม่มีซ้ำอยู่แล้ว); ถ้า Tom เพิ่มเองซ้ำ → ระบบจะเพิ่มเป็นอีกรายการ (พฤติกรรมเดียวกับ add ปกติ ไม่บล็อก)
- ปิด modal (ESC / backdrop / ยกเลิก) → ไม่เขียนอะไร

## Testing / Verification

- `npm run typecheck` + `npm run build` ผ่าน
- Manual (dev server):
  1. เดือนที่มี template → กดปุ่ม → modal โผล่พร้อมรายการ + sourceLabel → กดยืนยันเลย → รายการถูกเติม (เท่าเดิมกับพฤติกรรมเก่า)
  2. แก้ใน modal (ติ๊กออก 1, แก้เงิน 1, เพิ่ม 1) → ยืนยัน → เดือนได้รายการตามที่แก้
  3. เดือนเปล่า/เติมครบ → กดปุ่ม → modal เปล่า → เพิ่มเอง → ยืนยัน → ได้รายการ
  4. ทำซ้ำ (2) บนหน้า SavingsList กับหมวดออม
  5. ยกเลิก/ESC → ไม่มีอะไรเปลี่ยน

## Files Touched

- `src/components/forms/RecurringFillModal.tsx` (ใหม่)
- `src/components/forms/ExpenseList.tsx` (แก้ handleFillRecurring + render modal)
- `src/components/forms/SavingsList.tsx` (แก้ handleFillRecurring + render modal)
- **ไม่แตะ:** `recurringTemplate.ts`, `financeStore.ts`, types/schema
