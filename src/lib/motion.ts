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

/**
 * delay ของลูกลำดับที่ index (0-based) — ติดเพดานกัน list ยาวกลายเป็นคลื่น
 *
 * ปัดเป็นมิลลิวินาที (3 ตำแหน่ง) เพราะ index * STAGGER สะสม float error
 * ของ IEEE754 (เช่น 3 * 0.05 = 0.15000000000000002) — delay ระดับต่ำกว่า
 * มิลลิวินาทีไม่มีความหมายกับ animation อยู่แล้ว
 */
export const staggerDelay = (index: number, reduced: boolean): number => {
  if (reduced) return 0;
  return Math.round(Math.min(index, MAX_STAGGER_INDEX) * STAGGER * 1000) / 1000;
};

/** prop ที่ยัดเข้า Recharts series ได้ตรง ๆ (Recharts คิดเป็น ms) */
export const chartAnimation = (
  reduced: boolean,
): { isAnimationActive: boolean; animationDuration: number } =>
  reduced
    ? { isAnimationActive: false, animationDuration: 0 }
    : { isAnimationActive: true, animationDuration: DURATION.slow * 1000 };
