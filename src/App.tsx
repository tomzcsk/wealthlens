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
 * land in the user's browser when the matching route is visited.
 *
 * Suspense placement (F42): the <Suspense> boundary lives DOWN inside
 * <PageTransition> (rendered by Layout), NOT wrapped around <Routes>
 * here. That keeps the shell (sidebar + header) eager and painted while
 * only the page body swaps to <RouteLoader /> during a chunk fetch —
 * and lets PageTransition's exit animation run instead of the whole
 * tree blinking out. The only route that still needs its own <Suspense>
 * is `report/:year`, which renders OUTSIDE <Layout> (chrome-less PDF)
 * and therefore has no PageTransition to host a boundary.
 */

import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import Layout from '@/components/layout/Layout';
import RouteLoader from '@/components/ui/RouteLoader';

const OverviewPage = lazy(() => import('@/pages/OverviewPage'));
const MonthlyPage = lazy(() => import('@/pages/MonthlyPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
// /installments และ /loans ใช้ DebtPage ตัวเดียว (แท็บ ผ่อนของ / หนี้ระยะยาว)
const DebtPage = lazy(() => import('@/pages/DebtPage'));
const BankAccountsPage = lazy(() => import('@/pages/BankAccountsPage'));
const GoldPage = lazy(() => import('@/pages/GoldPage'));
const WealthPage = lazy(() => import('@/pages/WealthPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const TaxCalculatorPage = lazy(() => import('@/pages/TaxCalculatorPage'));
const PrintReportPage = lazy(() => import('@/pages/PrintReportPage'));

const NotFound = (): ReactNode => (
  <div className="space-y-4 text-center py-16">
    <h1 className="text-3xl font-bold text-ink-900">404</h1>
    <p className="text-sm text-ink-500">ไม่พบหน้านี้</p>
  </div>
);

function App(): ReactNode {
  return (
    /* GoogleOAuthProvider will be added by auth integration */
    <BrowserRouter>
      <Routes>
        {/*
          Print report lives OUTSIDE the Layout so the PDF has no sidebar
          / header chrome. F17.

          Rule (F42): any route rendered outside <Layout> gets no
          <PageTransition>, and therefore no Suspense boundary from it —
          so it must bring its own <Suspense fallback={<RouteLoader />}>
          around its lazy element. Layout-child routes inherit the
          boundary from PageTransition and must NOT add their own.
        */}
        <Route
          path="report/:year"
          element={
            <Suspense fallback={<RouteLoader />}>
              <PrintReportPage />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="monthly" element={<MonthlyPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="installments" element={<DebtPage />} />
          <Route path="loans" element={<DebtPage />} />
          <Route path="accounts" element={<BankAccountsPage />} />
          <Route path="gold" element={<GoldPage />} />
          <Route path="wealth" element={<WealthPage />} />
          <Route path="tax" element={<TaxCalculatorPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
