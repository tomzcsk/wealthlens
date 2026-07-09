/**
 * WealthLens — ความมั่งคั่งสุทธิ (F38).
 *
 * ประกอบตัวเลขจากทุกหน้าเข้าเป็นคำตอบเดียว: สินทรัพย์ − หนี้.
 *
 * รับ goldValue / resolvedLoans / installmentPlans เป็น argument แทนที่จะ
 * เรียก selector เอง — ฟังก์ชันจึง pure, ไม่ผูก Zustand, และทดสอบได้โดย
 * ไม่ต้องปั้น store (แบบเดียวกับ utils/loanPayments.ts ที่รับ `years`).
 *
 * สองกติกาที่ต้องไม่ลืม:
 *   1. หมวดออม 'gold' ถูกตัดทิ้ง — GoldHolding ที่จ่ายเงินสด dual-write
 *      SavingsItem หมวดนี้ไว้แล้ว นับสองทางจะได้ทองซ้ำ. ทองนับจาก ledger
 *      ทางเดียวเพราะได้ "มูลค่าตลาด" ไม่ใช่ราคาทุน.
 *   2. หนี้ระยะยาวใช้ "เงินต้นคงเหลือ" ไม่ใช่ ต้น+ดอก — ดอกของงวดอนาคต
 *      ยังไม่ใช่ภาระวันนี้ (โปะปิดพรุ่งนี้ก็ไม่ต้องจ่าย).
 *
 * Pure + total: ไม่ throw, ไม่พึ่ง Date.now (referenceDate ส่งเข้ามา).
 */
import type { Loan, SavingsCategory, WealthLensData } from '@/types';
import type { InstallmentPlanSummary } from '@/stores/selectors';
import { sumBankAllTime } from '@/utils/bankAccounts';
import { getPrincipalRemaining } from '@/utils/loanCalculations';

/** หมวดออมที่ ledger ทองคำเป็นเจ้าของอยู่แล้ว — กันนับซ้ำ. */
const GOLD_SAVINGS_CATEGORY: SavingsCategory = 'gold';

export interface NetWorthLine {
  key: 'bank' | 'gold' | 'savings' | 'loans' | 'installments';
  amount: number;
  /** true เมื่อทองใช้ราคาทุนแทนราคาตลาด (ยังไม่ตั้ง spot price). */
  isCostBasis?: boolean;
}

export interface NetWorthLoanDetail {
  id: string;
  name: string;
  principalRemaining: number;
}

export interface NetWorthSavingsDetail {
  category: SavingsCategory;
  amount: number;
}

export interface NetWorthBreakdown {
  assets: NetWorthLine[];
  liabilities: NetWorthLine[];
  totalAssets: number;
  totalLiabilities: number;
  /** assets − liabilities. ติดลบได้ — ห้าม clamp. */
  netWorth: number;
  loanDetails: ReadonlyArray<NetWorthLoanDetail>;
  savingsByCategory: ReadonlyArray<NetWorthSavingsDetail>;
}

export interface GoldValueInput {
  marketValue: number;
  totalInvested: number;
}

/** ผลรวมออมทุกปี/ทุกเดือน แยกตามหมวด — ยกเว้นหมวดทอง. */
const sumSavingsByCategory = (
  years: WealthLensData['years'],
): NetWorthSavingsDetail[] => {
  const totals = new Map<SavingsCategory, number>();
  for (const yearData of Object.values(years)) {
    for (const monthSavings of yearData.savings ?? []) {
      for (const item of monthSavings.items ?? []) {
        if (item.category === GOLD_SAVINGS_CATEGORY) continue;
        totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
      }
    }
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
};

export const computeNetWorth = (
  data: WealthLensData,
  goldValue: GoldValueInput,
  resolvedLoans: readonly Loan[],
  installmentPlans: readonly InstallmentPlanSummary[],
  referenceDate: Date = new Date(),
): NetWorthBreakdown => {
  const bank = sumBankAllTime(data.bankAccounts ?? []);

  // ทอง fallback → ราคาทุน เมื่อยังไม่ตั้ง spot (marketValue = 0) ไม่งั้น
  // ทองทั้งก้อนจะหายไปจากสินทรัพย์.
  const usesCostBasis = goldValue.marketValue <= 0 && goldValue.totalInvested > 0;
  const gold = usesCostBasis ? goldValue.totalInvested : goldValue.marketValue;

  const savingsByCategory = sumSavingsByCategory(data.years);
  const savings = savingsByCategory.reduce((acc, s) => acc + s.amount, 0);

  const assets: NetWorthLine[] = [
    { key: 'bank', amount: bank },
    { key: 'gold', amount: gold, ...(usesCostBasis ? { isCostBasis: true } : {}) },
    { key: 'savings', amount: savings },
  ];

  const loanDetails: NetWorthLoanDetail[] = resolvedLoans.map((loan) => ({
    id: loan.id,
    name: loan.name,
    principalRemaining: getPrincipalRemaining(loan, referenceDate),
  }));
  const loans = loanDetails.reduce((acc, l) => acc + l.principalRemaining, 0);
  const installments = installmentPlans.reduce(
    (acc, p) => acc + Math.max(0, p.remainingAmount),
    0,
  );

  const liabilities: NetWorthLine[] = [
    { key: 'loans', amount: loans },
    { key: 'installments', amount: installments },
  ];

  const totalAssets = assets.reduce((acc, l) => acc + l.amount, 0);
  const totalLiabilities = liabilities.reduce((acc, l) => acc + l.amount, 0);

  return {
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    loanDetails,
    savingsByCategory,
  };
};
