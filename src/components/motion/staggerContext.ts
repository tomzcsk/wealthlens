/**
 * WealthLens — สัญญาณว่า "อยู่ใต้ <Stagger>" (F42).
 *
 * แยกไฟล์จาก Stagger.tsx เพราะ react-refresh ต้องการให้ไฟล์ component
 * export เฉพาะ component. FadeInUp อ่านค่านี้เพื่อ *ไม่* ตั้ง initial/animate
 * ของตัวเอง — เพราะ framer ถือว่า motion component ที่ตั้ง initial/animate เป็น
 * variant label = "คุม variant เอง" (isControllingVariants) แล้วถอนตัวออกจาก
 * variantChildren ของ parent ทำให้ staggerChildren ไม่มีผลกับมันเลย
 * (motion-dom/render/VisualElement: addVariantChild ทำเฉพาะเมื่อ !isControllingVariants)
 */

import { createContext } from 'react';

export const InsideStaggerContext = createContext(false);
