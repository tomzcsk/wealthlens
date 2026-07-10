/**
 * WealthLens — fade + เลื่อนขึ้น 8px (F42).
 *
 * ใช้ได้ 2 แบบ:
 *   1. เดี่ยว ๆ — คุม initial/animate เอง → animate ตอน mount ทันที
 *   2. เป็นลูกของ <Stagger> — ปล่อยให้ parent สั่งจังหวะผ่าน variant context
 *
 * ข้อควรระวัง (พิสูจน์จาก source ของ motion-dom): ถ้าลูกของ <Stagger> ตั้ง
 * initial/animate ของตัวเอง framer จะถือว่ามัน "คุม variant เอง" แล้วไม่นับมัน
 * เป็น variantChild ของ parent → staggerChildren ไม่ทำงาน. เราจึงตั้ง initial/animate
 * เฉพาะตอนอยู่ *นอก* <Stagger> เท่านั้น (อ่านจาก InsideStaggerContext)
 */

import { useContext, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

import { DURATION, EASE } from '@/lib/motion';
import { InsideStaggerContext } from './staggerContext';

export interface FadeInUpProps {
  children: ReactNode;
  className?: string;
}

export const FadeInUp = ({ children, className }: FadeInUpProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const insideStagger = useContext(InsideStaggerContext);

  // reduced motion: ไม่มี y ไม่มีเวลา — โผล่มาเลย ไม่ครึ่ง ๆ กลาง ๆ
  const variants: Variants = {
    hidden: { opacity: 0, y: reduced ? 0 : 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: reduced
        ? { duration: 0 }
        : { duration: DURATION.base, ease: EASE },
    },
  };

  // นอก <Stagger>: คุมจังหวะเอง → animate ตอน mount
  // ใน <Stagger>: เว้น initial/animate ให้ parent สั่ง (ไม่งั้น stagger พัง — ดู header)
  const ownControl = insideStagger
    ? {}
    : { initial: 'hidden' as const, animate: 'show' as const };

  return (
    <motion.div className={className} variants={variants} {...ownControl}>
      {children}
    </motion.div>
  );
};

export default FadeInUp;
