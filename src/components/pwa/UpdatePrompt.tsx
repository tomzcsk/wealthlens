/**
 * WealthLens — แถบแจ้งเวอร์ชันใหม่ (F51).
 *
 * มี service worker แล้ว push ขึ้น Vercel → เปิดมือถือ → **ยังเห็นแอปเวอร์ชันเก่า**
 * เพราะ SW เสิร์ฟจาก cache. นี่คือกับดักที่ใหญ่ที่สุดของ PWA — ไม่มี prompt =
 * Tom จะคิดว่า deploy พัง
 *
 * ไม่ใช้ toast เพราะ toast ของโปรเจกต์ไม่มีปุ่มกดและหายเองใน 4 วินาที
 * (toastStore: "toasts are transient by design") — prompt ที่หายเองคือ prompt ที่พลาด
 *
 * ไม่อัปเดตเงียบ ๆ (autoUpdate) เพราะ reload กลางคันตอนกรอกฟอร์ม =
 * ข้อมูลที่พิมพ์ค้างหาย
 */
import { useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const UpdatePrompt = (): ReactNode => {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || dismissed) return null;

  // มือถือมีแถบล่าง (F47, ~72px + safe area) และปุ่มลอย 56px นั่งเหนือมันอีกที
  // → แถบนี้ต้องอยู่เหนือทั้งคู่ ไม่งั้นมันบังปุ่ม "เพิ่มรายจ่าย" ค้างไว้จนกว่าจะกดปิด
  return (
    <div
      role="status"
      data-testid="update-prompt"
      className="fixed inset-x-4 bottom-[calc(136px+env(safe-area-inset-bottom))] md:inset-x-auto md:right-6 md:bottom-6 md:w-96 z-50 flex items-center gap-3 rounded-xl border border-ink-200 bg-card px-4 py-3 shadow-lg"
    >
      <span aria-hidden="true" className="text-lg">
        ✨
      </span>
      <span className="flex-1 text-sm text-ink-700">มีเวอร์ชันใหม่</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="inline-flex items-center min-h-11 md:min-h-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition motion-safe:active:scale-[0.98]"
      >
        อัปเดต
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="ปิด"
        className="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-ink-400 hover:text-ink-700"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
};

export default UpdatePrompt;
