/**
 * WealthLens — net worth ย้อนหลังรายเดือน (F48).
 *
 * F38 ทำ "ความมั่งคั่ง ณ วันนี้" ไว้แล้ว (utils/netWorth.ts) และเขียนไว้ตรง ๆ ว่า
 * กราฟย้อนหลัง = นอก scope. ไฟล์นี้คือส่วนนั้น
 *
 * ── ความจริงข้อเดียวที่ทั้งไฟล์นี้ตั้งอยู่บนมัน ──
 * BankAccount.balances[ปี][เดือน] คือ **กระแสเงินของเดือนนั้น** ไม่ใช่ยอดคงเหลือ
 * (accountAllTimeTotal() บวกทุกเดือนเข้าด้วยกัน; F40 invariant: Σ tx = ค่าในช่อง)
 * → ยอด ณ เดือน M = ผลรวมสะสมทุกเดือน ≤ M
 * → เดือนที่ไม่มีตัวเลข = เงินไม่ขยับ ยอดคงเดิมเอง ไม่ต้อง carry-forward
 *
 * ── กฎไม่ให้กราฟโกหก ──
 * บัญชีที่เพิ่งเริ่มบันทึกจะทำให้เส้นกระโดด ทั้งที่เงินนั้นมีอยู่มาตลอด
 * (ของจริง: Tom เพิ่ม 5 บัญชีพร้อมกันใน ก.ค. 2026, เงินสด ฿150,000)
 * เดือนแบบนั้นติดธง isTrackingJump และ growthBetween() ที่คร่อมมันคืน null —
 * โชว์ "+38%" ทั้งที่แค่เปลี่ยนวิธีนับ คือการโกหกด้วยตัวเลขจริง
 *
 * ── ผูกกับของเดิม (G1) ──
 * จุดสุดท้ายของอนุกรมต้องเท่ากับ computeNetWorth() ที่หน้า /wealth ใช้อยู่ เป๊ะ
 * จึงต้องเดินตามกติกาเดียวกันทุกข้อ: ตัดหมวดออม 'gold' ทิ้ง (ทองนับจาก ledger
 * ทางเดียว), หนี้ใช้เงินต้นคงเหลือ, ผ่อนใช้ยอดเต็ม − งวดที่จ่ายแล้ว
 *
 * pure: ไม่ import React/Zustand — ทดสอบใน node ได้
 * (type-only import ของ InstallmentPlanSummary ไม่ใช่ runtime dependency)
 */
import type { BankAccount, GoldHolding, Loan, WealthLensData } from '@/types';
import type { InstallmentPlanSummary } from '@/stores/selectors';
import { getPrincipalRemaining } from '@/utils/loanCalculations';
import {
  endOfMonth,
  monthsIn,
  toYm,
  ymLte,
  type Ym,
} from '@/utils/monthRange';

export interface NetWorthPoint {
  ym: Ym;
  assets: number;
  debts: number;
  /** ติดลบได้ ห้าม clamp (กฎเดิม F38/F44) */
  netWorth: number;
  /** กี่บัญชีที่มีข้อมูลถึงเดือนนี้ — ใช้บอกว่าเส้นช่วงนั้น "ครอบคลุมแค่ไหน" */
  accountsCovered: number;
  /** เดือนนี้มีบัญชีใหม่โผล่ครั้งแรก → เส้นกระโดดเพราะวิธีนับเปลี่ยน ไม่ใช่เพราะรวยขึ้น */
  isTrackingJump: boolean;
  newAccounts: string[];
  /** ทองคิดด้วยราคาทุน (ยังไม่รู้ราคาตลาดของเดือนนั้น) */
  goldIsCostBasis: boolean;
}

/** เดือนแรกที่บัญชีนี้มีตัวเลข — ก่อนหน้านั้นถือว่าบัญชียังไม่มีตัวตนในข้อมูล */
const firstMonthOf = (account: BankAccount): Ym | null => {
  const all: Ym[] = [];
  for (const [year, months] of Object.entries(account.balances ?? {})) {
    for (const month of Object.keys(months)) {
      all.push(toYm(Number(year), Number(month)));
    }
  }
  return all.length === 0 ? null : all.sort()[0];
};

/**
 * ผลรวมสะสมของทุกบัญชีถึงเดือน ym
 * (เดือนสุดท้ายของอนุกรม → ต้องเท่ากับ sumBankAllTime() ที่ /wealth ใช้ — G1)
 */
const bankTotalAsOf = (accounts: readonly BankAccount[], ym: Ym): number => {
  let total = 0;
  for (const account of accounts) {
    for (const [year, months] of Object.entries(account.balances ?? {})) {
      for (const [month, amount] of Object.entries(months)) {
        if (ymLte(toYm(Number(year), Number(month)), ym)) total += amount;
      }
    }
  }
  return total;
};

/** เงินออมสะสม (ทุกหมวด ยกเว้นทอง — ทองนับจาก ledger ราคาตลาด, กฎเดิม F38) */
const savingsAsOf = (years: WealthLensData['years'], ym: Ym): number => {
  let total = 0;
  for (const [year, yearData] of Object.entries(years)) {
    for (const row of yearData.savings ?? []) {
      if (!ymLte(toYm(Number(year), row.month), ym)) continue;
      for (const item of row.items ?? []) {
        if (item.category === 'gold') continue;
        total += item.amount;
      }
    }
  }
  return total;
};

/**
 * ทองที่ถืออยู่ ณ สิ้นเดือน ym (ซื้อแล้ว และยังไม่ขาย ณ ตอนนั้น)
 *
 * การขายเก็บที่ `holding.sold?: GoldSaleRecord` (มี `soldDate`, `soldPrice`)
 * ไม่ใช่ field `soldDate` บนตัว holding ตรง ๆ — ถ้าลืมกรองตัวที่ขายไปแล้ว
 * ทองก้อนนั้นจะอยู่ในสินทรัพย์ตลอดกาลทั้งที่ขายไปแล้ว
 */
const goldHeldAsOf = (holdings: readonly GoldHolding[], ym: Ym): GoldHolding[] =>
  holdings.filter((h) => {
    if (!ymLte(h.purchaseDate.slice(0, 7), ym)) return false; // ยังไม่ได้ซื้อ
    const sold = h.sold?.soldDate;
    if (sold && ymLte(sold.slice(0, 7), ym)) return false; // ขายไปแล้ว ณ เดือนนั้น
    return true;
  });

/**
 * ยอดผ่อนคงเหลือ ณ สิ้นเดือน ym = ยอดเต็ม − งวดที่จ่ายไปแล้วถึงเดือนนั้น
 * (สูตรเดียวกับ remainingAmount ใน selectors.ts — แค่เปลี่ยนเส้นตัดเป็นเดือน ym)
 */
const installmentsRemainingAsOf = (
  plans: readonly InstallmentPlanSummary[],
  ym: Ym,
): number =>
  plans.reduce((total, plan) => {
    const paid = plan.instances
      .filter((i) => ymLte(toYm(i.year, i.month), ym))
      .reduce((s, i) => s + i.amount, 0);
    return total + Math.max(0, plan.totalAmount - paid);
  }, 0);

/**
 * @param goldPriceAt ราคาทอง (฿ ต่อ 1 บาททอง) ณ เดือนนั้น — คืน null เมื่อไม่รู้
 *                    (goldPriceHistory ของ Tom มีแต่ snapshot ใหม่ ๆ เดือนเก่าจึงไม่มีราคา)
 */
export const buildNetWorthHistory = (
  data: WealthLensData,
  goldPriceAt: (ym: Ym) => number | null,
  resolvedLoans: readonly Loan[],
  installmentPlans: readonly InstallmentPlanSummary[],
): NetWorthPoint[] => {
  const accounts = data.bankAccounts ?? [];
  const holdings = data.goldHoldings ?? [];

  // เดือนแรกของแต่ละบัญชี → ใช้ทั้งนับ coverage และหาจุดกระโดด
  const firstMonths = new Map<string, Ym>();
  for (const account of accounts) {
    const first = firstMonthOf(account);
    if (first) firstMonths.set(account.id, first);
  }

  return monthsIn(data.years).map((ym) => {
    const bank = bankTotalAsOf(accounts, ym);
    const savings = savingsAsOf(data.years, ym);

    const held = goldHeldAsOf(holdings, ym);
    const price = goldPriceAt(ym);
    const usesCostBasis = price === null || price <= 0;
    const gold = usesCostBasis
      ? held.reduce((s, h) => s + h.totalCost, 0)
      : held.reduce((s, h) => s + h.weightBaht * price, 0);

    const asOf = endOfMonth(ym);
    const loanDebt = resolvedLoans.reduce(
      (s, loan) => s + getPrincipalRemaining(loan, asOf),
      0,
    );
    const installmentDebt = installmentsRemainingAsOf(installmentPlans, ym);

    const covered = [...firstMonths.values()].filter((first) => ymLte(first, ym));
    const newAccounts = accounts
      .filter((a) => firstMonths.get(a.id) === ym)
      .map((a) => a.name);

    const assets = bank + gold + savings;
    const debts = loanDebt + installmentDebt;

    return {
      ym,
      assets,
      debts,
      netWorth: assets - debts, // ติดลบได้ ห้าม clamp
      accountsCovered: covered.length,
      isTrackingJump: newAccounts.length > 0,
      newAccounts,
      goldIsCostBasis: held.length > 0 && usesCostBasis,
    };
  });
};

/**
 * % เติบโตระหว่างสองเดือน — **null เมื่อปลายทางเป็นจุดกระโดด**
 * ตัวเลขที่คร่อมการเปลี่ยนวิธีนับ ไม่ได้วัดการเติบโต มันวัดว่าเราเริ่มนับอะไรเพิ่ม
 * (คืน null ด้วยเมื่อฐานเป็น 0 — หารด้วยศูนย์ไม่ได้ และ "โต ∞%" ไม่มีความหมาย)
 */
export const growthBetween = (
  from: NetWorthPoint,
  to: NetWorthPoint,
): number | null => {
  if (to.isTrackingJump) return null;
  if (from.netWorth === 0) return null;
  return (to.netWorth - from.netWorth) / Math.abs(from.netWorth);
};
