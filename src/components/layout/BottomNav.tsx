/**
 * WealthLens — แถบล่าง (มือถือเท่านั้น, F47).
 *
 * 4 เมนูหลัก + "อื่นๆ" ที่เปิด sheet รวมอีก 5 เมนู. อยู่ล่างจอเพราะนั่นคือที่ที่
 * นิ้วโป้งไปถึง — ของเดิมเป็นแฮมเบอร์เกอร์มุมซ้ายบน ซึ่งเอื้อมยากที่สุด
 *
 * safe-area-inset-bottom: ไม่ใส่แล้วแถบจะไปนอนใต้แถบ home ของ iPhone
 */
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import Modal from '@/components/ui/Modal';
import { isNavActive, mobileMoreItems, mobilePrimaryItems } from '@/lib/nav';

const tabBase =
  'flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium transition-colors';
const tabOn = 'text-primary-ink';
const tabOff = 'text-ink-500';

export const BottomNav = (): ReactNode => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const more = mobileMoreItems();
  const moreActive = more.some((item) => isNavActive(item, pathname));

  const go = (path: string): void => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav
        data-testid="bottom-nav"
        aria-label="เมนูมือถือ"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 bg-card border-t border-ink-200 pb-[env(safe-area-inset-bottom)]"
      >
        {mobilePrimaryItems().map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              aria-current={active ? 'page' : undefined}
              className={`${tabBase} ${active ? tabOn : tabOff}`}
            >
              <span aria-hidden="true" className="text-xl leading-none">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {/* ไม่ติด aria-current: มันแปลว่า "ลิงก์ของหน้าที่เปิดอยู่" — ปุ่มนี้ไม่ใช่หน้า
            มันเปิด sheet. เมื่ออยู่ในหน้าที่อยู่ใน sheet เราแค่ย้อมสีให้เห็นว่าอยู่ตรงนั้น */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`${tabBase} ${moreActive ? tabOn : tabOff}`}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ⋯
          </span>
          <span>อื่นๆ</span>
        </button>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="เมนูอื่นๆ"
        size="sm"
        placement="sheet"
      >
        <div className="flex flex-col gap-1 p-2 pb-3">
          {more.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => go(item.path)}
              className={`flex items-center gap-3 min-h-[52px] px-3 rounded-xl text-sm font-medium hover:bg-hover ${
                isNavActive(item, pathname) ? 'text-primary-ink' : 'text-ink-900'
              }`}
            >
              <span aria-hidden="true" className="text-lg w-6 text-center">
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              <span aria-hidden="true" className="text-ink-400">
                ›
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
};

export default BottomNav;
