/**
 * WealthLens — SavingsCategoryCard.
 *
 * Generic per-category savings tile บน Overview — โผล่อัตโนมัติเฉพาะหมวด
 * ที่มียอดในปีที่เลือก (F29) ต่างจาก Dime/Travel cards ตรงไม่มีเป้าหมาย/
 * progress — แสดงยอดสะสม + จำนวนรายการเท่านั้น
 *
 * หมวด gold = เงินสดที่จ่ายซื้อทองปีนี้ (ซื้อผ่าน Kept ไม่สร้าง
 * SavingsItem — เงินถูกนับใน Kept ไปแล้ว) ไม่ใช่มูลค่าทองที่ถืออยู่ —
 * อันนั้นดูหน้า Gold
 */
import { type ReactNode } from 'react';

import type { SavingsCategory } from '@/types';
import { formatTHB } from '@/utils/formatters';

interface CategoryDisplay {
  icon: string;
  label: string;
  iconBg: string;
}

/**
 * ครบทุก key ของ SavingsCategory เพื่อให้ type system บังคับอัปเดตเมื่อ
 * เพิ่มหมวดใหม่ — dime/travel ไม่ถูก render จริง (selector กรองออก)
 * แต่มี entry ไว้กัน runtime hole ถ้า caller ส่งมา
 */
const CATEGORY_DISPLAY: Record<SavingsCategory, CategoryDisplay> = {
  'investment-dime': { icon: '📈', label: 'ลงทุน Dime', iconBg: 'bg-net-50' },
  travel: { icon: '🏝️', label: 'ออมเที่ยว', iconBg: 'bg-income-50' },
  emergency: { icon: '🚨', label: 'เงินฉุกเฉิน', iconBg: 'bg-expense-50' },
  retirement: { icon: '🏖️', label: 'เกษียณ', iconBg: 'bg-net-50' },
  gold: { icon: '🥇', label: 'ออมทอง', iconBg: 'bg-warning-50' },
  general: { icon: '💰', label: 'ออมทั่วไป', iconBg: 'bg-income-50' },
};

interface SavingsCategoryCardProps {
  category: SavingsCategory;
  total: number;
  itemCount: number;
  year: number;
}

export const SavingsCategoryCard = ({
  category,
  total,
  itemCount,
  year,
}: SavingsCategoryCardProps): ReactNode => {
  const display = CATEGORY_DISPLAY[category];
  return (
    <div className="bg-card rounded-2xl border border-ink-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${display.iconBg} text-base`}
        >
          {display.icon}
        </span>
        <h3 className="text-base font-semibold text-ink-900">
          {display.label} — {year}
        </h3>
      </div>
      <div>
        <div className="text-xs text-ink-500">ออมแล้ว (YTD)</div>
        <div className="financial-number text-xl font-bold tabular-nums text-ink-900">
          {formatTHB(total)}
        </div>
        <div className="mt-1 text-xs text-ink-500 tabular-nums">
          {itemCount} รายการ
        </div>
      </div>
    </div>
  );
};

export default SavingsCategoryCard;
