/**
 * WealthLens — สีของกราฟตามโหมด (F46).
 *
 * ทำไมต้องมีไฟล์นี้ ทั้งที่ทุกที่ในแอปใช้ token ผ่าน Tailwind:
 * Recharts รับสีเป็น **prop** แล้วยัดลงเป็น SVG presentation attribute
 * ซึ่งสเปกไม่รับ var() → stroke="var(--ink-200)" จะได้เส้นหายเงียบ ๆ
 * ไม่มี error ให้เห็น. จึงต้องส่ง hex ตรงตามโหมด
 *
 * สีซีรีส์ (income/expense/net) และสีหมวดทั้ง 8 ไม่ได้อยู่ในนี้โดยตั้งใจ —
 * มันสดพอจะอ่านออกทั้งสองพื้นอยู่แล้ว เปลี่ยนไปก็ได้แต่ไม่ได้อะไรเพิ่ม
 *
 * pure: ไม่ import React — ทดสอบใน node ได้
 */
import type { Resolved } from './theme';

export interface ChartPalette {
  /** เส้นตารางพื้นหลัง (CartesianGrid) */
  grid: string;
  /** เส้นแกน (XAxis/YAxis axisLine) */
  axisLine: string;
  /** ตัวหนังสือ/ขีดบนแกน (XAxis/YAxis stroke) */
  axisTick: string;
  /** แถบไฮไลต์ใต้เคอร์เซอร์ของกราฟแท่ง */
  cursorFill: string;
  /** เส้นประไฮไลต์ของกราฟเส้น/พื้นที่ */
  cursorStroke: string;
}

const LIGHT: ChartPalette = {
  grid: '#E2E8F0',
  axisLine: '#E2E8F0',
  axisTick: '#94A3B8',
  cursorFill: 'rgba(148, 163, 184, 0.08)',
  cursorStroke: '#94A3B8',
};

const DARK: ChartPalette = {
  grid: '#334155',
  axisLine: '#334155',
  axisTick: '#94A3B8', // อ่านออกทั้งสองพื้น จึงคงไว้
  cursorFill: 'rgba(148, 163, 184, 0.14)',
  cursorStroke: '#64748B',
};

export const chartPalette = (resolved: Resolved): ChartPalette =>
  resolved === 'dark' ? DARK : LIGHT;
