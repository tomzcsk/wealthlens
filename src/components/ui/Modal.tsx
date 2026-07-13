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
 * Focus (F49): Tab/Shift+Tab cycle *within* the panel while it is open, and
 * closing returns focus to whatever opened it. Hand-rolled — one `keydown`
 * listener and two refs; a focus-trap package would be more code shipped than
 * code saved. `aria-hidden` on the wrapper stays deliberately absent: see the
 * note next to `pointerEvents` below.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
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
  /**
   * ตำแหน่งของแผง (F47).
   *   'center' — กลางจอ (ค่าเริ่มต้น, ใช้กับฟอร์มทั้งหมด)
   *   'sheet'  — เด้งขึ้นจากขอบล่าง เต็มความกว้าง. ใช้กับเมนูบนมือถือ:
   *              นิ้วโป้งอยู่ล่างจอ เมนูจึงควรมาหานิ้ว ไม่ใช่ให้นิ้วเอื้อมไปกลางจอ
   */
  placement?: 'center' | 'sheet';
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
  placement = 'center',
}: ModalProps): ReactNode => {
  const reduced = useReducedMotion() ?? false;
  const isSheet = placement === 'sheet';
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // ── จำว่าใครเปิด modal นี้ (F49) ───────────────────────────────────────────
  // ต้องเป็น useLayoutEffect ไม่ใช่ useEffect: ฟอร์มข้างในโฟกัสช่องแรกของตัวเอง
  // ตอน mount ด้วย useEffect (เช่น ExpenseForm) และ passive effect ของ "ลูก"
  // วิ่งก่อนของ "พ่อ" เสมอ — จับใน useEffect จึงได้ <input> ในกรอบมาแทนปุ่มที่เปิด
  // layout effect วิ่งใน commit ก่อน passive effect ทุกตัว จึงจับปุ่มจริงได้ทัน
  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // เนื้อหาบางตัวอาจใช้ attribute `autoFocus` (React โฟกัสให้ตั้งแต่ mutation
    // phase ก่อน layout effect) — โฟกัสที่อยู่ "ในกรอบ" ไม่ใช่ผู้เปิด คืนให้ไม่ได้
    openerRef.current = panelRef.current?.contains(opener) ? null : opener;
  }, [open]);

  // ── คืนโฟกัสให้ปุ่มที่เปิด ตอนปิด (F49) ──────────────────────────────────────
  // ไม่คืน = โฟกัสเด้งไปต้น <body> ผู้ใช้คีย์บอร์ดต้อง Tab ใหม่ทั้งหน้า
  //
  // ทำไมคืนใน passive cleanup ไม่ใช่ layout cleanup: React DOM จำ activeElement
  // ไว้ก่อน mutation phase แล้ว **คืนโฟกัสให้มันเอง** ใน resetAfterCommit ซึ่งวิ่ง
  // *หลัง* layout cleanup — โฟกัสที่เราตั้งใน layout cleanup จึงถูกเขียนทับกลับไป
  // ที่ปุ่มในกรอบที่กำลังจะหายไป (วัดมาแล้ว: focus() ติดจริงในบรรทัดนั้น แล้วหลุด
  // เป็น <body> ใน macrotask ถัดมา). passive cleanup วิ่งทีหลัง เราจึงชนะ
  useEffect(() => {
    if (!open) return;
    return () => {
      // ปุ่มที่เปิดอาจหายไปเองระหว่างนั้น (list re-render) — อย่าไปโฟกัสผี
      const target = openerRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  // Tab/Shift+Tab วนอยู่ในกรอบ — ไม่งั้นโฟกัสไหลไปปุ่มที่อยู่ "ข้างหลัง" modal
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null); // มองไม่เห็น = ข้าม

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // โฟกัสอยู่นอกกรอบ (เพิ่งเปิด ยังไม่มีใคร autofocus / คลิกพื้นหลัง) — ดึงกลับเข้ามา
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

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
      // NOTE: intentionally NOT `aria-hidden={!open}`. The panel stays mounted
      // through its exit animation, and focus restoration (F49) happens in an
      // effect *cleanup* — i.e. after React has already committed the closed
      // render. `aria-hidden` on an ancestor of the still-focused element is
      // itself an a11y violation, so we keep the attribute off and rely on
      // `pointerEvents: none` + the restored focus to make the fading panel inert.
      className={`fixed inset-0 z-50 flex justify-center ${
        isSheet ? 'items-end' : 'items-center p-4'
      }`}
      style={{ pointerEvents: open ? undefined : 'none' }}
    >
      {/* Backdrop */}
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-overlay/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionFor(reduced)}
      />
      {/* Panel */}
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          isSheet
            ? 'relative bg-card rounded-t-2xl shadow-xl w-full max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]'
            : `relative bg-card rounded-2xl shadow-xl w-full ${SIZE_MAX_WIDTH[size]} max-h-[90vh] overflow-y-auto`
        }
        // sheet เลื่อนขึ้นจากขอบล่าง (มันมาจากล่าง จึงควรดูเหมือนมาจากล่าง)
        // center ใช้ scale+fade เหมือนเดิมทุกประการ
        initial={
          isSheet
            ? { y: reduced ? 0 : '100%' }
            : { opacity: 0, scale: reduced ? 1 : 0.96 }
        }
        animate={isSheet ? { y: 0 } : { opacity: 1, scale: 1 }}
        exit={
          isSheet
            ? { y: reduced ? 0 : '100%' }
            : { opacity: 0, scale: reduced ? 1 : 0.98 }
        }
        transition={panelTransition}
      >
        {isSheet && (
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 mb-1 h-1 w-9 rounded-full bg-ink-200"
          />
        )}
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-ink-200">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="text-ink-400 hover:text-ink-700 text-xl leading-none p-1 -mr-1"
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
            className="absolute top-3 right-3 z-10 text-ink-400 hover:text-ink-700 text-xl leading-none p-1"
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
