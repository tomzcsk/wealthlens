/**
 * WealthLens — โหมดสี (F46).
 *
 * ธีมเป็นของ "เครื่อง" ไม่ใช่ของ "ผู้ใช้" จึงอยู่ใน LocalStorage key แยก
 * และ **ไม่ sync ขึ้น Drive** โดยตั้งใจ — มือถือกลางคืนอยากมืด เดสก์ท็อป
 * กลางวันอยากสว่าง ถ้า sync ข้ามเครื่องมันจะแย่งกันเปลี่ยน และมันไม่ใช่
 * ข้อมูลการเงิน จึงไม่ควรอยู่ใน wealthlens_data.json
 *
 * ผลข้างเคียง DOM (class บน <html>) อยู่ที่นี่ที่เดียว — component ไม่แตะ
 * classList เอง. ค่าเริ่มต้นถูกตั้งไว้แล้วโดย inline script ใน index.html
 * (กันแฟลชขาว) store แค่ "ยืนยัน" ค่าเดิมตอน hydrate ไม่ได้เปลี่ยนมัน
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_MODE,
  THEME_STORAGE_KEY,
  cycleTheme,
  resolveTheme,
  type Resolved,
  type ThemeMode,
} from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;

const paint = (resolved: Resolved): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
};

interface ThemeState {
  mode: ThemeMode;
  /** สิ่งที่จอเห็นจริง — derive จาก mode + เครื่อง, อัปเดตเมื่อ OS สลับ */
  resolved: Resolved;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  /** เรียกครั้งเดียวตอน mount — ผูก listener ของ OS, คืน unsubscribe */
  syncWithSystem: () => () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: DEFAULT_MODE,
      resolved: resolveTheme(DEFAULT_MODE, systemPrefersDark()),

      setMode: (mode) => {
        const resolved = resolveTheme(mode, systemPrefersDark());
        paint(resolved);
        set({ mode, resolved });
      },

      toggle: () => get().setMode(cycleTheme(get().mode)),

      syncWithSystem: () => {
        if (typeof window === 'undefined') return () => {};
        const mq = window.matchMedia(DARK_QUERY);
        const onChange = (e: MediaQueryListEvent): void => {
          // เคารพการเลือกของผู้ใช้: เครื่องเปลี่ยนมีผลเฉพาะโหมด 'system'
          if (get().mode !== 'system') return;
          const resolved: Resolved = e.matches ? 'dark' : 'light';
          paint(resolved);
          set({ resolved });
        };
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (s) => ({ mode: s.mode }), // resolved คำนวณใหม่เสมอ ไม่เก็บ
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const resolved = resolveTheme(state.mode, systemPrefersDark());
        paint(resolved);
        state.resolved = resolved;
      },
    },
  ),
);
