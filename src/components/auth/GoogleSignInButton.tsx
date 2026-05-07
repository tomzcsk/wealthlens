/**
 * WealthLens — Google sign-in button.
 *
 * Three render states:
 *   1. Not configured (no VITE_GOOGLE_CLIENT_ID)
 *      → muted text "Google Sync ปิดอยู่ — ตั้งค่า VITE_GOOGLE_CLIENT_ID
 *        ใน .env.local" with a `title` tooltip for hover detail.
 *   2. Configured but not signed in
 *      → "Sign in with Google" CTA in primary blue.
 *   3. Signed in
 *      → avatar (rounded-full <img>) + click-to-toggle dropdown showing
 *        the user's name, email, and a "Sign out" action.
 *
 * Kept self-contained — no portal, no shadcn dropdown — so it can drop into
 * the Header `data-slot="auth"` div without extra wiring.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';

const DISABLED_LABEL = 'Google Sync ปิดอยู่';
const DISABLED_TOOLTIP =
  'ตั้งค่า VITE_GOOGLE_CLIENT_ID ใน .env.local เพื่อเปิดใช้งาน Google Drive sync';

export const GoogleSignInButton = (): ReactNode => {
  const { isReady, isSignedIn, user, signIn, signOut } = useGoogleAuth();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (
        wrapperRef.current &&
        e.target instanceof Node &&
        !wrapperRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isReady) {
    return (
      <span
        title={DISABLED_TOOLTIP}
        className="text-xs text-slate-400 italic cursor-help select-none"
      >
        {DISABLED_LABEL}
      </span>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <button
        type="button"
        onClick={signIn}
        className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-3 py-2 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
      >
        <GoogleGlyph />
        <span>เข้าสู่ระบบด้วย Google</span>
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-primary/30 focus:outline-none focus:ring-2 focus:ring-primary"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <img
          src={user.picture}
          alt={user.name}
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-full bg-slate-100 object-cover"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-30"
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
            role="menuitem"
          >
            ออกจากระบบ
          </button>
        </div>
      ) : null}
    </div>
  );
};

const GoogleGlyph = (): ReactNode => (
  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#FFFFFF"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"
    />
    <path
      fill="#FFFFFF"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.92v2.32A8.997 8.997 0 0 0 9 18z"
      opacity=".85"
    />
    <path
      fill="#FFFFFF"
      d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.97H.92A8.997 8.997 0 0 0 0 9c0 1.45.35 2.82.92 4.03l3.05-2.32z"
      opacity=".7"
    />
    <path
      fill="#FFFFFF"
      d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 8.997 8.997 0 0 0 .92 4.97l3.05 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      opacity=".55"
    />
  </svg>
);

export default GoogleSignInButton;
