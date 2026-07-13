/**
 * WealthLens — ปุ่มสลับโหมดสี (F46).
 * สามจังหวะ: ตามเครื่อง → สว่าง → มืด
 */

import { useEffect, type ReactNode } from 'react';

import type { ThemeMode } from '@/lib/theme';
import { useThemeStore } from '@/stores/themeStore';

const FACE: Record<ThemeMode, { icon: string; label: string }> = {
  system: { icon: '💻', label: 'ตามเครื่อง' },
  light: { icon: '☀️', label: 'สว่าง' },
  dark: { icon: '🌙', label: 'มืด' },
};

export const ThemeToggle = (): ReactNode => {
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);
  const syncWithSystem = useThemeStore((s) => s.syncWithSystem);

  useEffect(() => syncWithSystem(), [syncWithSystem]);

  const face = FACE[mode];

  return (
    <button
      type="button"
      onClick={toggle}
      title={`โหมด: ${face.label}`}
      aria-label={`โหมดสี: ${face.label} — กดเพื่อเปลี่ยน`}
      /* มือถือ 44px ตามนิ้วโป้ง (F47/M2) — เดสก์ท็อปคงขนาดเดิม 36px */
      className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 rounded-lg border border-ink-200 bg-card text-base hover:bg-hover transition motion-safe:active:scale-[0.98]"
    >
      <span aria-hidden="true">{face.icon}</span>
    </button>
  );
};

export default ThemeToggle;
