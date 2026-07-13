# F48 — หน้าเติบโต Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้า `/growth` ตอบสองคำถาม — "รวยขึ้นหรือเปล่า" (net worth ย้อนหลังรายเดือน) และ "เก็บได้กี่ % ของที่หาได้" (อัตราการออมรายเดือน) — โดยไม่โกหกแม้แต่จุดเดียว

**Architecture:** สองโมดูล pure (`utils/netWorthHistory.ts`, `utils/savingsRate.ts`) คำนวณอนุกรมรายเดือนจาก `WealthLensData` ตรง ๆ ไม่แตะ store ไม่แตะ schema (read-only ล้วน). หน้า `GrowthPage` แค่วาด. ความถูกต้องผูกกับของเดิมด้วยกฎ **G1: จุดสุดท้ายของ history ต้องเท่ากับ `computeNetWorth()` ที่หน้า `/wealth` ใช้อยู่ เป๊ะ** — ถ้าสองเครื่องคำนวณให้คนละเลข ผู้ใช้จะเห็นตัวเลขสองค่าในแอปเดียว

**Tech Stack:** React 18 + Vite + Recharts + Zustand + TS strict. กราฟรับสีผ่าน `useChartTheme()` (F46 — Recharts รับ `var()` ไม่ได้) และความสูงผ่าน `utils/chartSizing.ts` (F47). verify script รันด้วย `npx tsx --tsconfig tsconfig.app.json scripts/<file>.ts`

**Spec:** `docs/superpowers/specs/2026-07-13-growth-analytics-design.md`

---

## ความจริงของข้อมูลที่ต้องรู้ก่อนเขียนโค้ดบรรทัดแรก

1. **`BankAccount.balances[ปี][เดือน]` = กระแสเงินของเดือนนั้น ไม่ใช่ยอดคงเหลือ**
   ยืนยันจากโค้ด: `accountAllTimeTotal()` ใน `utils/bankAccounts.ts` บวกทุกเดือนเข้าด้วยกัน และการ์ดบัญชีเขียนว่า "ยอดสะสมทุกปี". ตรงกับ invariant ของ F40: *ทุก (บัญชี,ปี,เดือน) ที่มีรายการ → Σ tx.amount === balance*
   → **ยอดบัญชี ณ เดือน M = ผลรวมสะสมของทุกเดือน ≤ M** เดือนที่ไม่มีตัวเลข = เงินไม่ขยับ ยอดคงเดิมเอง ไม่ต้อง carry-forward อะไรทั้งนั้น

2. **ข้อมูลจริงของ Tom:** กรุงศรี Kept มี 27 เดือนติดกัน (2024-05 → 2026-07); อีก 5 บัญชี (clicx, กสิกรไทย, กรุงศรีอยุธยา, กรุงไทย, เงินสด) **มีตัวเลขแค่ 1–2 เดือน เริ่ม 2026-07** → กราฟจะกระโดดที่เดือนนั้น ทั้งที่เงินมีอยู่มาตลอด

3. **ปี 2023 มีแต่รายได้ ไม่มีรายจ่ายรายการเลย** (data quirk ใน CLAUDE.md) → savings rate ต้องเป็น `null` ไม่ใช่ 100%

4. **`goldPriceHistory` มี 34 snapshot และเป็นของใหม่ทั้งนั้น** (auto-fetch) → เดือนเก่า ๆ ไม่มีราคาตลาด → ต้องตกไปที่ราคาทุน + ธง `goldIsCostBasis` (เส้นทางเดียวกับ F38)

---

## File Structure

**สร้างใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/utils/monthRange.ts` | pure: ไล่เดือนจาก `data.years` → `['2023-01', …]`, แปลง `ym` ↔ (ปี, เดือน), วันสิ้นเดือน |
| `src/utils/savingsRate.ts` | pure: อนุกรม % การออมรายเดือน (`rate: number \| null`) |
| `src/utils/netWorthHistory.ts` | pure: อนุกรม net worth รายเดือน + ธงจุดกระโดด |
| `src/pages/GrowthPage.tsx` | หน้า — แค่ประกอบ ไม่คำนวณ |
| `src/components/growth/NetWorthHistoryChart.tsx` | area chart + หมุด "เริ่มติดตาม" |
| `src/components/growth/SavingsRateChart.tsx` | แท่ง % + เส้นเฉลี่ย 3 เดือน |
| `scripts/verify-growth.ts` | G1–G7 |

**แก้**
| ไฟล์ | แก้อะไร |
|---|---|
| `src/lib/nav.ts` | เพิ่มเมนู 📉 เติบโต (`/growth`, group 3, `mobilePrimary: false`) |
| `src/App.tsx` | route `growth` → `GrowthPage` (lazy เหมือนหน้าอื่น) |

---

## Task 1: `monthRange.ts` — ไล่เดือน (pure)

**Files:** Create `src/utils/monthRange.ts`, Create `scripts/verify-growth.ts`

- [ ] **Step 1: เขียน verify ที่ยังแดง — `scripts/verify-growth.ts`**

```ts
/**
 * Verification for F48 — หน้าเติบโต.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts
 */
import { endOfMonth, monthsIn, parseYm, toYm } from '../src/utils/monthRange';

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

console.log('\n— monthRange —');
assert('toYm(2025, 7) = 2025-07', toYm(2025, 7) === '2025-07');
assert('toYm เติมศูนย์หน้า', toYm(2025, 1) === '2025-01');
assert('parseYm คืนตัวเลข', parseYm('2025-07').year === 2025 && parseYm('2025-07').month === 7);
{
  const months = monthsIn({ '2024': {}, '2025': {} } as never);
  assert(`สองปี = 24 เดือน (ได้ ${months.length})`, months.length === 24);
  assert('เรียงจากเก่าไปใหม่', months[0] === '2024-01' && months[23] === '2025-12');
}
{
  // วันสิ้นเดือนต้องถูกจริง ไม่ใช่ 30 ทุกเดือน — ใช้เป็น referenceDate ของหนี้
  const feb = endOfMonth('2024-02');
  assert('ก.พ. 2024 (ปีอธิกสุรทิน) = 29', feb.getDate() === 29, String(feb.getDate()));
  const dec = endOfMonth('2025-12');
  assert('ธ.ค. 2025 = 31', dec.getDate() === 31);
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts`
Expected: `Cannot find module '../src/utils/monthRange'`

- [ ] **Step 3: `src/utils/monthRange.ts`**

```ts
/**
 * WealthLens — ไล่เดือน (F48).
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 * (หลักเดียวกับ lib/motion.ts, lib/theme.ts, lib/nav.ts)
 */
import type { WealthLensData } from '@/types';

/** '2025-07' */
export type Ym = string;

export const toYm = (year: number, month: number): Ym =>
  `${year}-${String(month).padStart(2, '0')}`;

export const parseYm = (ym: Ym): { year: number; month: number } => {
  const [y, m] = ym.split('-');
  return { year: Number(y), month: Number(m) };
};

/** ทุกเดือนของทุกปีที่มีข้อมูล เรียงจากเก่าไปใหม่ */
export const monthsIn = (years: WealthLensData['years']): Ym[] => {
  const yearNums = Object.keys(years)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return yearNums.flatMap((y) =>
    Array.from({ length: 12 }, (_, i) => toYm(y, i + 1)),
  );
};

/**
 * วันสุดท้ายของเดือน (23:59:59.999) — ใช้เป็น referenceDate ให้
 * getPrincipalRemaining() ซึ่งนับงวดที่ dueDate ≤ วันนี้.
 * new Date(year, month, 0) = วันสุดท้ายของเดือนก่อนหน้า month (month เป็น 1-based
 * ที่นี่ จึงได้วันสุดท้ายของเดือนที่ต้องการพอดี) — ถูกทั้งเดือน 28/29/30/31
 */
export const endOfMonth = (ym: Ym): Date => {
  const { year, month } = parseYm(ym);
  return new Date(year, month, 0, 23, 59, 59, 999);
};

/** เดือนนี้มาก่อน (หรือเท่ากับ) เดือนนั้นไหม — เทียบสตริงได้เพราะรูปแบบ zero-padded */
export const ymLte = (a: Ym, b: Ym): boolean => a <= b;
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts` → `✅ ผ่านทั้งหมด` (7 ข้อ)
Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: commit**

```bash
git add src/utils/monthRange.ts scripts/verify-growth.ts
git commit -m "feat(growth): ไล่เดือน (pure) + verify (F48)"
```

---

## Task 2: `savingsRate.ts` — "เก็บได้กี่ %"

**Files:** Create `src/utils/savingsRate.ts`, Modify `scripts/verify-growth.ts`

- [ ] **Step 1: เพิ่ม assertion ลง `scripts/verify-growth.ts`** (import ที่หัวไฟล์, assertion ต่อท้ายก่อนบรรทัดสรุป)

```ts
import type { WealthLensData } from '../src/types';
import { buildSavingsRateSeries, rollingAverage } from '../src/utils/savingsRate';

/** ข้อมูลจำลองแบบสั้นที่สุดที่ยังสมจริง */
const emptyYear = () => ({ income: [], expenses: [], savings: [] });

console.log('\n— G4: "ไม่มีข้อมูล" ไม่ใช่ "เป็นศูนย์" —');
{
  // ปี 2023 ของ Tom: มีรายได้ ไม่มีรายจ่ายรายการเลย
  const data = {
    years: {
      '2023': {
        ...emptyYear(),
        income: [
          {
            month: 1,
            salary: 80_000,
            bonus: 0,
            commission: 20_000,
            deductions: { tax: 5_000, socialSecurity: 750, providentFund: 2_400, gsl: 0 },
          },
        ],
        expenses: [], // ← ไม่มีรายจ่ายเลย
      },
    },
  } as unknown as WealthLensData;

  const series = buildSavingsRateSeries(data);
  const jan = series.find((p) => p.ym === '2023-01')!;
  assert(
    'เดือนที่ไม่มีข้อมูลรายจ่าย → rate = null (ไม่ใช่ 1.0)',
    jan.rate === null,
    `ได้ ${String(jan.rate)}`,
  );
  assert('netAll ยังคำนวณได้ตามปกติ', jan.netAll > 0);
}

console.log('\n— savings rate: เดือนที่มีข้อมูลครบ —');
{
  const data = {
    years: {
      '2025': {
        ...emptyYear(),
        income: [
          {
            month: 1,
            salary: 100_000,
            bonus: 0,
            commission: 0,
            deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
          },
        ],
        expenses: [
          { month: 1, items: [{ id: 'a', category: 'housing', name: 'บ้าน', amount: 25_000 }] },
        ],
      },
    },
  } as unknown as WealthLensData;

  const jan = buildSavingsRateSeries(data).find((p) => p.ym === '2025-01')!;
  assert('netAll = 100,000', jan.netAll === 100_000);
  assert('จ่าย = 25,000', jan.spent === 25_000);
  assert('เหลือ = 75,000', jan.kept === 75_000);
  assert('rate = 0.75', jan.rate === 0.75);
}

console.log('\n— rollingAverage ข้ามช่องว่างโดยไม่นับมันเป็นศูนย์ —');
{
  const pts = [
    { ym: '2025-01', netAll: 0, spent: 0, kept: 0, rate: 0.5 },
    { ym: '2025-02', netAll: 0, spent: 0, kept: 0, rate: null },
    { ym: '2025-03', netAll: 0, spent: 0, kept: 0, rate: 0.7 },
  ];
  const avg = rollingAverage(pts, 3);
  // เดือนที่ 3: มีค่าจริง 2 ค่า (0.5, 0.7) → เฉลี่ย 0.6 ไม่ใช่ (0.5+0+0.7)/3 = 0.4
  assert('เฉลี่ยข้ามค่า null ไม่นับเป็น 0', avg[2] !== null && Math.abs(avg[2]! - 0.6) < 1e-9, String(avg[2]));
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts`
Expected: `Cannot find module '../src/utils/savingsRate'`

- [ ] **Step 3: `src/utils/savingsRate.ts`**

`calculateNetAll` มีอยู่แล้วใน `src/utils/calculations.ts` — **ต้องใช้ตัวนั้น ห้ามคำนวณเอง** (ไม่งั้นสูตร Net.All จะมีสองที่ แล้ววันหนึ่งมันจะไม่ตรงกัน)
เปิดอ่าน `src/utils/calculations.ts` ก่อนเพื่อดู signature จริง แล้วใช้ตามนั้น

```ts
/**
 * WealthLens — อัตราการออมรายเดือน (F48).
 *
 * "เก็บได้กี่ % ของที่หาได้" — รายได้ของ Tom 45% มาจากคอมมิชชั่น เดือนคอมเยอะ
 * กับเดือนคอมน้อยจึงเทียบกันด้วยยอดบาทไม่ได้เลย ต้องเทียบด้วย %
 *
 * กฎเหล็ก: "ไม่มีข้อมูล" ≠ "เป็นศูนย์"
 *   ปี 2023 ของ Tom มีแต่รายได้ ไม่มีรายจ่ายรายการเลย (data quirk, CLAUDE.md)
 *   ถ้าคืน rate = 1.0 ปีนั้นจะกลายเป็นปีที่ "ออมเก่งที่สุด" ในกราฟ ทั้งที่มันคือ
 *   ปีที่เรารู้น้อยที่สุด → คืน null แล้วให้กราฟเว้นแท่งนั้นไว้
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 */
import type { WealthLensData } from '@/types';
import { calculateNetAll } from '@/utils/calculations';
import { monthsIn, parseYm, type Ym } from '@/utils/monthRange';

export interface SavingsRatePoint {
  ym: Ym;
  /** Net.All ของเดือนนั้น (เงินเดือน+โบนัส−หัก+คอม+อื่นๆ) */
  netAll: number;
  spent: number;
  /** netAll − spent — ติดลบได้ ห้าม clamp (กฎเดิม F44) */
  kept: number;
  /** null = ไม่มีข้อมูลรายจ่ายของเดือนนั้น (ไม่ใช่ "จ่าย 0") */
  rate: number | null;
}

export const buildSavingsRateSeries = (
  data: WealthLensData,
): SavingsRatePoint[] =>
  monthsIn(data.years).map((ym) => {
    const { year, month } = parseYm(ym);
    const yearData = data.years[String(year)];
    const income = yearData?.income?.find((i) => i.month === month);
    const expenseRow = yearData?.expenses?.find((e) => e.month === month);

    const netAll = income ? calculateNetAll(income) : 0;
    const spent = (expenseRow?.items ?? []).reduce((s, i) => s + i.amount, 0);

    // ไม่มีแถวรายจ่ายของเดือนนั้นเลย = ไม่รู้ว่าจ่ายไปเท่าไร ≠ จ่าย 0
    const hasExpenseData = expenseRow !== undefined;
    const hasIncome = netAll !== 0;

    return {
      ym,
      netAll,
      spent,
      kept: netAll - spent,
      rate: hasExpenseData && hasIncome ? (netAll - spent) / netAll : null,
    };
  });

/**
 * ค่าเฉลี่ยเคลื่อนที่ — **ข้ามเดือนที่ rate เป็น null** ไม่นับมันเป็น 0
 * (นับเป็น 0 = ลากค่าเฉลี่ยลงด้วยข้อมูลที่ไม่มีอยู่จริง)
 * คืน null เมื่อไม่มีค่าจริงเลยในหน้าต่างนั้น
 */
export const rollingAverage = (
  points: readonly SavingsRatePoint[],
  window: number,
): (number | null)[] =>
  points.map((_, idx) => {
    const start = Math.max(0, idx - window + 1);
    const slice = points.slice(start, idx + 1);
    const real = slice.map((p) => p.rate).filter((r): r is number => r !== null);
    if (real.length === 0) return null;
    return real.reduce((s, r) => s + r, 0) / real.length;
  });
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts` → ✅ ทั้งหมด
Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: commit**

```bash
git add src/utils/savingsRate.ts scripts/verify-growth.ts
git commit -m "feat(growth): อัตราการออมรายเดือน — ไม่มีข้อมูล ≠ ศูนย์ (F48)"
```

---

## Task 3: `netWorthHistory.ts` — "รวยขึ้นหรือเปล่า"

**Files:** Create `src/utils/netWorthHistory.ts`, Modify `scripts/verify-growth.ts`

### อ่านก่อนเขียน
- `src/utils/netWorth.ts` — `computeNetWorth(data, goldValue, resolvedLoans, installmentPlans, referenceDate)`. **จุดสุดท้ายของ history ต้องเท่ากับผลของฟังก์ชันนี้เป๊ะ (G1)**
- `src/utils/bankAccounts.ts` — `accountAllTimeTotal()` (ยืนยันว่า balances เป็น flow)
- `src/utils/loanCalculations.ts` — `getPrincipalRemaining(loan, referenceDate)`
- `src/stores/selectors.ts:411` — `InstallmentPlanSummary` (มี `totalAmount`, `instances[]` ที่แต่ละตัวมี `year`, `month`, `amount`)
- `src/types/index.ts` — `GoldHolding` (`purchaseDate`, `weightBaht`, `totalCost`), `GoldPriceSnapshot` (`fetchedAt`, `price965`)

- [ ] **Step 1: เพิ่ม assertion ลง `scripts/verify-growth.ts`**

```ts
import { buildNetWorthHistory, growthBetween } from '../src/utils/netWorthHistory';

const acct = (id: string, name: string, balances: Record<string, Record<string, number>>) => ({
  id, name, balances,
});

console.log('\n— G2: ยอดบัญชีเป็นผลรวมสะสม เดือนที่เว้นว่างต้องไม่ร่วงเป็น 0 —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [
      // ม.ค. +100k · ก.พ. ไม่มีรายการเลย · มี.ค. +50k
      acct('a1', 'กรุงศรี', { '2025': { '1': 100_000, '3': 50_000 } }),
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;
  assert('ม.ค. = 100,000', at('2025-01').assets === 100_000);
  assert('ก.พ. (ไม่มีรายการ) ยังเป็น 100,000 ไม่ใช่ 0', at('2025-02').assets === 100_000, String(at('2025-02').assets));
  assert('มี.ค. = 150,000 (สะสม)', at('2025-03').assets === 150_000);
}

console.log('\n— G3 + G7: บัญชีใหม่โผล่ = จุดกระโดด ไม่ใช่ "รวยขึ้น" —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [
      acct('a1', 'กรุงศรี', { '2025': { '1': 100_000 } }),
      acct('a2', 'เงินสด', { '2025': { '6': 150_000 } }), // เริ่มติดตาม มิ.ย.
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;

  assert('G7 ก่อนเริ่มติดตาม นับแค่บัญชีเดียว', at('2025-05').accountsCovered === 1);
  assert('G7 พ.ค. = 100,000 (เงินสดยังไม่ถูกนับ)', at('2025-05').assets === 100_000);
  assert('G3 มิ.ย. ติดธง isTrackingJump', at('2025-06').isTrackingJump === true);
  assert('G3 มิ.ย. บอกชื่อบัญชีใหม่', at('2025-06').newAccounts.join() === 'เงินสด');
  assert('G3 ม.ค. ก็เป็นจุดกระโดด (บัญชีแรกโผล่)', at('2025-01').isTrackingJump === true);
  assert('เดือนอื่นไม่ใช่จุดกระโดด', at('2025-05').isTrackingJump === false);
  assert(
    'G3 % เติบโตที่คร่อมจุดกระโดด = null (ไม่ใช่ +150%)',
    growthBetween(at('2025-05'), at('2025-06')) === null,
  );
  assert(
    '% เติบโตที่ไม่คร่อมจุดกระโดด คำนวณได้ตามปกติ',
    growthBetween(at('2025-04'), at('2025-05')) === 0,
  );
}

console.log('\n— G5: netWorth ติดลบได้ ห้าม clamp —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [acct('a1', 'กรุงศรี', { '2025': { '1': 10_000 } })],
  } as unknown as WealthLensData;
  const plans = [
    { planId: 'p1', name: 'รถ', totalAmount: 500_000, instances: [], remainingAmount: 500_000 },
  ] as never;
  const h = buildNetWorthHistory(data, () => null, [], plans);
  const jan = h.find((p) => p.ym === '2025-01')!;
  assert('netWorth ติดลบ ไม่ถูก clamp เป็น 0', jan.netWorth < 0, String(jan.netWorth));
}

console.log('\n— G6: ทองไม่มีราคาตลาด → ราคาทุน + ติดธง —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [],
    goldHoldings: [
      { id: 'g1', purchaseDate: '2025-01-15', weightBaht: 1, totalCost: 40_000 },
    ],
  } as unknown as WealthLensData;

  const noPrice = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => noPrice.find((p) => p.ym === ym)!;
  assert('ไม่มีราคาตลาด → ใช้ราคาทุน 40,000', at('2025-01').assets === 40_000);
  assert('ติดธง goldIsCostBasis', at('2025-01').goldIsCostBasis === true);

  const withPrice = buildNetWorthHistory(data, () => 50_000, [], []);
  const jan2 = withPrice.find((p) => p.ym === '2025-01')!;
  assert('มีราคาตลาด → 1 บาททอง × 50,000', jan2.assets === 50_000);
  assert('ไม่ติดธงราคาทุน', jan2.goldIsCostBasis === false);
}

console.log('\n— ทองที่ยังไม่ซื้อ / ขายไปแล้ว ต้องไม่อยู่ในสินทรัพย์ —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [],
    goldHoldings: [
      // ซื้อ มี.ค. ขาย ก.ย. → นับเฉพาะ มี.ค.–ส.ค.
      {
        id: 'g1',
        purchaseDate: '2025-03-10',
        weightBaht: 1,
        totalCost: 40_000,
        sold: { soldDate: '2025-09-05', soldPrice: 45_000 },
      },
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;
  assert('ก.พ. (ยังไม่ซื้อ) = 0', at('2025-02').assets === 0);
  assert('เม.ย. (ถืออยู่) = 40,000', at('2025-04').assets === 40_000);
  assert('ต.ค. (ขายไปแล้ว) = 0 ไม่ใช่ค้างอยู่ตลอดกาล', at('2025-10').assets === 0, String(at('2025-10').assets));
}
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts`
Expected: `Cannot find module '../src/utils/netWorthHistory'`

- [ ] **Step 3: `src/utils/netWorthHistory.ts`**

```ts
/**
 * WealthLens — net worth ย้อนหลังรายเดือน (F48).
 *
 * F38 ทำ "ความมั่งคั่ง ณ วันนี้" ไว้แล้ว (utils/netWorth.ts) และเขียนไว้ตรง ๆ ว่า
 * กราฟย้อนหลัง = นอก scope. ไฟล์นี้คือส่วนนั้น
 *
 * ── ความจริงข้อเดียวที่ทั้งไฟล์นี้ตั้งอยู่บนมัน ──
 * BankAccount.balances[ปี][เดือน] คือ **กระแสเงินของเดือนนั้น** ไม่ใช่ยอดคงเหลือ
 * (accountAllTimeTotal() บวกทุกเดือนเข้าด้วยกัน; F40 invariant: Σ tx = ค่าในช่อง)
 * → ยอด ณ เดือน M = ผลรวมสะสมทุกเดือน ≤ M
 * → เดือนที่ไม่มีตัวเลข = เงินไม่ขยับ ยอดคงเดิมเอง ไม่ต้อง carry-forward
 *
 * ── กฎไม่ให้กราฟโกหก ──
 * บัญชีที่เพิ่งเริ่มบันทึกจะทำให้เส้นกระโดด ทั้งที่เงินนั้นมีอยู่มาตลอด
 * (ของจริง: Tom เพิ่ม 5 บัญชีพร้อมกันใน ก.ค. 2026, เงินสด ฿150,000)
 * เดือนแบบนั้นติดธง isTrackingJump และ growthBetween() ที่คร่อมมันคืน null —
 * โชว์ "+38%" ทั้งที่แค่เปลี่ยนวิธีนับ คือการโกหกด้วยตัวเลขจริง
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 */
import type { BankAccount, GoldHolding, Loan, WealthLensData } from '@/types';
import { getPrincipalRemaining } from '@/utils/loanCalculations';
import { endOfMonth, monthsIn, parseYm, toYm, ymLte, type Ym } from '@/utils/monthRange';
import type { InstallmentPlanSummary } from '@/stores/selectors';

export interface NetWorthPoint {
  ym: Ym;
  assets: number;
  debts: number;
  /** ติดลบได้ ห้าม clamp (กฎเดิม F38/F44) */
  netWorth: number;
  /** กี่บัญชีที่มีข้อมูลถึงเดือนนี้ — ใช้บอกว่าเส้นช่วงนั้น "ครอบคลุมแค่ไหน" */
  accountsCovered: number;
  /** เดือนนี้มีบัญชีใหม่โผล่ครั้งแรก → เส้นกระโดดเพราะวิธีนับเปลี่ยน ไม่ใช่เพราะรวยขึ้น */
  isTrackingJump: boolean;
  newAccounts: string[];
  /** ทองคิดด้วยราคาทุน (ยังไม่รู้ราคาตลาดของเดือนนั้น) */
  goldIsCostBasis: boolean;
}

/** เดือนแรกที่บัญชีนี้มีตัวเลข — ก่อนหน้านั้นถือว่าบัญชียังไม่มีตัวตนในข้อมูล */
const firstMonthOf = (account: BankAccount): Ym | null => {
  const all: Ym[] = [];
  for (const [year, months] of Object.entries(account.balances ?? {})) {
    for (const month of Object.keys(months)) {
      all.push(toYm(Number(year), Number(month)));
    }
  }
  return all.length === 0 ? null : all.sort()[0];
};

/** ผลรวมสะสมของบัญชีถึงเดือน ym */
const bankTotalAsOf = (accounts: readonly BankAccount[], ym: Ym): number => {
  let total = 0;
  for (const account of accounts) {
    for (const [year, months] of Object.entries(account.balances ?? {})) {
      for (const [month, amount] of Object.entries(months)) {
        if (ymLte(toYm(Number(year), Number(month)), ym)) total += amount;
      }
    }
  }
  return total;
};

/** เงินออมสะสม (ทุกหมวด ยกเว้นทอง — ทองนับจาก ledger ราคาตลาด, กฎเดิม F38) */
const savingsAsOf = (years: WealthLensData['years'], ym: Ym): number => {
  let total = 0;
  for (const [year, yearData] of Object.entries(years)) {
    for (const row of yearData.savings ?? []) {
      if (!ymLte(toYm(Number(year), row.month), ym)) continue;
      for (const item of row.items ?? []) {
        if (item.category === 'gold') continue;
        total += item.amount;
      }
    }
  }
  return total;
};

/**
 * ทองที่ถืออยู่ ณ สิ้นเดือน ym (ซื้อแล้ว และยังไม่ขาย ณ ตอนนั้น)
 *
 * การขายเก็บที่ `holding.sold?: GoldSaleRecord` (มี `soldDate`, `soldPrice`)
 * ไม่ใช่ field `soldDate` บนตัว holding ตรง ๆ — เช็คใน types/index.ts:514 ก่อน
 * ถ้าลืมกรองตัวที่ขายไปแล้ว ทองก้อนนั้นจะอยู่ในสินทรัพย์ตลอดกาลทั้งที่ขายไปแล้ว
 */
const goldHeldAsOf = (
  holdings: readonly GoldHolding[],
  ym: Ym,
): GoldHolding[] =>
  holdings.filter((h) => {
    if (!ymLte(h.purchaseDate.slice(0, 7), ym)) return false; // ยังไม่ได้ซื้อ
    const sold = h.sold?.soldDate;
    if (sold && ymLte(sold.slice(0, 7), ym)) return false; // ขายไปแล้ว ณ เดือนนั้น
    return true;
  });

/** ยอดผ่อนคงเหลือ ณ สิ้นเดือน ym = ยอดเต็ม − งวดที่จ่ายไปแล้วถึงเดือนนั้น */
const installmentsRemainingAsOf = (
  plans: readonly InstallmentPlanSummary[],
  ym: Ym,
): number =>
  plans.reduce((total, plan) => {
    const paid = plan.instances
      .filter((i) => ymLte(toYm(i.year, i.month), ym))
      .reduce((s, i) => s + i.amount, 0);
    return total + Math.max(0, plan.totalAmount - paid);
  }, 0);

/**
 * @param goldPriceAt ราคาทอง (฿ ต่อ 1 บาททอง) ณ เดือนนั้น — คืน null เมื่อไม่รู้
 *                    (goldPriceHistory ของ Tom มีแต่ snapshot ใหม่ ๆ เดือนเก่าจึงไม่มีราคา)
 */
export const buildNetWorthHistory = (
  data: WealthLensData,
  goldPriceAt: (ym: Ym) => number | null,
  resolvedLoans: readonly Loan[],
  installmentPlans: readonly InstallmentPlanSummary[],
): NetWorthPoint[] => {
  const accounts = data.bankAccounts ?? [];
  const holdings = data.goldHoldings ?? [];

  // เดือนแรกของแต่ละบัญชี → ใช้ทั้งนับ coverage และหาจุดกระโดด
  const firstMonths = new Map<string, Ym>();
  for (const account of accounts) {
    const first = firstMonthOf(account);
    if (first) firstMonths.set(account.id, first);
  }

  return monthsIn(data.years).map((ym) => {
    const bank = bankTotalAsOf(accounts, ym);
    const savings = savingsAsOf(data.years, ym);

    const held = goldHeldAsOf(holdings, ym);
    const price = goldPriceAt(ym);
    const usesCostBasis = price === null || price <= 0;
    const gold = usesCostBasis
      ? held.reduce((s, h) => s + h.totalCost, 0)
      : held.reduce((s, h) => s + h.weightBaht * price, 0);

    const asOf = endOfMonth(ym);
    const loanDebt = resolvedLoans.reduce(
      (s, loan) => s + getPrincipalRemaining(loan, asOf),
      0,
    );
    const installmentDebt = installmentsRemainingAsOf(installmentPlans, ym);

    const covered = [...firstMonths.values()].filter((first) => ymLte(first, ym));
    const newAccounts = accounts
      .filter((a) => firstMonths.get(a.id) === ym)
      .map((a) => a.name);

    const assets = bank + gold + savings;
    const debts = loanDebt + installmentDebt;

    return {
      ym,
      assets,
      debts,
      netWorth: assets - debts, // ติดลบได้ ห้าม clamp
      accountsCovered: covered.length,
      isTrackingJump: newAccounts.length > 0,
      newAccounts,
      goldIsCostBasis: held.length > 0 && usesCostBasis,
    };
  });
};

/**
 * % เติบโตระหว่างสองเดือน — **null เมื่อปลายทางเป็นจุดกระโดด**
 * ตัวเลขที่คร่อมการเปลี่ยนวิธีนับ ไม่ได้วัดการเติบโต มันวัดว่าเราเริ่มนับอะไรเพิ่ม
 * (คืน null ด้วยเมื่อฐานเป็น 0 — หารด้วยศูนย์ไม่ได้ และ "โต ∞%" ไม่มีความหมาย)
 */
export const growthBetween = (
  from: NetWorthPoint,
  to: NetWorthPoint,
): number | null => {
  if (to.isTrackingJump) return null;
  if (from.netWorth === 0) return null;
  return (to.netWorth - from.netWorth) / Math.abs(from.netWorth);
};
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts` → ✅ ทั้งหมด
Run: `npm run typecheck && npm run lint`

- [ ] **Step 5: commit**

```bash
git add src/utils/netWorthHistory.ts scripts/verify-growth.ts
git commit -m "feat(growth): net worth ย้อนหลัง + ธงจุดเริ่มติดตามบัญชีใหม่ (F48)"
```

---

## Task 4: G1 — ผูกกับของเดิม (ข้อที่สำคัญที่สุด)

ถ้าเครื่องคำนวณย้อนหลังให้ตัวเลขไม่ตรงกับ `/wealth` ผู้ใช้จะเห็นตัวเลขสองค่าในแอปเดียว และไม่มีทางรู้ว่าอันไหนถูก

**Files:** Modify `scripts/verify-growth.ts`

- [ ] **Step 1: เพิ่ม G1**

```ts
import { computeNetWorth } from '../src/utils/netWorth';

console.log('\n— G1: จุดสุดท้ายของ history === computeNetWorth() ของ /wealth เป๊ะ —');
{
  const data = {
    years: {
      '2025': {
        income: [],
        expenses: [],
        savings: [
          { month: 3, items: [{ id: 's1', category: 'general', name: 'ออม', amount: 20_000 }] },
        ],
      },
    },
    bankAccounts: [
      acct('a1', 'กรุงศรี', { '2025': { '1': 100_000, '6': 25_000 } }),
      acct('a2', 'เงินสด', { '2025': { '6': 150_000 } }),
    ],
    goldHoldings: [
      { id: 'g1', purchaseDate: '2025-02-10', weightBaht: 2, totalCost: 80_000 },
    ],
  } as unknown as WealthLensData;

  const goldValue = { marketValue: 0, totalInvested: 80_000 }; // ยังไม่ตั้ง spot → ราคาทุน
  const today = computeNetWorth(data, goldValue, [], [], new Date('2025-12-31'));

  const history = buildNetWorthHistory(data, () => null, [], []);
  const last = history[history.length - 1];

  assert(
    `assets ตรงกัน (history ${last.assets} vs netWorth ${today.totalAssets})`,
    last.assets === today.totalAssets,
  );
  assert(
    `netWorth ตรงกัน (history ${last.netWorth} vs netWorth ${today.netWorth})`,
    last.netWorth === today.netWorth,
  );
}
```

- [ ] **Step 2: รัน**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts`

**ถ้า G1 แดง อย่าแก้ assertion** — มันแปลว่าเครื่องคำนวณสองตัวไม่ตรงกันจริง ๆ ไปหาว่าใครผิด:
- `computeNetWorth` ใช้ `sumBankAllTime` (ผลรวมทุกเดือนของทุกบัญชี) — ต้องเท่ากับ `bankTotalAsOf(accounts, เดือนสุดท้าย)` เสมอ
- ออม: `computeNetWorth` รวมทุกปี ยกเว้นหมวด `gold` — `savingsAsOf` ต้องทำเหมือนกันเป๊ะ
- ทอง: ทั้งคู่ต้องตกไปที่ราคาทุนเมื่อไม่มีราคาตลาด
รายงานว่าใครผิดและแก้ที่ต้นเหตุ

- [ ] **Step 3: commit**

```bash
git add scripts/verify-growth.ts
git commit -m "test(growth): G1 — history จุดสุดท้ายต้องเท่ากับ /wealth เป๊ะ (F48)"
```

---

## Task 5: หน้า `/growth` + กราฟสองตัว

**Files:**
- Create: `src/components/growth/NetWorthHistoryChart.tsx`
- Create: `src/components/growth/SavingsRateChart.tsx`
- Create: `src/pages/GrowthPage.tsx`
- Modify: `src/lib/nav.ts`, `src/App.tsx`

### กฎที่ผูกอยู่กับงานก่อนหน้า (ห้ามผิด)
- **สีกราฟมาจาก `useChartTheme()`** — Recharts รับ `var()` ไม่ได้ (เขียน `stroke="var(--x)"` แล้วเส้นหายเงียบ ๆ ไม่มี error) — F46
- **สีอื่นทั้งหมดเป็น token class** (`bg-card`, `text-ink-500`, …) — `verify-no-hardcoded-colors.ts` allowlist ว่าง
- **ความสูงกราฟผ่าน `utils/chartSizing.ts`** — F47 (มือถือเตี้ยลง 20%)
- **ตารางถ้ามี ต้องตรึงคอลัมน์แรกเมื่อกว้างเกินจอ** — F47 M4
- **ปุ่ม/ลิงก์ ≥ 44px บนมือถือ** (`min-h-11 md:min-h-0`) — F47 M2
- อ่าน `src/components/analytics/TrendAnalysis.tsx` เป็นแบบ (มันมีทั้ง area chart, custom tooltip, gradient, legend)

- [ ] **Step 1: `src/lib/nav.ts` — เพิ่มเมนู**

แทรกในกลุ่ม 3 ต่อจาก `/analytics`:
```ts
  { path: '/growth', label: 'เติบโต', icon: '📉', mobilePrimary: false, group: 3 },
```
`scripts/verify-nav.ts` จะตรวจเองว่า route มีจริงใน `App.tsx` และ `mobilePrimary` ยังเป็น 4 พอดี

- [ ] **Step 2: `src/App.tsx` — route**

```tsx
const GrowthPage = lazy(() => import('@/pages/GrowthPage'));
...
          <Route path="growth" element={<GrowthPage />} />
```

- [ ] **Step 3: `NetWorthHistoryChart.tsx`**

Area chart ของ `netWorth` รายเดือน (แกน X = เดือนไทย ย่อ, แกน Y = ฿k):
- ใช้ `<ReferenceDot>` ที่ทุกจุดที่ `isTrackingJump` — tooltip/label บอก "เริ่มติดตาม: {newAccounts.join(', ')}"
- ช่วงก่อนบัญชีสุดท้ายเริ่มติดตาม (`accountsCovered < จำนวนบัญชีทั้งหมด`) วาดด้วย `strokeDasharray` + opacity ต่ำ พร้อมป้ายใต้กราฟ: "ช่วงนี้ครอบคลุม {n} จาก {total} บัญชี"
- custom tooltip แสดง: สินทรัพย์ / หนี้ / สุทธิ + บรรทัด "⚠️ ทองคิดด้วยราคาทุน" เมื่อ `goldIsCostBasis`
- **ไม่มีเส้นทำนายอนาคต** (กฎเดิม: ไม่เดา)

- [ ] **Step 4: `SavingsRateChart.tsx`**

- แท่ง `rate` (%) รายเดือน — **เดือนที่ `rate === null` ไม่วาดแท่ง** (ส่ง `null` เข้า Recharts มันจะเว้นช่องให้เอง อย่าแทนที่ด้วย 0)
- เส้นค่าเฉลี่ย 3 เดือนจาก `rollingAverage(points, 3)`
- ใต้กราฟ: caption นับจำนวนเดือนที่ไม่มีข้อมูลรายจ่าย — "12 เดือนไม่มีข้อมูลรายจ่าย (ปี 2023) จึงไม่มีอัตราการออม"
- แท่งติดลบ (จ่ายเกินรายได้) ใช้สี expense — **ห้าม clamp เป็น 0**

- [ ] **Step 5: `GrowthPage.tsx`**

ประกอบอย่างเดียว ไม่คำนวณ:
```tsx
  const data = useFinanceStore((s) => s.data);
  const loans = useResolvedLoans();
  const plans = useMemo(() => selectInstallmentPlans(snapshot), [snapshot]);
  const gold = useMemo(() => selectGoldSummary(snapshot), [snapshot]);

  // ราคาทองย้อนหลัง: หา snapshot ล่าสุดที่ fetchedAt ≤ สิ้นเดือนนั้น
  // ไม่มี = null → netWorthHistory ตกไปใช้ราคาทุนเอง (G6)
  const goldPriceAt = useCallback((ym: string) => { ... }, [data.goldPriceHistory]);

  const history = useMemo(
    () => buildNetWorthHistory(data, goldPriceAt, loans, plans),
    [data, goldPriceAt, loans, plans],
  );
  const rates = useMemo(() => buildSavingsRateSeries(data), [data]);
```
หัวหน้า: ตัวเลขล่าสุด + % เติบโตเทียบเดือนก่อน (ใช้ `growthBetween`) — **ถ้าได้ `null` แสดง "เทียบไม่ได้ (เริ่มติดตามบัญชีใหม่)" ไม่ใช่ซ่อนเงียบ ๆ**

- [ ] **Step 6: ตรวจ**

```bash
npm run typecheck && npm run lint && npm run build
npx tsx --tsconfig tsconfig.app.json scripts/verify-nav.ts
npx tsx --tsconfig tsconfig.app.json scripts/verify-no-hardcoded-colors.ts
npm run verify:mobile
```
ทั้งหมดต้องเขียว (verify:mobile จะตรวจหน้าใหม่ด้วยไหม? **ไม่** — ROUTES ใน `scripts/verify-mobile.ts` เป็นรายการตายตัว → **เพิ่ม `'/growth'` เข้าไปด้วย** ไม่งั้นหน้าใหม่ไม่มีใครตรวจ)

- [ ] **Step 7: commit**

```bash
git add src/lib/nav.ts src/App.tsx src/pages/GrowthPage.tsx src/components/growth scripts/verify-mobile.ts
git commit -m "feat(growth): หน้า /growth — net worth ย้อนหลัง + อัตราการออม (F48)"
```

---

## Task 6: ขับของจริง + เอกสาร

- [ ] **Step 1: ขับกับข้อมูลจริงของ Tom**

`npm run dev` → `/growth` (เบราว์เซอร์ของ Tom มีข้อมูลจริงใน LocalStorage อยู่แล้ว)

ต้องเห็น:
- ตัวเลข net worth เดือนล่าสุด **ตรงกับหน้า `/wealth` เป๊ะ** ← ถ้าไม่ตรง หยุด แล้วหาว่าใครผิด
- หมุด "เริ่มติดตาม" โผล่ที่ **ก.ค. 2026** พร้อมชื่อบัญชี (clicx, กสิกรไทย, กรุงศรีอยุธยา, กรุงไทย, เงินสด)
- ช่วงก่อนหน้านั้นเป็นเส้นจาง + ป้าย "ครอบคลุม 1 จาก 6 บัญชี"
- อัตราการออม **ปี 2023 ไม่มีแท่งเลย** (ไม่ใช่แท่ง 100%)
- ทั้งโหมดสว่างและมืด · ที่ 390px ไม่มีอะไรล้นขอบจอ

- [ ] **Step 2: เอกสาร**

- `features.json` — F48 ใน `phase_5`, `completionPercent: 100`, `status: "completed"`, `progressSummary` → 56/56, `nextMilestone` = Phase 5 จบ
- `CLAUDE.md` — Data Quirks: เพิ่มบรรทัด *"`bankAccounts.balances[ปี][เดือน]` = กระแสเงินของเดือนนั้น ไม่ใช่ยอดคงเหลือ — ยอดจริง = ผลรวมสะสม"* (นี่คือความเข้าใจผิดที่เกือบทำให้ F48 ผิดทั้งฟีเจอร์)
- `docs/UXUI.md` — หัวข้อหน้าเติบโต

- [ ] **Step 3: commit**

```bash
git add features.json CLAUDE.md docs/UXUI.md
git commit -m "docs: F48 หน้าเติบโตเสร็จ — Phase 5 ครบ"
```

---

## สิ่งที่ไม่ทำโดยตั้งใจ

- **ไม่พยากรณ์ net worth อนาคต** — เดาที่ดูน่าเชื่อถือเกินจริง
- **ไม่เทียบกับใคร** — เราไม่มีข้อมูลนั้น ไม่มีสิทธิ์พูด
- **ไม่แตะ `/wealth`** — มันตอบ "วันนี้เท่าไร" ได้ดีแล้ว หน้าใหม่ตอบ "มาถึงตรงนี้ได้ยังไง"
- **ไม่ทำ cashflow เข้า-ออกบัญชี** — คำถามที่สามที่ Tom ไม่ได้เลือก
