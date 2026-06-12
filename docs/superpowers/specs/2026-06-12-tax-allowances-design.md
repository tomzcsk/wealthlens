# Design: ช่องลดหย่อนภาษีรายช่อง (Itemized Tax Allowances)

**Date:** 2026-06-12
**Status:** Approved by Tom
**Scope:** ขยายหน้า 🧮 คำนวณภาษี (`TaxCalculatorPage`) จากช่องลดหย่อนก้อนเดียว
เป็นช่องรายรายการครบชุดตามกรมสรรพากร พร้อม persist แยกตามปี + Drive sync

## Requirements (จากการคุยกับ Tom)

1. **Persist ถาวรแยกตามปี** — refresh ไม่หาย, sync ขึ้น Google Drive,
   ติดไปกับ JSON backup
2. **ครบชุดมาตรฐานกรมสรรพากร** — ครอบครัว / ประกัน / ลงทุน / บ้าน / บริจาค
   ช่องที่ไม่ใช้ปล่อย 0 ได้
3. **Cap อัตโนมัติ** — กรอกยอดจ่ายจริง ระบบคุมเพดานตามกฎหมายให้
   ช่องครอบครัว (พ่อแม่/ผู้พิการ/บุตร) กรอกเป็นจำนวนคนแล้วระบบคูณให้

## Architecture (Approach A — approved)

ข้อมูลเก็บที่ **root ของ `WealthLensData`** ตาม pattern `loans`/`goldHoldings`:

```ts
taxAllowances?: { [year: string]: TaxAllowanceInputs };
```

- Optional field → payload เก่า hydrate ได้โดยไม่ต้อง migrate
- ติด Drive sync + export/import อัตโนมัติ (ทั้งก้อน `WealthLensData` sync อยู่แล้ว)
- ไม่แตะ `YearData` ที่มี consumer เยอะ

ทางที่ไม่เลือก: เก็บใน `preferences` (ผิดความหมาย — นั่นคือค่าตั้ง UI/เป้าหมาย)
และเก็บใน `YearData` (เป็น monthly ledger แต่ลดหย่อนเป็นยอดรายปี)

## Data Schema

```ts
interface TaxAllowanceInputs {
  // ครอบครัว — กรอกจำนวนคน ระบบคูณให้
  spouseNoIncome: boolean;        // คู่สมรสไม่มีเงินได้ → 60,000
  childrenCount: number;          // บุตร → 30,000/คน
  childrenBorn2561Count: number;  // บุตรคนที่ 2+ เกิด พ.ศ. 2561+ → 60,000/คน
  parentsCount: number;           // พ่อแม่ (อายุ 60+, เงินได้ ≤30k/ปี) → 30,000/คน
  disabledCount: number;          // ผู้พิการ/ทุพพลภาพ → 60,000/คน
  prenatalCare: number;           // ฝากครรภ์/คลอดบุตร — ยอดจ่ายจริง

  // ประกัน — ยอดจ่ายจริง
  lifeInsurance: number;          // ประกันชีวิต (คุ้มครอง ≥10 ปี)
  healthInsurance: number;        // ประกันสุขภาพตนเอง
  parentHealthInsurance: number;  // ประกันสุขภาพพ่อแม่
  pensionInsurance: number;       // ประกันชีวิตแบบบำนาญ

  // ลงทุน/เกษียณ
  rmf: number;
  thaiEsg: number;
  nsf: number;                    // กอช

  // บ้าน + บริจาค + อื่นๆ
  homeLoanInterest: number;       // ดอกเบี้ยเงินกู้ที่อยู่อาศัย
  donationEducation: number;      // บริจาคการศึกษา/กีฬา/รพ.รัฐ (นับ ×2)
  donationGeneral: number;        // บริจาคทั่วไป
  other: number;                  // มาตรการรายปี เช่น Easy E-Receipt (ไม่ cap)
}
```

**ไม่ต้องกรอก** (ดึงจากข้อมูลเงินเดือนจริงเหมือนเดิม): ประกันสังคม,
กองทุนสำรองเลี้ยงชีพ, ลดหย่อนส่วนตัว 60,000, หักค่าใช้จ่าย 50% ≤100,000

## Calculation — `resolveTaxAllowances` (pure function ใหม่ใน `taxCalculator.ts`)

รับ `(inputs, grossIncome, providentFund)` คืนรายการ `{ entered, applied }`
ต่อช่อง — UI ใช้แสดง badge เมื่อโดน cap แล้วส่งยอดรวมเข้า bracket math เดิม

| ช่อง | เพดาน |
|---|---|
| ฝากครรภ์/คลอด | 60,000 |
| พ่อแม่ | สูงสุด 4 คน (120,000) |
| ประกันสุขภาพตนเอง | ≤25,000 และ **รวมประกันชีวิต ≤100,000** |
| ประกันสุขภาพพ่อแม่ | 15,000 |
| ประกันบำนาญ | ≤15% ของเงินได้, ≤200,000 (เข้ากลุ่มเกษียณ) |
| RMF | ≤30% ของเงินได้, ≤500,000 (เข้ากลุ่มเกษียณ) |
| **กลุ่มเกษียณรวม** PVD+RMF+บำนาญ+กอช | **≤500,000** |
| ThaiESG | ≤30% ของเงินได้, ≤300,000 (แยกจากกลุ่มเกษียณ) |
| กอช | 30,000 |
| ดอกเบี้ยบ้าน | 100,000 |
| บริจาค | คิด **ท้ายสุด** หลังหักลดหย่อนอื่นทั้งหมด: การศึกษา ×2 ก่อน cap 10% ของเงินได้หลังหัก แล้วบริจาคทั่วไปอีก ≤10% ของยอดที่เหลือหลังหักบริจาคการศึกษา |

% caps อิง gross income ที่เลือกบนหน้า (เงินเดือน ± โบนัส ± คอม) —
ติ๊ก toggle แล้วคำนวณใหม่ทันที

## UI + Persistence

- หน้าเดิม เพิ่ม section "ลดหย่อน" ใต้ส่วนเลือกปี — 5 กลุ่ม
  (ครอบครัว / ประกัน / ลงทุน / บ้าน / บริจาค+อื่นๆ) grid 2-3 คอลัมน์
- ช่องตัวเลข comma-format + `tabular-nums` ผ่าน `utils/formatters` ตาม convention
- ช่องเดิม "ลดหย่อนเพิ่มเติม" (lump sum, ไม่เคย persist) → ถอดออก
  แทนด้วยช่อง "อื่นๆ" (ไม่มี migration เพราะของเดิมเป็น state ชั่วคราว)
- แก้ค่า → store action `updateTaxAllowances(year, inputs)` save LocalStorage
  ทันที → Drive sync debounce 2s ผ่าน pipeline เดิม (ไม่มีปุ่ม Save)
- Badge ส้ม "ใช้ได้ X" ข้างช่องที่กรอกเกิน cap
- Panel "รายได้และลดหย่อน" แสดงเฉพาะบรรทัดที่ applied > 0
- เปลี่ยนปี → โหลดชุดลดหย่อนของปีนั้น (ยังไม่เคยกรอก = ว่างทั้งหมด)

## Edge Cases

- รายได้ 0 หรือลดหย่อนรวม > รายได้ → taxable = 0 (logic เดิมรองรับ)
- Payload เก่าไม่มี `taxAllowances` → hydrate ปกติ (optional field)
- จำนวนคนติดลบ/ค่าติดลบ → clamp เป็น 0

## Testing / Verification

Repo ไม่มี test runner — verify ด้วย:
1. `npm run typecheck` + `npm run lint`
2. เคสคำนวณมือเทียบบน dev server จริง เช่น เงินได้ 1,000,000 +
   ประกันชีวิต 150,000 (→ applied 100,000) + พ่อแม่ 2 คน (→ 60,000) +
   RMF ชน group cap ร่วมกับ PVD
3. ตรวจ persist: กรอก → refresh → ค่าอยู่ครบ, สลับปีไม่ปนกัน
