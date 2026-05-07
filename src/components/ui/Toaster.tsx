/**
 * WealthLens — toast notification host.
 *
 * Mounts once near the root and renders the live toast queue from
 * `useToastStore`. Visually a stacked column in the top-right corner.
 *
 * Tone → left accent border colour (no full-width background — keeps the
 * cards quiet enough to coexist with charts/tables underneath):
 *   • success → income emerald
 *   • error   → expense red
 *   • info    → primary blue
 *
 * Animation is pure CSS: each card fades + slides in from the right on
 * mount via Tailwind transition classes triggered through a one-tick state
 * flip. We avoid framer-motion to honour the "no extra packages" rule.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { useToastStore, type Toast, type ToastTone } from '@/stores/toastStore';

const TONE_ACCENT: Record<ToastTone, string> = {
  success: 'border-l-4 border-l-income',
  error: 'border-l-4 border-l-expense',
  info: 'border-l-4 border-l-primary',
};

const TONE_ICON: Record<ToastTone, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

const TONE_ICON_BG: Record<ToastTone, string> = {
  success: 'bg-income-light text-income',
  error: 'bg-expense-light text-expense',
  info: 'bg-primary-light text-primary',
};

interface ToastCardProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastCard = ({ toast, onDismiss }: ToastCardProps): ReactNode => {
  // One-tick flip from "entering" → "entered" so the CSS transition runs.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const baseClasses =
    'pointer-events-auto flex items-start gap-3 max-w-[360px] bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 transition-all duration-300 ease-out';
  const motion = entered
    ? 'translate-x-0 opacity-100'
    : 'translate-x-4 opacity-0';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${baseClasses} ${TONE_ACCENT[toast.tone]} ${motion}`}
    >
      <span
        aria-hidden="true"
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${TONE_ICON_BG[toast.tone]}`}
      >
        {TONE_ICON[toast.tone]}
      </span>
      <p className="flex-1 text-sm text-slate-800 leading-snug pt-0.5">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 -mr-1 -mt-1 text-slate-400 hover:text-slate-700 text-lg leading-none p-1"
        aria-label="ปิดการแจ้งเตือน"
      >
        ×
      </button>
    </div>
  );
};

export const Toaster = (): ReactNode => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-label="การแจ้งเตือน"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
};

export default Toaster;
