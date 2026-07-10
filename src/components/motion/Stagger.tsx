/**
 * WealthLens — parent ที่แจกจังหวะให้ลูกโผล่ไล่กัน (F42).
 *
 * ใช้กับกลุ่มการ์ด ≤ 8 ใบ (KPI grid, savings cards, bank cards)
 * ห้ามใช้กับ list ยาว — 50 แถว × 50ms = คลื่นยาว 2.5 วินาที
 *
 * framer สั่ง "hidden → show" ไหลลงถึงลูก <FadeInUp> เอง ผ่าน variant context
 * เราจึงไม่ต้อง clone children หรือส่ง index ให้ใคร — แต่ลูกต้อง *ไม่* ตั้ง
 * initial/animate ของตัวเอง (ดู InsideStaggerContext ด้านล่าง)
 */

import { type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

import { STAGGER } from '@/lib/motion';
import { InsideStaggerContext } from './staggerContext';

export interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export const Stagger = ({ children, className }: StaggerProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;

  // staggerChildren อยู่ใน transition ของ target variant ('show') ตาม framer 12
  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : STAGGER },
    },
  };

  return (
    <InsideStaggerContext.Provider value={true}>
      <motion.div
        className={className}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {children}
      </motion.div>
    </InsideStaggerContext.Provider>
  );
};

export default Stagger;
