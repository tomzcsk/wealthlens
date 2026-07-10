import type { WealthLensData } from '../types';

/**
 * ทุกสิ่งที่ชี้มายังบัญชีหนึ่ง — แยกเป็นสองพวกโดยเจตนา:
 *
 *  - **ต้นทางนอกบัญชี** (`incomeMonths` / `expenses` / `goldHoldings` / `transfers`)
 *    ลบบัญชีทิ้งแล้ว pointer เหล่านี้ค้างชี้ id ที่ไม่มีอยู่. `applyBankDelta`
 *    หาบัญชีไม่เจอก็เงียบ (คืน array เดิม) → แก้รายได้ทีหลังเงินหายไปโดยไม่มี error.
 *    จึงต้อง **ปฏิเสธการลบ** แล้วให้ผู้ใช้ไปถอดการผูกเองก่อน
 *
 *  - **บรรทัดที่บัญชีเป็นเจ้าของเอง** (`ownTransactions`: manual/adjustment/backfill)
 *    ไม่มีใครนอกบัญชีอ้างถึง → กวาดทิ้งพร้อมบัญชีได้ ไม่เหลือกำพร้า
 *
 * ขาโอน (`transfer`) นับเป็นต้นทางนอกบัญชี เพราะขาคู่ของมันอยู่อีกบัญชีหนึ่ง —
 * ลบข้างเดียวแล้วเงินรวมทั้งระบบไม่คงที่
 */
export interface BankAccountUsage {
  /** เดือนที่มีรายได้ฝากเข้าบัญชีนี้ (deposits หรือ depositSideEffects). */
  incomeMonths: readonly { year: number; month: number }[];
  /** id ของรายจ่ายที่จ่ายผ่านบัญชีนี้. */
  expenses: readonly string[];
  /** id ของ gold holding ที่ตัดยอดบัญชีนี้. */
  goldHoldings: readonly string[];
  /** จำนวนขาโอนที่คู่กับบัญชีอื่น. */
  transfers: number;
  /** บรรทัดที่บัญชีเป็นเจ้าของเอง — กวาดทิ้งพร้อมบัญชีได้. */
  ownTransactions: number;
}

const INCOME_FIELDS = ['salary', 'bonus', 'commission', 'otherIncome'] as const;

export const findBankAccountUsage = (
  data: WealthLensData,
  accountId: string,
): BankAccountUsage => {
  const incomeMonths: { year: number; month: number }[] = [];
  const expenses: string[] = [];
  const goldHoldings: string[] = [];
  let transfers = 0;
  let ownTransactions = 0;

  for (const [yearKey, year] of Object.entries(data.years)) {
    for (const income of year.income) {
      const targeted = INCOME_FIELDS.some((f) => income.deposits?.[f] === accountId);
      const deposited = income.depositSideEffects?.some((ref) => ref.accountId === accountId);
      if (targeted || deposited) {
        incomeMonths.push({ year: Number(yearKey), month: income.month });
      }
    }
    for (const month of year.expenses) {
      for (const item of month.items) {
        if (item.paymentAccountId === accountId || item.sideEffects?.accountId === accountId) {
          expenses.push(item.id);
        }
      }
    }
  }

  for (const holding of data.goldHoldings ?? []) {
    if (holding.sideEffects?.accountId === accountId) goldHoldings.push(holding.id);
  }

  for (const tx of data.bankTransactions ?? []) {
    if (tx.accountId !== accountId) continue;
    if (tx.source.type === 'transfer') transfers += 1;
    else ownTransactions += 1;
  }

  return { incomeMonths, expenses, goldHoldings, transfers, ownTransactions };
};

/** ลบได้ก็ต่อเมื่อไม่มีต้นทางนอกบัญชีชี้มาเลย. */
export const isBankAccountDeletable = (data: WealthLensData, accountId: string): boolean => {
  const usage = findBankAccountUsage(data, accountId);
  return (
    usage.incomeMonths.length === 0 &&
    usage.expenses.length === 0 &&
    usage.goldHoldings.length === 0 &&
    usage.transfers === 0
  );
};
