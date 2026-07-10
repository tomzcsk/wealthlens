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
   * ส่ง arrow ใหม่ทุก render ได้ — เก็บใน latest-ref จึงไม่ restart animation
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
  const nodeRef = useRef<HTMLSpanElement | null>(null);
  // ค่าที่แสดงอยู่ตอนนี้ เริ่มที่ 0 เพื่อให้ mount แรกวิ่งจาก 0 ขึ้นมา
  const currentRef = useRef<number>(reduced ? value : 0);

  // latest-ref: เก็บ format ล่าสุดไว้ใน ref เพื่อไม่ต้องใส่ใน effect deps
  // ถ้า format อยู่ใน deps แล้ว caller ส่ง arrow ใหม่ทุก render (แบบ Task 6/7)
  // effect จะ restart กลางทาง → count-up สะดุด/รีเซ็ตนาฬิกา โดยไม่มี error เตือน
  const formatRef = useRef(format);
  // อัปเดตใน effect ไม่ใช่ตอน render (กฎ react-hooks/refs ห้ามเขียน ref ตอน render)
  // ประกาศ *ก่อน* animation effect → รันก่อนตามลำดับ declaration ค่า current จึง
  // สด ก่อน animation effect จะอ่าน (สาขา no-count-up อ่านแบบ sync). mount แรก
  // formatRef เริ่มด้วย useRef(format) อยู่แล้ว tween แรกจึงได้ formatter ที่ถูกเสมอ
  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const node = nodeRef.current;
    if (node === null) return;

    const from = currentRef.current;

    if (!shouldCountUp(from, value, reduced)) {
      currentRef.current = value;
      // reduced/ค่าเท่าเดิม: JSX เขียน format(value) ให้แล้ว การเขียนซ้ำนี้จึงเป็น
      // no-op ที่ตั้งใจ — กันเคสค่าไม่ finite (NaN/∞) ที่ JSX ยัง render ค่าเก่าไว้
      node.textContent = formatRef.current(value);
      return;
    }

    const controls = animate(from, value, {
      duration: DURATION.slow,
      ease: EASE,
      onUpdate: (latest: number) => {
        currentRef.current = latest;
        node.textContent = formatRef.current(latest);
      },
      onComplete: () => {
        currentRef.current = value;
        node.textContent = formatRef.current(value);
      },
    });

    // เปลี่ยนปีรัว ๆ: หยุดตัวเก่าก่อน ตัวใหม่จะวิ่งต่อจากตำแหน่งที่ค้างอยู่
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <>
      <span
        ref={nodeRef}
        aria-hidden="true"
        className={`tabular-nums ${className}`}
      >
        {/*
         * ค่าเริ่มต้นเท่ากับ currentRef ตอน mount (reduced ? value : 0) แต่คำนวณ
         * จาก props ตรง ๆ — ไม่อ่าน ref ตอน render (กฎ react-hooks/refs)
         * กรณีวิ่ง: string คงที่ = format(0) ทุก render → React ไม่แตะ DOM
         * ปล่อยให้ animation เขียน textContent เอง ไม่ถูก reconcile ทับ
         */}
        {format(reduced ? value : 0)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
};

export default AnimatedNumber;
