/**
 * WealthLens — หน้าความมั่งคั่ง (💎 ความมั่งคั่ง · F38).
 *
 * ประกอบตัวเลขจากทุกหน้า (บัญชี + ทอง + ออม − หนี้ − ผ่อน) เข้าเป็นคำตอบเดียว:
 * สินทรัพย์ − หนี้ = เงินที่เป็นของคุณจริงๆ. หน้านี้ derive ล้วน — ไม่แตะ
 * schema, ไม่แก้ข้อมูล. ตรรกะทั้งหมดอยู่ใน `computeNetWorth` (pure); ที่นี่แค่
 * เรียก selector, memoize, แล้วประกอบ label ไทย + note ให้ NetWorthColumn.
 */
import { useMemo, type ReactNode } from 'react';

import NetWorthColumn, {
  type NetWorthRow,
} from '@/components/wealth/NetWorthColumn';
import NetWorthHero from '@/components/wealth/NetWorthHero';
import { useResolvedLoans } from '@/hooks/useFinanceData';
import { useFinanceStore } from '@/stores/financeStore';
import { selectGoldSummary, selectInstallmentPlans } from '@/stores/selectors';
import type { SavingsCategory } from '@/types';
import { computeNetWorth, type NetWorthLine } from '@/utils/netWorth';

/** ข้อความไทยของหมวดออม — util คืน `category` (stable key) ไม่ใช่ข้อความ. */
const SAVINGS_CATEGORY_LABELS: Record<SavingsCategory, string> = {
  'investment-dime': 'ลงทุน Dime',
  travel: 'ออมเที่ยว',
  emergency: 'เงินฉุกเฉิน',
  retirement: 'เกษียณ',
  general: 'ออมทั่วไป',
  gold: 'ทองคำ',
};

export const WealthPage = (): ReactNode => {
  const data = useFinanceStore((s) => s.data);
  const loans = useResolvedLoans();

  const snapshot = useMemo(() => ({ data }), [data]);
  const gold = useMemo(() => selectGoldSummary(snapshot), [snapshot]);
  const plans = useMemo(() => selectInstallmentPlans(snapshot), [snapshot]);

  const breakdown = useMemo(
    () =>
      computeNetWorth(
        data,
        { marketValue: gold.marketValue, totalInvested: gold.totalInvested },
        loans,
        plans,
      ),
    [data, gold, loans, plans],
  );

  const assetRows = useMemo<NetWorthRow[]>(() => {
    const amountOf = (key: NetWorthLine['key']): number =>
      breakdown.assets.find((l) => l.key === key)?.amount ?? 0;
    const goldLine = breakdown.assets.find((l) => l.key === 'gold');

    return [
      {
        key: 'bank',
        label: 'บัญชีธนาคาร',
        amount: amountOf('bank'),
        note: 'ยอดสะสมทุกปี',
      },
      {
        key: 'gold',
        label: 'ทองคำ',
        amount: amountOf('gold'),
        note: goldLine?.isCostBasis
          ? 'ราคาทุน — ยังไม่ได้ตั้งราคาทองวันนี้'
          : 'ราคาตลาดวันนี้',
      },
      {
        key: 'savings',
        label: 'เงินออม',
        amount: amountOf('savings'),
        note: 'เงินที่ใส่ไป ไม่ใช่มูลค่าปัจจุบัน',
        details: breakdown.savingsByCategory.map((s) => ({
          key: s.category,
          label: SAVINGS_CATEGORY_LABELS[s.category],
          amount: s.amount,
        })),
      },
    ];
  }, [breakdown]);

  const liabilityRows = useMemo<NetWorthRow[]>(() => {
    const amountOf = (key: NetWorthLine['key']): number =>
      breakdown.liabilities.find((l) => l.key === key)?.amount ?? 0;

    return [
      {
        key: 'loans',
        label: 'หนี้ระยะยาว',
        amount: amountOf('loans'),
        note: 'เงินต้นคงเหลือ ไม่รวมดอกเบี้ยงวดอนาคต',
        details: breakdown.loanDetails.map((l) => ({
          key: l.id,
          label: l.name,
          amount: l.principalRemaining,
        })),
      },
      {
        key: 'installments',
        label: 'ผ่อนของ',
        amount: amountOf('installments'),
        note: 'ยอดคงเหลือทุกแผน',
      },
    ];
  }, [breakdown]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">💎 ความมั่งคั่ง</h1>
        <p className="text-sm text-ink-500 mt-1">
          สินทรัพย์ − หนี้ = เงินที่เป็นของคุณจริงๆ
        </p>
      </div>

      <NetWorthHero
        netWorth={breakdown.netWorth}
        totalAssets={breakdown.totalAssets}
        totalLiabilities={breakdown.totalLiabilities}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <NetWorthColumn
          title="สินทรัพย์"
          tone="asset"
          rows={assetRows}
          total={breakdown.totalAssets}
        />
        <NetWorthColumn
          title="หนี้"
          tone="liability"
          rows={liabilityRows}
          total={breakdown.totalLiabilities}
        />
      </div>
    </div>
  );
};

export default WealthPage;
