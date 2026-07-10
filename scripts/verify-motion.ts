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

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
