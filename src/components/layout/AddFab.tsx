/**
 * WealthLens — ปุ่มลอยเพิ่มรายจ่าย (มือถือเท่านั้น, F47).
 *
 * พาไป /monthly?add=expense → MonthlyPage สั่ง ExpenseList เปิดฟอร์มให้เลย
 * (รายจ่ายคืองานที่ทำบ่อยสุดบนมือถือ — ไม่ต้องถามก่อนว่าจะเพิ่มอะไร)
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export const AddFab = (): ReactNode => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      data-testid="add-fab"
      onClick={() => navigate('/monthly?add=expense')}
      aria-label="เพิ่มรายจ่าย"
      className="md:hidden fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-2xl bg-primary text-white text-2xl shadow-lg flex items-center justify-center transition motion-safe:active:scale-95"
    >
      <span aria-hidden="true">+</span>
    </button>
  );
};

export default AddFab;
