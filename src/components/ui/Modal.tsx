/**
 * WealthLens — minimal Modal/Dialog primitive.
 *
 * A no-dependency dialog rendered via `createPortal` so its backdrop can
 * cover the entire viewport regardless of where the trigger lives in the
 * tree. Keeps the surface area tiny: backdrop click + ESC to dismiss,
 * body scroll lock while open, and a corner close button.
 *
 * Open/close motion (F42): backdrop fades, panel scales+fades. The portal
 * and `<AnimatePresence>` render UNCONDITIONALLY — `open` only controls the
 * child inside `<AnimatePresence>`. This is what lets the panel play its
 * *exit* animation: an early `if (!open) return null` would unmount the whole
 * component the instant `open` flips false, and there would be nothing left
 * to animate out. When closed, `<AnimatePresence>{null}</AnimatePresence>`
 * renders zero DOM into `document.body` — no stray full-screen div.
 *
 * NOTE: Focus trapping is intentionally NOT implemented in v1. The form
 * inside auto-focuses its first input on mount, which covers the common
 * case. If we ever ship multi-step or nested modals, revisit and add a
 * proper focus trap (e.g. `focus-trap-react` or hand-rolled with a
 * sentinel pair).
 */

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { DURATION, EASE, transitionFor, type MotionTransition } from '@/lib/motion';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user dismisses (backdrop click, ESC, X button). */
  onClose: () => void;
  /** Optional title rendered in the panel header. */
  title?: string;
  /** Panel body. */
  children: ReactNode;
  /** Panel max-width preset. Defaults to 'md'. */
  size?: ModalSize;
}

/** Size → Tailwind max-width class. Tuned to the form's natural width. */
const SIZE_MAX_WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

export const Modal = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;

  // Lock body scroll while the modal is up so background content doesn't
  // shift around when the user scrolls inside the panel.
  //
  // Deliberate: this is keyed to `open`, so the lock releases ~150ms before
  // the exit animation finishes. On our target (macOS overlay scrollbars) that
  // causes no layout shift, and holding the lock until `onExitComplete` would
  // mean threading exit-completion state through here for an invisible window.
  // Don't "fix" it by decoupling from `open` without that tradeoff in mind.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ESC to dismiss — registered on window so it works even if focus is
  // outside the panel (e.g. immediately after open).
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  // Panel motion: quick scale+fade. Reduced motion → scale pinned to 1 in
  // every state and duration 0 (opacity may still snap).
  const panelTransition: MotionTransition = reduced
    ? { duration: 0 }
    : { duration: DURATION.fast, ease: EASE };

  const panel = (
    <div
      key="modal"
      role="presentation"
      // Outermost wrapper sits above everything; backdrop is a sibling-as-self
      // that handles the click-out behaviour.
      //
      // `pointer-events` is keyed to `open`, not to AnimatePresence presence:
      // the instant `open` flips false the still-fading panel must stop taking
      // clicks so a user who double-clicks "บันทึก" can't hit a live control on
      // a modal that's already closing. It doesn't touch opacity/transform, so
      // the exit animation still plays out normally.
      //
      // NOTE: intentionally NOT `aria-hidden={!open}`. ESC-to-close fires while
      // focus is still on a field *inside* the panel (and in-panel X/save/cancel
      // buttons focus on click in Chromium), and v1 has no focus trap and moves
      // no focus on close — so when `open` flips false, focus can live inside
      // this subtree. `aria-hidden` on an ancestor of the focused element is
      // itself an a11y violation, so we omit it. Revisit if a focus trap lands.
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ pointerEvents: open ? undefined : 'none' }}
    >
      {/* Backdrop */}
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(reduced)}
      />
      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-white rounded-2xl shadow-xl w-full ${SIZE_MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto`}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
        transition={panelTransition}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="text-slate-400 hover:text-slate-700 text-xl leading-none p-1 -mr-1"
            >
              ×
            </button>
          </div>
        )}
        {title === undefined && (
          // Floating close button when no header bar is present.
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute top-3 right-3 z-10 text-slate-400 hover:text-slate-700 text-xl leading-none p-1"
          >
            ×
          </button>
        )}
        {children}
      </motion.div>
    </div>
  );

  return createPortal(
    <AnimatePresence>{open ? panel : null}</AnimatePresence>,
    document.body,
  );
};

export default Modal;
