/**
 * WealthLens — UI state ของเครื่อง (ไม่ใช่ข้อมูลการเงิน).
 *
 * เก็บสถานะหน้าตาที่ควรจำข้ามการ reload แต่ **เป็นของเครื่อง ไม่ sync ขึ้น Drive**
 * (หลักเดียวกับธีม F46: เดสก์ท็อปกลางวันอยากเปิดเมนู มือถือ/จอเล็กอยากหุบ — คนละเครื่อง
 * คนละความชอบ และมันไม่ใช่ข้อมูลการเงิน). แยกจาก financeStore เพื่อไม่ให้ UI re-render
 * ไปกระตุก dashboard และไม่หลุดเข้า backup/export.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UiState {
  /** sidebar เดสก์ท็อปหุบเหลือ icon rail อยู่ไหม (false = เปิดเต็ม). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'wealthlens_ui' },
  ),
);
