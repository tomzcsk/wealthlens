/**
 * WealthLens — ตัวเลขความมั่งคั่งสุทธิ + สัดส่วนสินทรัพย์/หนี้ (F38).
 *
 * ป้าย "ไม่รวมมูลค่าบ้านและรถ" อยู่ใต้ตัวเลขเสมอ ไม่ใช่ tooltip — คนที่เห็น
 * เลขติดลบต้องเข้าใจทันทีว่าทำไม (บ้าน/รถไม่มีในระบบเป็นสินทรัพย์ แต่หนี้มี).
 */
import type { ReactNode } from 'react';

import { AnimatedNumber } from '@/components/motion';
import { formatTHB } from '@/utils/formatters';

interface NetWorthHeroProps {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export const NetWorthHero = ({
  netWorth,
  totalAssets,
  totalLiabilities,
}: NetWorthHeroProps): ReactNode => {
  const span = Math.max(totalAssets, 0) + Math.max(totalLiabilities, 0);
  const assetPct = span > 0 ? (Math.max(totalAssets, 0) / span) * 100 : 0;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">
          ความมั่งคั่งสุทธิ
        </div>
        <div
          className={`mt-1 text-4xl font-bold financial-number tabular-nums ${
            netWorth >= 0 ? 'text-slate-900' : 'text-expense'
          }`}
        >
          <AnimatedNumber
            value={netWorth}
            format={(v) => formatTHB(v, { decimals: 0 })}
          />
        </div>
        <div className="mt-1 text-sm text-slate-500">
          ไม่รวมมูลค่าบ้านและรถ — นับเฉพาะเงินในบัญชี ทองคำ และเงินออม
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-emerald-500" style={{ width: `${assetPct}%` }} />
          <div className="h-full bg-expense" style={{ width: `${100 - assetPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-emerald-700">
            สินทรัพย์{' '}
            <span className="financial-number tabular-nums font-semibold">
              {formatTHB(totalAssets, { decimals: 0 })}
            </span>
          </span>
          <span className="text-expense">
            หนี้{' '}
            <span className="financial-number tabular-nums font-semibold">
              {formatTHB(totalLiabilities, { decimals: 0 })}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
};

export default NetWorthHero;
