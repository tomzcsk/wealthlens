/**
 * WealthLens — Sidebar (เดสก์ท็อปเท่านั้น).
 *
 * 240px rail ซ้ายมือ (UXUI.md §5.1). บนมือถือไม่มี sidebar แล้ว —
 * เมนูอยู่ที่ BottomNav (F47). แฮมเบอร์เกอร์มุมซ้ายบนถูกลบทิ้ง: มันอยู่ในจุดที่
 * นิ้วโป้งเอื้อมยากที่สุดบนจอ 6 นิ้ว และมันกิน 40px จาก header จนชื่อหน้าโดนตัด
 *
 * รายการเมนูมาจาก src/lib/nav.ts — ทะเบียนเดียวกับที่ BottomNav ใช้
 */
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { desktopGroups, isNavActive } from '@/lib/nav';

import BuildInfo from './BuildInfo';

const linkBase =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors';
const linkInactive = 'text-ink-500 hover:bg-raised hover:text-ink-900';
const linkActive = 'bg-primary-50 text-primary-ink font-semibold';

export const Sidebar = (): ReactNode => {
  const { pathname } = useLocation();

  return (
    <aside
      className="hidden md:flex md:flex-col w-[240px] h-screen sticky top-0 bg-card border-r border-ink-200"
      aria-label="เมนู"
    >
      <div className="px-4 pt-6 pb-8">
        <div className="text-2xl font-bold text-primary-ink leading-none">
          WealthLens
        </div>
        <div className="mt-1 text-xs text-ink-500">บัญชีส่วนตัว</div>
      </div>

      <nav className="px-2" aria-label="เมนูหลัก">
        {desktopGroups().map((group, groupIndex) => (
          <div
            key={group[0].path}
            className={
              groupIndex > 0
                ? 'mt-2 flex flex-col gap-1 border-t border-ink-200 pt-2'
                : 'flex flex-col gap-1'
            }
          >
            {group.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={`${linkBase} ${
                  isNavActive(item, pathname) ? linkActive : linkInactive
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <BuildInfo />
    </aside>
  );
};

export default Sidebar;
