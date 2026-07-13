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
| Product goals, features, user stories | @docs/prd.md |
| Tech stack, architecture, data schema | @docs/techstack.md |
| UI design, colors, layout, components | @docs/UXUI.md |
| Feature list + build checkpoint status | @features.json |

---

## Architecture in One Glance

```
src/
├── components/     → UI components (layout/, dashboard/, forms/, ui/, motion/)
├── stores/         → Zustand store (financeStore.js)
├── data/           → seedData.js (historical 2023-2026)
├── lib/            → motion.ts (animation tokens + pure helpers)
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
- **Animation ทุกตัวมาจาก `src/components/motion/`** — ห้าม import `framer-motion` ตรงใน page/feature component; timing/easing ดึงจาก `src/lib/motion.ts` เท่านั้น (F42)
- **เลขวิ่ง (count-up) ใช้เฉพาะ KPI/hero** — ตัวเลขในตารางมีไว้เทียบกัน จึงไม่ animate เด็ดขาด
- **เมนูทุกที่มาจาก `src/lib/nav.ts`** — ห้าม hardcode รายการเมนูใน component; `Sidebar` (เดสก์ท็อป) กับ `BottomNav` (มือถือ) อ่านทะเบียนเดียวกัน เพิ่มหน้าใหม่แล้วลืมอีกที่ = เมนูสองชุดที่หลุดจากกันโดยไม่มี error ให้เห็น (F47)
- **สไตล์ที่ทำเพื่อมือถือ ต้องมี breakpoint กำกับเสมอ** — `min-h-11 md:min-h-0`, `md:hidden` — เดสก์ท็อปห้ามขยับ (กฎ M6 ใน `npm run verify:mobile` เป็นประตูกัน) (F47)
- **ทุกการเขียน `bankAccounts` ต้องจบที่ `ledgerPatch()`** — ที่เดียวที่ ledger กลายเป็น state (เก็บกวาดเซลล์กำพร้าอยู่ตรงนั้นด้วย). `withLedger` เรียกให้อยู่แล้ว แต่เส้นทางที่ประกอบ `BankLedger` เองต้องเรียกเอง — **`withLedger` อย่างเดียวไม่พอ**: `addInstallmentPlan`/`deleteInstallmentPlan` เคยข้ามมันไปเงียบ ๆ ทั้งที่ acceptance ของ F40 ("financeStore ไม่เรียก `applyBankDelta` ตรง") ยังเขียว (F49)
- **สีทุกสีมาจาก token ใน `src/index.css`** — ห้ามเขียนสีดิบใน component (`bg-white`, `text-slate-500`); `scripts/verify-no-hardcoded-colors.ts` เป็นประตูกัน (allowlist ว่าง, ยกเว้นแค่ `text-white`). กราฟรับสีผ่าน `useChartTheme()` เพราะ Recharts ยัดสีลง SVG attribute ซึ่งไม่รับ `var()` — เขียน `var()` แล้วเส้นหายเงียบ ๆ ไม่มี error (F46)

### Dev Commands
```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Production build → dist/
npm run preview    # Preview production build
npm run typecheck  # TypeScript check
npm run lint       # ESLint check
npm run verify:mobile  # build + Playwright วัดจอจริง 390×844 (M1–M6) และ 1280px
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
| Phase 4 — Post-Ship | ✅ Completed | Multi-user login, per-month Kept, Dime/ออมเที่ยว split, reimbursements, ผ่อน 0%, gold ledger, loan tracker (กยศ) |
| Phase 5 — Polish | ✅ Completed | Dark mode (F46) · Mobile UX (F47) · หน้าเติบโต — net worth ย้อนหลัง + อัตราการออม (F48) |
| Phase 6 — Debt & Polish | 🔨 In progress (1/3) | เก็บหนี้เทคนิค (F49 ✅) · รื้อหน้าวิเคราะห์ (ยังไม่เริ่ม) · PWA (ยังไม่เริ่ม) |

**เมื่อ complete feature ใด:** อัปเดต `features.json` → เปลี่ยน `status` เป็น `"completed"` และกรอก `completedAt`

---

## Key Design Decisions (ที่ตัดสินใจแล้ว ห้ามเปลี่ยนโดยไม่ถาม)

1. **No backend** — ข้อมูลส่วนตัวอยู่บน LocalStorage + Google Drive เท่านั้น ไม่มี server กลาง
2. **Google Drive scope = `drive.file` เท่านั้น** — แอปเห็นแค่ไฟล์ที่ตัวเองสร้าง ไม่เห็น Drive ทั้งหมดของ Tom
3. **Zustand ไม่ใช่ Redux** — ง่ายกว่า boilerplate น้อยกว่า ทรงพลังพอ
4. **Recharts ไม่ใช่ Chart.js** — React-native, TypeScript support ดีกว่า
5. **Thai month names** — ใช้ `ม.ค.–ธ.ค.` บน chart axes เสมอ
6. **Income = Salary + Bonus + Commission + รายได้อื่นๆ (otherIncome)** — `otherIncome` เพิ่มภายหลัง (F32) พฤติกรรมเหมือน Commission: บวกเข้า Net.All หลังหัก, นับใน รายรับรวม, optional (`otherIncome?: number`) เพื่อ backward-compat กับข้อมูลเดิม
7. **framer-motion เป็น dependency ของ motion layer (F42)** — กลับจุดยืนเดิม "ไม่เพิ่ม package เกินจำเป็น" โดยตั้งใจ เพราะ animation ที่ทำเองไม่มี exit/spring/reduced-motion ที่ดีพอ; แต่ห่อไว้หลัง `src/components/motion/` + `src/lib/motion.ts` ทั้งหมด page ไม่แตะ framer ตรง จึงถอด/เปลี่ยน library ได้จากที่เดียว
8. **ยอดบัญชีติดลบได้ ห้าม clamp (F44)** — ลบรายได้ที่เงินถูกใช้ไปแล้ว → คืนยอดจนติดลบ ไม่ใช่ปฏิเสธการลบ. ปฏิเสธ = ล็อกผู้ใช้ไว้กับข้อมูลที่กรอกผิด. ยอดติดลบในข้อมูลจริงของ Tom เป็นยอดจริง ไม่ใช่บั๊ก
9. **ลบบัญชีที่ยังมีต้นทางผูกอยู่ไม่ได้ (F44)** — รายได้/รายจ่าย/ทอง/ขาโอน บล็อกการลบ (บอกว่าผูกกี่ที่ ให้ผู้ใช้ถอดเอง); บรรทัด manual/adjustment/backfill กวาดพร้อมบัญชี. **ไม่มี cascade delete** — ลบบัญชีแล้วไล่ลบรายได้/รายจ่ายอัตโนมัติ = ทำลายข้อมูลการเงินจริงจากปุ่มเดียว
10. **สีอยู่ที่ token เท่านั้น (F46)** — ค่าจริงทั้งหมดอยู่ใน `src/index.css` (`:root` / `.dark`, เก็บเป็นเลขช่องสีเพื่อให้ Tailwind ประกอบ alpha ได้) component รู้จักแค่ชื่อ. **สีหนึ่งมีสองบทบาท**: `bg-primary` (พื้นปุ่มที่มี `text-white` ทับ — ต้องเข้มเท่าเดิมในโหมดมืด) กับ `text-primary-ink` (หมึกบนการ์ด — ต้องสว่างขึ้น) เป็นคนละ token ใช้สลับกันไม่ได้ — นี่คือจุดที่คนมาใหม่พลาดแน่. โหมดสว่างถูกตรึงไว้ด้วย R0 ใน `scripts/verify-theme.ts`. **ธีมเป็นของเครื่อง ไม่ sync ขึ้น Drive** (มือถือกลางคืนอยากมืด เดสก์ท็อปกลางวันอยากสว่าง และมันไม่ใช่ข้อมูลการเงิน)
11. **มือถือ: เมนูอยู่ล่าง ตารางยังเป็นตาราง (F47)** — แถบล่าง 5 ช่อง + ปุ่มลอย "+" แทนแฮมเบอร์เกอร์มุมซ้ายบน (นิ้วโป้งเอื้อมถึงครึ่งล่างของจอ 6 นิ้ว — แฮมเบอร์เกอร์อยู่มุมที่ไกลที่สุดพอดี และกิน 40px จาก header จนชื่อหน้าโดนตัด). **ตารางกว้างตรึงคอลัมน์แรก ไม่แตกเป็นการ์ด** — การ์ดอ่านง่ายทีละแถว แต่เทียบข้ามแถวไม่ได้อีกเลย ซึ่งเป็นเหตุผลเดียวที่ตารางพวกนี้มีอยู่ (กฎเดียวกับ "ตัวเลขในตารางมีไว้เทียบกัน" ที่ห้ามเลขวิ่งในตาราง)
12. **กราฟห้ามโกหก (F48)** — สี่ข้อ ผูกกันเป็นชุดเดียว: (ก) **การเปลี่ยนวิธีนับไม่ใช่ความรวย** — เดือนที่เริ่มบันทึกบัญชีใหม่ติดธง `isTrackingJump`, กราฟปักหมุดบอกชื่อบัญชี, และ `growthBetween()` ที่คร่อมจุดนั้นคืน **`null`** → hero แสดง "เทียบไม่ได้ (เริ่มติดตามบัญชีใหม่)" ไม่ใช่ตัวเลข (โชว์ +% ทั้งที่แค่เริ่มนับเงินที่มีอยู่แล้ว = โกหกด้วยตัวเลขจริง); (ข) **"ไม่มีข้อมูล" ≠ "ศูนย์"** — เดือนที่ไม่รู้คือ**ช่องว่าง**ในกราฟ ไม่ใช่แท่งศูนย์หรือแท่งเต็ม (ปี 2023 ไม่มีรายจ่าย → อัตราการออม `null` ไม่ใช่ 100% ไม่งั้นปีที่เรารู้น้อยที่สุดจะกลายเป็นปีที่ออมเก่งที่สุด); (ค) **ติดลบได้ ไม่ clamp** (ต่อจากข้อ 8 — net worth และอัตราการออมติดลบได้ทั้งคู่); (ง) **ไม่มี insight ที่ข้อมูลไม่รองรับ** — ไม่มีเส้นทำนาย ไม่เทียบกับใคร. และ **ข้อมูลต้องดังกว่าคำเตือนของมันเสมอ** — เดิมวาดช่วง "ครอบคลุมบัญชีไม่ครบ" เป็นเส้นประจาง แต่มันจริงกับ 42 จาก 43 เดือน คำเตือนจึงกลืนกราฟทั้งใบจนดูเหมือนไม่มีข้อมูล; คำเตือนต้องอยู่ **หลัง** ข้อมูล (แถบพื้นหลัง + caption) ไม่ใช่ทับมัน

---

## Data Quirks ที่ต้องรู้

- **ปี 2023:** มีแค่ income data ไม่มี itemized expenses (ดู @docs/prd.md#7-data-inventory)
- **ปี 2026 เพิ่ม `ลงทุน Dime`** ใน deductions — field นี้ optional ในปีอื่น
- **`Net.`** = take-home เฉพาะเงินเดือน หลังหักทุกอย่าง
- **`Net. All`** = Net. + Commission + รายได้อื่นๆ (F32) (ตัวเลข KPI หลัก)
- **`เหลือจริง`** = Net.All - จ่าย (สิ่งที่ Tom เหลือในบัญชีจริงๆ)
- **Kept → บัญชีธนาคาร (F33):** "Kept (กรุงศรี)" กลายเป็น `bankAccounts` แบบ generic (card-first, หลายบัญชี, ยอดต่อเดือน) — Kept เดิม migrate เป็นบัญชี "กรุงศรี" (`acct-krungsri`) อัตโนมัติตอน rehydrate. `keptBalances` คงไว้เป็น backward-compat (แหล่ง migrate เท่านั้น ไม่อ่านที่อื่นแล้ว). **เป้าหมายออม (savings goal) ถูกตัดออก**. gold 'kept' ตัดยอดบัญชีกรุงศรี
- **เซลล์ยอด 0 ที่ "ไม่มีรายการรองรับ" ถูกเก็บกวาดอัตโนมัติทุกครั้งที่เขียน ledger (F49)** — คีย์กำพร้าแบบนี้ (`{'2027':{'7':0}}`) เกิดจากการ revert รายการที่เคยหักบัญชี และมันเลื่อนหมุด "เริ่มติดตามบัญชีใหม่" ของหน้าเติบโต (F48 อ่าน `Object.keys(balances)` หาเดือนแรก). **แต่เซลล์ 0 ที่ *มี* รายการ (ฝาก ฿1,000 → ถอน ฿1,000 ในเดือนเดียวกัน) ต้องอยู่ต่อ** — ลบทิ้งคือพัง invariant ของ F40 (Σ tx ในเดือน === ค่าในช่อง). กฎคือ "ไม่มีรายการรองรับ" ไม่ใช่ "ยอดเป็นศูนย์"
- **`bankAccounts[].balances[ปี][เดือน]` = กระแสเงินของเดือนนั้น ไม่ใช่ยอดคงเหลือสิ้นเดือน** — ยอดจริง ณ เดือนใด = **ผลรวมสะสมของทุกเดือน ≤ เดือนนั้น** (`accountAllTimeTotal()` บวกทุกเดือนเข้าด้วยกัน · การ์ดบัญชีเขียนว่า "ยอดสะสมทุกปี" · invariant F40: Σ รายการในเดือน === ค่าในช่องนั้น) และเดือนที่ไม่มีตัวเลข = เงินไม่ขยับ ยอดคงเดิมเอง **ไม่ต้อง carry-forward**. ชื่อ field ชวนให้อ่านผิดเป็น "ยอดคงเหลือ" — ดราฟต์แรกของ F48 อ่านผิดแบบนั้น และถ้าปล่อยไว้กราฟความมั่งคั่งจะแบนราบผิดทั้งเส้น

---

## Reference Files (โหลดเมื่อต้องการ)

```
@docs/prd.md           # Features scope, user stories, success metrics
@docs/techstack.md     # Stack details, data schema TypeScript types
@docs/UXUI.md          # Colors, components, screen layouts, animations
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
