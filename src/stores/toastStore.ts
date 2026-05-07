/**
 * WealthLens — ephemeral toast notification store.
 *
 * Tiny Zustand store for transient UI messages. Toasts auto-dismiss after
 * `durationMs` (default 4s) via a setTimeout scheduled inside `push`.
 *
 * Kept side-effect free at module load — the timer only runs when `push`
 * is called, so SSR / test environments stay clean.
 *
 * Not persisted — toasts are session-local by design.
 */

import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  durationMs?: number;
}

export interface ToastState {
  toasts: Toast[];
  /** Enqueue a toast. The store generates an id and schedules removal. */
  push: (toast: Omit<Toast, 'id'>) => void;
  /** Remove a toast immediately by id. */
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION_MS = 4000;

/**
 * Generate a short unique id without pulling in `uuid` for every toast.
 * Collisions across the same millisecond are vanishingly unlikely for UI toasts.
 */
const nextId = (): string =>
  `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (toast) => {
    const id = nextId();
    const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    if (duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
