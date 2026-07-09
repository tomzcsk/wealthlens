# F36 — หนี้บ้าน: สร้างตารางผ่อนอัตโนมัติ (Amortization Generator)

*Design · 2026-07-09*

## 1. ปัญหา

Tom มีหนี้บ้านที่รู้แค่ 3 ตัวเลข: ยอดคงเหลือ ฿3,047,222.30 · ดอกเบี้ย 3.750%/ปี · จ่าย ฿30,000/เดือน
เขาไม่มีตารางผ่อน (schedule) จากธนาคาร

ระบบปัจจุบัน (`LoanForm`, F31) บังคับกรอกตารางเองทีละแถว — ใช้ได้กับ กยศ ที่ export จากพอร์ทัลมา แต่หนี้บ้าน 123 งวดกรอกมือไม่ไหว

**ปัญหาที่ซ่อนอยู่:** `getRemainingBalance = getScheduleTotal − getTotalPaid` และ `getTotalPaid` นับจาก `loan.scheduledPayments` ซึ่ง**ไม่มี UI ให้บันทึกเลย** (มีแค่ seed ของ กยศ) หนี้ที่ผู้ใช้สร้างเองจึงมี `scheduledPayments: []` ตลอดกาล → ยอดคงเหลือค้างที่ยอดเต็ม ไม่มีวันลด ถ้าไม่แก้ ฟีเจอร์นี้ไร้ประโยชน์

## 2. ขอบเขต

**In scope**
1. Pure util สร้างตารางลดต้นลดดอกจาก (ยอดคงเหลือ, อัตรา%/ปี, ค่างวด/เดือน, วันงวดแรก)
2. `LoanForm` มี 2 โหมด: กรอกเอง (เดิม) / คำนวณอัตโนมัติ (ใหม่)
3. `Loan.assumeOnSchedule?: boolean` — checkbox ผู้ใช้เลือกเอง: ถือว่างวดที่ถึงกำหนดแล้ว = จ่ายแล้ว
4. `getPrincipalRemaining()` + แสดง "เงินต้นคงเหลือ" บน `LoanDetail`
5. `scripts/verify-amortization.ts`

**Out of scope (YAGNI)**
- ดอกเบี้ยลอยตัวหลายช่วงอัตรา (MRR−x%) — ใช้อัตราเดียวคงที่ แก้ loan แล้ว re-generate เมื่ออัตราเปลี่ยน
- ดอกเบี้ยรายวัน (actual/365) — ใช้ ÷12 แบบชีตของ Tom (9,522.57 ตรงเป๊ะ)
- Re-generate ตารางเมื่อโปะ — ตารางอยู่นิ่ง โปะไปลดยอดคงเหลืออย่างเดียว
- สร้าง `ExpenseItem` อัตโนมัติทุกเดือน — expense "บ้าน" มีอยู่แล้ว หนี้ก้อนนี้เป็น tracker ล้วน ไม่แตะ cashflow

## 3. Data model

```ts
// types/index.ts — Loan
export interface Loan {
  // ...เดิมทั้งหมด
  /**
   * เมื่อ true: ถือว่าทุกงวดที่ dueDate ≤ วันนี้ ถูกจ่ายแล้ว (หักบัญชี
   * อัตโนมัติ) โดยไม่ต้องมี ScheduledPayment row. Optional →
   * payload เดิม (กยศ) hydrate ได้และคำนวณเหมือนเดิมทุกประการ.
   */
  assumeOnSchedule?: boolean;
}
```

`LoanInput` / `LoanPatch` ใน `stores/financeStore.ts` รับ `assumeOnSchedule?: boolean` เพิ่ม (patch ใช้ `boolean` — ไม่ต้องมี `| null` เพราะ `false` คือค่า "ปิด" อยู่แล้ว)

**Backward-compat:** field เป็น optional, `undefined` = ปิด → กยศ ของ Tom และ payload Drive เดิมคำนวณเท่าเดิม 100%

## 4. `src/utils/amortization.ts` (ใหม่ · pure, total)

```ts
export interface AmortizationInput {
  openingBalance: number;     // เงินต้นคงเหลือวันนี้
  annualRatePercent: number;  // 3.75 = 3.75%/ปี
  monthlyPayment: number;
  firstDueDate: string;       // ISO yyyy-mm-dd
}

export type AmortizationResult =
  // rows = LoanScheduleDraftRow[] (utils/loanForm) — เข้า finalizeSchedule เส้นทางเดิม
  | { ok: true; rows: LoanScheduleDraftRow[]; totalInterest: number; totalPaid: number }
  | { ok: false; error: AmortizationError };

export type AmortizationError =
  | 'INVALID_INPUT'      // ยอด ≤ 0 / อัตรา < 0 / ค่างวด ≤ 0 / วันที่ไม่ถูก
  | 'PAYMENT_TOO_LOW'    // ค่างวด ≤ ดอกงวดแรก → ผ่อนไม่มีวันหมด
  | 'TOO_MANY_PERIODS';  // > 600 งวด (50 ปี)
```

อัลกอริทึม (วนเดือนละงวด):
```
interest  = round2(balance × annualRate / 100 / 12)
principal = min(monthlyPayment − interest, balance)
balance   = round2(balance − principal)
```
งวดสุดท้ายรับเศษ (`principal = balance` → `total = balance + interest`)
วันครบกำหนดใช้ `stepDate` ที่มีอยู่แล้ว → export จาก `utils/loanForm.ts` (clamp สิ้นเดือน: 31 ม.ค. + 1 เดือน → 28 ก.พ.)

`principalRatio` / `totalAmount` ปล่อยให้ `finalizeSchedule()` เดิมคิด — amortization คืน draft rows เข้าเส้นทางเดียวกับโหมดกรอกมือ **ไม่แตกเส้นทางบันทึกใหม่**

ผลลัพธ์คาดหวังของเคส Tom (งวดแรก 2026-08-05):
| | |
|---|---|
| จำนวนงวด | 123 |
| งวด 1 | ดอก 9,522.57 · ต้น 20,477.43 |
| งวดสุดท้าย | รวม 11,727.32 |
| Σ ต้น | 3,047,222.30 (เป๊ะ ไม่มีเศษหาย) |
| Σ ดอก | 624,505.02 |

## 5. `src/utils/loanCalculations.ts` (แก้)

```ts
/** งวดที่ถึงกำหนดแล้ว ณ referenceDate — [] เมื่อ assumeOnSchedule ปิด */
const dueInstallments = (loan, ref) =>
  loan.assumeOnSchedule ? loan.schedule.filter(i => toMs(i.dueDate) <= ref.getTime()) : [];
```

| ฟังก์ชัน | การเปลี่ยนแปลง |
|---|---|
| `getTotalPaid(loan, ref?)` | บวก Σ `totalAmount` ของ `dueInstallments` เพิ่มจาก `scheduledPayments` + `extraPayments` |
| `getRemainingBalance(loan, ref?)` | ไม่แก้ (ได้ผลตามอัตโนมัติ) |
| `getMergedPaymentLog(loan, ref?)` | งวดที่ถึงกำหนดโผล่เป็น `source: 'auto'`, `label: 'หักตามตาราง'` |
| `getThisYearProgress` | `paidThisYear` นับงวดที่ถึงกำหนดในปีนั้นด้วย |
| `getPrincipalRemaining(loan, ref?)` **(ใหม่)** | `Σต้นทั้งตาราง − Σต้นงวดที่จ่ายแล้ว − Σ extraPayments` (floor 0) |
| `getLoanSummary` | เพิ่ม `principalRemaining` ใน struct |

ทุกฟังก์ชันรับ `referenceDate: Date = new Date()` (มี default อยู่แล้วในบางตัว) เพื่อให้ verify script กด reference date ได้

**หมายเหตุความหมาย:** `remaining` เดิม = ต้น+ดอกที่ยังไม่จ่าย (ของ กยศ ไม่มีดอก ทั้งสองค่าเท่ากัน) หนี้บ้านสองค่าต่างกันมาก (3.67M vs 3.05M) จึงต้องโชว์คู่กัน

## 6. UI

**`LoanForm.tsx`** — radio 2 โหมด (โหมดคำนวณโผล่เฉพาะตอน *create*; edit ใช้กรอกมือ/สร้างใหม่ทับ)
- `กรอกตารางเอง` (default)
- `คำนวณอัตโนมัติ (ลดต้นลดดอก)` → 4 ช่อง text: ยอดคงเหลือ · ดอกเบี้ย %/ปี · จ่าย/เดือน · วันงวดแรก
  - preview สดใต้ฟอร์ม: "123 งวด · จบ ต.ค. 2036 · ดอกรวม ฿624,505 · จ่ายรวม ฿3,671,727" + แถวงวดแรก/งวดสุดท้าย
  - error เป็นข้อความไทยใต้ช่อง เช่น *"ค่างวด ฿9,000 น้อยกว่าดอกเบี้ยงวดแรก ฿9,522.57 — ผ่อนไม่มีวันหมด"*
  - กด "สร้างตาราง" → เติม `EditRow[]` (แก้รายแถวต่อได้) — **ไม่ render 123 แถวเป็น input พร้อมกัน**: แสดง 5 แถวแรก + สรุป และปุ่ม "แสดงทั้งหมด"
- checkbox **"หักบัญชีอัตโนมัติทุกเดือน (ถือว่างวดที่ถึงกำหนดแล้ว = จ่ายแล้ว)"** — แยกจากโหมด ใช้ได้ทั้ง create/edit, default ปิด
  - helper text: *"ปิดไว้ถ้าจ่ายเองไม่ตรงงวด แล้วบันทึกเป็นโปะพิเศษแทน"*

**`LoanDetail.tsx` — LoanHero** เพิ่มช่อง "เงินต้นคงเหลือ" ข้าง "ยอดคงเหลือ (ต้น+ดอก)" แสดงเฉพาะเมื่อ `principalRemaining !== remaining` (กยศ ไม่มีดอก → ไม่โผล่ ไม่รก)

**`PaymentLogTable`** ไม่ต้องแก้ — บริโภค `getMergedPaymentLog` อยู่แล้ว

## 7. Verification — `scripts/verify-amortization.ts`

1. เคส Tom (3,047,222.30 / 3.75% / 30,000): 123 งวด, งวด1 ดอก 9,522.57, Σต้น = 3,047,222.30 เป๊ะ, Σดอก = 624,505.02, งวดสุดท้ายคงเหลือ 0
2. `PAYMENT_TOO_LOW` เมื่อค่างวด = 9,000
3. `INVALID_INPUT` เมื่อยอด ≤ 0 / ค่างวด ≤ 0
4. อัตรา 0% → ตาราง = ceil(ยอด / ค่างวด) งวด, ดอกรวม 0
5. `stepDate` clamp: งวดแรก 2026-01-31 → งวด 2 = 2026-02-28
6. `assumeOnSchedule` เปิด + reference date หลังงวด 3 → `totalPaid` = Σ 3 งวดแรก, `principalRemaining` ลดตามต้น 3 งวด
7. `assumeOnSchedule` ปิด → `totalPaid` = 0 (พฤติกรรมเดิม)
8. **Regression:** seed กยศ ของ Tom → `getLoanSummary` ทุกค่าเท่าเดิม (ไม่มี field → ไม่นับงวดอัตโนมัติ)

บวก `npm run typecheck` + `npm run build` + verify scripts เดิมไม่ regress
