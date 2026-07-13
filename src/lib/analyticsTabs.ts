/**
 * WealthLens — ทะเบียนแท็บของหน้าวิเคราะห์ (F50).
 *
 * pure: ไม่ import React — ทดสอบใน node ได้ (หลักเดียวกับ lib/nav.ts)
 * สถานะแท็บอยู่ใน URL (?tab=) ไม่ใช่ useState — ปุ่มย้อนกลับ/บุ๊กมาร์ก/ส่งลิงก์
 * ตรงแท็บ ต้องใช้ได้ ซึ่ง useState ทำไม่ได้สักอย่าง
 */
export type AnalyticsTabId = 'years' | 'trends' | 'subs';

export interface AnalyticsTab {
  id: AnalyticsTabId;
  label: string;
}

export const ANALYTICS_TABS: readonly AnalyticsTab[] = [
  { id: 'years', label: 'รายปี' },
  { id: 'trends', label: 'แนวโน้ม' },
  { id: 'subs', label: 'Subscription' },
];

export const DEFAULT_TAB: AnalyticsTabId = 'years';

/** ?tab= ที่ไม่รู้จัก (หรือไม่มี) → แท็บเริ่มต้น ไม่ใช่หน้าว่าง */
export const resolveTab = (param: string | null): AnalyticsTabId =>
  ANALYTICS_TABS.some((t) => t.id === param) ? (param as AnalyticsTabId) : DEFAULT_TAB;
