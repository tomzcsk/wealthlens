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
import { useLocation, useOutlet } from 'react-router-dom';

import RouteLoader from '@/components/ui/RouteLoader';
import { transitionFor } from '@/lib/motion';

/**
 * /installments กับ /loans เป็นแท็บของหน้าเดียวกัน (DebtPage)
 * ถ้า key ต่างกัน การกดสลับแท็บจะ fade ทั้งหน้า — เหมือนโหลดหน้าใหม่ทั้งที่ไม่ได้ไปไหน
 * จึงให้สองเส้นทางนี้ใช้ key เดียวกัน
 *
 * ใช้ === ไม่ใช่ startsWith — เผื่ออนาคตมี /loans/:id เป็นหน้า detail จริง
 * ที่ *ควร* fade เป็นการเปลี่ยนหน้า
 */
const transitionKeyOf = (pathname: string): string =>
  pathname === '/installments' || pathname === '/loans' ? 'debt' : pathname;

export const PageTransition = (): ReactNode => {
  const location = useLocation();
  const reduced = useReducedMotion() ?? false;
  const transition = transitionFor(reduced);

  // ต้องเป็น useOutlet() ไม่ใช่ <Outlet/> — ห้าม "simplify" กลับ:
  // <Outlet/> อ่าน location ปัจจุบันเสมอ → div ที่กำลัง fade ออก (ซึ่ง framer
  // retain ไว้ตอน mode="wait") จะ render หน้าปลายทาง หน้าเก่าเลยไม่เคย fade
  // ออกจริง — หน้าใหม่ flash เข้า/ออก/เข้าแทน. useOutlet() คืน element ที่ถูก
  // จับไว้ตอน render นั้น หน้าเก่าจึง fade ออกเป็นหน้าเก่าจริง ๆ
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKeyOf(location.pathname)}
        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : -4 }}
        transition={transition}
      >
        <Suspense fallback={<RouteLoader />}>{outlet}</Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

export default PageTransition;
