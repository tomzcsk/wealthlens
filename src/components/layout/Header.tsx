/**
 * WealthLens — top Header.
 *
 * Composition (left → right):
 *   • Page title  — derived from the current route, never hardcoded.
 *   • Year selector — native <select> wired to `useFinanceStore`.
 *                     Years come from `data.years` keys so newly-added
 *                     years show up automatically.
 *   • "+ Add Entry" CTA — primary button → /monthly.
 *   • Auth/sync slot — placeholder; the auth agent fills this in.
 */

import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useFinanceStore } from '@/stores';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import SyncStatusIndicator from '@/components/auth/SyncStatusIndicator';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'ภาพรวม',
  '/monthly': 'รายละเอียดรายเดือน',
  '/analytics': 'วิเคราะห์',
  '/tax': 'ภาษี',
  '/settings': 'ตั้งค่า',
};

const titleFor = (pathname: string): string =>
  ROUTE_TITLES[pathname] ?? 'WealthLens';

export const Header = (): ReactNode => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const years = useFinanceStore((s) => s.data.years);
  const selectedYear = useFinanceStore((s) => s.selectedYear);
  const setSelectedYear = useFinanceStore((s) => s.setSelectedYear);

  const yearOptions = useMemo(
    () =>
      Object.keys(years)
        .map((y) => Number(y))
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => a - b),
    [years],
  );

  return (
    <header
      className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm"
      role="banner"
    >
      <div className="flex items-center gap-4 px-6 md:px-8 h-16">
        {/* Spacer so the mobile hamburger doesn't collide with the title */}
        <div className="md:hidden w-10" aria-hidden="true" />

        <h1 className="text-xl font-semibold text-slate-900 truncate">
          {titleFor(pathname)}
        </h1>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sr-only">ปี</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm font-medium text-slate-900 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary cursor-pointer"
              aria-label="เลือกปี"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => navigate('/monthly')}
            className="hidden sm:inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <span aria-hidden="true">+</span>
            <span>เพิ่มรายการ</span>
          </button>

          <div data-slot="auth" className="flex items-center gap-2">
            <SyncStatusIndicator />
            <GoogleSignInButton />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
