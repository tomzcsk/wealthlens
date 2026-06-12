# Design: Savings Category Cards (card ออมตามหมวด บน Overview)

**Date:** 2026-06-12
**Status:** Approved by Tom
**Scope:** แถว savings cards บน Overview แสดงทุกหมวดออมที่มีข้อมูลในปีที่เลือก
(เดิมมีแค่ Kept / Dime / ออมเที่ยว)

## Requirements (จากการคุยกับ Tom)

1. **ทุกหมวดที่มีข้อมูล** — card โผล่อัตโนมัติตามหมวดที่มียอดในปีนั้น
   หมวดที่ไม่มีข้อมูล = ไม่แสดง (ไม่รก)
2. **แค่ยอดสะสม** — ไม่มีเป้าหมาย/progress bar (เพิ่มทีหลังได้ถ้าอยากได้)

## Architecture (Approach A — approved)

ไม่แตะ schema, ไม่มีข้อมูลใหม่ — อ่านจาก `years[year].savings` ที่มีอยู่:

1. **Selector** `useSavingsCategoryTotals(year)` ใน `src/hooks/useFinanceData.ts`
   — รวม `SavingsItem.amount` ทั้งปีแยกตาม category คืน
   `Array<{ category: SavingsCategory; total: number; itemCount: number }>`
   - กรองเฉพาะ `total > 0`
   - **ไม่รวม** `investment-dime` และ `travel` — สองหมวดนั้นมี card
     เป้าหมายเฉพาะ (DimeInvestmentCard / TravelSavingsCard) อยู่แล้ว ไม่แสดงซ้ำ
   - เรียงตามยอดมาก → น้อย

2. **Component ใหม่** `src/components/dashboard/SavingsCategoryCard.tsx`
   — generic ใบเดียวใช้ทุกหมวด props: `{ category, total, itemCount, year }`
   - แสดง: icon + ชื่อหมวดไทย + ปี, ยอดสะสม (number-xl, tabular-nums,
     format ผ่าน formatters), "{itemCount} รายการ" ตัวเล็ก
   - ไม่มี progress bar, ไม่มีปุ่มแก้ไข
   - config ต่อหมวด (icon/label/สี):
     `gold` → 🥇 ออมทอง (amber) | `emergency` → 🚨 เงินฉุกเฉิน (red)
     | `retirement` → 🏖️ เกษียณ (violet) | `general` → 💰 ออมทั่วไป (emerald)

3. **OverviewPage** — หลัง `<TravelSavingsCard />` ใน grid เดิม:
   `totals.map((t) => <SavingsCategoryCard key={t.category} ... />)`
   ปีที่ไม่มีหมวดเพิ่มเติม → หน้าตาเหมือนเดิมทุกประการ

## ข้อเท็จจริงเรื่องหมวดทอง

ยอดหมวด `gold` มาจาก `SavingsItem` ที่เกิดเฉพาะการซื้อทองด้วย**เงินสด**
(`GoldPaymentMethod === 'cash'`) — ซื้อผ่าน Kept ไม่สร้าง SavingsItem
เพราะเงินถูกนับใน Kept ไปแล้ว (กันนับซ้ำ ตามดีไซน์ ledger F25) ดังนั้น
card ออมทองใบนี้ = "เงินสดที่จ่ายซื้อทองปีนี้" ไม่ใช่มูลค่าทองที่ถือ
(มูลค่าถือดูที่หน้า Gold)

## Edge cases

- ปีไม่มี savings เลย → ไม่มี card เพิ่ม (selector คืน [])
- หมวดที่ยอดติดลบสุทธิ (ถอน > ฝาก ถ้ามี) → `total > 0` filter ตัดออก
- เปลี่ยนปี → totals คำนวณใหม่ตาม selectedYear

## Testing

- typecheck + lint + build
- Playwright บน dev server: seed savings หลายหมวดผ่าน LocalStorage →
  card โผล่ตามหมวด, ปีไม่มีข้อมูลไม่โผล่, ยอดตรงกับผลรวมมือ
