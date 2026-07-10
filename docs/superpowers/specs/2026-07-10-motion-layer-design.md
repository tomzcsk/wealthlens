# F42 — Motion Layer (animation ทั้งแอป)

วันที่: 2026-07-10 · สถานะ: approved

## เป้าหมาย

ให้ WealthLens รู้สึกมีชีวิตโดยไม่ขวางการอ่านตัวเลข — แอปการเงินที่ Tom เปิดทุกวัน
animation ต้อง "เนียน เร็ว ไม่ขวาง": 150–400ms, ไม่มี bounce/spring แรง ๆ

ครอบคลุม 4 ด้าน:

1. ตัวเลขวิ่ง (count-up) + การ์ดโผล่ไล่กัน (stagger)
2. กราฟวาดตัวเอง (Recharts)
3. เปลี่ยนหน้าลื่นไหล (page transition, modal)
4. ฟีดแบ็กตอนกดใช้งาน (button tap)

## การตัดสินใจที่ตกลงแล้ว

- **ใช้ framer-motion** — ยกเลิกกฎ "no extra packages" ที่เขียนไว้ใน `Toaster.tsx`
  (คอมเมนต์นั้นต้องแก้ ไม่ใช่ทิ้งให้ขัดกับโค้ดจริง)
- **Motion primitives layer** — หน้าเว็บไม่ import framer-motion โดยตรง
  แต่ห่อด้วย component ของเรา เปลี่ยนจังหวะทั้งแอปได้จากไฟล์เดียว
- **ไม่แตะ `Toaster.tsx`** — มันทำงานดีอยู่แล้ว (YAGNI)

## สถาปัตยกรรม

### `src/lib/motion.ts` — tokens แหล่งเดียว

```ts
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.4 };
export const EASE = [0.22, 1, 0.36, 1]; // easeOutQuint
export const STAGGER = 0.05;
```

ห้าม hardcode ตัวเลขเวลาใน component ใด ๆ

### `src/components/motion/` — 4 primitives

| Component | หน้าที่ | ใช้ที่ |
|---|---|---|
| `AnimatedNumber` | count-up เลขจริง แล้ว format ทุกเฟรม | KPI cards, LoanHero, NetWorthHero, ยอดสะสมบัญชี |
| `Stagger` | parent แจก delay 50ms ต่อลูก | KPI grid, savings cards, bank account cards |
| `FadeInUp` | fade + เลื่อนขึ้น 8px | ลูกของ `Stagger`, section เดี่ยว ๆ |
| `PageTransition` | `AnimatePresence mode="wait"` รอบ `<Outlet />` | `Layout.tsx` |

## กฎที่ต้องรักษา

### AnimatedNumber

- format ผ่าน `utils/formatters.ts` เท่านั้น (กฎ CLAUDE.md) — ห้าม format เอง
- คง `tabular-nums` ไว้เสมอ ไม่งั้นตัวเลขกระตุกซ้าย-ขวาตอนวิ่ง
- mount ครั้งแรก: วิ่งจาก 0
- ค่าเปลี่ยน (เช่น เปลี่ยนปี): วิ่งจากค่าเก่า → ค่าใหม่
- re-render ที่ค่าเท่าเดิม: **ไม่วิ่ง** (เทียบ prev value ด้วย ref)

### ตัวเลขไหน "ไม่" วิ่ง

`MonthlySummaryTable`, ตารางงวดผ่อน (`LoanScheduleTable`), รายการเดินบัญชี
(`MonthTransactionList`), `AllYearsSummary`

เหตุผล: ตัวเลขในตารางมีไว้ **อ่านเทียบกัน** ถ้า 120 ตัววิ่งพร้อมกันคือ noise ไม่ใช่ชีวิต
และ re-render หนักโดยไม่ได้อะไรกลับมา

### Stagger

ไม่ใช้กับ list ยาว (รายการเดินบัญชี 50 แถว × 50ms = คลื่นยาว 2.5 วินาที)
ใช้เฉพาะกลุ่มการ์ด ≤ 8 ใบ

### PageTransition

`mode="wait"` บังคับ — ไม่งั้นหน้าเก่ากับหน้าใหม่ซ้อนกันตอนสลับ
วางใน `Layout.tsx` รอบ `<Outlet />`

`PrintReportPage` อยู่ **นอก** `<Layout>` ใน `App.tsx` อยู่แล้ว → PDF ไม่โดน animation
โดยอัตโนมัติ ไม่ต้องมี guard พิเศษ

### กราฟ

ใช้ `isAnimationActive` + `animationDuration` ของ Recharts เอง
ตั้ง duration ให้ตรง token · **ไม่เอา framer ไปห่อ Recharts**

### Modal + ปุ่ม

- `Modal.tsx`: backdrop fade, panel `scale 0.96 → 1`
- ปุ่มหลัก: `whileTap={{ scale: 0.98 }}`

## prefers-reduced-motion

ใช้ `useReducedMotion()` ของ framer-motion → **ปิดจริง ไม่ใช่ลดลง**:

- ตัด transform และ count-up ทั้งหมด (เลขแสดงค่าปลายทางทันที)
- เหลือแค่ opacity ที่เปลี่ยนทันที
- Recharts: `isAnimationActive={false}`

## ขอบเขตที่ไม่ทำ (YAGNI)

- ไม่แตะ `Toaster.tsx`
- ไม่ทำ layout animation / shared element transition
- ไม่ทำ scroll-triggered animation
- ไม่แตะ business logic, schema, หรือ store ใด ๆ — งานนี้เป็น presentation ล้วน

## การตรวจสอบ

- `npm run typecheck` · `npm run lint` · `npm run build` ผ่าน
- verify scripts เดิมทั้ง 17 ตัวไม่ regress (งานนี้ไม่แตะ logic จึงต้องผ่านทั้งหมด)
- ขับ UI จริง: เปลี่ยนปีแล้ว KPI วิ่งจากค่าเก่า, สลับหน้าไม่ซ้อน,
  เปิด `/report/2025` แล้วการ์ดไม่จาง, เปิด reduced-motion แล้วเลขนิ่ง
