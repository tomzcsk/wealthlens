/**
 * WealthLens — application shell.
 *
 * Two-column grid on desktop (240px sidebar + flexible main).
 * Single-column on mobile; the sidebar collapses into a drawer that
 * the Sidebar component manages internally.
 *
 * The Header sits at the top of the main column and is sticky so it
 * stays anchored while the route content scrolls.
 *
 * Sync glue (mounted here, NEVER inside a conditional):
 *   • `useDriveSyncCoordinator()` owns all Drive-sync side-effects and
 *     returns the imperative manualSync/manualReload handles.
 *   • Those handles flow into descendants (Settings page) via
 *     `<SyncCoordinatorProvider>`.
 *   • `<Toaster />` renders the global notification queue.
 */

import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';

import { SyncCoordinatorProvider } from '@/auth/SyncCoordinatorContext';
import { useGoogleAuth } from '@/auth/useGoogleAuth';
import Toaster from '@/components/ui/Toaster';
import useAnomalyAlertEffect from '@/hooks/useAnomalyAlertEffect';
import useDriveSyncCoordinator from '@/hooks/useDriveSyncCoordinator';
import LoginPage from '@/pages/LoginPage';

import Header from './Header';
import Sidebar from './Sidebar';

export const Layout = (): ReactNode => {
  // Mount the sync coordinator unconditionally so its effects are owned by
  // a single, stable React node for the lifetime of the app.
  const syncHandles = useDriveSyncCoordinator();
  // F15 — passive observer that surfaces newly-detected expense anomalies
  // as toasts. Pre-existing (mount-time) anomalies are intentionally NOT
  // toasted — see useAnomalyAlertEffect for the spam-on-load rationale.
  useAnomalyAlertEffect();

  const { isReady, isSignedIn } = useGoogleAuth();
  // Auth gate: when Google OAuth is configured but the user hasn't signed
  // in yet, take over the screen with the login page instead of leaking
  // the dashboard chrome (and any stale localStorage data) to anyone who
  // opens the URL. If OAuth isn't configured at all (`!isReady`), fall
  // through to the dashboard so the app stays usable in local-only mode.
  const requireSignIn = isReady && !isSignedIn;

  return (
    <SyncCoordinatorProvider value={syncHandles}>
      {requireSignIn ? (
        <LoginPage />
      ) : (
        <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-[240px_1fr]">
          <Sidebar />
          <div className="flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-6 md:p-8">
              <Outlet />
            </main>
          </div>
        </div>
      )}
      <Toaster />
    </SyncCoordinatorProvider>
  );
};

export default Layout;
