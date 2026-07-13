/**
 * WealthLens — motion primitives barrel (F42).
 */

export { AnimatedNumber } from './AnimatedNumber';
export { FadeInUp } from './FadeInUp';
export { PageTransition } from './PageTransition';
export { Stagger } from './Stagger';

/**
 * ผู้ใช้ขอ "ลดการเคลื่อนไหว" ไว้ในระบบไหม (F48).
 *
 * กราฟทั้ง 6 ตัวเคย import ตัวนี้จาก framer-motion ตรง ๆ ซึ่งผิดกฎ F42
 * ที่เขียนไว้เองว่า page/feature component ห้ามแตะ framer โดยตรง — กฎที่เขียนไว้
 * แต่ไม่มีใครทำตาม คือกฎที่โกหก. re-export ผ่าน barrel ตัวนี้แทน แล้วกฎกลับมาเป็นจริง
 * และวันที่อยากเปลี่ยน/ถอด framer ก็ยังแก้ได้จากที่เดียวตามเจตนาเดิม
 */
export { useReducedMotion } from 'framer-motion';
