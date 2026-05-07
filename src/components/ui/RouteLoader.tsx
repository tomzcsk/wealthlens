/**
 * WealthLens — RouteLoader.
 *
 * Suspense fallback shown while a lazy-loaded route chunk is being
 * fetched. Intentionally minimal: a full-viewport centered text label
 * that reserves vertical space so the chrome doesn't shift.
 *
 * Visual style matches the dashboard — quiet slate text, no spinner
 * blast, Thai copy ("กำลังโหลด...") to fit the rest of the UI.
 */

import type { ReactNode } from 'react';

function RouteLoader(): ReactNode {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center text-sm text-slate-400"
      role="status"
      aria-live="polite"
    >
      กำลังโหลด...
    </div>
  );
}

export default RouteLoader;
