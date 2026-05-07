/**
 * WealthLens — Sidebar navigation.
 *
 * Desktop: 240px fixed rail on the left (UXUI.md §5.1).
 * Mobile: hidden behind a hamburger toggle that opens a slide-in drawer
 *         with a backdrop. The same NavLink list is reused for both
 *         experiences, so the active-route logic lives in exactly one place.
 */

import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ภาพรวม', icon: '🏠', end: true },
  { to: '/monthly', label: 'รายเดือน', icon: '📊' },
  { to: '/analytics', label: 'วิเคราะห์', icon: '📈' },
  { to: '/tax', label: 'ภาษี', icon: '🧮' },
  { to: '/settings', label: 'ตั้งค่า', icon: '⚙️' },
];

const linkBase =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors';
const linkInactive = 'text-slate-500 hover:bg-slate-100 hover:text-slate-900';
const linkActive = 'bg-primary-light text-primary font-semibold';

const Brand = (): ReactNode => (
  <div className="px-4 pt-6 pb-8">
    <div className="text-2xl font-bold text-primary leading-none">
      WealthLens
    </div>
    <div className="mt-1 text-xs text-slate-500">บัญชีส่วนตัว</div>
  </div>
);

const NavList = ({ onNavigate }: { onNavigate?: () => void }): ReactNode => (
  <nav className="px-2 flex flex-col gap-1" aria-label="เมนูหลัก">
    {NAV_ITEMS.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          `${linkBase} ${isActive ? linkActive : linkInactive}`
        }
      >
        <span aria-hidden="true" className="text-base leading-none">
          {item.icon}
        </span>
        <span>{item.label}</span>
      </NavLink>
    ))}
  </nav>
);

export const Sidebar = (): ReactNode => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const close = (): void => setMobileOpen(false);

  return (
    <>
      {/* Mobile hamburger — visible below md breakpoint, fixed top-left */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="เปิดเมนู"
        aria-expanded={mobileOpen}
        className="md:hidden fixed top-3 left-3 z-30 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-700 hover:bg-slate-50"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          ☰
        </span>
      </button>

      {/* Desktop sidebar — fixed 240px rail */}
      <aside
        className="hidden md:flex md:flex-col w-[240px] h-screen sticky top-0 bg-white border-r border-slate-200"
        aria-label="เมนู"
      >
        <Brand />
        <NavList />
      </aside>

      {/* Mobile drawer + backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={close}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside
            className="relative w-[260px] h-full bg-white border-r border-slate-200 shadow-xl flex flex-col animate-in"
            aria-label="เมนูมือถือ"
          >
            <div className="flex items-start justify-between">
              <Brand />
              <button
                type="button"
                onClick={close}
                aria-label="ปิดเมนู"
                className="m-3 inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <NavList onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
