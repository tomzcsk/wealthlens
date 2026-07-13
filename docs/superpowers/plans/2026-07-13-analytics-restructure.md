# F50 — รื้อหน้าวิเคราะห์ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/analytics` จาก 7.8 จอ เหลือ ~2 จอต่อแท็บ — โดยตัดของที่ไม่มีใครดูออกจริง ๆ ไม่ใช่ซ่อนไว้

**Architecture:** ลบสองฟีเจอร์ที่ไม่ถูกใช้ (F16 ทั้งก้อน · F15 เหลือแต่ toast) แล้วแตกที่เหลือเป็น 3 แท็บที่ `React.lazy` แยกกันจริง สถานะแท็บอยู่ใน URL (`?tab=`) ไม่ใช่ `useState` — ปุ่มย้อนกลับและบุ๊กมาร์กจึงใช้ได้ **กฎ A2 บังคับว่าแผงของแท็บอื่นต้องไม่อยู่ใน DOM เลย** เพราะ "lazy" ที่จริง ๆ แค่ `hidden` คือโหลดครบเหมือนเดิม แค่มองไม่เห็น

**Tech Stack:** React 18 + Vite + react-router (`useSearchParams`) + Recharts + Playwright (devDep). verify รันด้วย `npx tsx --tsconfig tsconfig.app.json scripts/<file>.ts`

**Spec:** `docs/superpowers/specs/2026-07-13-analytics-restructure-design.md`

---

## แก้ spec หนึ่งจุดก่อนเริ่ม

Spec §3.2 เขียนว่า *"ถอดตัวกรอง 'รายการที่กดปิดแล้ว' ออกจาก `useAnomalies`"* — **ไม่มีอะไรให้ถอด**
`src/hooks/useAnomalies.ts` คืน `detectAnomalies(data)` ตรง ๆ ไม่ได้อ่าน `anomalyStore` เลย
→ `anomalyStore` ถูกใช้ใน `AnomalyAlerts.tsx` **ที่เดียวจริง ๆ** ลบแผง = ลบ store ได้เลย ไม่ต้องแก้ hook

---

## กฎเหล็ก

1. **toast แจ้งเตือนต้องรอด** — มันคือคุณค่าเดียวที่เหลือของ F15 ถ้ามันตายไปกับแผง แปลว่าตัดผิด. `Layout` ต้องยังเรียก `useAnomalyAlertEffect()` และมันต้องยังเด้งจริง (ขับทดสอบ ไม่ใช่เดา)
2. **lazy ต้อง lazy จริง** — เปิดแท็บหนึ่งแล้ว DOM ต้องไม่มีแผงของแท็บอื่น (A2)
3. **ไม่แตะสูตรคำนวณ** ของแผงที่เหลือ — งานนี้คือจัดที่ทาง ไม่ใช่แก้เลข
4. **ลบให้หมด อย่าทิ้งซาก** — ไฟล์ที่ลบต้องไม่มีอยู่จริง โค้ดตายที่ยังอยู่คือโค้ดที่วันหนึ่งมีคน import กลับมา

---

## File Structure

**สร้างใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/pages/analytics/YearsTab.tsx` | `AllYearsSummary` + `MultiYearComparison` |
| `src/pages/analytics/TrendsTab.tsx` | `TrendAnalysis` |
| `src/pages/analytics/SubscriptionsTab.tsx` | `SubscriptionManager` |
| `src/lib/analyticsTabs.ts` | pure: ทะเบียนแท็บ (`id`, `label`, `path`) + `resolveTab(param)` |
| `scripts/verify-analytics.ts` | A1–A5 + ประตูกันซาก |

**ลบ**
`src/components/analytics/BudgetForecast.tsx` · `src/hooks/useForecast.ts` · `src/utils/forecast.ts` · `src/components/analytics/AnomalyAlerts.tsx` · `src/stores/anomalyStore.ts`

**แก้**
`src/pages/AnalyticsPage.tsx` (กลายเป็นแถบแท็บ + `<Suspense>` ครอบแท็บที่เลือก)

---

## Task 1: ประตูตรวจ — เขียนก่อน ให้มันแดงตามความจริง

**Files:** Create `scripts/verify-analytics.ts`

- [ ] **Step 1: เขียน `scripts/verify-analytics.ts`**

```ts
/**
 * Verification for F50 — หน้าวิเคราะห์.
 *   npm run verify:analytics
 *
 * A1–A5 วัดจากจอจริงที่ 390×844 (มือถือ) — ความสูงหน้ากับ "แผงของแท็บอื่น
 * ยังอยู่ใน DOM ไหม" มีอยู่แค่ในหน้าที่ render แล้วเท่านั้น
 * ประตูกันซากตรวจด้วย fs/grep — โค้ดตายที่ยังอยู่ = วันหนึ่งมีคน import กลับมา
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { chromium, type Page } from 'playwright';

import seedData from '../src/data/seedData';

const PORT = 4192;

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

// ─── ประตูกันซาก (ไม่ต้องเปิดเบราว์เซอร์) ────────────────────────────────────
console.log('\n— ซากของที่ลบไปแล้ว ต้องไม่เหลือ —');
const DELETED = [
  'src/components/analytics/BudgetForecast.tsx',
  'src/hooks/useForecast.ts',
  'src/utils/forecast.ts',
  'src/components/analytics/AnomalyAlerts.tsx',
  'src/stores/anomalyStore.ts',
];
for (const file of DELETED) {
  assert(`ไฟล์ถูกลบจริง: ${file}`, !existsSync(file));
}

const srcFiles: string[] = [];
const walk = (p: string): void => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e));
  } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
    srcFiles.push(p);
  }
};
walk('src');

const DEAD_SYMBOLS = [
  'BudgetForecast',
  'useForecast',
  'utils/forecast',
  'AnomalyAlerts',
  'anomalyStore',
];
const importers: string[] = [];
for (const file of srcFiles) {
  const src = readFileSync(file, 'utf8');
  for (const symbol of DEAD_SYMBOLS) {
    if (src.includes(symbol)) importers.push(`${file} → ${symbol}`);
  }
}
assert(
  `ไม่มีใครอ้างถึงของที่ลบไปแล้ว (เจอ ${importers.length})`,
  importers.length === 0,
  importers.slice(0, 5).join(' · '),
);

console.log('\n— toast แจ้งเตือนต้องไม่ตายไปกับแผง —');
{
  const layout = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  assert('Layout ยังเรียก useAnomalyAlertEffect()', layout.includes('useAnomalyAlertEffect'));
  assert('useAnomalies ยังอยู่', existsSync('src/hooks/useAnomalies.ts'));
  assert('anomalyDetection ยังอยู่', existsSync('src/utils/anomalyDetection.ts'));
}

// ─── A1–A5: จอจริง ──────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !extname(file)) file = join('dist', 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'text/plain');
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(
  ([key, data]) => {
    localStorage.setItem(
      key as string,
      JSON.stringify({
        state: { data, selectedYear: 2025, selectedMonth: 7, lastUpdated: new Date(0).toISOString() },
        version: 1,
      }),
    );
  },
  ['wealthlens_data', seedData] as const,
);
const page: Page = await ctx.newPage();

/** หัวข้อ (h2/h3) ของแผงที่อยู่ใน DOM ตอนนี้ */
const panelsInDom = (): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('main h2, main h3')].map((h) => h.textContent?.trim() ?? ''),
  );

const TABS = [
  { id: 'years', ต้องมี: 'ภาพรวมทุกปี', ห้ามมี: ['Subscription', '48 เดือน'] },
  { id: 'trends', ต้องมี: '48 เดือน', ห้ามมี: ['Subscription', 'ภาพรวมทุกปี'] },
  { id: 'subs', ต้องมี: 'Subscription', ห้ามมี: ['48 เดือน', 'ภาพรวมทุกปี'] },
];

for (const tab of TABS) {
  await page.goto(`http://localhost:${PORT}/analytics?tab=${tab.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  console.log(`\n── แท็บ ${tab.id}`);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  assert(`A1 สูง ${height}px ≤ 2200px`, height <= 2200);

  const panels = await panelsInDom();
  assert(
    `A3 แท็บนี้แสดงแผงที่ถูก (${tab.ต้องมี})`,
    panels.some((p) => p.includes(tab.ต้องมี)),
    panels.join(' | '),
  );
  for (const forbidden of tab.ห้ามมี) {
    assert(
      `A2 ไม่มีแผงของแท็บอื่นใน DOM (${forbidden})`,
      !panels.some((p) => p.includes(forbidden)),
      'lazy ที่แค่ hidden = โหลดครบเหมือนเดิม',
    );
  }

  const bleed = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return { scrollW: document.documentElement.scrollWidth, vw };
  });
  assert(`A5 ไม่ล้นขอบจอ (${bleed.scrollW} ≤ ${bleed.vw})`, bleed.scrollW <= bleed.vw);

  const tabs = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="analytics-tabs"]');
    if (!bar) return null;
    const buttons = [...bar.querySelectorAll('a, button')];
    return {
      count: buttons.length,
      small: buttons.filter((b) => b.getBoundingClientRect().height < 44).length,
      current: buttons.filter((b) => b.getAttribute('aria-current') === 'page').length,
    };
  });
  assert('A4 แถบแท็บมี 3 ปุ่ม', tabs?.count === 3, tabs ? `ได้ ${tabs.count}` : 'ไม่เจอแถบแท็บ');
  assert('A4 ทุกปุ่ม ≥ 44px', tabs?.small === 0, `เล็กเกิน ${tabs?.small}`);
  assert('A4 แท็บปัจจุบันมี aria-current', tabs?.current === 1);
}

console.log('\n— A3: ?tab= ที่ไม่รู้จัก ต้องตกกลับ years ไม่ใช่หน้าว่าง —');
await page.goto(`http://localhost:${PORT}/analytics?tab=ขยะ`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
{
  const panels = await panelsInDom();
  assert(
    'tab ขยะ → เห็นแท็บรายปี',
    panels.some((p) => p.includes('ภาพรวมทุกปี')),
    panels.join(' | ') || '(หน้าว่าง)',
  );
}

await browser.close();
server.close();

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: เพิ่ม script ใน `package.json`**

```json
    "verify:analytics": "vite build --mode verify && npx tsx --tsconfig tsconfig.app.json scripts/verify-analytics.ts",
```
(เลียนแบบ `verify:mobile` ที่มีอยู่แล้ว — `--mode verify` ปิด login gate ผ่าน `.env.verify`)

- [ ] **Step 3: รันให้เห็นว่าแดง — และจดว่าแดงตรงไหน**

Run: `npm run verify:analytics`
Expected (สภาพวันนี้):
- ประตูกันซาก **แดง 6 ข้อ** (ไฟล์ทั้ง 5 ยังอยู่ + มีคน import)
- A1 **แดงทุกแท็บ** (หน้าเดียว 6,584px)
- A2/A3/A4 **แดง** (ยังไม่มีแท็บ — `?tab=` ไม่มีความหมาย ทุกแผงอยู่ใน DOM พร้อมกัน)

จดจำนวนที่แดงไว้ใน commit message — มันคือ "ก่อน"

- [ ] **Step 4: commit** (ประตูที่แดงคือความจริงที่วัดได้ ไม่ใช่ความล้มเหลว)

```bash
git add scripts/verify-analytics.ts package.json
git commit -m "test(analytics): ประตู verify:analytics — A1-A5 + กันซาก (F50)"
```

---

## Task 2: ลบ F16 ประมาณการเดือนหน้า

**Files:** Delete `src/components/analytics/BudgetForecast.tsx`, `src/hooks/useForecast.ts`, `src/utils/forecast.ts`; Modify `src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: ตรวจก่อนลบว่าไม่มีใครอื่นใช้**

```bash
grep -rn "BudgetForecast\|useForecast\|utils/forecast" src scripts
```
คาดว่าเจอแค่: ตัวมันเอง + `AnalyticsPage.tsx` + `scripts/verify-analytics.ts` (ประตูกันซาก)
**ถ้าเจอที่อื่น — หยุด แล้วรายงาน** (แปลว่ามีคนใช้จริง สเปกผิด)

- [ ] **Step 2: ลบ**

```bash
git rm src/components/analytics/BudgetForecast.tsx src/hooks/useForecast.ts src/utils/forecast.ts
```
แล้วเอา `<BudgetForecast />` กับบรรทัด import ออกจาก `src/pages/AnalyticsPage.tsx`

- [ ] **Step 3: ตรวจ**

Run: `npm run typecheck && npm run lint && npm run build` — ผ่านทั้งหมด (ถ้า typecheck แดง แปลว่ายังมีคนอ้างถึง — ดี ประตูทำงาน)
Run: `npm run verify:analytics` → ประตูกันซากของ F16 **เขียว 3 ข้อ** (A1–A5 ยังแดง)

- [ ] **Step 4: commit**

```bash
git commit -am "refactor(analytics): ลบ F16 ประมาณการเดือนหน้า — ไม่มีใครใช้ (F50)"
```

---

## Task 3: ลบแผงแจ้งเตือน — เก็บ toast

**Files:** Delete `src/components/analytics/AnomalyAlerts.tsx`, `src/stores/anomalyStore.ts`; Modify `src/pages/AnalyticsPage.tsx`

**หัวใจของ task นี้: toast ต้องรอด** `useAnomalyAlertEffect` (mount ที่ `Layout`) มีชุด "seen" แบบ session-local ของตัวเอง **ไม่ได้พึ่งแผงและไม่ได้อ่าน `anomalyStore`**
และ `useAnomalies` คืน `detectAnomalies(data)` ตรง ๆ **ไม่มีตัวกรอง dismissed ให้ถอด** (สเปกเขียนผิดข้อนี้ — ตรวจแล้ว)

- [ ] **Step 1: ยืนยันว่า `anomalyStore` ถูกใช้ที่แผงที่เดียวจริง**

```bash
grep -rn "anomalyStore" src
```
คาดว่าเจอแค่: `src/stores/anomalyStore.ts` เอง + `src/components/analytics/AnomalyAlerts.tsx`
**ถ้าเจอที่อื่น — หยุด แล้วรายงาน**

- [ ] **Step 2: ลบ**

```bash
git rm src/components/analytics/AnomalyAlerts.tsx src/stores/anomalyStore.ts
```
เอา `<AnomalyAlerts />` + import ออกจาก `AnalyticsPage.tsx`
`src/stores/index.ts` อาจ re-export `anomalyStore` — ถ้าใช่ เอาบรรทัดนั้นออกด้วย

**ห้ามแตะ:** `hooks/useAnomalies.ts` · `hooks/useAnomalyAlertEffect.ts` · `utils/anomalyDetection.ts` · การเรียก `useAnomalyAlertEffect()` ใน `Layout.tsx`

- [ ] **Step 3: ตรวจว่า toast ยังเด้งจริง — ขับ ไม่ใช่เดา**

`npm run typecheck && npm run lint && npm run build`

แล้วขับด้วย Playwright (devDep): build โหมด verify, เสิร์ฟ `dist/`, seed LocalStorage ด้วย `seedData` **บวกรายจ่ายผิดปกติหนึ่งรายการ** (ก้อนใหญ่ผิดปกติในหมวดหนึ่ง เดือนล่าสุด — ดู `utils/anomalyDetection.ts` ว่าเกณฑ์คือ avg + 2σ) แล้วเปิดหน้าไหนก็ได้ที่อยู่ใน `Layout`
**ต้องเห็น toast เด้ง** — จับจาก DOM ของ `Toaster`

รายงานสิ่งที่เห็นจริง ถ้า toast ไม่เด้ง **หยุด** แปลว่าตัดโดนของที่ยังจำเป็น

- [ ] **Step 4: commit**

```bash
git commit -am "refactor(analytics): ตัดแผงแจ้งเตือน — เก็บ toast ไว้ (F50)"
```

---

## Task 4: สามแท็บ

**Files:** Create `src/lib/analyticsTabs.ts`, `src/pages/analytics/{YearsTab,TrendsTab,SubscriptionsTab}.tsx`; Modify `src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: `src/lib/analyticsTabs.ts` (pure)**

```ts
/**
 * WealthLens — ทะเบียนแท็บของหน้าวิเคราะห์ (F50).
 *
 * pure: ไม่ import React — ทดสอบใน node ได้ (หลักเดียวกับ lib/nav.ts)
 * สถานะแท็บอยู่ใน URL (?tab=) ไม่ใช่ useState — ปุ่มย้อนกลับ/บุ๊กมาร์ก/ส่งลิงก์
 * ตรงแท็บ ต้องใช้ได้ ซึ่ง useState ทำไม่ได้สักอย่าง
 */
export type AnalyticsTabId = 'years' | 'trends' | 'subs';

export interface AnalyticsTab {
  id: AnalyticsTabId;
  label: string;
}

export const ANALYTICS_TABS: readonly AnalyticsTab[] = [
  { id: 'years', label: 'รายปี' },
  { id: 'trends', label: 'แนวโน้ม' },
  { id: 'subs', label: 'Subscription' },
];

export const DEFAULT_TAB: AnalyticsTabId = 'years';

/** ?tab= ที่ไม่รู้จัก (หรือไม่มี) → แท็บเริ่มต้น ไม่ใช่หน้าว่าง */
export const resolveTab = (param: string | null): AnalyticsTabId =>
  ANALYTICS_TABS.some((t) => t.id === param)
    ? (param as AnalyticsTabId)
    : DEFAULT_TAB;
```

- [ ] **Step 2: สามไฟล์แท็บ**

`src/pages/analytics/YearsTab.tsx`:
```tsx
/** WealthLens — แท็บรายปี (F50): ตารางภาพรวมทุกปี + เทียบข้ามปี. */
import type { ReactNode } from 'react';

import { AllYearsSummary } from '@/components/analytics/AllYearsSummary';
import { MultiYearComparison } from '@/components/analytics/MultiYearComparison';

export const YearsTab = (): ReactNode => (
  <div className="space-y-6">
    <AllYearsSummary />
    <MultiYearComparison />
  </div>
);

export default YearsTab;
```

`src/pages/analytics/TrendsTab.tsx`:
```tsx
/** WealthLens — แท็บแนวโน้ม (F50): 48 เดือน + สัดส่วนค่าใช้จ่ายตลอดเวลา. */
import type { ReactNode } from 'react';

import { TrendAnalysis } from '@/components/analytics/TrendAnalysis';

export const TrendsTab = (): ReactNode => <TrendAnalysis />;

export default TrendsTab;
```

`src/pages/analytics/SubscriptionsTab.tsx`:
```tsx
/** WealthLens — แท็บ Subscription (F50). */
import type { ReactNode } from 'react';

import { SubscriptionManager } from '@/components/analytics/SubscriptionManager';

export const SubscriptionsTab = (): ReactNode => <SubscriptionManager />;

export default SubscriptionsTab;
```

- [ ] **Step 3: `AnalyticsPage.tsx` — แถบแท็บ + lazy**

```tsx
/**
 * WealthLens — หน้าวิเคราะห์ (F50).
 *
 * เดิมเป็นเครื่องมือ 6 อย่างคนละเรื่องกองซ้อนกันในหน้าเดียว = 7.8 จอบนมือถือ
 * ตอนนี้เป็น 3 แท็บที่ lazy แยกกันจริง — เปิดแท็บหนึ่ง แผงของแท็บอื่นไม่อยู่ใน
 * DOM เลย (ไม่ใช่ hidden). สถานะอยู่ใน URL: ปุ่มย้อนกลับ/บุ๊กมาร์กใช้ได้
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import RouteLoader from '@/components/ui/RouteLoader';
import { ANALYTICS_TABS, resolveTab, type AnalyticsTabId } from '@/lib/analyticsTabs';

const YearsTab = lazy(() => import('@/pages/analytics/YearsTab'));
const TrendsTab = lazy(() => import('@/pages/analytics/TrendsTab'));
const SubscriptionsTab = lazy(() => import('@/pages/analytics/SubscriptionsTab'));

const PANELS: Record<AnalyticsTabId, ReactNode> = {
  years: <YearsTab />,
  trends: <TrendsTab />,
  subs: <SubscriptionsTab />,
};

const tabBase =
  'inline-flex items-center justify-center min-h-11 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors';
const tabOn = 'bg-primary text-white';
const tabOff = 'bg-card text-ink-600 border border-ink-200 hover:bg-hover';

export const AnalyticsPage = (): ReactNode => {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = resolveTab(searchParams.get('tab'));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink-900">วิเคราะห์</h1>

      {/* เลื่อนแนวนอนได้บนมือถือ — 3 แท็บพอดีจอ 390px แต่ชื่อยาวขึ้นเมื่อไรก็ยังรอด */}
      <div
        data-testid="analytics-tabs"
        role="tablist"
        aria-label="มุมมองการวิเคราะห์"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={() => setSearchParams({ tab: tab.id }, { replace: false })}
            className={`${tabBase} ${active === tab.id ? tabOn : tabOff}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key={active} — บังคับให้ Suspense รีเซ็ตเมื่อสลับแท็บ ไม่งั้นแท็บใหม่จะ
          โผล่มาแทนที่แท็บเก่าแบบกระตุก โดยไม่มีสถานะกำลังโหลด */}
      <Suspense key={active} fallback={<RouteLoader />}>
        {PANELS[active]}
      </Suspense>
    </div>
  );
};

export default AnalyticsPage;
```

> **`setSearchParams` ใช้ `replace: false`** — สลับแท็บแล้วปุ่มย้อนกลับต้องพากลับไปแท็บก่อนหน้า ไม่ใช่เด้งออกจากหน้าไปเลย

- [ ] **Step 4: ตรวจ**

Run: `npm run typecheck && npm run lint && npm run build`
Run: `npm run verify:analytics` → **เขียวทั้งหมด**

ถ้า **A2 แดง** (แผงของแท็บอื่นยังอยู่ใน DOM) แปลว่า lazy ไม่ทำงานจริง — `PANELS` เป็น object ที่สร้าง element ทั้งสามตอน render **แต่ `React.lazy` จะไม่ import chunk จนกว่า element นั้นจะถูก mount** ดังนั้นการสร้าง element ไว้ล่วงหน้าไม่ทำให้ chunk ถูกโหลด. ถ้ายังแดงอยู่ ให้เปลี่ยนเป็น switch ที่ render เฉพาะตัวที่เลือก แล้วรายงานว่าทำไม

- [ ] **Step 5: commit**

```bash
git add src/lib/analyticsTabs.ts src/pages/analytics src/pages/AnalyticsPage.tsx
git commit -m "feat(analytics): 3 แท็บ lazy จริง + สถานะใน URL (F50)"
```

---

## Task 5: ปิดงาน

- [ ] **Step 1: verify ทั้งชุด**

```bash
for f in scripts/verify-*.ts; do
  case "$f" in *verify-mobile.ts|*verify-analytics.ts) continue;; esac
  npx tsx --tsconfig tsconfig.app.json "$f" >/dev/null 2>&1 && echo "✅ $f" || echo "❌ $f"
done
npm run verify:mobile
npm run verify:analytics
npm run typecheck && npm run lint && npm run build
```
เขียวทั้งหมด

- [ ] **Step 2: วัดผลจริง**

รายงานตัวเลข: ความสูงแต่ละแท็บที่ 390px (เทียบกับ 6,584px เดิม) และขนาด bundle ของ `/analytics` (`npm run build` พิมพ์ให้)

- [ ] **Step 3: ขับดูจริง**

`VITE_GOOGLE_CLIENT_ID= npm run dev` → `/analytics` ทั้งสามแท็บ ทั้งโหมดสว่างและมืด ที่ 390px และ 1280px:
- สลับแท็บแล้วเนื้อหาเปลี่ยน · URL เปลี่ยน · ปุ่มย้อนกลับพากลับแท็บก่อนหน้า
- ไม่มีอะไรล้นขอบจอ
- แถบแท็บกดโดนด้วยนิ้วโป้ง

- [ ] **Step 4: เอกสาร**

- `features.json` — **F50** ใน `phase_6` (`completionPercent: 67`) · **F16** → `"status": "removed"` พร้อมเหตุผลและวันที่ · **F15** → หมายเหตุว่าเหลือแต่ toast แผงถูกถอดใน F50
  **ห้ามลบ F15/F16 ออกจากไฟล์** — ประวัติต้องบอกว่ามันเคยมีแล้วถอดออก ไม่ใช่แกล้งทำเป็นไม่เคยมี
- `CLAUDE.md` — Dev Commands: เพิ่ม `npm run verify:analytics`
- `docs/UXUI.md` — หัวข้อหน้าวิเคราะห์: 3 แท็บ, lazy จริง, สถานะใน URL

- [ ] **Step 5: commit**

```bash
git add features.json CLAUDE.md docs/UXUI.md
git commit -m "docs: F50 รื้อหน้าวิเคราะห์เสร็จ"
```

---

## สิ่งที่ไม่ทำโดยตั้งใจ

- **ไม่แยกเป็นหลายหน้าในเมนู** — เมนูมี 9 รายการแล้ว
- **ไม่ลบ LocalStorage key `wealthlens_anomaly_dismissals`** — มันกลายเป็นขยะกำพร้าที่ไม่มีใครอ่าน เขียนไว้ให้รู้ ดีกว่าเขียนโค้ดลบ key ที่ต้องดูแลต่ออีกสิบปี
- **ไม่แตะสูตรคำนวณ** ของแผงที่เหลือ
