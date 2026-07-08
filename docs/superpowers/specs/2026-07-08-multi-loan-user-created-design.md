# Design — หนี้สินหลายก้อน + เพิ่มหนี้เองได้ทุกแบบ

**วันที่:** 2026-07-08
**Feature id (ใหม่):** F31 — Multi-loan + user-created loans
**สถานะ:** approved, รอเขียน implementation plan

---

## 1. ปัญหา

แอปตอนนี้มีผู้ใช้ 2 คน แต่ฟีเจอร์ "หนี้สิน" ถูกออกแบบรอบ กยศ ของ Tom คนเดียว:

- `LoansPage` empty state มีปุ่มเดียวคือ **"โหลด กยศ ตัวอย่าง"** ซึ่ง seed ข้อมูล กยศ **ส่วนตัวของ Tom** (`seedLoan(gslLoan)`) ให้ผู้ใช้คนอื่น — คนที่ 2 ที่ไม่มี กยศ จะโดนยัดข้อมูลของ Tom และไม่มีทางสร้างหนี้ของตัวเอง
- `LoansPage` แสดงได้แค่ `loans[0]` — ถ้ามีหลายก้อนจะเห็นแค่ก้อนแรก
- ไม่มี form สร้างหนี้เอง และไม่มี action แก้ไขหนี้ (`updateLoan`)

**เป้าหมาย:**
- ผู้ใช้ที่ไม่มี กยศ (คนที่ 2) สร้างหนี้ของตัวเองได้ **ทุกประเภท**
- ผู้ใช้ที่มี กยศ (Tom) เก็บได้ **หลายก้อนพร้อมกัน** แก้/ลบได้
- เลิกยัดข้อมูล "ของ Tom" ให้ผู้ใช้คนอื่น
- **ข้อมูล กยศ เดิมของ Tom ต้องปลอดภัย 100%** — ไม่มี migration ไม่มีการแปลง

---

## 2. Data model — ไม่แตะ schema

`Loan` type (`src/types/index.ts:526`) รองรับครบอยู่แล้ว ไม่ต้องแก้ interface:

```ts
interface Loan {
  id: string;
  name: string;
  type: 'gsl' | 'mortgage' | 'auto' | 'other';   // รองรับ "ทุกแบบ" อยู่แล้ว
  startDate: string;
  schedule: LoanInstallment[];                     // ผู้ใช้กรอกเอง
  scheduledPayments: ScheduledPayment[];           // เริ่มว่าง
  extraPayments: ExtraPayment[];                    // เริ่มว่าง
  linkedDeductionField?: LoanDeductionField;        // เว้นว่างสำหรับหนี้สร้างเอง
}
```

**หนี้ที่ผู้ใช้สร้างเอง:**
- `id` = UUID v4 ใหม่ (client-side)
- `linkedDeductionField` = เว้นว่าง (ไม่ auto-link เงินเดือน — ต่างจาก กยศ)
- `scheduledPayments` / `extraPayments` = `[]`
- `schedule[]` = มาจาก LoanForm (ดูข้อ 4)

**Backward-compat:** ทุกอย่างที่ derive มาจาก `schedule[]` + ledgers (`getLoanSummary`, ตารางงวด, payment log) ทำงานเหมือนเดิม เพราะ model ไม่เปลี่ยน กยศ ของ Tom ที่ persist ไว้ hydrate ได้ปกติ และ rehydrate backfill (`financeStore.ts:1529`) ยังคงอยู่

---

## 3. Store actions (`src/stores/financeStore.ts`)

| Action | สถานะ | พฤติกรรม |
|--------|-------|----------|
| `addLoan(loan: Loan)` | **เพิ่มใหม่** | `data.loans = [...loans, loan]` — ต่อก้อนใหม่ ไม่ยุ่งก้อนเดิม, bump `lastUpdated` |
| `updateLoan(id, patch: Partial<Loan>)` | **เพิ่มใหม่** | map หา `id` แล้ว merge patch (name/type/schedule/startDate) — ก้อนอื่นไม่แตะ, bump `lastUpdated` |
| `deleteLoan(id, opts)` | **มีแล้ว** ✓ | คงเดิม |
| `seedLoan(loan)` | **มีแล้ว** ✓ | คงเดิม (idempotent by id) — ใช้กับปุ่ม "โหลด กยศ ตัวอย่าง" |
| `addExtraPayment` / `deleteExtraPayment` | **มีแล้ว** ✓ | คงเดิม |

**หลักประกันความปลอดภัย:** action ที่เพิ่มทั้งหมดเป็น immutable update ผ่าน `set((state) => ...)` เดิม — เขียนแบบ pure ตาม pattern `seedLoan`/`deleteLoan` ที่มีอยู่ ไม่มี side-effect นอกจาก `lastUpdated`. `updateLoan`/`deleteLoan` รันเฉพาะเมื่อผู้ใช้กดปุ่มบนก้อนนั้น

---

## 4. `src/components/loans/LoanForm.tsx` (สร้าง/แก้ไข)

Component เดียว ใช้ทั้ง create และ edit (โหมดต่างกันที่ prop `initialLoan?`)

**Fields:**
- **ชื่อหนี้** (`name`) — required
- **ประเภท** (`type`) — dropdown 4 ตัวเลือก: กยศ / สินเชื่อบ้าน / รถยนต์ / อื่นๆ (map → `gsl|mortgage|auto|other`)
- **วันเริ่มงวดแรก** (`startDate`) — date input

**Schedule builder (กรอกทุกงวดเอง — ต้น/ดอก แยก):**
1. ผู้ใช้ระบุ **จำนวนงวด (N)** + **ความถี่** (รายเดือน / รายปี)
2. กด "สร้างตาราง" → ระบบ scaffold N แถว: `installmentNumber` 1..N, `dueDate` ไล่จาก `startDate` (+1 เดือน หรือ +1 ปี ต่อแถว), ยอดเปล่า (0)
3. ผู้ใช้ **แก้ได้ทุกแถว**: `ต้น (principalAmount)`, `ดอก (interestAmount)`, `วันครบกำหนด (dueDate)`
4. ระบบคำนวณให้อัตโนมัติต่อแถว:
   - `totalAmount = principalAmount + interestAmount`
   - `principalRatio = principalAmount / Σ(principalAmount ทุกแถว)` (0 ถ้าผลรวมเป็น 0)
5. แสดงยอดรวมท้ายตาราง (Σ totalAmount) ให้เห็นภาระทั้งก้อน

**โหมด edit:** preload `schedule` เดิมลงในตารางแก้ไข — ปรับจำนวนแถวได้ (เพิ่ม/ลบท้ายตาราง)

**Validation:**
- `name` ไม่ว่าง
- `schedule.length >= 1`
- ทุกยอด `>= 0`
- `dueDate` เป็นวันที่ถูกต้อง (ISO yyyy-mm-dd)
- ถ้าไม่ผ่าน → disable ปุ่มบันทึก + ข้อความ inline

**บันทึก:**
- โหมด create → `addLoan(loan)` + toast "เพิ่มหนี้แล้ว"
- โหมด edit → `updateLoan(id, patch)` + toast "แก้ไขหนี้แล้ว"

---

## 5. `src/pages/LoansPage.tsx` — refactor เป็น multi-loan

`LoansPage` ตอนนี้ ~360 บรรทัด ทำหลายหน้าที่ (empty state + hero + this-year + tables + modals). แตกออก:

### 5.1 แตก `src/components/loans/LoanDetail.tsx`
ย้าย `LoanHero`, `ThisYearCard`, `LoanScheduleTable`, `PaymentLogTable`, modal เพิ่ม/ลบโปะ → เป็น component เดียวรับ prop `loan: Loan`. Responsibility เดียว: แสดง + จัดการ payment ของก้อนที่ส่งเข้ามา

### 5.2 `LoansPage` = orchestrator
- อ่าน `loans = data.loans ?? []`
- **state:** `selectedLoanId` (default = `loans[0]?.id`), `formMode` (`null | 'create' | { edit: id }`), `pendingDeleteLoanId`
- **Header:** หัวข้อ "💰 หนี้สิน" + ปุ่ม **"+ เพิ่มหนี้"** (เปิด LoanForm โหมด create ใน Modal)
- **ถ้ามีหลายก้อน:** แถว **pills เลือกก้อน** (เช่น `[กยศ] [สินเชื่อบ้าน]`) — คลิกเปลี่ยน `selectedLoanId`
- **แสดง `<LoanDetail loan={selectedLoan} />`** + ปุ่ม **แก้ไข** / **ลบ** ต่อก้อน (ลบ = confirm modal → `deleteLoan`)
- **Empty state (loans ว่าง):**
  - ปุ่มหลัก **"+ เพิ่มหนี้"** (primary)
  - ปุ่มรองเล็กๆ (text link) **"โหลด กยศ ตัวอย่าง"** — demote ลง, ระบุชัดว่าเป็นตัวอย่างของ Tom

### 5.3 Sidebar
คงเดิม — เมนู "💰 หนี้สิน" แสดงทุกผู้ใช้ (ผู้ใช้ที่ไม่มีหนี้เห็น empty state ที่มีปุ่ม "+ เพิ่มหนี้" ก็สมเหตุสมผล)

### 5.4 `LoanSummaryCard` (Overview)
คงเดิม — ซ่อนเมื่อ `!data.loans?.[0]`. (พิจารณาแยก: ถ้ามีหลายก้อนจะรวมยอดหรือโชว์ก้อนแรก — **นอก scope รอบนี้**, คงพฤติกรรมเดิมโชว์ `loans[0]`)

---

## 6. นอก scope (แยกทำทีหลังถ้าต้องการ)

1. **Auto-link หนี้สร้างเองเข้าเงินเดือน/รายเดือน** — หนี้สร้างเอง log การจ่ายผ่านปุ่ม "เพิ่มโปะ" (`extraPayments`) เท่านั้น ซึ่งนับรวมใน `getTotalPaid` ถูกต้องอยู่แล้ว ไม่ผูก `deductions.gsl`
2. **Multi-user LocalStorage isolation** — browser เดียวหลายผู้ใช้ share `wealthlens_data` blob (แยกจริงที่ Drive ต่อ account). เป็น concern คนละเรื่อง แก้แยก
3. **`LoanSummaryCard` รวมหลายก้อน** — คงโชว์ `loans[0]` ไปก่อน

---

## 7. Verification (ก่อนถือว่าเสร็จ)

- `npm run typecheck` + `npm run build` ผ่าน
- **Verify script** (`scripts/verify-multi-loan.ts` หรือคล้ายกัน): assert ว่า seed กยศ ของ Tom (`gslLoan`) ผ่าน `getLoanSummary` แล้วได้ `scheduleTotal` / `remaining` / `progressFraction` **เท่าเดิมเป๊ะ** หลัง refactor (พิสูจน์ว่าข้อมูลเดิมไม่กระทบ)
- Assert `addLoan` / `updateLoan` / `deleteLoan` ทำงานถูก (เพิ่ม/แก้/ลบ ก้อนที่ระบุ ไม่แตะก้อนอื่น)
- Assert LoanForm generator สร้าง `schedule[]` ที่ `totalAmount = ต้น+ดอก` และ `Σ principalRatio ≈ 1`
- UI smoke ผ่าน browser: empty → เพิ่มหนี้ → เห็นก้อนใหม่ → แก้ → ลบ

---

## 8. ไฟล์ที่แตะ

| ไฟล์ | การเปลี่ยน |
|------|-----------|
| `src/stores/financeStore.ts` | เพิ่ม `addLoan`, `updateLoan` actions + type ใน interface |
| `src/components/loans/LoanForm.tsx` | **ใหม่** — form สร้าง/แก้ + schedule builder |
| `src/components/loans/LoanDetail.tsx` | **ใหม่** — แตกจาก LoansPage (hero + this-year + tables + payment modals) |
| `src/pages/LoansPage.tsx` | refactor เป็น multi-loan orchestrator (pills + add/edit/delete) |
| `scripts/verify-multi-loan.ts` | **ใหม่** — verify data safety + actions |
| `features.json` | เพิ่ม F31 |

ไม่แตะ: `types/index.ts` (schema), `data/seedData.ts`, `driveSync.ts`, `Sidebar.tsx`, `LoanSummaryCard.tsx`, `loanCalculations.ts`
