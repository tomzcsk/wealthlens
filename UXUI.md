# UX/UI Design Specification — WealthLens

**Version:** 1.0.0  
**Last Updated:** 2026-05-06  
**Design Philosophy:** *Data tells a story. Our job is to make that story beautiful, clear, and actionable.*

---

## 1. Design Principles

### 1.1 Clarity Over Cleverness
ทุก element บน screen ต้องตอบคำถามว่า "มันช่วย Tom เข้าใจการเงินของตัวเองได้ยังไง?" ถ้าตอบไม่ได้ → ตัดออก

### 1.2 Data-First Design
ตัวเลขคือ hero ของ design นี้ ดังนั้น typography ต้องรองรับการอ่านตัวเลขได้สบายตา ทั้งเล็กและใหญ่

### 1.3 Calm & Trustworthy
สีและ mood ต้องให้ความรู้สึกว่า "ระบบนี้จัดการได้ มีเสถียรภาพ" ไม่ใช่ panic-inducing

---

## 2. Color System

### Primary Palette
```css
/* Brand Colors */
--color-primary: #2563EB;        /* Blue 600 — Action, Links, CTA */
--color-primary-light: #EFF6FF;  /* Blue 50 — Backgrounds */
--color-primary-dark: #1D4ED8;   /* Blue 700 — Hover states */

/* Income Colors (Positive) */
--color-income: #059669;         /* Emerald 600 */
--color-income-light: #ECFDF5;   /* Emerald 50 */
--color-income-bar: #34D399;     /* Emerald 400 — Charts */

/* Expense Colors (Negative) */
--color-expense: #DC2626;        /* Red 600 */
--color-expense-light: #FEF2F2;  /* Red 50 */
--color-expense-bar: #F87171;    /* Red 400 — Charts */

/* Neutral */
--color-net: #7C3AED;            /* Violet 600 — Net income */
--color-savings: #D97706;        /* Amber 600 — Savings/Kept */
```

### Semantic Colors
```css
--color-success: #059669;   /* เพิ่มขึ้น, บวก */
--color-warning: #D97706;   /* เตือน, ระวัง */
--color-danger:  #DC2626;   /* ลดลง, ติดลบ */
--color-info:    #2563EB;   /* ข้อมูลทั่วไป */
```

### Neutral Colors (Light Mode)
```css
--bg-primary:   #FFFFFF;
--bg-secondary: #F8FAFC;   /* Slate 50 */
--bg-card:      #FFFFFF;
--border:       #E2E8F0;   /* Slate 200 */
--text-primary: #0F172A;   /* Slate 900 */
--text-secondary: #64748B; /* Slate 500 */
--text-muted:   #94A3B8;   /* Slate 400 */
```

### Expense Category Colors (สำหรับ Pie Chart)
```css
--cat-housing:      #6366F1;  /* Indigo — บ้าน/หอพัก */
--cat-vehicle:      #8B5CF6;  /* Violet — รถยนต์ */
--cat-utilities:    #06B6D4;  /* Cyan — Net/ไฟ */
--cat-subscription: #F59E0B;  /* Amber — Netflix/ChatGPT */
--cat-finance:      #EF4444;  /* Red — บัตรเครดิต */
--cat-entertainment:#EC4899;  /* Pink — หวย */
--cat-savings:      #10B981;  /* Emerald — ออมเที่ยว */
--cat-other:        #6B7280;  /* Gray — อื่นๆ */
```

---

## 3. Typography

### Font Stack
```css
/* Primary — สำหรับ UI ทั่วไป */
font-family: 'Inter', 'Noto Sans Thai', sans-serif;

/* Numbers — สำหรับตัวเลขการเงิน */
font-family: 'Inter', monospace;
font-variant-numeric: tabular-nums;
```

### Type Scale
| Token | Size | Weight | ใช้สำหรับ |
|-------|------|--------|---------|
| `display` | 2.25rem/36px | 700 | KPI cards หลัก |
| `h1` | 1.875rem/30px | 700 | Page title |
| `h2` | 1.5rem/24px | 600 | Section headers |
| `h3` | 1.25rem/20px | 600 | Card headers |
| `body` | 0.875rem/14px | 400 | Content ทั่วไป |
| `small` | 0.75rem/12px | 400 | Labels, captions |
| `number-xl` | 2rem/32px | 700 | Big KPI numbers |
| `number-lg` | 1.5rem/24px | 600 | Secondary KPIs |

---

## 4. Layout & Spacing

### Grid System
- **Desktop:** 12-column grid, 1280px max-width
- **Tablet:** 8-column, 768px
- **Mobile:** 4-column, 100%

### Spacing Scale (Tailwind-based)
```
4px  = space-1
8px  = space-2
12px = space-3
16px = space-4  ← Base unit
24px = space-6
32px = space-8
48px = space-12
64px = space-16
```

---

## 5. Screen Layouts

### 5.1 Layout Shell
```
┌─────────────────────────────────────────────────┐
│  SIDEBAR (240px)  │  MAIN CONTENT AREA          │
│                   │                              │
│  🏠 Overview      │  [Header — Year Selector]   │
│  📊 Monthly       │                              │
│  📈 Analytics     │  [Page Content]              │
│  ⚙️ Settings      │                              │
└─────────────────────────────────────────────────┘
```

---

### 5.2 Overview Dashboard (หน้าหลัก)

```
┌──────────────────────────────────────────────────────────────────┐
│  WealthLens          [2026 ▼]                    [+ Add Entry]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐  │
│  │ รายรับรวม    │ │ ค่าใช้จ่าย   │ │ Net Income   │ │ Kept   │  │
│  │ ฿924,000     │ │ ฿656,236     │ │ ฿286,491     │ │฿190k   │  │
│  │ ↑ 12% vs '25│ │ ↑ 5% vs '25 │ │ ↓ 4% vs '25 │ │        │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘  │
│                                                                   │
│  ┌──────────────────────────────────┐ ┌────────────────────────┐ │
│  │ Income vs Expense (Monthly)      │ │ Expense Breakdown       │ │
│  │                                  │ │     🟣 Housing 35%      │ │
│  │  [Area/Bar Chart ← 12 months]   │ │     🟤 Vehicle 20%      │ │
│  │                                  │ │     🔵 Utilities 8%     │ │
│  │                                  │ │     🟡 Subscriptions 4% │ │
│  │                                  │ │     🔴 Credit Card 18%  │ │
│  └──────────────────────────────────┘ └────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Monthly Summary Table                                        │ │
│  │ เดือน | เงินเดือน | โบนัส | คอม | หัก | Net | จ่าย | เหลือ │ │
│  │ ม.ค.  | 80,000   | -     | 113k| 8.5k| 71k | 163k | 29k   │ │
│  │ ...                                                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

### 5.3 Monthly Detail Page

```
┌──────────────────────────────────────────────────────────────────┐
│  เมษายน 2026  [← มี.ค.]  [พ.ค. →]                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────── INCOME SECTION ──────────────────────────────────┐    │
│  │  เงินเดือน  ฿80,000   โบนัส  ฿0    คอม  ฿137,000       │    │
│  │  [Edit Income]                                           │    │
│  │  ──── Deductions ────                                    │    │
│  │  ภาษี ฿4,261  ประกัน ฿875  กองทุน ฿2,400  กยศ ฿0       │    │
│  │  ลงทุน ฿10,000  | รวมหัก ฿7,536 | Net ฿72,464           │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────── EXPENSE SECTION ─────────────────────────────────┐    │
│  │  [+ Add Expense]                                         │    │
│  │                                                          │    │
│  │  🏠 Housing                                 ฿60,000     │    │
│  │  🚗 Vehicle                                 ฿23,722     │    │
│  │  📡 Net AIS                                  ฿2,228     │    │
│  │  🎬 Netflix                                    ฿419     │    │
│  │  💡 ค่าไฟบ้าน                                ฿2,483     │    │
│  │  💳 บัตรเครดิต                              ฿19,029     │    │
│  │  📦 อื่นๆ                                   ฿18,000     │    │
│  │  ────────────────────────────────────────────────       │    │
│  │  รวมจ่าย: ฿155,560                                       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────── SUMMARY ──────────────────────────────────────────┐    │
│  │  Net All: ฿297,000  จ่าย: ฿155,560  เหลือ: ฿141,440     │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

### 5.4 Multi-Year Comparison Page

```
┌──────────────────────────────────────────────────────────────────┐
│  Year Comparison: [✓ 2023] [✓ 2024] [✓ 2025] [✓ 2026]           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Net Income Trend (2023–2026)                           │    │
│  │  [Multi-line chart — 1 line per year]                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Metric          | 2023      | 2024      | 2025   | 2026 │    │
│  │ เงินเดือน       | 885k      | 950k      | 960k   | 320k │    │
│  │ โบนัส           | 445k      | 475k      | 480k   | 80k  │    │
│  │ คอม             | 512k      | 1,042k    | 1,158k | 524k │    │
│  │ รวมหัก         | 146k      | 84k       | 79k    | 34k  │    │
│  │ Net All         | 1,696k    | 2,223k    | 2,598k | 924k │    │
│  │ รวมจ่าย        | -         | 1,416k    | 1,423k | 656k │    │
│  │ เหลือ/Kept      | -         | 695k      | 355k   | 190k │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Component Library

### 6.1 KPI Card
```
┌─────────────────────────────┐
│  [Icon]  Card Title          │
│                              │
│  ฿1,234,567                  │ ← number-xl, color-coded
│                              │
│  ↑ +12.3%  vs ปีก่อน         │ ← small text, green/red
└─────────────────────────────┘

States: default | positive | negative | loading | empty
```

### 6.2 Month Row (Table)
```
[month name] | [salary] | [bonus] | [comm] | [deduct] | [net] | [expenses] | [remaining]
             |          |         |        |          |       |            |
             Hover: highlight row, show tooltip with breakdown
```

### 6.3 Expense Item Row
```
[category icon] [name]              [amount]  [edit] [delete]
🏠 บ้าน                          ฿60,000.00  ✏️    🗑️
```

### 6.4 Data Entry Form — Income
```
┌──────────────────────────────┐
│  เดือน: [Select ▼]           │
│  เงินเดือน: [_____________]  │
│  โบนัส:    [_____________]  │
│  คอม:      [_____________]  │
│                              │
│  ──── Deductions ────        │
│  ภาษี:         [_________]  │
│  ประกันสังคม:  [_________]  │
│  กองทุน:       [_________]  │
│  กยศ:          [_________]  │
│  ลงทุน:        [_________]  │
│                              │
│  [Cancel]  [Save Income ✓]   │
└──────────────────────────────┘
```

---

## 7. Interaction Design

### 7.1 Data Entry UX
- **Tab to navigate** ระหว่าง input fields
- **Auto-format** ตัวเลขเป็น comma-separated ขณะพิมพ์
- **Inline validation** แสดง error ทันทีที่ blur จาก field
- **Keyboard shortcut:** `Ctrl+S` / `Cmd+S` เพื่อ save

### 7.2 Chart Interactions
- **Hover tooltip** แสดงตัวเลขละเอียดเมื่อ hover
- **Click legend** เพื่อ toggle series visibility
- **Responsive** resize ตาม viewport

### 7.3 Year/Month Navigation
- **Year Selector:** Dropdown ที่ Header
- **Month Navigation:** Prev/Next arrows ใน Monthly Detail
- **Breadcrumb:** ปี > เดือน

### 7.4 Empty States
- ถ้าไม่มีข้อมูลเดือนนั้น → แสดง "ยังไม่มีข้อมูล กด + เพื่อเพิ่ม"
- ถ้า expenses = 0 → แสดง "เพิ่มค่าใช้จ่ายของเดือนนี้"

---

## 8. Responsive Breakpoints

| Breakpoint | Width | Layout |
|-----------|-------|--------|
| Mobile | < 640px | Single column, bottom nav |
| Tablet | 640–1024px | Sidebar collapsed |
| Desktop | > 1024px | Full sidebar + content |

---

## 9. Accessibility

- **Color contrast:** ทุก text ต้อง pass WCAG AA (4.5:1 ratio)
- **Focus states:** ทุก interactive element ต้องมี visible focus ring
- **ARIA labels:** ทุก chart ต้องมี aria-label อธิบาย
- **Keyboard navigation:** ทั้งหมดต้องใช้ keyboard ได้

---

## 10. Micro-interactions & Animations

| Interaction | Animation |
|------------|-----------|
| Card hover | shadow elevate, 150ms ease |
| Button click | scale 0.97, 100ms |
| Chart mount | fade + grow from bottom, 600ms ease-out |
| Number change | count up animation, 800ms |
| Toast notification | slide in from top-right, 300ms |
| Modal open | fade + scale from 0.95, 200ms |

---

## 11. Dark Mode (Future)

เตรียม CSS variables ไว้รองรับ dark mode ตั้งแต่แรก:
```css
@media (prefers-color-scheme: dark) {
  --bg-primary: #0F172A;
  --bg-secondary: #1E293B;
  --bg-card: #1E293B;
  --border: #334155;
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
}
```
