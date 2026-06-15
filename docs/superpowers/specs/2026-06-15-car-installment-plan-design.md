# Design — รถยนต์เป็นแผนผ่อน 60 งวด (Car Installment Plan)

**Date:** 2026-06-15
**Feature ID:** F30
**Owner:** Tom
**Status:** 🟡 Spec — pending review

---

## 1. Problem & Goal

รายการ **"รถยนต์"** (category `vehicle`, ฿23,722/เดือน) ปัจจุบันเป็น expense
แบบ recurring ธรรมดา ติดป้าย "ประจำ" — แต่จริง ๆ มันคือ **สินเชื่อผ่อนรถ 60 งวด**

Tom อยากให้มันแสดงเป็น **"ผ่อน X/60"** เหมือนรายการยาง (Bridgestone Dueler AT002)
ทั้งบน:
1. **รายการ expense** (badge "ผ่อน 39/60" แทน "ประจำ")
2. **หน้า "แผนผ่อน"** (การ์ดแผน: ผ่อนไป 39/60, งวดถัดไป, ยอดคงเหลือ, timeline)

### ข้อเท็จจริงแผนผ่อนรถ (จาก Tom)

| ค่า | ค่าจริง |
|---|---|
| งวดที่ 1 | เม.ย. 2023 (`startYear=2023, startMonth=4`) |
| จำนวนงวด | 60 |
| ค่างวด | ฿23,722 (เท่ากันทุกงวด, ไม่มีเศษ) |
| ยอดรวมป้าย (`totalAmount`) | ฿1,423,320 (= 23,722 × 60) |
| งวดปัจจุบัน (มิ.ย. 2026) | งวด 39 |
| งวดสุดท้าย | มี.ค. 2028 (งวด 60) |

**สูตรเลขงวด:** `sequence = (year − 2023) × 12 + month − 3`
ตรวจ: มิ.ย. 2026 → (3×12)+6−3 = **39** ✓ · ม.ค. 2024 → 10 ✓

---

## 2. Core Insight — แยก "ตารางงวด" ออกจาก "แถว cashflow"

ระบบ installment เดิม (F24) ออกแบบให้ **แผน = ชุดแถว ExpenseItem ที่ปั๊มครบทุกงวดตั้งแต่ตอนสร้าง**
(ยางสร้างครบ 10 แถวพร้อมกัน) หน้าแผนผ่อนจึงคำนวณทุกอย่างจาก **การนับแถวที่มีอยู่จริง**
(`selectInstallmentPlans` ใน `src/stores/selectors.ts`)

แต่รถยนต์ต่างออกไป — เราจะ**ติดป้ายเฉพาะเดือนที่มีข้อมูลจริงเท่านั้น**
(ม.ค. 2024 → มิ.ย. 2026 ≈ 30 แถว) **ไม่สร้างแถว 2023** (ไม่มี itemized) และ
**ไม่สร้างแถวอนาคต** (ไม่ให้ยอดจ่ายเดือนข้างหน้าบวม) — ตามที่ Tom เลือก

ถ้าปล่อยให้หน้าแผนผ่อนนับแถวเหมือนเดิม รถจะแสดง **ผิดทั้งหมด**:

| ควรเป็น | ถ้านับแถว (เดิม) |
|---|---|
| ผ่อนไป 39/60 | ~30/60 |
| งวดถัดไป ก.ค. 2026 | ไม่มีแถวอนาคต → `nextDue=null` → **ตกไปหมวด "ผ่อนครบแล้ว"** ❌ |
| จบ มี.ค. 2028 | จบ มิ.ย. 2026 (แถวสุดท้ายที่มี) |

**ทางแก้:** ทำให้ `selectInstallmentPlans` คำนวณจาก **schedule ที่ derive จาก metadata**
(`startYear/startMonth + totalMonths`) แทนการนับแถว — แล้ว overlay แถวจริงที่มีลงไปบน schedule

- ✅ รถถูก: 39/60, งวดถัดไป ก.ค. 2026, จบ มี.ค. 2028, อยู่หมวด active
- ✅ ยางถูกเหมือนเดิม (แถวครบ → schedule = แถวจริง พอดี ตัวเลขไม่เปลี่ยน)
- ✅ ไม่ต้องสร้างแถวผี — เคารพ "ไม่แตะ 2023 / ไม่เพิ่มยอดอนาคต"

**ตัวเลขคงเหลือใช้แบบงวด:** remaining = (60−39) × 23,722 = **฿498,162**
(ต่างจากยอดหนี้จริง ฿521,362 ที่รวมดอกเบี้ย ซึ่งเป็นแนวคิด Loan Tracker ที่ไม่ได้เลือกทำ — ยืนยันแล้วกับ Tom ว่าใช้แบบงวดได้)

---

## 3. Architecture & Components

ไม่แตะ schema — `ExpenseItem.installment` (`InstallmentMeta`) มีอยู่แล้ว (F24)
งานทั้งหมดคือ: 1 pure util, ขยาย 1 selector, 1 store action (+1 safety action),
แก้ render 2 จุด, ปุ่ม DangerZone, และ tag seed

### 3.1 Pure util — `src/utils/installments.ts` (ไฟล์ใหม่)

รวม logic ที่ใช้ร่วมทั้ง seed + store + selector ไว้ที่เดียว (single source of truth)

```ts
// extract จาก financeStore (เลิก duplicate) — financeStore import กลับมาใช้
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const advanceMonth = (year, month, offset) => { ... }; // +offset เดือน

// ----- Car plan spec (ค่าคงที่ที่เดียว) -----
export const CAR_INSTALLMENT = {
  name: 'รถยนต์',
  category: 'vehicle' as ExpenseCategory,
  totalMonths: 60,
  perInstallment: 23722,
  totalAmount: 23722 * 60,   // 1,423,320
  startYear: 2023,
  startMonth: 4,
} as const;

// sequence ของเดือน (year,month) ในแผนนี้ ; null ถ้าอยู่นอกช่วง 1..60
export function carSequenceFor(year: number, month: number): number | null;

// pure: คืน years ใหม่ที่ item "รถยนต์"/vehicle ถูกเติม installment metadata
// - ไม่แตะ amount, ไม่แตะ isRecurring
// - planId เดียวทั้งแผน ; ถ้ามี item ที่ tag แล้ว reuse planId เดิม (idempotent)
// - ติดเฉพาะเดือนที่ sequence อยู่ใน 1..60 (เดือนที่มีแถวจริงเท่านั้น)
export function applyCarInstallmentTags(
  years: WealthLensData['years'],
  planId?: string,
): WealthLensData['years'];

// สร้างตารางงวดเต็ม 1..totalMonths จาก metadata + overlay แถวจริง
export interface ScheduledInstallment {
  sequence: number;
  year: number;
  month: number;
  amount: number;        // แถวจริงถ้ามี ; ไม่งั้น perInstallment (งวดท้ายดูดเศษ)
  materialized: boolean; // true = มีแถว expense จริงในเดือนนั้น
  itemId: string | null;
}
export function buildInstallmentSchedule(
  meta: InstallmentMeta,
  materializedBySeq: Map<number, { amount: number; itemId: string }>,
): ScheduledInstallment[];
```

### 3.2 `selectInstallmentPlans` — schedule-driven (`src/stores/selectors.ts`)

เดิม join แถวตาม planId แล้วนับ ; **ใหม่** — หลัง join แล้วสร้าง schedule จาก metadata
แล้ว derive ทุกตัวเลขจาก schedule:

```ts
const materializedBySeq = new Map(sorted.map(i => [i.sequence, { amount: i.amount, itemId: i.itemId }]));
const schedule = buildInstallmentSchedule(meta.meta, materializedBySeq);

const paid       = schedule.filter(s => ymKey(s.year, s.month) <= refYm);
const paidMonths = paid.length;                                   // รถ = 39
const paidAmount = paid.reduce((a, s) => a + s.amount, 0);
const nextDue    = schedule.find(s => ymKey(s.year, s.month) > refYm) ?? null; // ก.ค. 2026
const isCompleted = nextDue === null;
const remainingAmount = Math.max(0, meta.meta.totalAmount - paidAmount);        // 498,162
const end = schedule[schedule.length - 1];                        // มี.ค. 2028
```

เปลี่ยน `InstallmentPlanSummary`:
- เพิ่ม `schedule: ScheduledInstallment[]` (เต็ม `totalMonths` งวด)
- `nextDue` เปลี่ยน type เป็น `ScheduledInstallment | null`
- เพิ่ม `endYear/endMonth` (จาก schedule entry สุดท้าย) — แทนการอ่าน lastInstance จากแถวจริง
- คง `instances` (แถว materialized) ไว้ได้ แต่ KPI/timeline ย้ายไปใช้ `schedule`

**ผลต่อยาง:** schedule = แถวจริง 1:1 → paidMonths/paidAmount/nextDue/end เท่าเดิมเป๊ะ (ตัวเลขในภาพไม่ขยับ)

### 3.3 หน้าแผนผ่อน — `src/pages/InstallmentsPage.tsx`

- **Timeline** (`PlanCard`): map จาก `plan.schedule` แทน `plan.instances`
  - งวดอนาคต (ym > วันนี้) หรือยังไม่ materialized → สไตล์จาง + ป้ายเล็ก "คาดการณ์"
  - label ปุ่ม: `ดู timeline (${plan.schedule.length} งวด)` → รถแสดง "60 งวด"
  - key ใช้ `sequence` (itemId อาจ null)
- **เริ่ม → จบ:** ใช้ `plan.startYear/Month → plan.endYear/Month` (จาก schedule)
- **KPI `thisMonthDue`:** วนจาก `plan.schedule` ที่ ym === วันนี้ (รถ มิ.ย. 2026 = 23,722, ยาง = 2,890)

### 3.4 Safety — กันปุ่ม "ลบทั้งแผน" ลบรายจ่ายรถจริง

ปัจจุบัน `confirmDelete → deleteInstallmentPlan(planId)` **ลบทุกแถวของแผน**
สำหรับยางโอเค (แถว = ตัวแผน) แต่รถ = ลบประวัติรายจ่ายรถจริง 30 เดือนทิ้ง ❌

**แก้:** modal "ลบแผนผ่อน" ให้มี 2 ทางเลือก
1. **"ยกเลิกสถานะผ่อน (เก็บรายการไว้)"** → `untagInstallmentPlan(planId)` — ลบเฉพาะ
   `installment` metadata ออกจากทุกแถว แต่ **เก็บแถว expense + ยอดเงินไว้** (ป้าย "ประจำ" กลับมา)
2. **"ลบทุกงวด"** (ของเดิม, สีแดง) → `deleteInstallmentPlan` — สำหรับแผนซื้อจริงอย่างยาง

เพิ่ม store action ใหม่ `untagInstallmentPlan(planId)` ใน `financeStore.ts`
(atomic, bump `lastUpdated` ครั้งเดียว)

### 3.5 Store action — `tagCarInstallments()` (`src/stores/financeStore.ts`)

```ts
tagCarInstallments: () => {
  // reuse planId เดิมถ้ามี item รถถูก tag แล้ว ; ไม่งั้น uuidv4()
  set(state => {
    const years = applyCarInstallmentTags(state.data.years);
    const stamp = nowIso();
    return { data: { ...state.data, lastUpdated: stamp, years }, lastUpdated: stamp };
  });
  return <จำนวนงวดที่ tag>;   // ให้ DangerZone โชว์ใน toast
}
```
Idempotent — กดซ้ำได้ (เดือนใหม่ที่กรอกภายหลังจะถูก tag เพิ่มเมื่อกดอีกครั้ง)

### 3.6 ExpenseList render — ซ่อน "ประจำ" เมื่อเป็นงวดผ่อน (`src/components/forms/ExpenseList.tsx`)

```tsx
{item.isRecurring && installment == null && ( <span>ประจำ</span> )}
```
รถจึงโชว์แค่ "ผ่อน 39/60" (เหมือนยางเป๊ะ) โดยไม่ต้องแก้ค่า `isRecurring` ในข้อมูล
(เก็บความจริงว่ามันเป็นรายจ่ายประจำด้วย)

### 3.7 DangerZone — ปุ่ม trigger (`src/components/settings/DangerZone.tsx`)

ปุ่มใหม่ pattern เดียวกับ "เติม Kept" / "โหลด กยศ":
**"🚗 ผูกรถยนต์เป็นผ่อน (60 งวด)"** → `handleTagCar()`:
- เรียก `tagCarInstallments()`, toast `ผูกรถยนต์เป็นผ่อน N งวดแล้ว`
- ถ้า sign-in → `manualSync()` ขึ้น Drive
- busy state `'car'`

> การยกเลิก (undo) ทำผ่านปุ่ม "ยกเลิกสถานะผ่อน" บนการ์ดหน้าแผนผ่อน (3.4) — ไม่ต้องมีปุ่มแยกใน DangerZone

### 3.8 Seed — tag ตอน build (`src/data/seedData.ts`)

ห่อ years ที่ประกอบเสร็จด้วย `applyCarInstallmentTags(...)` ก่อน export
→ fresh install / `resetToSeed` แสดง badge + การ์ดแผนผ่อนรถถูกต้องด้วย
(ไม่ต้องแก้ literal ทีละแถว — ฟังก์ชันเดียวจัดการ)

---

## 4. Data Flow

```
DangerZone "ผูกรถยนต์"  ─┐
                         ├─► tagCarInstallments() ─► applyCarInstallmentTags(years)
seedData (build time) ──┘                                    │ เติม installment metadata
                                                             ▼
                                          years[*].expenses[*].items[].installment
                                                             │
                       ┌─────────────────────────────────────┼─────────────────────────┐
                       ▼                                      ▼                          ▼
            ExpenseList (badge "ผ่อน 39/60",        selectInstallmentPlans       LocalStorage +
             ซ่อน "ประจำ")                          → buildInstallmentSchedule     Drive sync
                                                    → การ์ดหน้าแผนผ่อน
```

---

## 5. Edge Cases & Constraints

- **ปี 2023 ไม่มี itemized expenses** → ไม่มีแถวรถให้ tag (งวด 1–9) → schedule เติมเป็น
  "คาดการณ์" ให้เอง, paidAmount นับจาก schedule (perInstallment) ไม่ใช่จากแถว → คงเหลือถูก
  **(ตัดสินใจ 2026-06-15: ปล่อย 2023 ว่างไว้ — ไม่ backfill แถวรถ 9 งวด เพื่อรักษา quirk
  "2023 = รายได้ล้วน" ; timeline แสดงงวด 1–9 เป็นคาดการณ์สีจาง)**
- **เดือนอนาคต (ก.ค. 2026+)** ไม่สร้างแถว → schedule แสดงเป็น "คาดการณ์" (จาง) ใน timeline,
  ยอดจ่ายรายเดือนจริงไม่บวม
- **กดปุ่มซ้ำ** → idempotent, reuse planId เดิม, sequence คำนวณใหม่ทุกครั้ง
- **เดือนใหม่ที่กรอกทีหลัง** จะยังไม่มี badge จนกดปุ่มอีกครั้ง (ตามที่เลือก "เฉพาะเดือนที่มีข้อมูล")
- **ค่างวดไม่เท่ากันบางเดือน** (ถ้า Tom เคยกรอกต่างจาก 23,722) → schedule ใช้ค่าแถวจริงตรงงวด
  ที่ materialized, ใช้ perInstallment เฉพาะงวดคาดการณ์
- **ไม่กระทบ:** totals รายเดือน/รายปี, category breakdown, anomaly, subscription manager
  (metadata ไม่เปลี่ยน amount/category/isRecurring)

---

## 6. Verification

**Script — `scripts/verify-car-installment.ts`** (pattern เดียวกับ `verify-tax-allowances.ts`):
1. `carSequenceFor(2026,6) === 39` ; `(2024,1) === 10` ; `(2023,3) === null` ; `(2028,4) === null`
2. `applyCarInstallmentTags` บน seed → item รถ มิ.ย. 2026 มี `installment.sequence === 39`,
   `totalMonths === 60`, `planId` เดียวกันทุกงวด ; **amount + isRecurring ไม่เปลี่ยน**
3. `selectInstallmentPlans(taggedSeed, refDate=2026-06-15)` → แผนรถ:
   `paidMonths === 39`, `totalMonths === 60`, `nextDue` = ก.ค. 2026,
   `isCompleted === false`, `remainingAmount === 498162`, end = มี.ค. 2028,
   `schedule.length === 60`
4. แผนยางใน seed (ถ้ามี) ตัวเลขไม่เปลี่ยนจาก baseline
5. `untagInstallmentPlan(planId)` → ทุกแถวรถ `installment === undefined`, amount คงเดิม,
   จำนวนแถวเท่าเดิม

**UI (Playwright):**
- หน้า expense: รถโชว์ badge "ผ่อน 39/60" ไม่มี "ประจำ"
- หน้าแผนผ่อน: การ์ดรถ "ผ่อนไป 39/60", "งวดถัดไป ก.ค. 2026", "เริ่ม เม.ย. 2023 → จบ มี.ค. 2028",
  KPI "ยอดผ่อนเดือนนี้" รวมค่างวดรถ, timeline 60 งวด (อนาคตจาง)
- ทดสอบ "ยกเลิกสถานะผ่อน" → รถหายจากแผนผ่อน, แถวรายจ่ายยังอยู่ครบ

---

## 7. Out of Scope

- Loan Tracker เต็มรูป (ยอดหนี้รวมดอกเบี้ย ฿521,362, ตารางดอกเบี้ย) — Tom เลือก badge/installment model
- Auto-tag เดือนอนาคตอัตโนมัติตอนกรอก expense ใหม่ (ใช้กดปุ่มซ้ำแทน)
- ผูก loan อื่น (บ้าน) เข้า installment model — เฉพาะรถยนต์รอบนี้

---

## 8. Files Touched

| ไฟล์ | งาน |
|---|---|
| `src/utils/installments.ts` | **ใหม่** — round2/advanceMonth (ย้ายมา), CAR_INSTALLMENT, carSequenceFor, applyCarInstallmentTags, buildInstallmentSchedule, ScheduledInstallment |
| `src/stores/selectors.ts` | `selectInstallmentPlans` schedule-driven + ขยาย `InstallmentPlanSummary` |
| `src/stores/financeStore.ts` | `tagCarInstallments()`, `untagInstallmentPlan()`, import round2/advanceMonth จาก util |
| `src/pages/InstallmentsPage.tsx` | timeline/เริ่ม-จบ/KPI ใช้ schedule, delete modal 2 ทางเลือก |
| `src/components/forms/ExpenseList.tsx` | ซ่อน "ประจำ" เมื่อมี installment |
| `src/components/settings/DangerZone.tsx` | ปุ่ม "🚗 ผูกรถยนต์เป็นผ่อน" |
| `src/data/seedData.ts` | ห่อ years ด้วย applyCarInstallmentTags |
| `scripts/verify-car-installment.ts` | **ใหม่** — assertions |
| `features.json` | เพิ่ม F30, mark completed ตอนจบ |
```
