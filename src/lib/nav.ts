/**
 * WealthLens — ทะเบียนเมนู (F47).
 *
 * แหล่งความจริงเดียวของ nav: Sidebar (เดสก์ท็อป) และ BottomNav (มือถือ)
 * อ่านจากที่นี่ทั้งคู่. ก่อนหน้านี้ Sidebar hardcode รายการไว้ในตัวเอง —
 * พอเพิ่มแถบล่าง มันจะกลายเป็นเมนูสองชุดที่หลุดจากกันวันใดวันหนึ่ง
 * (เพิ่มหน้าใหม่แล้วลืมอีกที่ ไม่มี error ให้เห็น)
 *
 * pure: ไม่ import React — ทดสอบใน node ได้ (หลักเดียวกับ lib/motion.ts, lib/theme.ts)
 */

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** react-router `end` — ใช้กับ '/' เท่านั้น ไม่งั้นมัน active ทุกหน้า */
  end?: boolean;
  /**
   * URL อื่นที่ควรถือว่าเมนูนี้ active ด้วย.
   * หนี้สิน (/loans) เป็นเจ้าของทั้งแท็บ ผ่อนของ (/installments) และหนี้ระยะยาว
   */
  alsoActiveOn?: readonly string[];
  /** อยู่บนแถบล่าง (4 อัน) หรืออยู่ใน sheet "อื่นๆ" */
  mobilePrimary: boolean;
  /**
   * กลุ่มบน sidebar เดสก์ท็อป — คงลำดับเดิมไว้เป๊ะ:
   *   1 "วันนี้เป็นยังไง / จะบันทึกอะไร"
   *   2 "ฐานะฉันเป็นยังไง" (ความมั่งคั่งนำหน้า เพราะเป็นบทสรุปของอีกสามอัน)
   *   3 "เอาข้อมูลไปคิดต่อ"
   */
  group: 1 | 2 | 3;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'ภาพรวม', icon: '🏠', end: true, mobilePrimary: true, group: 1 },
  { path: '/monthly', label: 'รายเดือน', icon: '📊', mobilePrimary: true, group: 1 },
  { path: '/wealth', label: 'ความมั่งคั่ง', icon: '💎', mobilePrimary: false, group: 2 },
  { path: '/accounts', label: 'บัญชีธนาคาร', icon: '🏦', mobilePrimary: true, group: 2 },
  { path: '/gold', label: 'ทองคำ', icon: '🪙', mobilePrimary: false, group: 2 },
  {
    path: '/loans',
    label: 'หนี้สิน',
    icon: '💰',
    alsoActiveOn: ['/installments'],
    mobilePrimary: false,
    group: 2,
  },
  { path: '/analytics', label: 'วิเคราะห์', icon: '📈', mobilePrimary: true, group: 3 },
  { path: '/tax', label: 'ภาษี', icon: '🧮', mobilePrimary: false, group: 3 },
  { path: '/settings', label: 'ตั้งค่า', icon: '⚙️', mobilePrimary: false, group: 3 },
];

export const mobilePrimaryItems = (): NavItem[] =>
  NAV_ITEMS.filter((i) => i.mobilePrimary);

export const mobileMoreItems = (): NavItem[] =>
  NAV_ITEMS.filter((i) => !i.mobilePrimary);

export const desktopGroups = (): NavItem[][] =>
  ([1, 2, 3] as const).map((g) => NAV_ITEMS.filter((i) => i.group === g));

/** เมนูนี้ active อยู่ไหม เมื่อ url ปัจจุบันคือ pathname */
export const isNavActive = (item: NavItem, pathname: string): boolean => {
  if (item.end) return pathname === item.path;
  if (pathname === item.path) return true;
  if (pathname.startsWith(`${item.path}/`)) return true;
  return item.alsoActiveOn?.includes(pathname) ?? false;
};
