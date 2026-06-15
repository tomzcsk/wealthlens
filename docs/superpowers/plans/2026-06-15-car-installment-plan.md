# Car Installment Plan (F30) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้รายการ "รถยนต์" (฿23,722/เดือน) แสดงเป็นแผนผ่อน 60 งวด — badge "ผ่อน 39/60" บนรายการ expense และการ์ดในหน้า "แผนผ่อน" — โดยไม่สร้างแถวผีและไม่แตะข้อมูลปี 2023

**Architecture:** เพิ่ม pure util `src/utils/installments.ts` (ติดป้าย + สร้างตารางงวดจาก metadata) → ทำให้ `selectInstallmentPlans` คำนวณจาก *schedule ที่ derive จาก metadata* แทนการนับแถว → trigger ผ่านปุ่ม DangerZone (`tagCarInstallments`) + tag ตอน build seed → กันลบประวัติรถจริงด้วย `untagInstallmentPlan` + modal 2 ทางเลือก

**Tech Stack:** React 19 + TypeScript strict + Zustand + Vite. ไม่มี test runner — verify ด้วย `npx tsx scripts/verify-*.ts` + `npm run typecheck` + `npm run build`

**Spec:** `docs/superpowers/specs/2026-06-15-car-installment-plan-design.md`

**Key facts:** งวด 1 = เม.ย. 2023 · 60 งวด · ฿23,722/งวด · totalAmount ฿1,423,320 · sequence = `(year−2023)×12 + month − 3` · มิ.ย. 2026 = งวด 39 · จบ มี.ค. 2028 · คงเหลือแบบงวด ฿498,162

---

## File Structure

| ไฟล์ | Responsibility |
|---|---|
| `src/utils/installments.ts` (**ใหม่**) | pure: round2/advanceMonth (ย้ายมาจาก financeStore), CAR_INSTALLMENT spec, carSequenceFor, applyCarInstallmentTags, removeInstallmentTags, buildInstallmentSchedule + ScheduledInstallment type |
| `src/stores/selectors.ts` | `selectInstallmentPlans` schedule-driven + ขยาย `InstallmentPlanSummary` |
| `src/stores/financeStore.ts` | import helpers จาก util (ลบ local), `tagCarInstallments()`, `untagInstallmentPlan()` |
| `src/pages/InstallmentsPage.tsx` | timeline/เริ่ม-จบ/KPI ใช้ schedule, delete modal 2 ทางเลือก |
| `src/components/forms/ExpenseList.tsx` | ซ่อน "ประจำ" เมื่อมี installment |
| `src/components/settings/DangerZone.tsx` | ปุ่ม "🚗 ผูกรถยนต์เป็นผ่อน" |
| `src/data/seedData.ts` | ห่อ years ด้วย applyCarInstallmentTags (planId คงที่) |
| `scripts/verify-car-installment.ts` (**ใหม่**) | hand-computed assertions |
| `features.json` | เพิ่ม F30 |

---

## Task 1: Pure util — tagging helpers (`src/utils/installments.ts`)

**Files:**
- Create: `src/utils/installments.ts`
- Test: `scripts/verify-car-installment.ts`

- [ ] **Step 1: Write the failing verify script (tagging portion)**

Create `scripts/verify-car-installment.ts`:

```ts
/**
 * Hand-computed verification for car installment plan (F30).
 * Repo has no test runner — run with: npx tsx scripts/verify-car-installment.ts
 */
import seedData from '../src/data/seedData';
import {
  applyCarInstallmentTags,
  carSequenceFor,
  removeInstallmentTags,
} from '../src/utils/installments';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(actual)} (expected ${String(expected)})`);
};

// --- carSequenceFor ---
expectEq('seq มิ.ย. 2026', carSequenceFor(2026, 6), 39);
expectEq('seq ม.ค. 2024', carSequenceFor(2024, 1), 10);
expectEq('seq มี.ค. 2028 (งวดสุดท้าย)', carSequenceFor(2028, 3), 60);
expectEq('seq มี.ค. 2023 (ก่อนเริ่ม)', carSequenceFor(2023, 3), null);
expectEq('seq เม.ย. 2028 (เกินแผน)', carSequenceFor(2028, 4), null);

// --- applyCarInstallmentTags (idempotent, ไม่แตะ amount) ---
const tagged = applyCarInstallmentTags(seedData.years, 'test-car-plan');
const jan24Car = tagged['2024'].expenses
  .find((e) => e.month === 1)
  ?.items.find((it) => it.name === 'รถยนต์' && it.category === 'vehicle');
expectEq('Jan 2024 car sequence', jan24Car?.installment?.sequence, 10);
expectEq('Jan 2024 car totalMonths', jan24Car?.installment?.totalMonths, 60);
expectEq('Jan 2024 car planId', jan24Car?.installment?.planId, 'test-car-plan');
expectEq('Jan 2024 car amount unchanged', jan24Car?.amount, 23722);
expectEq('Jan 2024 car isRecurring unchanged', jan24Car?.isRecurring, true);

// 2023 ไม่ถูกแตะ (ไม่มีแถวรถ)
const car2023 = tagged['2023'].expenses
  .find((e) => e.month === 4)
  ?.items.find((it) => it.name === 'รถยนต์');
expectEq('2023 ไม่มีแถวรถ', car2023, undefined);

// --- removeInstallmentTags ---
const untagged = removeInstallmentTags(tagged, 'test-car-plan');
const jan24u = untagged['2024'].expenses
  .find((e) => e.month === 1)
  ?.items.find((it) => it.name === 'รถยนต์');
expectEq('untag removes metadata', jan24u?.installment, undefined);
expectEq('untag keeps amount', jan24u?.amount, 23722);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-car-installment.ts`
Expected: FAIL — `Cannot find module '../src/utils/installments'`

- [ ] **Step 3: Create `src/utils/installments.ts` (tagging portion)**

```ts
import { v4 as uuidv4 } from 'uuid';

import type {
  ExpenseCategory,
  InstallmentMeta,
  MonthlyExpense,
  WealthLensData,
} from '@/types';

/** Round to 2 decimals (moved from financeStore — single source of truth). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Add `offset` whole months to (year, month). Month overflow rolls years. */
export const advanceMonth = (
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } => {
  const zeroBased = month - 1 + offset;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
};

/** ผ่อนรถ 60 งวด เริ่ม เม.ย. 2023 งวดละ 23,722 (ค่าคงที่ที่เดียว). */
export const CAR_INSTALLMENT = {
  name: 'รถยนต์',
  category: 'vehicle' as ExpenseCategory,
  totalMonths: 60,
  perInstallment: 23722,
  totalAmount: 23722 * 60, // 1,423,320
  startYear: 2023,
  startMonth: 4,
} as const;

/** sequence (1..60) ของเดือนนี้ในแผนรถ ; null ถ้าอยู่นอกช่วงแผน. */
export const carSequenceFor = (year: number, month: number): number | null => {
  const seq =
    (year - CAR_INSTALLMENT.startYear) * 12 +
    month -
    (CAR_INSTALLMENT.startMonth - 1);
  return seq >= 1 && seq <= CAR_INSTALLMENT.totalMonths ? seq : null;
};

/**
 * คืน years ใหม่ที่ item "รถยนต์"/vehicle ถูกเติม `installment` metadata
 * โดยคำนวณ sequence จากปฏิทิน — ติดเฉพาะเดือนที่ sequence อยู่ใน 1..60.
 * ไม่แตะ `amount` และ `isRecurring`. Idempotent: ถ้ามีงวดที่ tag แล้ว
 * reuse planId เดิม (ไม่งั้นใช้ `planId` ที่ส่งมา หรือ uuid ใหม่).
 */
export const applyCarInstallmentTags = (
  years: WealthLensData['years'],
  planId: string = uuidv4(),
): WealthLensData['years'] => {
  let existingPlanId: string | undefined;
  for (const yr of Object.values(years)) {
    for (const row of yr.expenses) {
      for (const item of row.items) {
        if (
          item.name === CAR_INSTALLMENT.name &&
          item.category === CAR_INSTALLMENT.category &&
          item.installment
        ) {
          existingPlanId = item.installment.planId;
        }
      }
    }
  }
  const usePlanId = existingPlanId ?? planId;

  const next: WealthLensData['years'] = {};
  for (const [yearKey, yr] of Object.entries(years)) {
    const year = Number(yearKey);
    const nextExpenses: MonthlyExpense[] = yr.expenses.map((row) => {
      let touched = false;
      const items = row.items.map((item) => {
        if (
          item.name !== CAR_INSTALLMENT.name ||
          item.category !== CAR_INSTALLMENT.category
        ) {
          return item;
        }
        const seq = carSequenceFor(year, row.month);
        if (seq == null) return item;
        touched = true;
        const installment: InstallmentMeta = {
          planId: usePlanId,
          sequence: seq,
          totalMonths: CAR_INSTALLMENT.totalMonths,
          totalAmount: CAR_INSTALLMENT.totalAmount,
          startYear: CAR_INSTALLMENT.startYear,
          startMonth: CAR_INSTALLMENT.startMonth,
        };
        return { ...item, installment };
      });
      return touched ? { ...row, items } : row;
    });
    next[yearKey] = { ...yr, expenses: nextExpenses };
  }
  return next;
};

/** ลบ `installment` ออกจากทุกแถวของแผน planId แต่เก็บแถว expense ไว้. */
export const removeInstallmentTags = (
  years: WealthLensData['years'],
  planId: string,
): WealthLensData['years'] => {
  const next: WealthLensData['years'] = {};
  for (const [yearKey, yr] of Object.entries(years)) {
    const nextExpenses = yr.expenses.map((row) => {
      let touched = false;
      const items = row.items.map((item) => {
        if (item.installment?.planId !== planId) return item;
        touched = true;
        const { installment: _omit, ...rest } = item;
        return rest;
      });
      return touched ? { ...row, items } : row;
    });
    next[yearKey] = { ...yr, expenses: nextExpenses };
  }
  return next;
};
```

> หมายเหตุ: ถ้า `@/types` ไม่ export ชื่อใดชื่อหนึ่ง ให้เช็ค `src/types/index.ts` แล้วใช้ชื่อที่ตรง (financeStore.ts import `WealthLensData`, `ExpenseItem`, `InstallmentMeta`, `MonthlyExpense` จาก `@/types`)

- [ ] **Step 4: Run to verify tagging assertions pass**

Run: `npx tsx scripts/verify-car-installment.ts`
Expected: ทุกบรรทัด tagging ขึ้น `✓` (schedule/selector ส่วนยังไม่เพิ่ม) → ออกด้วย `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/utils/installments.ts scripts/verify-car-installment.ts
git commit -m "feat(installments): util ติดป้าย/ถอดป้ายผ่อนรถ + carSequenceFor (F30)"
```

---

## Task 2: Pure util — schedule builder (`src/utils/installments.ts`)

**Files:**
- Modify: `src/utils/installments.ts` (append)
- Test: `scripts/verify-car-installment.ts` (append)

- [ ] **Step 1: Append failing schedule assertions to verify script**

แทรกก่อนบรรทัด `console.log(failures === 0 ...)` ใน `scripts/verify-car-installment.ts`:

```ts
import { buildInstallmentSchedule } from '../src/utils/installments';

// --- buildInstallmentSchedule ---
const carMeta = jan24Car!.installment!;
const sched = buildInstallmentSchedule(
  carMeta,
  new Map([[10, { amount: 23722, itemId: 'x' }]]),
);
expectEq('schedule length', sched.length, 60);
expectEq('งวด 1 = เม.ย. 2023', `${sched[0].year}-${sched[0].month}`, '2023-4');
expectEq('งวด 39 = มิ.ย. 2026', `${sched[38].year}-${sched[38].month}`, '2026-6');
expectEq('งวด 60 = มี.ค. 2028', `${sched[59].year}-${sched[59].month}`, '2028-3');
expectEq('งวด 10 materialized', sched[9].materialized, true);
expectEq('งวด 10 itemId', sched[9].itemId, 'x');
expectEq('งวด 1 projected', sched[0].materialized, false);
expectEq('งวด 1 amount = perInstallment', sched[0].amount, 23722);
```

> ย้าย `import { buildInstallmentSchedule }` ไปรวมกับ import เดิมด้านบนได้ (อย่าให้ import ซ้ำชื่อ)

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-car-installment.ts`
Expected: FAIL — `buildInstallmentSchedule is not exported` (หรือ undefined)

- [ ] **Step 3: Append `ScheduledInstallment` + `buildInstallmentSchedule` to `src/utils/installments.ts`**

```ts
/** หนึ่งงวดในตารางผ่อน — derive จาก metadata, overlay แถวจริงถ้ามี. */
export interface ScheduledInstallment {
  sequence: number;
  year: number;
  month: number;
  /** ค่าแถวจริงถ้า materialized ; ไม่งั้น perInstallment (งวดท้ายดูดเศษ). */
  amount: number;
  /** true = มีแถว expense จริงในเดือนนั้น. */
  materialized: boolean;
  itemId: string | null;
}

/**
 * สร้างตารางงวดเต็ม 1..totalMonths จาก metadata แล้ว overlay แถวจริง
 * (`materializedBySeq`) ลงไป — งวดที่ไม่มีแถวจะเป็น "คาดการณ์".
 */
export const buildInstallmentSchedule = (
  meta: InstallmentMeta,
  materializedBySeq: Map<number, { amount: number; itemId: string }>,
): ScheduledInstallment[] => {
  const perInstallment = round2(meta.totalAmount / meta.totalMonths);
  const lastInstallment = round2(
    meta.totalAmount - perInstallment * (meta.totalMonths - 1),
  );
  const schedule: ScheduledInstallment[] = [];
  for (let seq = 1; seq <= meta.totalMonths; seq += 1) {
    const { year, month } = advanceMonth(meta.startYear, meta.startMonth, seq - 1);
    const row = materializedBySeq.get(seq);
    const expected = seq === meta.totalMonths ? lastInstallment : perInstallment;
    schedule.push({
      sequence: seq,
      year,
      month,
      amount: row ? row.amount : expected,
      materialized: row != null,
      itemId: row?.itemId ?? null,
    });
  }
  return schedule;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx scripts/verify-car-installment.ts`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add src/utils/installments.ts scripts/verify-car-installment.ts
git commit -m "feat(installments): buildInstallmentSchedule + ScheduledInstallment (F30)"
```

---

## Task 3: Schedule-driven selector (`src/stores/selectors.ts`)

**Files:**
- Modify: `src/stores/selectors.ts` (`InstallmentPlanSummary` interface + `selectInstallmentPlans` body ~408-516)
- Test: `scripts/verify-car-installment.ts` (append)

- [ ] **Step 1: Append failing selector assertions to verify script**

แทรกก่อน `console.log(failures === 0 ...)`:

```ts
import { selectInstallmentPlans } from '../src/stores/selectors';

// --- selectInstallmentPlans (schedule-driven) ---
const snapshot = { data: { ...seedData, years: tagged } };
const refDate = new Date('2026-06-15T00:00:00.000Z');
const plans = selectInstallmentPlans(snapshot, refDate);
const carPlan = plans.find((p) => p.name === 'รถยนต์');
expectEq('มีแผนรถ', carPlan != null, true);
expectEq('paidMonths', carPlan?.paidMonths, 39);
expectEq('totalMonths', carPlan?.totalMonths, 60);
expectEq('คงเหลือแบบงวด', carPlan?.remainingAmount, 498162);
expectEq('nextDue ปี', carPlan?.nextDue?.year, 2026);
expectEq('nextDue เดือน', carPlan?.nextDue?.month, 7);
expectEq('endYear', carPlan?.endYear, 2028);
expectEq('endMonth', carPlan?.endMonth, 3);
expectEq('schedule length', carPlan?.schedule.length, 60);
expectEq('ยัง active', carPlan?.isCompleted, false);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/verify-car-installment.ts`
Expected: FAIL — `carPlan.schedule is undefined` / `endYear` undefined

- [ ] **Step 3: Extend `InstallmentPlanSummary` interface**

ใน `src/stores/selectors.ts` แก้ interface `InstallmentPlanSummary` (รอบบรรทัด 408-422): เพิ่ม import และ field

เพิ่มที่ import block (รวมกับ import จาก `@/utils/installments` ถ้ามี ไม่งั้นเพิ่มบรรทัดใหม่ใกล้ import อื่น):
```ts
import {
  buildInstallmentSchedule,
  type ScheduledInstallment,
} from '@/utils/installments';
```

แก้ interface — เปลี่ยน type ของ `nextDue` และเพิ่ม `schedule` / `endYear` / `endMonth`:
```ts
  /** All งวด found in the data, sorted by sequence. */
  instances: InstallmentInstance[];
  /** ตารางงวดเต็ม (derive จาก metadata, overlay แถวจริง). */
  schedule: ScheduledInstallment[];
  /** Sum of งวด amounts up to and including `referenceDate`. */
  paidAmount: number;
  /** Count of งวด already due (schedule-wise). */
  paidMonths: number;
  /** Remaining balance = totalAmount - paidAmount. */
  remainingAmount: number;
  /** Next งวด due (first schedule entry with month > referenceDate), if any. */
  nextDue: ScheduledInstallment | null;
  /** งวดสุดท้ายของตาราง (จบเมื่อไหร่). */
  endYear: number;
  endMonth: number;
  /** True when every งวด of the plan is in the past. */
  isCompleted: boolean;
```

- [ ] **Step 4: Replace the per-plan derivation loop in `selectInstallmentPlans`**

แทนที่ block `for (const [planId, instances] of plans) { ... }` (รอบบรรทัด 482-505) ด้วย:

```ts
  const summaries: InstallmentPlanSummary[] = [];
  for (const [planId, instances] of plans) {
    const sorted = [...instances].sort((a, b) => a.sequence - b.sequence);
    const meta = planMeta.get(planId);
    if (!meta) continue;
    const materializedBySeq = new Map(
      sorted.map((i) => [i.sequence, { amount: i.amount, itemId: i.itemId }]),
    );
    const schedule = buildInstallmentSchedule(meta.meta, materializedBySeq);
    const paid = schedule.filter((s) => ymKey(s.year, s.month) <= refYm);
    const paidAmount = paid.reduce((acc, s) => acc + s.amount, 0);
    const nextDue =
      schedule.find((s) => ymKey(s.year, s.month) > refYm) ?? null;
    const end = schedule[schedule.length - 1];
    summaries.push({
      planId,
      name: meta.name,
      category: meta.category,
      totalAmount: meta.meta.totalAmount,
      totalMonths: meta.meta.totalMonths,
      startYear: meta.meta.startYear,
      startMonth: meta.meta.startMonth,
      instances: sorted,
      schedule,
      paidAmount,
      paidMonths: paid.length,
      remainingAmount: Math.max(0, meta.meta.totalAmount - paidAmount),
      nextDue,
      endYear: end.year,
      endMonth: end.month,
      isCompleted: nextDue === null,
    });
  }
```

- [ ] **Step 5: Run verify + typecheck**

Run: `npx tsx scripts/verify-car-installment.ts && npm run typecheck`
Expected: verify `ALL PASS` ; typecheck อาจ error ที่ `InstallmentsPage.tsx` (ใช้ `nextDue.amount`/`lastInstance`) — แก้ใน Task 4. ถ้า error เฉพาะ InstallmentsPage ถือว่าผ่าน step นี้

- [ ] **Step 6: Commit**

```bash
git add src/stores/selectors.ts scripts/verify-car-installment.ts
git commit -m "feat(installments): selectInstallmentPlans คิดจาก schedule (F30)"
```

---

## Task 4: Installments page — schedule timeline + safe delete (`src/pages/InstallmentsPage.tsx`)

**Files:**
- Modify: `src/pages/InstallmentsPage.tsx`

- [ ] **Step 1: PlanCard — เริ่ม→จบ จาก endYear/endMonth**

ลบบรรทัด `const lastInstance = plan.instances[plan.instances.length - 1];` (รอบบรรทัด 54).

แทนที่ block `<p className="text-xs text-slate-500 mt-1"> ... </p>` (รอบบรรทัด 72-82) ด้วย:
```tsx
          <p className="text-xs text-slate-500 mt-1">
            {meta.label} · เริ่ม{' '}
            {formatThaiMonthYearShort(plan.startYear, plan.startMonth)} → จบ{' '}
            {formatThaiMonthYearShort(plan.endYear, plan.endMonth)}
          </p>
```

- [ ] **Step 2: PlanCard — timeline จาก plan.schedule**

แก้ปุ่ม toggle label (รอบบรรทัด 148):
```tsx
          {expanded ? '▾ ซ่อน timeline' : `▸ ดู timeline (${plan.schedule.length} งวด)`}
```

แทนที่ `<ol> ... </ol>` (รอบบรรทัด 151-174) ด้วย:
```tsx
          <ol className="mt-3 space-y-1 max-h-64 overflow-y-auto pr-1">
            {plan.schedule.map((inst) => {
              const today = todayYearMonth();
              const isFuture =
                inst.year * 100 + inst.month > today.year * 100 + today.month;
              const faded = isFuture || !inst.materialized;
              return (
                <li
                  key={inst.sequence}
                  className={`flex items-center justify-between text-xs px-3 py-1.5 rounded ${
                    faded ? 'bg-white text-slate-400' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  <span>
                    งวด {inst.sequence}/{plan.totalMonths} ·{' '}
                    {formatThaiMonthYearShort(inst.year, inst.month)}
                    {!inst.materialized && (
                      <span className="ml-2 text-[10px] text-slate-400">
                        คาดการณ์
                      </span>
                    )}
                  </span>
                  <span className="financial-number tabular-nums">
                    {formatTHB(inst.amount)}
                  </span>
                </li>
              );
            })}
          </ol>
```

- [ ] **Step 3: KPI thisMonthDue จาก schedule**

ใน `kpis` useMemo (รอบบรรทัด 212-219) แก้ loop ด้านในจาก `plan.instances` เป็น `plan.schedule`:
```tsx
    for (const plan of activePlans) {
      totalRemaining += plan.remainingAmount;
      for (const inst of plan.schedule) {
        if (inst.year * 100 + inst.month === todayKey) {
          thisMonthDue += inst.amount;
        }
      }
    }
```

- [ ] **Step 4: เพิ่ม untag action + handler**

หลังบรรทัด `const deleteInstallmentPlan = useFinanceStore((s) => s.deleteInstallmentPlan);` เพิ่ม:
```tsx
  const untagInstallmentPlan = useFinanceStore(
    (s) => s.untagInstallmentPlan,
  );
```

หลังฟังก์ชัน `confirmDelete` (รอบบรรทัด 236) เพิ่ม:
```tsx
  const confirmUntag = (): void => {
    const plan = pendingDelete;
    if (!plan) return;
    untagInstallmentPlan(plan.planId);
    setPendingDelete(null);
    pushToast({
      message: `ยกเลิกสถานะผ่อนของ '${plan.name}' แล้ว (เก็บรายการไว้)`,
      tone: 'info',
    });
  };
```

- [ ] **Step 5: Delete modal — 2 ทางเลือก**

แทนที่ block ใน modal "ลบแผนผ่อน" — ส่วน `<p className="text-xs text-slate-500"> ... </p>` + `<div className="flex items-center justify-end gap-2"> ... </div>` (รอบบรรทัด 365-384) ด้วย:
```tsx
            <p className="text-xs text-slate-500">
              เลือก "ยกเลิกสถานะผ่อน" ถ้าแค่อยากเอา badge ออกแต่เก็บรายการรายจ่ายไว้
              (เช่น รถยนต์) — หรือ "ลบทุกงวด" ถ้าต้องการลบรายการออกจริง (เช่น
              แผนซื้อของผ่อน) · ลบทุกงวด undo ไม่ได้
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={confirmUntag}
                className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition"
              >
                ยกเลิกสถานะผ่อน (เก็บรายการไว้)
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-expense rounded-md hover:bg-red-700 transition"
              >
                ลบทุกงวด ({pendingDelete.totalMonths} งวด รวม{' '}
                {pendingDelete.instances.length} แถว)
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="w-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition"
              >
                ยกเลิก
              </button>
            </div>
```

> หมายเหตุ: action `untagInstallmentPlan` จะถูกสร้างใน Task 5 — typecheck step นี้จะ error จนกว่าจะจบ Task 5 (ทำต่อเนื่องได้)

- [ ] **Step 6: Commit**

```bash
git add src/pages/InstallmentsPage.tsx
git commit -m "feat(installments): timeline schedule-aware + ปุ่มลบ 2 ทางเลือก (F30)"
```

---

## Task 5: Store actions — tag/untag (`src/stores/financeStore.ts`)

**Files:**
- Modify: `src/stores/financeStore.ts`

- [ ] **Step 1: Import helpers จาก util + ลบ local round2/advanceMonth**

เพิ่ม import (ใกล้ import อื่นด้านบนไฟล์):
```ts
import {
  advanceMonth,
  applyCarInstallmentTags,
  removeInstallmentTags,
  round2,
} from '@/utils/installments';
```

ลบ local definitions:
- บรรทัด ~115: `const round2 = (n: number): number => Math.round(n * 100) / 100;`
- บรรทัด ~193-204: block `const advanceMonth = (...) => { ... };`

> typecheck จะยืนยันว่าไม่มีที่อื่นใช้ชื่อซ้ำ/ขาด

- [ ] **Step 2: เพิ่ม action declarations ใน FinanceState interface**

หลังบรรทัด `deleteInstallmentPlan: (planId: string) => void;` (รอบบรรทัด 246) เพิ่ม:
```ts
  /** ติดป้าย installment ให้รายการ "รถยนต์" ที่มีอยู่ทุกเดือน — คืนจำนวนงวดที่ tag. */
  tagCarInstallments: () => number;
  /** ถอด installment metadata ออกจากทุกแถวของแผน (เก็บแถว expense ไว้). */
  untagInstallmentPlan: (planId: string) => void;
```

- [ ] **Step 3: เพิ่ม implementations ถัดจาก deleteInstallmentPlan**

หลัง block `deleteInstallmentPlan: (planId) => set(...)` (รอบบรรทัด 640) เพิ่ม:
```ts
      tagCarInstallments: () => {
        let count = 0;
        set((state) => {
          const years = applyCarInstallmentTags(state.data.years);
          for (const yr of Object.values(years)) {
            for (const row of yr.expenses) {
              for (const item of row.items) {
                if (
                  item.name === 'รถยนต์' &&
                  item.category === 'vehicle' &&
                  item.installment
                ) {
                  count += 1;
                }
              }
            }
          }
          const stamp = nowIso();
          return {
            data: { ...state.data, lastUpdated: stamp, years },
            lastUpdated: stamp,
          };
        });
        return count;
      },

      untagInstallmentPlan: (planId) =>
        set((state) => {
          const years = removeInstallmentTags(state.data.years, planId);
          const stamp = nowIso();
          return {
            data: { ...state.data, lastUpdated: stamp, years },
            lastUpdated: stamp,
          };
        }),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (selector + page + store ครบแล้ว)

- [ ] **Step 5: Commit**

```bash
git add src/stores/financeStore.ts
git commit -m "feat(installments): tagCarInstallments + untagInstallmentPlan actions (F30)"
```

---

## Task 6: ExpenseList — ซ่อน "ประจำ" เมื่อเป็นงวดผ่อน (`src/components/forms/ExpenseList.tsx`)

**Files:**
- Modify: `src/components/forms/ExpenseList.tsx:85`

- [ ] **Step 1: แก้เงื่อนไข badge "ประจำ"**

แก้บรรทัด 85 จาก:
```tsx
          {item.isRecurring && (
```
เป็น:
```tsx
          {item.isRecurring && installment == null && (
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/forms/ExpenseList.tsx
git commit -m "feat(installments): ซ่อนป้ายประจำเมื่อเป็นงวดผ่อน (F30)"
```

---

## Task 7: DangerZone — ปุ่มผูกรถยนต์ (`src/components/settings/DangerZone.tsx`)

**Files:**
- Modify: `src/components/settings/DangerZone.tsx`

- [ ] **Step 1: เพิ่ม store hook + busy state 'car'**

หลังบรรทัด `const resetToSeed = useFinanceStore((s) => s.resetToSeed);` (บรรทัด 18) เพิ่ม:
```tsx
  const tagCarInstallments = useFinanceStore((s) => s.tagCarInstallments);
```

แก้บรรทัด 29:
```tsx
  const [busy, setBusy] = useState<null | 'reset' | 'kept' | 'gold' | 'car'>(null);
```

- [ ] **Step 2: เพิ่ม handler**

หลังฟังก์ชัน `handleImportKept` (รอบบรรทัด 140) เพิ่ม:
```tsx
  const handleTagCar = async (): Promise<void> => {
    setBusy('car');
    try {
      const count = tagCarInstallments();
      if (isSignedIn) {
        await manualSync();
        push({
          message: `ผูกรถยนต์เป็นผ่อน ${count} งวด + sync Drive แล้ว`,
          tone: 'success',
        });
      } else {
        push({
          message: `ผูกรถยนต์เป็นผ่อน ${count} งวดแล้ว`,
          tone: 'success',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      push({ message: `Tag error: ${msg}`, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
```

- [ ] **Step 3: เพิ่ม section ปุ่ม (หลัง section "เติม Kept รายเดือน")**

หลัง `</div>` ปิด section "เติม Kept รายเดือน" (รอบบรรทัด 208) เพิ่ม:
```tsx
      <div className="space-y-2 pt-4 border-t border-red-100">
        <h3 className="text-sm font-semibold text-slate-900">
          ผูกรถยนต์เป็นแผนผ่อน
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          ติดป้าย "ผ่อน X/60" ให้รายการ{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
            รถยนต์
          </code>{' '}
          ทุกเดือนที่มีข้อมูล (งวด 1 = เม.ย. 2023, 60 งวด) — ยอดเงินไม่เปลี่ยน
          กดซ้ำได้
          {isSignedIn && <> · sync Drive ให้ทันที</>}
        </p>
        <button
          type="button"
          onClick={handleTagCar}
          disabled={busy !== null}
          className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'car' ? 'กำลังผูก...' : '🚗 ผูกรถยนต์เป็นผ่อน (60 งวด)'}
        </button>
      </div>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/DangerZone.tsx
git commit -m "feat(installments): ปุ่ม DangerZone ผูกรถยนต์เป็นผ่อน (F30)"
```

---

## Task 8: Seed — tag ตอน build (`src/data/seedData.ts`)

**Files:**
- Modify: `src/data/seedData.ts` (รอบบรรทัด 2934-2945)

- [ ] **Step 1: Import + ห่อ years ด้วย applyCarInstallmentTags**

เพิ่ม import (ใกล้ import `@/types`):
```ts
import { applyCarInstallmentTags } from '@/utils/installments';
```

แก้ object `seedData` (รอบบรรทัด 2934-2945) — ห่อ years ด้วย planId คงที่:
```ts
const SEED_CAR_PLAN_ID = 'seed-car-installment-plan';

const seedData: WealthLensData = {
  version: '1.0.0',
  lastUpdated: '2026-05-06T00:00:00.000Z',
  years: applyCarInstallmentTags(
    {
      '2023': year2023,
      '2024': year2024,
      '2025': year2025,
      '2026': year2026,
    },
    SEED_CAR_PLAN_ID,
  ),
  loans: [gslLoan],
};
```

- [ ] **Step 2: Verify ทั้งชุด + typecheck + build**

Run: `npx tsx scripts/verify-car-installment.ts && npm run typecheck && npm run build`
Expected: verify `ALL PASS` ; typecheck PASS ; build สำเร็จ (dist/)

- [ ] **Step 3: Commit**

```bash
git add src/data/seedData.ts
git commit -m "feat(installments): tag รถยนต์เป็นผ่อนใน seed data (F30)"
```

---

## Task 9: UI verification + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 1: Manual/Playwright UI check**

`npm run dev` → seed data (signed-out OK) → ตรวจ:
- หน้า expense (Monthly): รายการ "รถยนต์" แสดง badge "ผ่อน X/60" และ **ไม่มี** badge "ประจำ"
- หน้า "แผนผ่อน": การ์ดรถ — "ผ่อนไป 39/60", "งวดถัดไป ก.ค. 2026", "เริ่ม เม.ย. 2023 → จบ มี.ค. 2028", "คงเหลือ ฿498,162"
- KPI "ยอดผ่อนเดือนนี้" รวมค่างวดรถ (ถ้ามีเดือนปัจจุบันในข้อมูล)
- กด "ดู timeline (60 งวด)" → งวดอนาคต/ไม่มีแถวจริงแสดงจาง + ป้าย "คาดการณ์"
- หน้า Settings → DangerZone → ปุ่ม "🚗 ผูกรถยนต์เป็นผ่อน" กดได้ ขึ้น toast
- กด "ลบทั้งแผน" รถ → modal มี 2 ปุ่ม → กด "ยกเลิกสถานะผ่อน" → รถหายจากแผนผ่อน แต่รายการรายจ่ายรถยังอยู่ครบ

> หมายเหตุ: seed data มีรถถึง พ.ค. 2026 (งวด 38). ถ้า refDate จริง (วันนี้) ≥ มิ.ย. 2026 paidMonths = 39 จาก schedule (งวด 39 = มิ.ย. 2026 นับว่าถึงกำหนดแม้ไม่มีแถว)

- [ ] **Step 2: อัปเดต features.json**

เพิ่ม feature F30 ใน `phase_4.features` (ก่อน/หลัง F29 ได้) — pattern เดียวกับ entry อื่น:
```json
        {
          "id": "F30",
          "name": "Car Installment Plan (รถยนต์เป็นผ่อน 60 งวด)",
          "description": "ติดป้าย 'ผ่อน X/60' ให้รายการรถยนต์ + หน้าแผนผ่อนคิดจากตารางงวด (schedule) แทนนับแถว",
          "status": "completed",
          "priority": "P2",
          "phase": "phase_4",
          "acceptanceCriteria": [
            "รายการ 'รถยนต์' แสดง badge 'ผ่อน X/60' แทน 'ประจำ' (sequence = (ปี−2023)×12+เดือน−3)",
            "หน้าแผนผ่อนคิดจาก schedule (metadata) → รถแสดง 39/60, งวดถัดไป ก.ค. 2026, จบ มี.ค. 2028, อยู่หมวด active",
            "ติดเฉพาะเดือนที่มีข้อมูลจริง ไม่สร้างแถวอนาคต ไม่แตะ 2023 (timeline แสดงงวดที่ไม่มีแถวเป็น 'คาดการณ์')",
            "คงเหลือแบบงวด ฿498,162",
            "ปุ่ม DangerZone 'ผูกรถยนต์เป็นผ่อน' (idempotent) + tag ใน seed",
            "ปุ่มลบแผนมี 2 ทางเลือก: 'ยกเลิกสถานะผ่อน (เก็บรายการ)' กันลบประวัติรถจริง / 'ลบทุกงวด'"
          ],
          "estimatedHours": 6,
          "dependencies": ["F24"],
          "checkpoint": {
            "completed": true,
            "completedAt": "2026-06-15",
            "notes": "Spec: docs/superpowers/specs/2026-06-15-car-installment-plan-design.md | Verified: scripts/verify-car-installment.ts + UI"
          }
        }
```

อัปเดต `progressSummary.totalFeatures` และ `completed` (+1 → 38).

- [ ] **Step 3: Final verify + commit**

```bash
npx tsx scripts/verify-car-installment.ts && npm run typecheck && npm run lint
git add features.json
git commit -m "docs: F30 car installment plan — completed"
```

---

## Self-Review Notes

- **Spec coverage:** badge (T6) · schedule-driven manager (T3,T4) · tag existing only/no 2023/no future (T1 carSequenceFor range + buildSchedule projected) · คงเหลือ 498,162 (T3 verify) · DangerZone button (T7) · seed tag (T8) · delete safety/untag (T4,T5) · verify (T1-3) — ครบ
- **Types:** `ScheduledInstallment` (T2) ใช้ใน selector (T3) + page (T4) ตรงกัน · `nextDue` เปลี่ยนเป็น `ScheduledInstallment | null` มีผลเฉพาะ InstallmentsPage (แก้ใน T4) · `endYear/endMonth` ใช้ใน T4
- **DRY:** round2/advanceMonth ย้ายไป util ที่เดียว (T5 ลบ local) ; tag/untag/schedule logic อยู่ util เดียว ใช้ทั้ง seed + store + selector
- **ลำดับ:** T3 (selector ใช้ buildInstallmentSchedule) ต้องหลัง T2 ; T4 (page ใช้ untag) typecheck เขียวหลัง T5 — โน้ตไว้ในแต่ละ step แล้ว
```
