/**
 * WealthLens — minimal Modal/Dialog primitive.
 *
 * A no-dependency dialog rendered via `createPortal` so its backdrop can
 * cover the entire viewport regardless of where the trigger lives in the
 * tree. Keeps the surface area tiny: backdrop click + ESC to dismiss,
 * body scroll lock while open, and a corner close button.
 *
 * NOTE: Focus trapping is intentionally NOT implemented in v1. The form
 * inside auto-focuses its first input on mount, which covers the common
 * case. If we ever ship multi-step or nested modals, revisit and add a
 * proper focus trap (e.g. `focus-trap-react` or hand-rolled with a
 * sentinel pair).
 */

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  // Lock body scroll while the modal is up so background content doesn't
  // shift around when the user scrolls inside the panel.
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

  if (!open) return null;

  const panel = (
    <div
      role="presentation"
      // Outermost wrapper sits above everything; backdrop is a sibling-as-self
      // that handles the click-out behaviour.
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-white rounded-2xl shadow-xl w-full ${SIZE_MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto`}
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
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};

export default Modal;
