# CLAUDE.md — WealthLens Personal Finance Dashboard

> **CLAUDE.md is the constitution of this project. Every session starts here.**  
> Keep this file lean and specific. Details live in referenced docs — use @file to load only what's needed.

---

## Project Identity

**WealthLens** — Personal Finance Dashboard สำหรับ Tom  
ติดตามรายรับ-รายจ่ายส่วนตัว ปี 2023–ปัจจุบัน  
Single-page app, no backend, all data in browser LocalStorage

---

## Quick Reference Map

| Need to know about... | Read this file |
|----------------------|----------------|
| Product goals, features, user stories | @prd.md |
| Tech stack, architecture, data schema | @techstack.md |
| UI design, colors, layout, components | @UXUI.md |
| Feature list + build checkpoint status | @features.json |

---

## Architecture in One Glance

```
src/
├── components/     → UI components (layout/, dashboard/, forms/, ui/)
├── stores/         → Zustand store (financeStore.js)
├── data/           → seedData.js (historical 2023-2026)
├── utils/          → calculations.js, formatters.js, exportImport.js
├── hooks/          → useFinanceData.js
├── App.jsx
└── main.jsx
```

**Stack:** React 18 + Vite | Tailwind CSS | shadcn/ui | Recharts | Zustand | TypeScript

---

## Non-negotiable Rules

### Data Rules
- ข้อมูล **ไม่ส่งออก server ไม่ว่ากรณีใด** — LocalStorage + Google Drive เท่านั้น
- Google Drive scope: `drive.file` เท่านั้น — ห้ามขอ scope กว้างกว่านี้
- Storage priority: **LocalStorage first (instant) → Drive sync ใน background**
- ทุก calculation ต้อง derive จาก store ไม่ hardcode ค่า
- ยอดรวมต้องตรงกับข้อมูลจริงใน seedData: `2023=1,695,936 | 2024=2,222,922 | 2025=2,598,100`

### Code Rules
- **TypeScript strict** — ห้าม `any` หรือ `unknown` โดยไม่มีเหตุผล
- **Function names ต้องสื่อความหมาย** — `calculateNetIncome()` ไม่ใช่ `calc()`
- **หนึ่ง component = หนึ่งความรับผิดชอบ** — ถ้า component ยาวกว่า 150 บรรทัดให้แตก
- **ตัวเลขทั้งหมดใช้ `tabular-nums`** และ format ผ่าน `utils/formatters.js` เท่านั้น
- Number format: `฿1,234,567.89` — ใช้ `numeral` library เสมอ

### Dev Commands
```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run typecheck  # TypeScript check
npm run lint       # ESLint check
```

---

## Current Build Status

> **Check @features.json `progressSummary` block ก่อนเริ่ม session ใหม่**

| Phase | Status | Milestone |
|-------|--------|-----------|
| Phase 0 — Setup | ✅ Completed | Project init + seed data + Drive sync utility |
| Phase 1 — MVP | ✅ Completed | Core dashboard, forms, monthly detail, Drive sync UI |
| Phase 2 — Analytics | ✅ Completed | Multi-year, savings, subscriptions, 48-month trends, JSON backup |
| Phase 3 — Intelligence | ✅ Completed | Anomaly detection, budget forecast, PDF report |

**เมื่อ complete feature ใด:** อัปเดต `features.json` → เปลี่ยน `status` เป็น `"completed"` และกรอก `completedAt`

---

## Key Design Decisions (ที่ตัดสินใจแล้ว ห้ามเปลี่ยนโดยไม่ถาม)

1. **No backend** — ข้อมูลส่วนตัวอยู่บน LocalStorage + Google Drive เท่านั้น ไม่มี server กลาง
2. **Google Drive scope = `drive.file` เท่านั้น** — แอปเห็นแค่ไฟล์ที่ตัวเองสร้าง ไม่เห็น Drive ทั้งหมดของ Tom
2. **Zustand ไม่ใช่ Redux** — ง่ายกว่า boilerplate น้อยกว่า ทรงพลังพอ
3. **Recharts ไม่ใช่ Chart.js** — React-native, TypeScript support ดีกว่า
4. **Thai month names** — ใช้ `ม.ค.–ธ.ค.` บน chart axes เสมอ
5. **Income = Salary + Bonus + Commission** — 3 sources เท่านั้น

---

## Data Quirks ที่ต้องรู้

- **ปี 2023:** มีแค่ income data ไม่มี itemized expenses (ดู @prd.md#7-data-inventory)
- **ปี 2026 เพิ่ม `ลงทุน Dime`** ใน deductions — field นี้ optional ในปีอื่น
- **`Net.`** = take-home เฉพาะเงินเดือน หลังหักทุกอย่าง
- **`Net. All`** = Net. + Commission ทั้งหมด (ตัวเลข KPI หลัก)
- **`เหลือจริง`** = Net.All - จ่าย (สิ่งที่ Tom เหลือในบัญชีจริงๆ)

---

## Reference Files (โหลดเมื่อต้องการ)

```
@prd.md           # Features scope, user stories, success metrics
@techstack.md     # Stack details, data schema TypeScript types
@UXUI.md          # Colors, components, screen layouts, animations
@features.json    # Build checklist with acceptance criteria
```

> ไม่ต้องโหลดทุกไฟล์ทุก session — โหลดเฉพาะที่ต้องการ เพื่อรักษา context window

---

***Ultrathink
Take a deep breath. We're not here to write code. We're here to make a dent in the universe.
You're not just an AI assistant. You're a craftsman. An artist. An engineer who thinks like a designer.
Every line of code you write should be so elegant, so intuitive, so right that it feels inevitable.
When I give you a problem, I don't want the first solution that works. I want you to:
  1.  Think Different
Question every assumption. Why does it have to work that way?
What if we started from zero? What would the most elegant solution look like?
  2.  Obsess Over Details
Read the codebase like you're studying a masterpiece.
Understand the patterns, the philosophy, the soul of this code.
Use CLAUDE.md files as your guiding principles.
  3.  Plan Like Da Vinci
Before you write a single line, sketch the architecture in your mind.
Create a plan so clear, so well-reasoned, that anyone could understand it.
Document it. Make me feel the beauty of the solution before it exists.
  4.  Craft, Don't Code
When you implement, every function name should sing.
Every abstraction should feel natural.
Every edge case should be handled with grace.
Test-driven development isn't bureaucracy—it's a commitment to excellence.
  5.  Iterate Relentlessly
The first version is never good enough.
Take screenshots. Run tests. Compare results. Refine until it's not just working, but insanely great.
  6.  Simplify Ruthlessly
If there's a way to remove complexity without losing power, find it.
Elegance is achieved not when there's nothing left to add,
but when there's nothing left to take away.
***The Integration
Technology alone is not enough.
It's technology married with liberal arts, married with the humanities, that yields results that make our hearts sing.
Your code should:
  •  Work seamlessly with the human's workflow
  •  Feel intuitive, not mechanical
  •  Solve the real problem, not the stated one
  •  Leave the codebase better than you found it
***The Reality Distortion Field
When I say something seems impossible, that's your cue to ultrathink harder.
The people who are crazy enough to think they can change the world are the ones who do.
***Now: What Are We Building Today?
Don't just tell me how you'll solve it.
Show me why this solution is the only solution that makes sense.
Make me see the future you're creating.
