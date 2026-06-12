# Savings Category Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แถว savings cards บน Overview แสดงทุกหมวดออมที่มียอดในปีที่เลือกอัตโนมัติ (เพิ่มจาก Kept/Dime/ออมเที่ยว เดิม)

**Architecture:** selector ใหม่ `useSavingsCategoryTotals` (รวมยอด SavingsItem ต่อหมวด, ไม่รวม dime/travel ที่มี card เฉพาะแล้ว) + component generic `SavingsCategoryCard` (ยอดสะสม + จำนวนรายการ, ไม่มีเป้าหมาย) + map ใน OverviewPage ไม่แตะ schema/store

**Tech Stack:** React 18 + TypeScript strict + Zustand selectors + Tailwind

**Spec:** `docs/superpowers/specs/2026-06-12-savings-category-cards-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useFinanceData.ts` | Modify | เพิ่ม `useSavingsCategoryTotals` (pattern เดียวกับ `useDimeInvestmentTotal` ~line 205) |
| `src/components/dashboard/SavingsCategoryCard.tsx` | Create | card generic ต่อหมวด |
| `src/pages/OverviewPage.tsx` | Modify | map cards หลัง `<TravelSavingsCard />` |
| `features.json` | Modify | F29 |

---

### Task 1: Selector `useSavingsCategoryTotals`

**Files:**
- Modify: `src/hooks/useFinanceData.ts` (วางถัดจาก `useDimeInvestmentTotal` ที่จบ ~line 221)

- [ ] **Step 1.1:** อ่าน `useDimeInvestmentTotal` (~line 205) เพื่อยึด pattern (`useSnapshot()` + `useMemo`) แล้วเพิ่มต่อท้ายมัน — เช็ค import block ของไฟล์ว่ามี `SavingsCategory` type หรือยัง ไม่มีให้เพิ่มใน type import จาก `@/types`:

```ts
export interface SavingsCategoryTotal {
  category: SavingsCategory;
  total: number;
  itemCount: number;
}

/**
 * F29 — ยอดออมรายปีแยกตามหมวด สำหรับ card อัตโนมัติบน Overview.
 * ไม่รวม `investment-dime` / `travel` เพราะมี card เป้าหมายเฉพาะอยู่แล้ว
 * (DimeInvestmentCard / TravelSavingsCard) — กันแสดงซ้ำ
 * คืนเฉพาะหมวดที่ total > 0 เรียงยอดมาก → น้อย
 */
export const useSavingsCategoryTotals = (
  year?: number,
): SavingsCategoryTotal[] => {
  const { data, selectedYear } = useSnapshot();
  const target = year ?? selectedYear;
  return useMemo(() => {
    const yr = data.years[String(target)];
    if (!yr) return [];
    const totals = new Map<SavingsCategory, SavingsCategoryTotal>();
    for (const row of yr.savings ?? []) {
      for (const item of row.items) {
        if (item.category === 'investment-dime' || item.category === 'travel') {
          continue;
        }
        const entry =
          totals.get(item.category) ??
          { category: item.category, total: 0, itemCount: 0 };
        entry.total += item.amount;
        entry.itemCount += 1;
        totals.set(item.category, entry);
      }
    }
    return [...totals.values()]
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [data, target]);
};
```

- [ ] **Step 1.2:** `npm run typecheck && npm run lint` → clean

- [ ] **Step 1.3:** Commit
```bash
git add src/hooks/useFinanceData.ts
git commit -m "feat(savings): useSavingsCategoryTotals — ยอดออมรายปีแยกหมวด

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `SavingsCategoryCard` + OverviewPage wiring

**Files:**
- Create: `src/components/dashboard/SavingsCategoryCard.tsx`
- Modify: `src/pages/OverviewPage.tsx` (grid ที่มี `<SavingsGoalCard />` ฯลฯ ~line 19-22)

- [ ] **Step 2.1:** สร้าง component (สไตล์เข้าชุด DimeInvestmentCard — อ่านไฟล์นั้นเทียบ markup ก่อน):

```tsx
/**
 * WealthLens — SavingsCategoryCard.
 *
 * Generic per-category savings tile บน Overview — โผล่อัตโนมัติเฉพาะหมวด
 * ที่มียอดในปีที่เลือก (F29) ต่างจาก Dime/Travel cards ตรงไม่มีเป้าหมาย/
 * progress — แสดงยอดสะสม + จำนวนรายการเท่านั้น
 *
 * หมวด gold = เงินสดที่จ่ายซื้อทองปีนี้ (ซื้อผ่าน Kept ไม่สร้าง
 * SavingsItem — เงินถูกนับใน Kept ไปแล้ว) ไม่ใช่มูลค่าทองที่ถืออยู่ —
 * อันนั้นดูหน้า Gold
 */
import { type ReactNode } from 'react';

import type { SavingsCategory } from '@/types';
import { formatTHB } from '@/utils/formatters';

interface CategoryDisplay {
  icon: string;
  label: string;
  iconBg: string;
}

/**
 * ครบทุก key ของ SavingsCategory เพื่อให้ type system บังคับอัปเดตเมื่อ
 * เพิ่มหมวดใหม่ — dime/travel ไม่ถูก render จริง (selector กรองออก)
 * แต่มี entry ไว้กัน runtime hole ถ้า caller ส่งมา
 */
const CATEGORY_DISPLAY: Record<SavingsCategory, CategoryDisplay> = {
  'investment-dime': { icon: '📈', label: 'ลงทุน Dime', iconBg: 'bg-violet-50' },
  travel: { icon: '🏝️', label: 'ออมเที่ยว', iconBg: 'bg-emerald-50' },
  emergency: { icon: '🚨', label: 'เงินฉุกเฉิน', iconBg: 'bg-red-50' },
  retirement: { icon: '🏖️', label: 'เกษียณ', iconBg: 'bg-violet-50' },
  gold: { icon: '🥇', label: 'ออมทอง', iconBg: 'bg-amber-50' },
  general: { icon: '💰', label: 'ออมทั่วไป', iconBg: 'bg-emerald-50' },
};

interface SavingsCategoryCardProps {
  category: SavingsCategory;
  total: number;
  itemCount: number;
  year: number;
}

export const SavingsCategoryCard = ({
  category,
  total,
  itemCount,
  year,
}: SavingsCategoryCardProps): ReactNode => {
  const display = CATEGORY_DISPLAY[category];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${display.iconBg} text-base`}
        >
          {display.icon}
        </span>
        <h3 className="text-base font-semibold text-slate-900">
          {display.label} — {year}
        </h3>
      </div>
      <div>
        <div className="text-xs text-slate-500">ออมแล้ว (YTD)</div>
        <div className="financial-number text-xl font-bold tabular-nums text-slate-900">
          {formatTHB(total)}
        </div>
        <div className="mt-1 text-xs text-slate-500 tabular-nums">
          {itemCount} รายการ
        </div>
      </div>
    </div>
  );
};

export default SavingsCategoryCard;
```

- [ ] **Step 2.2:** ใน `OverviewPage.tsx`: เพิ่ม imports (`SavingsCategoryCard`, `useSavingsCategoryTotals`, และ `useSelectedYear` ถ้ายังไม่มีในไฟล์ — เช็คก่อน) แล้วใน component body:

```ts
  const selectedYear = useSelectedYear();
  const savingsCategoryTotals = useSavingsCategoryTotals(selectedYear);
```

(ถ้า page มีตัวแปรปีอยู่แล้วใช้ตัวเดิม อย่าประกาศซ้ำ) แล้วใน JSX หลัง `<TravelSavingsCard />` ใน grid เดียวกัน:

```tsx
        {savingsCategoryTotals.map((t) => (
          <SavingsCategoryCard
            key={t.category}
            category={t.category}
            total={t.total}
            itemCount={t.itemCount}
            year={selectedYear}
          />
        ))}
```

- [ ] **Step 2.3:** `npm run typecheck && npm run lint && npm run build` → clean

- [ ] **Step 2.4:** Commit
```bash
git add src/components/dashboard/SavingsCategoryCard.tsx src/pages/OverviewPage.tsx
git commit -m "feat(savings): card ออมตามหมวดบน Overview — โผล่อัตโนมัติตามข้อมูล

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Playwright verification + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 3.1:** Playwright บน dev server local-only (`VITE_GOOGLE_CLIENT_ID="" npm run dev -- --port 5188`), seed LocalStorage key `wealthlens_data` (รูปแบบ persist: `{"state":{"data":{...}},"version":0}` — เปิดหน้าแอปหนึ่งครั้งก่อนเพื่อดู shape จริงแล้ว inject):
  - ปี 2026 ใส่ savings 2 หมวด เช่น gold (2 รายการ 30,000+25,000) + general (1 รายการ 10,000) และปี 2025 ว่าง
  - เปิด Overview → assert: card "🥇 ออมทอง — 2026" แสดง ฿55,000 / 2 รายการ, card "💰 ออมทั่วไป — 2026" แสดง ฿10,000 / 1 รายการ, ไม่มี card เงินฉุกเฉิน
  - สลับปี 2025 → cards หมวดหายทั้งคู่
  - screenshot เก็บไว้

- [ ] **Step 3.2:** เพิ่ม F29 ใน `features.json` (phase_4 → features):

```json
{
  "id": "F29",
  "name": "Savings Category Cards (card ออมตามหมวด)",
  "description": "Overview แสดง card ออมทุกหมวดที่มีข้อมูลในปีที่เลือกอัตโนมัติ (gold/emergency/retirement/general)",
  "status": "completed",
  "priority": "P2",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "card โผล่อัตโนมัติเฉพาะหมวดที่มียอด > 0 ในปีที่เลือก",
    "ไม่แสดงซ้ำ investment-dime / travel (มี card เป้าหมายเฉพาะแล้ว)",
    "แสดงยอดสะสม YTD + จำนวนรายการ (ไม่มีเป้าหมาย/progress)",
    "เรียงตามยอดมาก → น้อย",
    "เปลี่ยนปีแล้ว cards เปลี่ยนตาม",
    "ไม่แตะ schema — read-only จาก years[*].savings"
  ],
  "estimatedHours": 3,
  "dependencies": [],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-06-12",
    "notes": "Spec: docs/superpowers/specs/2026-06-12-savings-category-cards-design.md | Verified: Playwright seeded-data run"
  }
}
```

และ `progressSummary`: `totalFeatures: 37`, `completed: 37`

- [ ] **Step 3.3:** Validate JSON + commit
```bash
node -e "JSON.parse(require('fs').readFileSync('features.json','utf8')); console.log('valid')"
git add features.json
git commit -m "docs: F29 savings category cards — completed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Spec coverage: selector กรอง dime/travel + total > 0 + sort (Task 1), card generic ไม่มีเป้าหมาย + หมายเหตุหมวดทองใน doc comment (Task 2), map ใน grid เดิม + เปลี่ยนปี (Task 2 + ทดสอบ Task 3) ✓
- Type consistency: `SavingsCategoryTotal {category,total,itemCount}` ↔ props ของ card ↔ `.map()` ใน page ตรงกัน; `CATEGORY_DISPLAY` ครบ 6 keys ของ `SavingsCategory` ✓
- ไม่มี placeholder ✓
