/**
 * WealthLens — ชั้นตัดสินโหมดสี (F46).
 *
 * pure ล้วน: ไม่ import React / Zustand / DOM — ทดสอบใน node ได้ตรง ๆ
 * (หลักเดียวกับ lib/motion.ts และ utils/actionMessages.ts)
 *
 * ThemeMode = สิ่งที่ผู้ใช้เลือก · Resolved = สิ่งที่จอเห็นจริง
 * แยกสองคำนี้ให้ขาด เพราะ 'system' ไม่ใช่สี มันคือ 'ไปถามเครื่องเอา'
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type Resolved = 'light' | 'dark';

/** โหมดเริ่มต้นเมื่อยังไม่เคยเลือก — เคารพการตั้งค่าเครื่องก่อนเสมอ */
export const DEFAULT_MODE: ThemeMode = 'system';

/** key ใน LocalStorage — ธีมเป็นของเครื่อง ไม่ปนกับข้อมูลการเงิน */
export const THEME_STORAGE_KEY = 'wealthlens-theme';

export const resolveTheme = (
  mode: ThemeMode,
  systemPrefersDark: boolean,
): Resolved => {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
};

/** ลำดับปุ่ม: ตามเครื่อง → สว่าง → มืด → ตามเครื่อง */
export const cycleTheme = (mode: ThemeMode): ThemeMode => {
  if (mode === 'system') return 'light';
  if (mode === 'light') return 'dark';
  return 'system';
};
