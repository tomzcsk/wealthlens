# Tech Stack — WealthLens Personal Finance Dashboard

**Version:** 1.1.0  
**Last Updated:** 2026-05-06  
**Philosophy:** *Simplicity is the ultimate sophistication. No backend. No database server. Just elegant client-side code that runs anywhere — and syncs safely to Google Drive.*

---

## 1. Core Architecture Decision

### Why Single-Page App (No Backend)?

ข้อมูลการเงินส่วนตัวเป็นเรื่องที่ sensitive มาก การไม่มี backend หมายความว่า:
- **ไม่มี server ที่อาจถูก hack** — ข้อมูลอยู่บน browser ของ Tom เท่านั้น
- **Deploy ง่ายมาก** — แค่เปิดไฟล์ HTML ก็ใช้งานได้เลย
- **ไม่มีค่าใช้จ่าย hosting** — ฟรี 100%
- **ทำงาน offline ได้** — ไม่ต้องมีอินเทอร์เน็ต

### Architecture Pattern
```
Browser (SPA)
├── UI Layer (React + Tailwind)
├── State Management (Zustand)
├── Chart Layer (Recharts)
└── Storage Layer
    ├── LocalStorage (primary — instant read/write)
    └── Google Drive Sync (backup — background, debounced 2s)
```

**Storage Strategy:**
- **Write:** Save LocalStorage ก่อน (instant) → sync Drive ใน background
- **Read (first load):** เช็ค LocalStorage → ถ้าว่างให้ดึงจาก Drive
- **Offline:** ทำงานได้ปกติจาก LocalStorage, sync เมื่อกลับมา online

---

## 2. Frontend Framework

### React 18 (Vite)
**เหตุผล:**
- Component-based ทำให้สร้าง reusable chart/card components ได้สวย
- React Hooks ทำให้ state management เป็นธรรมชาติ
- Ecosystem ที่ใหญ่ที่สุด — หา solution ได้ทุกปัญหา
- Vite ให้ HMR ที่เร็วมากระหว่าง development

```bash
# Initialize
npm create vite@latest wealthlens -- --template react
cd wealthlens
npm install
```

---

## 3. Styling

### Tailwind CSS v3
**เหตุผล:**
- Utility-first ทำให้ design ตรงตาม UX/UI spec ได้เร็ว
- ไม่มี CSS naming hell
- Responsive design ง่ายมากด้วย `sm:`, `md:`, `lg:`
- Dark mode รองรับด้วย `dark:` prefix

### shadcn/ui (Component Library)
**เหตุผล:**
- Components สวยงาม มาตรฐาน โดยไม่ต้องเขียนเอง
- Copy-paste แล้วแก้ได้ — ไม่ใช่ black box
- Compatible กับ Tailwind และ Radix UI

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn-ui@latest init
```

---

## 4. Data Visualization

### Recharts
**เหตุผล:**
- Built บน D3.js แต่ใช้งานง่ายกว่ามาก
- Responsive ด้วย `ResponsiveContainer`
- มี Chart types ครบ: LineChart, BarChart, PieChart, AreaChart
- Customizable ได้ทุกส่วน

**Charts ที่จะใช้:**
| Chart Type | ใช้สำหรับ |
|-----------|----------|
| `AreaChart` | แนวโน้ม Net Income รายเดือน |
| `BarChart` | Income vs Expense เปรียบเทียบ |
| `PieChart` | สัดส่วนค่าใช้จ่ายตามหมวด |
| `LineChart` | Multi-year trend comparison |
| `ComposedChart` | Overview dashboard หลัก |

```bash
npm install recharts
```

---

## 5. State Management

### Zustand
**เหตุผล:**
- เบากว่า Redux มาก (2KB) แต่ powerful เท่ากัน
- API เรียบง่าย ไม่มี boilerplate
- Persist middleware ทำให้ sync กับ LocalStorage ได้อัตโนมัติ

```bash
npm install zustand
```

**Store Structure:**
```javascript
// stores/financeStore.js
{
  years: {
    2023: { income: [...], deductions: {...}, expenses: [...] },
    2024: { income: [...], deductions: {...}, expenses: [...] },
    2025: { income: [...], deductions: {...}, expenses: [...] },
    2026: { income: [...], deductions: {...}, expenses: [...] },
  },
  selectedYear: 2026,
  selectedMonth: null, // null = show all months
  actions: { ... }
}
```

---

## 6. Data Persistence

### LocalStorage (Primary — Layer 1)
ข้อมูลทั้งหมดเก็บใน `localStorage` ด้วย key `wealthlens_data`  
อ่าน/เขียนทันที ทำงาน offline ได้เต็มรูปแบบ

### Google Drive Sync (Cloud Backup — Layer 2)
ไฟล์ `wealthlens_data.json` เก็บที่ `My Drive/WealthLens/`  
Sync อัตโนมัติใน background ทุกครั้งที่ข้อมูลเปลี่ยน (debounce 2 วินาที)

**Authentication:** Google OAuth 2.0 (PKCE flow — no client secret needed)  
**Scope ที่ขอ:** `https://www.googleapis.com/auth/drive.file` (เข้าถึงเฉพาะไฟล์ที่แอปสร้าง ไม่เห็น Drive ทั้งหมด)

**Sync Logic:**
```javascript
// utils/driveSync.js
const SYNC_DEBOUNCE_MS = 2000;
const DRIVE_FOLDER = 'WealthLens';
const DRIVE_FILENAME = 'wealthlens_data.json';

// เรียกหลัง save ทุกครั้ง
syncToDrive(data)        // upload JSON → Drive
loadFromDrive()          // download JSON ← Drive (first load)
getSyncStatus()          // 'synced' | 'syncing' | 'offline' | 'error'
```

**Conflict Resolution:** ถ้าเปิดหลายเครื่องพร้อมกัน ใช้ `lastUpdated` timestamp ที่ใหม่กว่าเป็น winner

**Sync Status UI:** indicator มุมขวาบน
- `✅ Synced` — ข้อมูลตรงกับ Drive แล้ว
- `🔄 Syncing...` — กำลัง upload
- `📴 Offline` — ไม่มีอินเทอร์เน็ต, จะ sync เมื่อกลับมา online
- `⚠️ Sync Error` — มีปัญหา, คลิกเพื่อ retry

### JSON Manual Export/Import (Emergency Backup — Layer 3)
- Export: Download ไฟล์ `wealthlens_backup_YYYY-MM-DD.json`
- Import: Drag & Drop หรือ Upload ไฟล์ JSON กลับมา

### Data Schema
```typescript
interface WealthLensData {
  version: string;
  lastUpdated: string;
  years: {
    [year: string]: YearData;
  };
}

interface YearData {
  income: MonthlyIncome[];
  expenses: MonthlyExpense[];
}

interface MonthlyIncome {
  month: number; // 1-12
  salary: number;
  bonus: number;
  commission: number;
  deductions: {
    tax: number;
    socialSecurity: number;
    providentFund: number;
    gsl: number; // กยศ
    investment?: number; // Dime (2026+)
  };
}

interface MonthlyExpense {
  month: number;
  items: ExpenseItem[];
}

interface ExpenseItem {
  id: string;
  category: ExpenseCategory;
  name: string;
  amount: number;
  isRecurring: boolean;
}

type ExpenseCategory = 
  | 'housing'
  | 'vehicle'
  | 'utilities'
  | 'subscription'
  | 'finance'
  | 'entertainment'
  | 'savings'
  | 'other';
```

---

## 7. Utility Libraries

| Library | Version | ใช้ทำอะไร |
|---------|---------|----------|
| `date-fns` | ^3.x | จัดการวันที่ ชื่อเดือนภาษาไทย |
| `numeral` | ^2.x | Format ตัวเลข 1,234,567.89 |
| `uuid` | ^9.x | Generate unique ID สำหรับ expense items |
| `clsx` | ^2.x | Conditional className utility |
| `@react-oauth/google` | ^0.12.x | Google OAuth 2.0 login button + token management |

```bash
npm install date-fns numeral uuid clsx @react-oauth/google
```

**Google Drive API** — ใช้ผ่าน `fetch` โดยตรง ไม่ต้องติดตั้ง library เพิ่ม:
```javascript
// Upload file to Drive
fetch('https://www.googleapis.com/upload/drive/v3/files', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify(data)
})
```

---

## 8. Development Tools

| Tool | ใช้ทำอะไร |
|------|----------|
| **Vite** | Build tool & Dev server |
| **ESLint** | Code quality |
| **Prettier** | Code formatting |
| **TypeScript** | Type safety (optional แต่แนะนำ) |

---

## 9. Deployment Options

| Option | วิธี | ค่าใช้จ่าย |
|--------|------|-----------|
| **Local File** | `npm run build` → เปิด `dist/index.html` | ฟรี |
| **GitHub Pages** | Push to main → auto deploy | ฟรี |
| **Vercel** | Connect repo → auto deploy | ฟรี |
| **Netlify** | Drag & drop `dist/` folder | ฟรี |

---

## 10. Project Structure

```
wealthlens/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   └── Layout.jsx
│   │   ├── dashboard/
│   │   │   ├── SummaryCards.jsx
│   │   │   ├── IncomeExpenseChart.jsx
│   │   │   ├── ExpensePieChart.jsx
│   │   │   ├── MonthlyTable.jsx
│   │   │   └── YearComparison.jsx
│   │   ├── forms/
│   │   │   ├── IncomeForm.jsx
│   │   │   └── ExpenseForm.jsx
│   │   └── ui/ (shadcn components)
│   ├── stores/
│   │   └── financeStore.js
│   ├── data/
│   │   └── seedData.js (ข้อมูลปี 2023–2026)
│   ├── utils/
│   │   ├── calculations.js
│   │   ├── formatters.js
│   │   ├── exportImport.js
│   │   └── driveSync.js        ← Google Drive sync logic
│   ├── hooks/
│   │   └── useFinanceData.js
│   ├── App.jsx
│   └── main.jsx
├── prd.md
├── techstack.md
├── UXUI.md
├── features.json
├── CLAUDE.md
├── package.json
└── vite.config.js
```

---

## 11. Performance Targets

| Metric | Target |
|--------|--------|
| First Load | < 2 seconds |
| Chart Render | < 500ms |
| Data Entry Save | < 100ms |
| Bundle Size | < 500KB gzipped |
