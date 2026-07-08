/**
 * WealthLens — session-expiry UX (mounted ONCE in Layout).
 *
 * The Google access token lives ~1 hour (implicit flow, no refresh token).
 * This watcher:
 *   • shows a bottom banner when the session is within 5 minutes of expiry,
 *     with a one-tap "เข้าสู่ระบบใหม่" to refresh the token proactively;
 *   • when the token actually expires (time-based OR a 401 from Drive),
 *     surfaces a toast so the user knows sync paused and how to resume.
 *
 * Soft (time-based) expiry re-uses the SAME `TOKEN_EXPIRED_EVENT` the 401
 * path dispatches, so the auth hook's existing listener clears the session
 * and this component toasts exactly once for either trigger.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useToastStore } from '@/stores/toastStore';
import { TOKEN_EXPIRED_EVENT } from '@/utils/driveSync';

/** Show the "almost out" banner when this much time (ms) or less remains. */
const WARN_MS = 5 * 60 * 1000;

export const SessionWatcher = (): ReactNode => {
  const { isReady, isSignedIn, expiresAt, signIn } = useGoogleAuth();
  const pushToast = useToastStore((s) => s.push);

  const [now, setNow] = useState<number>(() => Date.now());
  // Guards a single soft-expiry dispatch per session (reset on new token).
  const firedRef = useRef(false);

  // Tick every 20s while signed in so the countdown + expiry check stay live.
  useEffect(() => {
    if (!isSignedIn || expiresAt == null) return;
    firedRef.current = false;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, [isSignedIn, expiresAt]);

  // Soft (time-based) expiry → dispatch the shared event (auth hook clears
  // the session; the listener below toasts). Fire once per session.
  useEffect(() => {
    if (!isSignedIn || expiresAt == null) return;
    if (now >= expiresAt && !firedRef.current) {
      firedRef.current = true;
      window.dispatchEvent(new Event(TOKEN_EXPIRED_EVENT));
    }
  }, [now, isSignedIn, expiresAt]);

  // Toast once whenever the session expires (covers 401 AND soft timer).
  useEffect(() => {
    const onExpire = (): void => {
      pushToast({
        message: 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่เพื่อ sync ข้อมูลต่อ',
        tone: 'error',
      });
    };
    window.addEventListener(TOKEN_EXPIRED_EVENT, onExpire);
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, onExpire);
  }, [pushToast]);

  if (!isReady || !isSignedIn || expiresAt == null) return null;
  const remaining = expiresAt - now;
  if (remaining <= 0 || remaining > WARN_MS) return null;

  const mins = Math.max(1, Math.ceil(remaining / 60_000));

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-300 shadow-lg px-4 py-3">
        <span aria-hidden="true" className="text-lg">
          ⏳
        </span>
        <div className="flex-1 text-sm text-amber-900">
          เซสชันใกล้หมด{' '}
          <span className="font-semibold tabular-nums">(อีก ~{mins} นาที)</span>{' '}
          — เข้าสู่ระบบใหม่เพื่อ sync ต่อ
        </div>
        <button
          type="button"
          onClick={() => signIn()}
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition"
        >
          เข้าสู่ระบบใหม่
        </button>
      </div>
    </div>
  );
};

export default SessionWatcher;
