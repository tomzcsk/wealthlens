# Motion Layer (F42) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ WealthLens มี animation ที่เนียน เร็ว ไม่ขวางการอ่านตัวเลข — ตัวเลขวิ่ง, การ์ดโผล่ไล่กัน, กราฟวาดตัวเอง, เปลี่ยนหน้าลื่นไหล, ฟีดแบ็กตอนกด

**Architecture:** ชั้น motion primitives บาง ๆ (`src/lib/motion.ts` + `src/components/motion/`) ห่อ framer-motion ไว้ข้างใน หน้าเว็บใช้ component ของเราเท่านั้น ไม่ import framer-motion ตรง ๆ ค่าเวลา/easing ทั้งแอปมาจากไฟล์เดียว pure helper แยกออกจาก component เพื่อทดสอบได้ด้วย verify script แบบเดียวกับ 17 ตัวที่มีอยู่

**Tech Stack:** React 19, framer-motion 12, Tailwind 3, Recharts 3, TypeScript strict, verify scripts รันด้วย `npx tsx`

**Spec:** `docs/superpowers/specs/2026-07-10-motion-layer-design.md`

---

## หมายเหตุสำคัญก่อนเริ่ม

**โปรเจกต์นี้ไม่มี test runner** (ไม่มี vitest/jest) การทดสอบใช้ verify script แบบ node: `scripts/verify-*.ts` รันด้วย
`npx tsx --tsconfig tsconfig.app.json scripts/verify-x.ts` แล้วนับ `failures` แล้ว `process.exit(failures)`

ดังนั้น TDD ในแผนนี้ = **แยก logic ที่ตัดสินใจได้ออกมาเป็น pure function** (`shouldCountUp`, `transitionFor`, `staggerDelay`, `chartAnimation`) แล้วเขียน verify script ก่อน จากนั้นค่อยเอา pure function ไปใช้ใน component ส่วนที่เหลือ (การเคลื่อนไหวจริง) ตรวจด้วยการขับ UI จริงใน Task 10

**บั๊กที่เจอตอนสำรวจ และแผนนี้แก้ด้วย:**

1. `src/components/layout/Sidebar.tsx:152` ใช้ class `animate-in` ที่ **ไม่มีอยู่จริง** — ไม่มี keyframe ใน `src/index.css` และไม่มี plugin `tailwindcss-animate` (Task 9)
2. `src/App.tsx` วาง `<Suspense>` ครอบ `<Routes>` ทั้งก้อน รวม `<Layout>` ⇒ เข้าหน้าใหม่ครั้งแรก sidebar/header หายทั้งแผง และ page transition จะทำงานไม่ได้ ต้องย้าย Suspense ลงระดับ page (Task 4)
3. `src/components/ui/Toaster.tsx:15` มีคอมเมนต์ว่า *"We avoid framer-motion to honour the no-extra-packages rule"* ซึ่งจะกลายเป็นเท็จหลัง Task 1 (Task 9)

---

## File Structure

**สร้างใหม่:**

| ไฟล์ | ความรับผิดชอบ |
|---|---|
| `src/lib/motion.ts` | tokens + pure helpers ทั้งหมด ไม่ import React |
| `src/components/motion/AnimatedNumber.tsx` | count-up เลขเดียว |
| `src/components/motion/FadeInUp.tsx` | fade + เลื่อนขึ้น 8px (ใช้เดี่ยว หรือเป็นลูกของ Stagger) |
| `src/components/motion/Stagger.tsx` | parent แจก delay ให้ลูก |
| `src/components/motion/PageTransition.tsx` | สลับหน้าแบบ fade, ครอบ `<Outlet />` |
| `src/components/motion/index.ts` | barrel export |
| `scripts/verify-motion.ts` | ทดสอบ pure helpers |

**แก้ไข:** `package.json`, `src/App.tsx`, `src/components/layout/Layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/ui/Modal.tsx`, `src/components/ui/Toaster.tsx`, `src/components/dashboard/KpiCard.tsx`, `src/pages/OverviewPage.tsx`, `src/components/wealth/NetWorthHero.tsx`, `src/components/loans/LoanDetail.tsx`, `src/components/dashboard/ExpensePieChart.tsx`, `src/components/analytics/TrendAnalysis.tsx`, `src/components/layout/Header.tsx`, `features.json`

---

### Task 1: ติดตั้ง framer-motion + motion tokens (pure)

**Files:**
- Modify: `package.json`
- Create: `src/lib/motion.ts`
- Test: `scripts/verify-motion.ts`

- [ ] **Step 1: ติดตั้ง package**

```bash
npm install framer-motion@^12
```

ตรวจว่า React 19 ไม่ขึ้น peer warning:

```bash
npm ls framer-motion react
```
Expected: framer-motion@12.x, react@19.x — ไม่มี `UNMET PEER DEPENDENCY`

- [ ] **Step 2: เขียน verify script ที่ต้องล้มเหลว**

สร้าง `scripts/verify-motion.ts`:

```ts
/**
 * Verification for F42 — motion layer pure helpers.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-motion.ts
 */
import {
  DURATION,
  EASE,
  STAGGER,
  chartAnimation,
  shouldCountUp,
  staggerDelay,
  transitionFor,
} from '../src/lib/motion';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};
const deepEq = (label: string, a: unknown, b: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(a)} (expected ${JSON.stringify(b)})`);
};

// --- tokens -----------------------------------------------------------------
eq('DURATION.fast', DURATION.fast, 0.15);
eq('DURATION.base', DURATION.base, 0.25);
eq('DURATION.slow', DURATION.slow, 0.4);
eq('STAGGER', STAGGER, 0.05);
deepEq('EASE', EASE, [0.22, 1, 0.36, 1]);

// --- transitionFor ----------------------------------------------------------
deepEq('transitionFor(false)', transitionFor(false), {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1],
});
eq('transitionFor(true) มี duration 0', transitionFor(true).duration, 0);

// --- shouldCountUp ----------------------------------------------------------
eq('mount 0 → 1000 วิ่ง', shouldCountUp(0, 1000, false), true);
eq('ค่าเท่าเดิม ไม่วิ่ง', shouldCountUp(1000, 1000, false), false);
eq('ค่าเปลี่ยน วิ่ง', shouldCountUp(1000, 2000, false), true);
eq('reduced motion ไม่วิ่ง', shouldCountUp(0, 1000, true), false);
eq('NaN ปลายทาง ไม่วิ่ง', shouldCountUp(0, Number.NaN, false), false);
eq('Infinity ปลายทาง ไม่วิ่ง', shouldCountUp(0, Number.POSITIVE_INFINITY, false), false);
eq('NaN ต้นทาง ไม่วิ่ง', shouldCountUp(Number.NaN, 5, false), false);

// --- staggerDelay -----------------------------------------------------------
eq('staggerDelay(0)', staggerDelay(0, false), 0);
eq('staggerDelay(3)', staggerDelay(3, false), 0.15);
eq('staggerDelay reduced', staggerDelay(3, true), 0);
eq('staggerDelay ติดเพดานที่ลูกที่ 8', staggerDelay(20, false), 0.4);

// --- chartAnimation ---------------------------------------------------------
deepEq('chartAnimation(false)', chartAnimation(false), {
  isAnimationActive: true,
  animationDuration: 400,
});
deepEq('chartAnimation(true)', chartAnimation(true), {
  isAnimationActive: false,
  animationDuration: 0,
});

console.log(failures === 0 ? '\nAll motion assertions passed' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: รัน verify ให้เห็นว่าล้มเหลว**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-motion.ts`
Expected: FAIL — `Cannot find module '../src/lib/motion'`

- [ ] **Step 4: เขียน `src/lib/motion.ts`**

```ts
/**
 * WealthLens — motion tokens & pure helpers (F42).
 *
 * แหล่งเดียวของค่าเวลา/easing ทั้งแอป ห้าม hardcode duration ใน component
 * ไฟล์นี้ไม่ import React และไม่ import framer-motion — pure ทั้งหมด
 * จึงทดสอบได้ด้วย `scripts/verify-motion.ts` แบบ node ล้วน
 *
 * ปรัชญา: 150–400ms, easeOutQuint (พุ่งออกเร็ว จอดนุ่ม), ไม่มี spring
 * นี่คือแอปการเงินที่ Tom เปิดทุกวัน — animation ต้องไม่ขวางการอ่านตัวเลข
 */

/** ระยะเวลา (วินาที) ตามที่ framer-motion คาดหวัง */
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.4 } as const;

/** easeOutQuint — cubic-bezier ที่พุ่งออกเร็วแล้วค่อย ๆ จอด */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** ระยะห่างระหว่างการ์ดแต่ละใบตอนโผล่ (วินาที) */
export const STAGGER = 0.05;

/** จำนวนลูกสูงสุดที่ยังไล่ delay — เกินกว่านี้ใช้ delay เท่าลูกที่ 8 */
const MAX_STAGGER_INDEX = 8;

export interface MotionTransition {
  duration: number;
  // ต้องเป็น tuple 4 ตัว ไม่ใช่ number[] — framer-motion นิยาม
  // BezierDefinition = readonly [number, number, number, number]
  // ถ้าใช้ readonly number[] จะ assign เข้า <motion.div transition={...}> ไม่ได้
  ease?: readonly [number, number, number, number];
}

/**
 * transition มาตรฐาน เมื่อผู้ใช้ขอ reduced motion เราปิดจริง (duration 0)
 * ไม่ใช่แค่ลดความแรง — ครึ่ง ๆ กลาง ๆ ยังทำให้เวียนหัวได้
 */
export const transitionFor = (reduced: boolean): MotionTransition =>
  reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE };

/**
 * เลขควรวิ่งหรือไม่:
 *   - reduced motion → ไม่วิ่ง
 *   - ค่าเท่าเดิม (re-render เปล่า) → ไม่วิ่ง
 *   - ค่าไม่ finite (NaN/Infinity จาก calc ที่พัง) → ไม่วิ่ง แสดงผลตรง ๆ
 */
export const shouldCountUp = (
  from: number,
  to: number,
  reduced: boolean,
): boolean => {
  if (reduced) return false;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return from !== to;
};

/** delay ของลูกลำดับที่ index (0-based) — ติดเพดานกัน list ยาวกลายเป็นคลื่น */
export const staggerDelay = (index: number, reduced: boolean): number => {
  if (reduced) return 0;
  return Math.min(index, MAX_STAGGER_INDEX) * STAGGER;
};

/** prop ที่ยัดเข้า Recharts series ได้ตรง ๆ (Recharts คิดเป็น ms) */
export const chartAnimation = (
  reduced: boolean,
): { isAnimationActive: boolean; animationDuration: number } =>
  reduced
    ? { isAnimationActive: false, animationDuration: 0 }
    : { isAnimationActive: true, animationDuration: DURATION.slow * 1000 };
```

- [ ] **Step 5: รัน verify ให้ผ่าน**

Run: `npx tsx --tsconfig tsconfig.app.json scripts/verify-motion.ts`
Expected: `All motion assertions passed` และ exit 0

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/motion.ts scripts/verify-motion.ts
git commit -m "feat(motion): tokens + pure helpers + framer-motion (F42)"
```

---

### Task 2: AnimatedNumber

**Files:**
- Create: `src/components/motion/AnimatedNumber.tsx`

- [ ] **Step 1: เขียน component**

หลักการที่ห้ามพลาด:
- format ผ่าน `utils/formatters.ts` เท่านั้น → รับ `format` เป็น prop (ผู้เรียกส่ง function ที่ **stable** เช่น import ตรงจาก formatters หรือประกาศระดับ module ห้ามสร้าง arrow ใหม่ทุก render)
- เขียน `textContent` ผ่าน ref ไม่ setState ทุกเฟรม — 60fps × React re-render คือการเผาแบตเปล่า ๆ
- `tabular-nums` ต้องอยู่เสมอ ไม่งั้นตัวเลขขยับซ้าย-ขวาตอนวิ่ง
- ค่าที่ screen reader อ่านต้องเป็น **ค่าปลายทาง** ไม่ใช่เลขที่กำลังวิ่ง

```tsx
/**
 * WealthLens — count-up number (F42).
 *
 * วิ่งเลขจริงแล้ว format ทุกเฟรม เขียนลง textContent ผ่าน ref
 * เพื่อไม่ให้ React re-render 60 ครั้งต่อวินาที
 *
 * เข้าถึงได้: ตัวที่วิ่งเป็น aria-hidden, ค่าจริงอยู่ใน sr-only span
 * ที่อัปเดตครั้งเดียวตอนค่าเปลี่ยน — AT จึงไม่ถูกยิงรัวทุกเฟรม
 *
 * ใช้กับเลขพระเอกเท่านั้น (KPI, hero) ห้ามใช้ในตาราง — ดูเหตุผลใน
 * docs/superpowers/specs/2026-07-10-motion-layer-design.md
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

import { DURATION, EASE, shouldCountUp } from '@/lib/motion';

export interface AnimatedNumberProps {
  /** ค่าปลายทาง */
  value: number;
  /**
   * ตัวจัดรูปแบบจาก `utils/formatters.ts`
   * ต้องเป็น reference ที่คงที่ระหว่าง render (module-level หรือ useCallback)
   */
  format: (value: number) => string;
  className?: string;
}

export const AnimatedNumber = ({
  value,
  format,
  className = '',
}: AnimatedNumberProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const nodeRef = useRef<HTMLSpanElement>(null);
  // ค่าที่แสดงอยู่ตอนนี้ เริ่มที่ 0 เพื่อให้ mount แรกวิ่งจาก 0 ขึ้นมา
  const currentRef = useRef<number>(reduced ? value : 0);

  useEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;

    const from = currentRef.current;

    if (!shouldCountUp(from, value, reduced)) {
      currentRef.current = value;
      node.textContent = format(value);
      return;
    }

    const controls = animate(from, value, {
      duration: DURATION.slow,
      ease: EASE,
      onUpdate: (latest: number) => {
        currentRef.current = latest;
        node.textContent = format(latest);
      },
      onComplete: () => {
        currentRef.current = value;
        node.textContent = format(value);
      },
    });

    // เปลี่ยนปีรัว ๆ: หยุดตัวเก่าก่อน ตัวใหม่จะวิ่งต่อจากตำแหน่งที่ค้างอยู่
    return () => controls.stop();
  }, [value, reduced, format]);

  return (
    <>
      <span
        ref={nodeRef}
        aria-hidden="true"
        className={`tabular-nums ${className}`}
      >
        {format(currentRef.current)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
};

export default AnimatedNumber;
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add src/components/motion/AnimatedNumber.tsx
git commit -m "feat(motion): AnimatedNumber — count-up ผ่าน ref ไม่ re-render (F42)"
```

---

### Task 3: FadeInUp + Stagger

**Files:**
- Create: `src/components/motion/FadeInUp.tsx`
- Create: `src/components/motion/Stagger.tsx`
- Create: `src/components/motion/index.ts`

- [ ] **Step 1: เขียน `FadeInUp.tsx`**

```tsx
/**
 * WealthLens — fade + เลื่อนขึ้น 8px (F42).
 *
 * ใช้ได้ 2 แบบ:
 *   1. เดี่ยว ๆ — animate ตอน mount ทันที
 *   2. เป็นลูกของ <Stagger> — parent สั่งจังหวะผ่าน variants
 */

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { DURATION, EASE } from '@/lib/motion';

export interface FadeInUpProps {
  children: ReactNode;
  className?: string;
}

/** variants ที่ <Stagger> ใช้สั่งลูกทุกตัวพร้อมกัน */
export const fadeInUpVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE },
  },
};

/** reduced motion: ไม่มี y ไม่มีเวลา — โผล่มาเลย */
export const fadeInUpVariantsReduced = {
  hidden: { opacity: 0, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } },
};

export const FadeInUp = ({ children, className }: FadeInUpProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      className={className}
      variants={reduced ? fadeInUpVariantsReduced : fadeInUpVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
};

export default FadeInUp;
```

- [ ] **Step 2: เขียน `Stagger.tsx`**

```tsx
/**
 * WealthLens — parent ที่แจกจังหวะให้ลูกโผล่ไล่กัน (F42).
 *
 * ใช้กับกลุ่มการ์ด ≤ 8 ใบ (KPI grid, savings cards, bank cards)
 * ห้ามใช้กับ list ยาว — 50 แถว × 50ms = คลื่นยาว 2.5 วินาที
 *
 * `variants` ของ framer จะไหลลงถึงลูกที่เป็น <FadeInUp> เอง
 * เราจึงไม่ต้อง clone children หรือส่ง index ให้ใคร
 */

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { STAGGER } from '@/lib/motion';

export interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export const Stagger = ({ children, className }: StaggerProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : STAGGER },
    },
  };

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
};

export default Stagger;
```

- [ ] **Step 3: barrel `index.ts`**

`PageTransition` ยังไม่มี (สร้างใน Task 4) ตอนนี้ export แค่ 3 ตัว ไม่งั้น typecheck พังกลางทาง:

```ts
export { AnimatedNumber } from './AnimatedNumber';
export { FadeInUp } from './FadeInUp';
export { Stagger } from './Stagger';
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/
git commit -m "feat(motion): FadeInUp + Stagger primitives (F42)"
```

---

### Task 4: PageTransition + ย้าย Suspense ลงระดับ page

**Files:**
- Create: `src/components/motion/PageTransition.tsx`
- Modify: `src/components/motion/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Layout.tsx:57-59` (`<main>` block)

**ทำไมต้องย้าย Suspense:** ตอนนี้ `App.tsx` ครอบ `<Suspense>` รอบ `<Routes>` ทั้งก้อน ซึ่งรวม `<Layout>` ด้วย เมื่อ navigate ไปหน้าที่ chunk ยังไม่โหลด React จะแทน **ทั้ง tree** ด้วย `<RouteLoader />` ⇒ sidebar/header หายวับ และ `<PageTransition>` ที่อยู่ใน Layout ก็ถูก unmount ไปด้วย exit animation จึงไม่มีวันเล่น ย้าย Suspense เข้าไปข้างใน PageTransition แก้ทั้งสองเรื่องพร้อมกัน

- [ ] **Step 1: เขียน `PageTransition.tsx`**

```tsx
/**
 * WealthLens — สลับหน้าแบบ fade (F42).
 *
 * `mode="wait"` บังคับ: ต้องรอหน้าเก่าออกให้สุดก่อนหน้าใหม่เข้า
 * ไม่งั้นสองหน้าซ้อนกันแล้ว layout กระโดด
 *
 * `<Suspense>` อยู่ **ข้างใน** ตัวนี้ (ไม่ใช่รอบ <Routes> ใน App.tsx)
 * เพื่อให้ lazy chunk ที่ยังโหลดไม่เสร็จแทนที่แค่เนื้อหน้า ไม่ใช่ทั้ง shell
 *
 * `initial={false}` — โหลดแอปครั้งแรกไม่ต้อง fade เนื้อหน้าเข้ามา
 * ผู้ใช้เพิ่งรอ chunk เสร็จ ไม่ควรต้องรอ animation อีก 250ms
 */

import { Suspense, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';

import RouteLoader from '@/components/ui/RouteLoader';
import { transitionFor } from '@/lib/motion';

export const PageTransition = (): ReactNode => {
  const location = useLocation();
  const reduced = useReducedMotion() ?? false;
  const transition = transitionFor(reduced);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -4 }}
        transition={transition}
      >
        <Suspense fallback={<RouteLoader />}>
          <Outlet />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;
```

- [ ] **Step 2: เพิ่มบรรทัดใน barrel**

`src/components/motion/index.ts` เพิ่ม:
```ts
export { PageTransition } from './PageTransition';
```

- [ ] **Step 3: แก้ `Layout.tsx` ให้ใช้ PageTransition แทน Outlet**

ลบ `import { Outlet } from 'react-router-dom';` แล้วเพิ่ม:
```tsx
import { PageTransition } from '@/components/motion';
```

เปลี่ยน `<main>`:
```tsx
            <main className="flex-1 p-6 md:p-8">
              <PageTransition />
            </main>
```

- [ ] **Step 4: แก้ `App.tsx` — เอา Suspense ออกจากรอบ Routes**

`PrintReportPage` อยู่นอก Layout จึงไม่มี PageTransition มาห่อ ⇒ ต้องมี Suspense ของตัวเอง

เปลี่ยนบล็อก `return (...)` เป็น:
```tsx
    <BrowserRouter>
      <Routes>
        {/*
          Print report lives OUTSIDE the Layout so the PDF has no sidebar
          / header chrome (F17) — และไม่มี page transition มาทำให้การ์ด
          ค้างอยู่ครึ่งจางตอน print. มี Suspense ของตัวเองเพราะไม่ได้
          อาศัย <PageTransition> ที่ครอบ <Outlet /> ใน Layout.
        */}
        <Route
          path="report/:year"
          element={
            <Suspense fallback={<RouteLoader />}>
              <PrintReportPage />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="monthly" element={<MonthlyPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="installments" element={<DebtPage />} />
          <Route path="loans" element={<DebtPage />} />
          <Route path="accounts" element={<BankAccountsPage />} />
          <Route path="gold" element={<GoldPage />} />
          <Route path="wealth" element={<WealthPage />} />
          <Route path="tax" element={<TaxCalculatorPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
```

อัปเดตคอมเมนต์หัวไฟล์ที่บอกว่า Suspense ครอบ Routes ให้ตรงความจริงใหม่ (Suspense อยู่ระดับ page ผ่าน PageTransition)

- [ ] **Step 5: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่านทั้งคู่ ไม่มี unused import (`Suspense` ยังใช้ใน App.tsx สำหรับ report route)

- [ ] **Step 6: Commit**

```bash
git add src/components/motion/ src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat(motion): PageTransition + ย้าย Suspense ลงระดับ page (F42)"
```

---

### Task 5: Modal เปิด-ปิดแบบ scale + fade

**Files:**
- Modify: `src/components/ui/Modal.tsx`

**กับดัก:** ตอนนี้ `Modal` ทำ `if (!open) return null` ก่อน render ⇒ ถ้าเอา `AnimatePresence` ไว้ข้างในก็ไม่มีวันเห็น exit animation เพราะ component หายไปก่อน ต้องให้ `createPortal` + `AnimatePresence` อยู่เสมอ แล้วให้ `open` คุมลูกข้างใน

- [ ] **Step 1: แก้ imports**

```tsx
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { DURATION, EASE, transitionFor } from '@/lib/motion';
```

- [ ] **Step 2: เปลี่ยนส่วน render ทั้งก้อน**

ลบบรรทัด `if (!open) return null;` แล้วแทน `const panel = (...)` และ `return createPortal(panel, document.body);` ด้วย:

```tsx
  const reduced = useReducedMotion() ?? false;

  const panel = (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(reduced)}
      />
      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-white rounded-2xl shadow-xl w-full ${SIZE_MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto`}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
        transition={
          reduced
            ? { duration: 0 }
            : { duration: DURATION.fast, ease: EASE }
        }
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="text-slate-400 hover:text-slate-700 text-xl leading-none p-1 -mr-1"
            >
              ×
            </button>
          </div>
        )}
        {title === undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute top-3 right-3 z-10 text-slate-400 hover:text-slate-700 text-xl leading-none p-1"
          >
            ×
          </button>
        )}
        {children}
      </motion.div>
    </div>
  );

  return createPortal(
    <AnimatePresence>{open ? panel : null}</AnimatePresence>,
    document.body,
  );
```

**ระวัง:** hooks ทั้งหมด (`useEffect` × 2, `useReducedMotion`) ต้องถูกเรียกทุก render — เพราะเราลบ early-return ออกแล้ว ลำดับ hooks จึงคงที่โดยอัตโนมัติ ตรวจว่า `useEffect` ทั้งสองยังมี `if (!open) return;` อยู่ข้างในเหมือนเดิม

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: ไม่มี error

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Modal.tsx
git commit -m "feat(motion): Modal เปิด-ปิดแบบ scale + fade (F42)"
```

---

### Task 6: KPI cards — เลขวิ่ง + การ์ดโผล่ไล่กัน

**Files:**
- Modify: `src/components/dashboard/KpiCard.tsx:148,199-201`
- Modify: `src/pages/OverviewPage.tsx` (KPI grid wrapper)

- [ ] **Step 1: อ่าน `KpiCard.tsx` หา `formatAmount`**

Run: `grep -n "formatAmount" src/components/dashboard/KpiCard.tsx`

ยืนยันว่า `formatAmount` เป็น reference คงที่ระดับ module (import จาก `@/utils/formatters` หรือประกาศนอก component) — ถ้าเป็น arrow ที่สร้างใหม่ใน component ให้ยกออกไประดับ module ก่อน ไม่งั้น `AnimatedNumber` จะ re-animate ทุก render

- [ ] **Step 2: ใช้ AnimatedNumber ใน hero number**

เพิ่ม import:
```tsx
import { AnimatedNumber } from '@/components/motion';
```

เปลี่ยนบล็อก hero number จาก:
```tsx
      <div className="mt-4 financial-number text-3xl font-bold tabular-nums text-slate-900">
        {formattedAmount}
      </div>
```
เป็น:
```tsx
      <div className="mt-4 financial-number text-3xl font-bold tabular-nums text-slate-900">
        <AnimatedNumber value={amount} format={formatAmount} />
      </div>
```

`aria-label` ของการ์ด (`${label}: ${formattedAmount}`) **ไม่ต้องแก้** — มันคำนวณจาก `amount` ค่าปลายทางอยู่แล้ว screen reader จึงได้ยินค่าจริงเสมอ

- [ ] **Step 3: ห่อ KPI grid ด้วย Stagger + FadeInUp**

ใน `OverviewPage.tsx` หา grid ของ KpiCard:

Run: `grep -n "KpiCard\|grid" src/pages/OverviewPage.tsx | head -20`

เปลี่ยน container `<div className="grid ...">` เป็น `<Stagger className="grid ...">` และห่อ `<KpiCard ... />` แต่ละใบด้วย `<FadeInUp>`:

```tsx
import { FadeInUp, Stagger } from '@/components/motion';

// ...
<Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <FadeInUp><KpiCard label="รายรับรวม" ... /></FadeInUp>
  <FadeInUp><KpiCard label="ค่าใช้จ่าย" ... /></FadeInUp>
  <FadeInUp><KpiCard label="Net Income" ... /></FadeInUp>
  <FadeInUp><KpiCard label="ธนาคาร" ... /></FadeInUp>
</Stagger>
```

**ระวัง:** เก็บ `className` ของ grid เดิมไว้ให้ครบ — `Stagger` ส่ง className ต่อให้ `motion.div` ตรง ๆ ถ้า class หาย layout พัง ให้ copy string เดิมมาทั้งอัน

- [ ] **Step 4: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/KpiCard.tsx src/pages/OverviewPage.tsx
git commit -m "feat(motion): KPI เลขวิ่ง + การ์ดโผล่ไล่กัน (F42)"
```

---

### Task 7: Hero numbers — ความมั่งคั่ง + หนี้

**Files:**
- Modify: `src/components/wealth/NetWorthHero.tsx`
- Modify: `src/components/loans/LoanDetail.tsx` (hero block, ราว บรรทัด 100-115)

- [ ] **Step 1: NetWorthHero — เลขความมั่งคั่งสุทธิวิ่ง**

Run: `grep -n "format\|className=\"" src/components/wealth/NetWorthHero.tsx | head -20`

หา element ที่แสดงตัวเลข net worth หลัก แล้วแทนค่าข้างในด้วย:
```tsx
<AnimatedNumber value={netWorth} format={formatCurrency} />
```
โดย `formatCurrency` คือ formatter ที่ไฟล์นั้นใช้อยู่แล้ว (import จาก `@/utils/formatters`) — **ห้ามสร้าง formatter ใหม่**

ถ้าไฟล์นั้นใช้ inline arrow เช่น `(n) => formatCurrency(n)` ให้เปลี่ยนไปใช้ reference ตรง ๆ

- [ ] **Step 2: LoanDetail hero — ยอดคงเหลือวิ่ง**

เปลี่ยนเฉพาะ **ยอดคงเหลือหลัก** ใบเดียว ไม่แตะเลขในตารางงวด (`LoanScheduleTable`) และไม่แตะ `PaymentLogTable`

- [ ] **Step 3: ตรวจว่าไม่มีตารางไหนถูกแตะ**

Run:
```bash
grep -rln "AnimatedNumber" src/components src/pages
```
Expected: ต้องไม่มี `MonthlySummaryTable.tsx`, `LoanScheduleTable.tsx`, `MonthTransactionList.tsx`, `PaymentLogTable.tsx`, `AllYearsSummary.tsx` อยู่ในผลลัพธ์

- [ ] **Step 4: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/components/wealth/NetWorthHero.tsx src/components/loans/LoanDetail.tsx
git commit -m "feat(motion): hero ความมั่งคั่ง + ยอดหนี้คงเหลือ เลขวิ่ง (F42)"
```

---

### Task 8: กราฟ — จังหวะเดียวกับทั้งแอป + เคารพ reduced motion

**Files:**
- Modify: `src/components/dashboard/ExpensePieChart.tsx:184`
- Modify: `src/components/analytics/TrendAnalysis.tsx:331,580`
- Modify: ไฟล์อื่นที่มี Recharts series ตามผล grep

- [ ] **Step 1: หา Recharts series ทั้งหมด**

Run:
```bash
grep -rn "<Bar \|<Bar$\|<Area \|<Line \|<Pie " src/components src/pages
```

ทุก series ที่เจอต้องได้ `{...chartAnimation(reduced)}` — ตัวที่ไม่เคยตั้งค่าไว้ใช้ default ของ Recharts (1500ms) ซึ่งช้ากว่าทั้งแอป 3.75 เท่า

- [ ] **Step 2: ใส่ chartAnimation ในแต่ละไฟล์**

รูปแบบ (ทำซ้ำทุกไฟล์ที่ grep เจอ):

```tsx
import { useReducedMotion } from 'framer-motion';
import { chartAnimation } from '@/lib/motion';

// ในตัว component:
const reduced = useReducedMotion() ?? false;
const anim = chartAnimation(reduced);

// ในทุก series:
<Bar dataKey="income" fill="#34D399" {...anim} />
<Area dataKey="netAll" stroke="#7C3AED" {...anim} />
<Line dataKey="net" stroke="#7C3AED" {...anim} />
<Pie data={data} dataKey="value" {...anim} />
```

`{...anim}` ต้องอยู่ **หลัง** prop อื่น ๆ ที่มีชื่อชนกัน (ถ้ามี `isAnimationActive` เขียนไว้อยู่แล้วให้ลบทิ้ง อย่าให้มีสองที่)

**ห้าม** เอา `motion.div` ของ framer ไปห่อ `<ResponsiveContainer>` — Recharts วัดขนาดเองจาก DOM การ animate transform ของ parent จะทำให้มันวัดผิดตอนกำลังเคลื่อนไหว

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ผ่าน

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ExpensePieChart.tsx src/components/analytics/TrendAnalysis.tsx
git commit -m "feat(motion): กราฟใช้จังหวะเดียวกับทั้งแอป + reduced motion (F42)"
```

---

### Task 9: ฟีดแบ็กตอนกด + แก้ dead class + แก้คอมเมนต์ที่โกหก

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:152`
- Modify: `src/components/ui/Toaster.tsx:15`
- Modify: `src/components/layout/Header.tsx:81`, `src/pages/SettingsPage.tsx:159`

- [ ] **Step 1: แก้ dead class `animate-in` ใน Sidebar**

`animate-in` ไม่มีนิยามที่ไหนเลย (ไม่มี keyframe ใน `src/index.css`, ไม่มี plugin `tailwindcss-animate`) drawer จึงเด้งเข้ามาแบบไม่มี animation มาตลอด

เปลี่ยน drawer panel ให้เป็น `motion.div`:

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import { DURATION, EASE } from '@/lib/motion';

// ในตัว component:
const reduced = useReducedMotion() ?? false;

// เปลี่ยน <div className="relative w-[260px] ... animate-in"> เป็น:
<motion.div
  className="relative w-[260px] h-full bg-white border-r border-slate-200 shadow-xl flex flex-col"
  initial={{ x: reduced ? 0 : -260 }}
  animate={{ x: 0 }}
  transition={reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE }}
>
```

(ลบ `animate-in` ออกจาก className)

- [ ] **Step 2: แก้คอมเมนต์ใน `Toaster.tsx:15`**

จาก:
```
 * flip. We avoid framer-motion to honour the "no extra packages" rule.
```
เป็น:
```
 * flip. Hand-rolled CSS transitions — this component predates the motion
 * layer (F42) and works well; migrating it to framer-motion would buy
 * nothing. New animations should use `src/components/motion/` instead.
```

**ไม่แตะโค้ดของ Toaster** เปลี่ยนแค่คอมเมนต์ให้ตรงความจริง

- [ ] **Step 3: ปุ่มหลัก — ยุบตอนกด (CSS ล้วน ไม่ใช้ framer)**

`active:scale-[0.98]` ของ Tailwind ให้ผลเหมือน `whileTap` โดยไม่ต้องเปลี่ยน `<button>` เป็น `motion.button` และเบราว์เซอร์เคารพ `prefers-reduced-motion` ผ่าน `motion-safe:` ให้เอง

`src/components/layout/Header.tsx:81` — ปุ่ม "+ เพิ่มรายการ" เพิ่ม class:
```
motion-safe:active:scale-[0.98] transition-transform
```
(วางต่อท้าย class เดิม ไม่ลบอะไร — `transition-colors` เดิมจะถูก `transition-transform` ทับ ให้เปลี่ยนเป็น `transition` เฉย ๆ ซึ่งครอบทั้งสี+transform)

ทำแบบเดียวกันกับปุ่ม primary ใน `src/pages/SettingsPage.tsx:159`

- [ ] **Step 4: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: ผ่านทั้งสาม

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/ui/Toaster.tsx src/components/layout/Header.tsx src/pages/SettingsPage.tsx
git commit -m "fix(motion): drawer slide จริง (animate-in เป็น class ที่ไม่มีอยู่) + ปุ่มยุบตอนกด (F42)"
```

---

### Task 10: ตรวจสอบทั้งระบบ + ขับ UI จริง

**Files:** ไม่แก้โค้ด (ยกเว้นเจอบั๊ก)

- [ ] **Step 1: verify scripts ทั้งหมดต้องผ่าน**

งานนี้ไม่แตะ store/schema/logic เลย ⇒ ทั้ง 18 ตัว (17 เดิม + verify-motion) ต้องผ่านโดยไม่มีข้อแก้ตัว

```bash
for f in scripts/verify-*.ts; do
  echo "── $f"
  npx tsx --tsconfig tsconfig.app.json "$f" > /dev/null 2>&1 && echo "  ✓ pass" || echo "  ✗ FAIL"
done
```
Expected: `✓ pass` ทั้ง 18 บรรทัด

- [ ] **Step 2: typecheck + lint + build**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: ผ่านทั้งสาม ไม่มี warning ใหม่

- [ ] **Step 3: ดู bundle ว่าโตเท่าไร**

```bash
npm run build 2>&1 | grep -E "dist/assets/index.*\.js"
```
บันทึกตัวเลขไว้ในข้อความ commit ของ Task 11 — framer-motion ควรเพิ่มราว 40KB gzip ถ้าเกิน 80KB แปลว่ามีอะไรผิด (อาจ import ทั้ง library แทน tree-shake)

- [ ] **Step 4: ขับ UI จริง**

`npm run dev` แล้วตรวจทีละข้อ:

1. เปิด `/` → KPI 4 ใบโผล่ไล่กัน เลขวิ่งจาก 0 ขึ้นค่าจริง
2. เปลี่ยนปีบน header → เลขวิ่งจาก**ค่าเก่า**ไปค่าใหม่ (ไม่ใช่ตกกลับไป 0 ก่อน)
3. เปลี่ยนปีรัว ๆ 3 ครั้งเร็ว ๆ → เลขไม่ค้าง ไม่กระตุก ไม่แสดง NaN
4. สลับหน้า Overview → Analytics → Monthly → หน้าเก่าออกก่อนหน้าใหม่เข้า **ไม่ซ้อนกัน** และ sidebar/header **ไม่กระพริบ**
5. กด "+ เพิ่มรายการ" → modal ขยายเข้ามานุ่ม ๆ กด ESC → หดออก (ไม่ใช่หายวับ)
6. ย่อจอเป็นมือถือ → กดเปิด drawer → **เลื่อนเข้าจากซ้ายจริง ๆ** (ก่อนหน้านี้เด้ง)
7. เปิด `/report/2025` → การ์ดทุกใบทึบเต็มที่ ไม่มีใบไหนค้างครึ่งจาง กด Cmd+P ดูตัวอย่าง PDF
8. ตารางสรุปรายเดือน → ตัวเลข**ไม่วิ่ง** นิ่งสนิท อ่านเทียบกันได้
9. macOS: System Settings → Accessibility → Display → เปิด "Reduce motion" แล้ว reload → ทุกอย่างโผล่ทันที เลขไม่วิ่ง กราฟไม่วาด แต่ยัง**ใช้งานได้ครบ**

- [ ] **Step 5: บันทึกผลการขับ UI**

ถ้าข้อไหนไม่ผ่าน → หยุด แก้ แล้วรัน Step 1-4 ใหม่ ห้ามข้ามไป Task 11 โดยมีข้อที่ยังแดง

---

### Task 11: ปิดงาน — features.json + CLAUDE.md

**Files:**
- Modify: `features.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: เพิ่ม F42 ใน `features.json`**

เพิ่มเข้า `phases[4].features` (phase_4) ต่อจาก F41:

```json
{
  "id": "F42",
  "name": "Motion Layer (animation ทั้งแอป)",
  "description": "ชั้น motion primitives — ตัวเลขวิ่ง, การ์ดโผล่ไล่กัน, กราฟวาดตัวเอง, เปลี่ยนหน้าลื่นไหล, ฟีดแบ็กตอนกด",
  "status": "completed",
  "priority": "P2",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "src/lib/motion.ts — tokens แหล่งเดียว (DURATION/EASE/STAGGER) + pure helpers, ไม่ import React",
    "motion primitives 4 ตัว: AnimatedNumber / FadeInUp / Stagger / PageTransition — หน้าเว็บไม่ import framer-motion ตรงๆ",
    "AnimatedNumber เขียน textContent ผ่าน ref (ไม่ re-render 60fps), format ผ่าน utils/formatters เท่านั้น, คง tabular-nums, sr-only บอกค่าปลายทาง",
    "เลขวิ่งเฉพาะ KPI/hero — ตาราง (MonthlySummaryTable, LoanScheduleTable, MonthTransactionList, PaymentLogTable, AllYearsSummary) ไม่วิ่ง",
    "PageTransition mode='wait' + ย้าย Suspense ลงระดับ page (เดิมครอบ Routes ทั้งก้อน ทำให้ shell กระพริบ)",
    "prefers-reduced-motion ปิดจริง (duration 0) ไม่ใช่ลดความแรง; PrintReportPage อยู่นอก Layout จึงไม่โดน animation",
    "กราฟใช้ chartAnimation() — จังหวะเดียวกับทั้งแอป (400ms) แทน default 1500ms ของ Recharts",
    "แก้บั๊ก: Sidebar drawer ใช้ class animate-in ที่ไม่มีอยู่จริง → slide เข้าจริง",
    "Verified: scripts/verify-motion.ts + verify เดิมทั้ง 17 ตัวไม่ regress + typecheck + lint + build + ขับ UI จริง 9 ข้อ"
  ],
  "estimatedHours": 6,
  "dependencies": [],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-07-10",
    "notes": "Spec: docs/superpowers/specs/2026-07-10-motion-layer-design.md | Plan: docs/superpowers/plans/2026-07-10-motion-layer.md | Files: src/lib/motion.ts (ใหม่), src/components/motion/* (ใหม่ 5 ไฟล์), scripts/verify-motion.ts (ใหม่), App.tsx, Layout.tsx, Sidebar.tsx, Modal.tsx, Toaster.tsx (คอมเมนต์), KpiCard.tsx, OverviewPage.tsx, NetWorthHero.tsx, LoanDetail.tsx, ExpensePieChart.tsx, TrendAnalysis.tsx, Header.tsx, SettingsPage.tsx | หมายเหตุ: Toaster ยังใช้ CSS transition เดิม (ทำงานดีอยู่แล้ว)"
  }
}
```

อัปเดต `progressSummary`: `totalFeatures` 49 → 50, `completed` 49 → 50

- [ ] **Step 2: เพิ่มกฎใน `CLAUDE.md`**

ใต้หัวข้อ **Code Rules** เพิ่ม:
```markdown
- **Animation ทุกตัวมาจาก `src/components/motion/`** — ห้าม import `framer-motion` ในหน้าเว็บโดยตรง ค่าเวลา/easing มาจาก `src/lib/motion.ts` เท่านั้น
- **เลขวิ่ง (count-up) เฉพาะ KPI/hero** — ตัวเลขในตารางมีไว้อ่านเทียบกัน ไม่วิ่ง
```

ใต้ **Key Design Decisions** เพิ่มข้อ 6:
```markdown
6. **framer-motion (F42)** — ยกเลิกกฎ "no extra packages" เดิม แต่ห่อไว้หลัง motion primitives เพื่อให้ถอดออกได้จากที่เดียว
```

- [ ] **Step 3: Commit**

```bash
git add features.json CLAUDE.md
git commit -m "docs: F42 motion layer — completed"
```

---

## Self-Review

**Spec coverage:**

| ข้อใน spec | Task |
|---|---|
| `src/lib/motion.ts` tokens | 1 |
| `AnimatedNumber` + กฎ format/tabular-nums/prev-ref | 2 |
| `Stagger` + `FadeInUp` + เพดาน 8 ใบ | 3 |
| `PageTransition` + `mode="wait"` | 4 |
| Modal scale/fade | 5 |
| เลขวิ่งเฉพาะ KPI/hero | 6, 7 |
| ตารางไม่วิ่ง (ตรวจด้วย grep) | 7 Step 3 |
| กราฟ Recharts + ไม่ห่อด้วย framer | 8 |
| ปุ่ม tap feedback | 9 |
| แก้คอมเมนต์ Toaster | 9 |
| prefers-reduced-motion ปิดจริง | 1 (helper), 2/3/4/5/8/9 (ใช้), 10 (ตรวจ) |
| PrintReport ไม่โดน animation | 4 (Suspense แยก), 10 ข้อ 7 (ตรวจ) |
| verify 17 ตัวไม่ regress | 10 |
| ไม่แตะ Toaster code / store / schema | ทุก task |

ครบทุกข้อ ไม่มีข้อไหนไม่มี task รองรับ

**Type consistency:** `shouldCountUp(from, to, reduced)`, `transitionFor(reduced)`, `staggerDelay(index, reduced)`, `chartAnimation(reduced)` — ชื่อและ signature ตรงกันระหว่าง Task 1 (นิยาม), Task 2/3/4/5/8/9 (เรียกใช้), และ verify script

**นอกเหนือจาก spec (เพิ่มเข้ามาเพราะเจอตอนอ่านโค้ด):** dead class `animate-in` (Task 9), Suspense ครอบ Routes ทั้งก้อน (Task 4) — ทั้งสองเป็นบั๊กที่ขวางไม่ให้ animation ทำงานถูกต้อง จึงอยู่ในขอบเขต
