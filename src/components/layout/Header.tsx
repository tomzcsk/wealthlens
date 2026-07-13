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

import { NAV_ITEMS, isNavActive } from '@/lib/nav';
import { useFinanceStore } from '@/stores';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import SyncStatusIndicator from '@/components/auth/SyncStatusIndicator';
import ThemeToggle from './ThemeToggle';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'ภาพรวม',
  '/monthly': 'รายละเอียดรายเดือน',
  '/analytics': 'วิเคราะห์',
  '/tax': 'ภาษี',
  '/settings': 'ตั้งค่า',
};

/**
 * ชื่อยาว (เดสก์ท็อป). ROUTE_TITLES มีแค่ 5 route — ที่เหลือเคยตกไปเป็น
 * "WealthLens" ซึ่งไม่ได้บอกอะไรเลย (หน้าบัญชี/ทอง/หนี้/ความมั่งคั่ง เคยขึ้นหัวว่า
 * "WealthLens" มาตลอด) ตอนนี้ตกไปที่ชื่อในทะเบียนเมนูแทน — คำเดียวกับที่ sidebar
 * ไฮไลต์อยู่ตรงนั้นพอดี
 */
const titleFor = (pathname: string): string =>
  ROUTE_TITLES[pathname] ??
  NAV_ITEMS.find((item) => isNavActive(item, pathname))?.label ??
  'WealthLens';

/**
 * ชื่อสั้นสำหรับมือถือ (F47) — ดึงจากทะเบียนเมนู ไม่ใช่พิมพ์ใหม่
 *
 * header บนจอ 390px เหลือที่ให้ชื่อหน้าแค่ ~131px แต่ "รายละเอียดรายเดือน"
 * ต้องการ 150px จึงโดนตัดเป็น "รายละเอียดรา…". ไล่บีบ padding ต่อไปเรื่อย ๆ
 * ไม่ยั่งยืน — พอชื่อหน้ายาวกว่านี้ก็โดนตัดอีก
 *
 * ทางที่ถูกกว่า: แถบล่างบอกอยู่แล้วว่าตอนนี้อยู่หมวดไหน ใช้คำเดียวกับมันเลย
 * (รายเดือน / บัญชีธนาคาร / …) — คำเดียวกันทั้งแอป และมาจากแหล่งเดียวกัน
 */
const shortTitleFor = (pathname: string): string =>
  NAV_ITEMS.find((item) => isNavActive(item, pathname))?.label ??
  titleFor(pathname);

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
      className="sticky top-0 z-20 bg-card border-b border-ink-200 shadow-sm"
      role="banner"
    >
      {/* px-4 บนมือถือ: ไม่มีแฮมเบอร์เกอร์แล้ว (F47) ชื่อหน้าจึงได้ที่เต็ม ๆ */}
      <div className="flex items-center gap-4 px-4 md:px-8 h-16">
        <h1 className="text-lg md:text-xl font-semibold text-ink-900 truncate">
          <span className="md:hidden">{shortTitleFor(pathname)}</span>
          <span className="hidden md:inline">{titleFor(pathname)}</span>
        </h1>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sr-only">ปี</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="appearance-none bg-card border border-ink-200 rounded-lg px-2 pr-6 md:px-3 md:pr-8 py-2 min-h-11 md:min-h-0 text-sm font-medium text-ink-900 hover:border-ink-300 focus:outline-none focus:ring-2 focus:ring-primary-ink focus:border-primary-ink cursor-pointer"
              aria-label="เลือกปี"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          {/* มือถือใช้ปุ่มลอย (AddFab) แทน — sm (640px) ยังเป็นมือถือแนวนอน */}
          <button
            type="button"
            onClick={() => navigate('/monthly')}
            className="hidden md:inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition motion-safe:active:scale-[0.98]"
          >
            <span aria-hidden="true">+</span>
            <span>เพิ่มรายการ</span>
          </button>

          <ThemeToggle />

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
