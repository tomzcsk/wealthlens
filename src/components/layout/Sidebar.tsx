/**
 * WealthLens — Sidebar navigation.
 *
 * Desktop: 240px fixed rail on the left (UXUI.md §5.1).
 * Mobile: hidden behind a hamburger toggle that opens a slide-in drawer
 *         with a backdrop. The same NavLink list is reused for both
 *         experiences, so the active-route logic lives in exactly one place.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';

import { DURATION, EASE } from '@/lib/motion';

import BuildInfo from './BuildInfo';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /**
   * URL อื่นที่ควรถือว่า nav นี้ active ด้วย. หนี้สิน (/loans) เป็นเจ้าของทั้ง
   * แท็บ ผ่อนของ (/installments) และ หนี้ระยะยาว — highlight ต้องติดทั้งสอง url.
   */
  alsoActiveOn?: string[];
}

/**
 * เมนูแบ่ง 3 กลุ่มตามคำถามที่ผู้ใช้ถืออยู่ในหัว:
 *   1. "วันนี้เป็นยังไง / จะบันทึกอะไร"
 *   2. "ฐานะฉันเป็นยังไง" — ความมั่งคั่งนำหน้าเพราะเป็นบทสรุปของอีกสามอันที่
 *      ตามมา (บัญชี + ทอง − หนี้); สามอันนั้นคือที่มาของคำตอบ
 *   3. "เอาข้อมูลไปคิดต่อ" — วิเคราะห์/ภาษี เป็นเครื่องมือ ไม่ใช่ที่เก็บข้อมูล
 * กลุ่มคั่นด้วยเส้นบางๆ ไม่มีหัวข้อตัวหนังสือ — 9 รายการยังไม่มากพอที่จะ
 * คุ้มค่ากับ label เพิ่ม
 */
const NAV_GROUPS: NavItem[][] = [
  [
    { to: '/', label: 'ภาพรวม', icon: '🏠', end: true },
    { to: '/monthly', label: 'รายเดือน', icon: '📊' },
  ],
  [
    { to: '/wealth', label: 'ความมั่งคั่ง', icon: '💎' },
    { to: '/accounts', label: 'บัญชีธนาคาร', icon: '🏦' },
    { to: '/gold', label: 'ทองคำ', icon: '🪙' },
    {
      to: '/loans',
      label: 'หนี้สิน',
      icon: '💰',
      alsoActiveOn: ['/installments'],
    },
  ],
  [
    { to: '/analytics', label: 'วิเคราะห์', icon: '📈' },
    { to: '/tax', label: 'ภาษี', icon: '🧮' },
    { to: '/settings', label: 'ตั้งค่า', icon: '⚙️' },
  ],
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

const NavList = ({ onNavigate }: { onNavigate?: () => void }): ReactNode => {
  const { pathname } = useLocation();
  return (
    <nav className="px-2" aria-label="เมนูหลัก">
      {NAV_GROUPS.map((group, groupIndex) => (
        <div
          key={group[0].to}
          className={
            groupIndex > 0
              ? 'mt-2 flex flex-col gap-1 border-t border-slate-200 pt-2'
              : 'flex flex-col gap-1'
          }
        >
          {group.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) => {
                // NavLink รู้จักแค่ `to` ของตัวเอง — เติม alsoActiveOn ให้ nav
                // อย่างหนี้สิน highlight ตอนอยู่แท็บ /installments ด้วย.
                const active =
                  isActive || (item.alsoActiveOn?.includes(pathname) ?? false);
                return `${linkBase} ${active ? linkActive : linkInactive}`;
              }}
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
  );
};

export const Sidebar = (): ReactNode => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduced = useReducedMotion() ?? false;

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
        <BuildInfo />
      </aside>

      {/* Mobile drawer + backdrop.
          AnimatePresence renders UNCONDITIONALLY — `mobileOpen` only gates the
          child inside it. A `{mobileOpen && …}` guard around AnimatePresence
          would unmount everything the instant it flips false, killing the exit
          (same lesson as Modal.tsx, F42). `pointerEvents` is keyed to
          `mobileOpen` on the wrapper so a still-sliding drawer stops taking
          clicks — a thumb can't fire `close` twice mid-exit. */}
      <AnimatePresence>
        {mobileOpen ? (
          <div
            key="drawer"
            className="md:hidden fixed inset-0 z-40"
            style={{ pointerEvents: mobileOpen ? undefined : 'none' }}
          >
            <motion.button
              type="button"
              aria-label="ปิดเมนู"
              onClick={close}
              className="absolute inset-0 bg-slate-900/40"
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reduced ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: DURATION.base }}
            />
            <motion.aside
              className="relative w-[260px] h-full bg-white border-r border-slate-200 shadow-xl flex flex-col"
              aria-label="เมนูมือถือ"
              initial={{ x: reduced ? 0 : -260 }}
              animate={{ x: 0 }}
              exit={{ x: reduced ? 0 : -260 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { duration: DURATION.base, ease: EASE }
              }
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
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
