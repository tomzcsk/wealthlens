# WealthLens

> Personal Finance Dashboard ส่วนตัว — ติดตามรายรับ-รายจ่าย ปี 2023–ปัจจุบัน  
> No backend. ข้อมูลอยู่บน LocalStorage + Google Drive ของคุณเองเท่านั้น

![Built with Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)

---

## ฟีเจอร์

### ภาพรวม / KPI
- 4 KPI cards: รายรับรวม, ค่าใช้จ่าย, รายได้สุทธิ, Kept (กรุงศรี)
- เป้าหมายออม + Streak tracker
- กราฟ Income vs Expense รายเดือน (Bar + Net line)
- Donut chart สัดส่วนค่าใช้จ่าย
- ตารางสรุปรายเดือน + Export CSV

### รายเดือน
- Section: รายได้ / ออม-ลงทุน / ค่าใช้จ่าย / สรุป
- กรอกข้อมูลผ่าน Modal — มี comma format อัตโนมัติ
- ปุ่ม **📋 เติมรายการประจำ** — เปิดเดือนใหม่กดทีเดียว ดึงรายการประจำมาให้ (ค่าเสถียร 3 เดือน → ใช้ค่าเดิม, ค่าเปลี่ยน → default 0)
- ปุ่ม **📋 เติมจากค่าเริ่มต้น** สำหรับ Income — ดึงค่า base จาก Settings

### Analytics
- ภาพรวมทุกปี — ตารางรวมรายปี (เงินได้ / หัก / Net.All / จ่าย / ออม / เหลือจริง / Kept)
- เปรียบเทียบรายปี (multi-year line chart)
- จัดการ Subscription รายเดือน
- แนวโน้ม 48 เดือน + best/worst month
- ประมาณการเดือนหน้า (Forecast vs Actual)
- แจ้งเตือนผิดปกติ (anomaly detection > avg + 2σ)

### ภาษี
- คำนวณภาษีเงินได้บุคคลธรรมดา (Thailand PIT)
- Toggle รวมโบนัส / รวมคอม
- ใส่ลดหย่อนเพิ่มได้ (RMF, SSF, ลูก, ฯลฯ)
- เปรียบเทียบกับภาษีหัก ณ ที่จ่ายจริง → คืน/ค้างชำระ

### ตั้งค่า
- Google Drive Sync (scope `drive.file` เท่านั้น — เห็นแค่ไฟล์ที่แอปสร้าง)
- Backup / คืนค่า JSON (Drag & Drop รองรับ)
- ค่าเริ่มต้นรายได้
- Generate PDF report (ผ่าน browser print → Save as PDF)
- รีเซ็ตเป็นข้อมูลต้นฉบับ + Push ขึ้น Drive

---

## Tech Stack

| Layer | ใช้ |
|-------|-----|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 8 + manual chunks |
| Styling | Tailwind CSS 3 + custom design tokens |
| State | Zustand + persist middleware |
| Charts | Recharts 3 |
| Routing | React Router 6 (lazy routes + Suspense) |
| Auth | @react-oauth/google (PKCE flow) |
| Cloud | Google Drive API v3 (fetch directly, no SDK) |
| Format | numeral, date-fns |
| Lint | ESLint + Prettier |

ดูรายละเอียดสถาปัตยกรรมที่ [`techstack.md`](./techstack.md), specs ที่ [`prd.md`](./prd.md), [`UXUI.md`](./UXUI.md), [`features.json`](./features.json), guidelines ที่ [`CLAUDE.md`](./CLAUDE.md)

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+

### Install
```bash
git clone https://github.com/tomzcsk/wealthlens.git
cd wealthlens
npm install
```

### Setup Google OAuth (สำหรับ Drive Sync)

1. ไป [Google Cloud Console](https://console.cloud.google.com/) → สร้าง project ใหม่
2. APIs & Services → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `https://your-domain.vercel.app` (production)
5. Copy Client ID
6. APIs & Services → **OAuth consent screen** → **Publish app** (scope `drive.file` ไม่ sensitive ไม่ต้อง verify)
7. สร้างไฟล์ `.env.local`:

```bash
cp .env.example .env.local
# แก้ไข VITE_GOOGLE_CLIENT_ID=your_client_id_here
```

(Drive Sync ปิดได้ — ถ้าไม่ใส่ Client ID แอปทำงาน LocalStorage-only)

### Run
```bash
npm run dev          # dev server (http://localhost:5173)
npm run build        # production build → dist/
npm run preview      # preview production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier
```

---

## Deploy → Vercel

### One-time setup

1. ไป [vercel.com](https://vercel.com) → Sign in with GitHub
2. **Add New… → Project** → import `tomzcsk/wealthlens`
3. Vercel ตรวจ Vite อัตโนมัติ — ค่า default พอ:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. **Environment Variables:**
   - Name: `VITE_GOOGLE_CLIENT_ID`
   - Value: (Client ID จาก Google Cloud Console)
   - Environment: Production + Preview + Development
5. กด **Deploy** — รอ ~1 นาที

### หลัง deploy ครั้งแรก

1. Copy Vercel URL ที่ได้ (เช่น `https://wealthlens.vercel.app`)
2. กลับไป **Google Cloud Console → Credentials → OAuth Client** ที่สร้างไว้
3. **Authorized JavaScript origins** เพิ่ม URL จาก step 1
4. Save → รอ ~5 นาที sync
5. ลองเปิด Vercel URL → Sign in with Google → ใช้งานได้

### Auto-deploy

ทุกครั้ง `git push origin main` Vercel จะ build + deploy production อัตโนมัติ  
PR branches จะได้ Preview URL ให้ทดสอบก่อน merge

### SPA Fallback

React Router ใช้ BrowserRouter — refresh route เช่น `/analytics` ต้อง rewrite ให้ index.html  
**Vercel ทำให้อัตโนมัติ** สำหรับ Vite preset (ไม่ต้องใส่ `vercel.json`)

ถ้าเจอ 404 หลัง refresh ให้สร้าง `vercel.json` ที่ root:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

---

## Privacy & Data

- **Local-first:** ข้อมูลทั้งหมดอยู่บน LocalStorage ของ browser ตัวเอง
- **No server:** แอปไม่มี backend — ไม่ส่งข้อมูลขึ้น server กลาง
- **Drive scope:** `drive.file` เท่านั้น — แอปเห็นแค่ไฟล์ `wealthlens_data.json` ที่ตัวเองสร้าง ไม่เห็น Drive ทั้งหมด
- **Token:** อยู่ใน browser localStorage หมดอายุ ~1 ชม. — refresh เมื่อต้อง

---

## Project Structure

```
src/
├── components/
│   ├── analytics/     # MultiYear, AllYears, Trends, Forecast, Anomaly, Subscription
│   ├── auth/          # GoogleSignInButton, SyncStatusIndicator
│   ├── dashboard/     # KpiCard, IncomeExpenseChart, PieChart, MonthlySummaryTable, SavingsGoal
│   ├── forms/         # IncomeForm, ExpenseForm/List, SavingsForm/List
│   ├── layout/        # Sidebar, Header, Layout
│   ├── settings/      # BackupSection, ReportsSection, DangerZone, IncomeDefaultsSection
│   └── ui/            # Modal, Toaster, RouteLoader
├── stores/            # financeStore (ledger), goalsStore (targets+kept+defaults), syncStore, anomalyStore, toastStore
├── data/              # seedData.ts (2023–2026 historical)
├── auth/              # AuthProvider, useGoogleAuth, syncCoordinator
├── hooks/             # useFinanceData, useDriveSyncCoordinator, useAnomalies, useForecast
├── utils/             # formatters, calculations, exportImport, driveSync, taxCalculator, anomalyDetection, forecast, recurringTemplate
├── types/             # WealthLensData schema, ExpenseCategory, SavingsCategory
├── pages/             # Overview, Monthly, Analytics, Tax, Settings, PrintReport
├── App.tsx
└── main.tsx
```

---

## Status

✅ **25/25 features ทำเสร็จแล้ว**

- Phase 0 — Setup (7/7)
- Phase 1 — MVP Dashboard (10/10)
- Phase 2 — Analytics (5/5)
- Phase 3 — Intelligence (3/3)

ฟีเจอร์เสริมที่เพิ่มหลัง Phase 3:
- Savings/Investment เป็น first-class category (แยกจาก income/expense)
- Tax Calculator (Thailand PIT)
- Income Defaults
- Reset & Push to Drive
- Recurring template fill (smart amount inference)
- Thai UI throughout

---

## License

Private — for personal use by [Tom (@tomzcsk)](https://github.com/tomzcsk)
