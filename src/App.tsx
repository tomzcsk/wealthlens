/**
 * WealthLens — application root.
 *
 * Owns routing only. The Layout component owns the visual shell;
 * pages slot in via React Router's <Outlet />.
 *
 * Auth: GoogleOAuthProvider will be added by the auth integration —
 * intentionally left out of this file so the layout can ship/test
 * without OAuth credentials.
 *
 * Route-level code splitting: every page is loaded via React.lazy() so
 * heavy dependencies (Recharts on Analytics / PrintReport, etc.) only
 * land in the user's browser when the matching route is visited. The
 * Layout shell stays eager so the chrome paints instantly while the
 * first page chunk streams in behind <Suspense>.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import Layout from '@/components/layout/Layout';
import RouteLoader from '@/components/ui/RouteLoader';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const MonthlyPage = lazy(() => import('@/pages/MonthlyPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const TaxCalculatorPage = lazy(() => import('@/pages/TaxCalculatorPage'));
const PrintReportPage = lazy(() => import('@/pages/PrintReportPage'));

const NotFound = (): ReactNode => (
  <div className="space-y-4 text-center py-16">
    <h1 className="text-3xl font-bold text-slate-900">404</h1>
    <p className="text-sm text-slate-500">ไม่พบหน้านี้</p>
  </div>
);

function App(): ReactNode {
  return (
    /* GoogleOAuthProvider will be added by auth integration */
    <BrowserRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/*
            Print report lives OUTSIDE the Layout so the PDF has no sidebar
            / header chrome. F17.
          */}
          <Route path="report/:year" element={<PrintReportPage />} />
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="monthly" element={<MonthlyPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="tax" element={<TaxCalculatorPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
