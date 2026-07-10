/**
 * Verification: ลบหนี้ / ลบรายการโปะ ต้องคืนยอดบัญชีของรายจ่ายที่ผูกไว้
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-loan-expense-revert.ts
 *
 * บั๊ก (แพทเทิร์นเดียวกับ deleteIncome/deleteBankAccount): `deleteLoan` และ
 * `deleteExtraPayment` ลบ ExpenseItem ที่ตัวเองสร้างไว้ด้วยการ `filter(row.items)`
 * ตรง ๆ — ไม่ผ่าน `reconcileExpenseLedger` ต่างจาก `deleteExpense` ที่ทำถูก
 *
 * ผล: รายจ่ายที่ผูกบัญชีจ่าย (F34) ถูกลบ แต่ยอดที่หักไปไม่ถูกคืน และเหลือ
 * bankTransaction กำพร้าชี้ expenseId ที่ไม่มีอยู่ — ผู้ใช้ลบเองไม่ได้เพราะ
 * `deleteBankTransaction` ปฏิเสธรายการที่ `source.type === 'expense'`
 */
import type { WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const run = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const s = useFinanceStore;

  const setup = (): void =>
    s.setState((st) => ({
      data: {
        ...st.data,
        bankAccounts: [{ id: 'acc', name: 'กสิกร', balances: { '2026': { '7': 100000 } } }],
        bankTransactions: [],
        years: {},
        loans: [
          {
            id: 'loan1', name: 'กยศ', type: 'gsl', principal: 100000,
            startDate: '2026-01-01', schedule: [], extraPayments: [],
          },
        ],
      } as WealthLensData,
    }));

  const bal = (): number =>
    s.getState().data.bankAccounts?.find((a) => a.id === 'acc')?.balances['2026']?.['7'] ?? 0;
  const txCount = (): number => (s.getState().data.bankTransactions ?? []).length;
  /** bankTransaction ที่ source ชี้ expenseId ที่ไม่มีอยู่แล้ว */
  const orphanTx = (): number => {
    const d = s.getState().data;
    return (d.bankTransactions ?? []).filter((t) => {
      if (t.source.type !== 'expense') return false;
      const { expenseId } = t.source;
      return !Object.values(d.years).some((y) =>
        y.expenses.some((m) => m.items.some((i) => i.id === expenseId)),
      );
    }).length;
  };

  /** เพิ่มโปะพร้อมสร้างรายจ่าย แล้วผูกบัญชีจ่าย (สิ่งที่ผู้ใช้ทำได้ผ่าน ExpenseList) */
  const addExtraWithPayment = (amount: number): string => {
    s.getState().addExtraPayment('loan1', {
      date: '2026-07-15', amount, createExpenseEntry: true,
    } as never);
    const item = s.getState().data.years['2026'].expenses.flatMap((m) => m.items)[0];
    s.getState().updateExpense(2026, 7, item.id, { paymentAccountId: 'acc' });
    return s.getState().data.loans![0].extraPayments[0].id;
  };

  // ===================================================================
  // Task 1 — deleteExtraPayment คืนยอด + ไม่ทิ้งรายการกำพร้า
  // ===================================================================
  setup();
  const extraId = addExtraWithPayment(5000);
  eq('ตั้งต้น: หักจากบัญชี 5,000', bal(), 95000);
  eq('ตั้งต้น: มีบรรทัดในสมุด 1', txCount(), 1);

  s.getState().deleteExtraPayment('loan1', extraId, { revertExpenseSideEffect: true });
  eq('ลบโปะ → คืนยอดบัญชี', bal(), 100000);
  eq('ลบโปะ → ไม่เหลือบรรทัดของรายจ่ายนั้น', txCount(), 0);
  eq('ลบโปะ → ไม่มีรายการกำพร้า', orphanTx(), 0);
  eq('ลบโปะ → รายการโปะหายจากหนี้', s.getState().data.loans![0].extraPayments.length, 0);

  // ===================================================================
  // Task 2 — deleteLoan คืนยอดของทุกรายการโปะที่ผูกไว้
  // ===================================================================
  setup();
  addExtraWithPayment(3000);
  eq('ตั้งต้น: หัก 3,000', bal(), 97000);

  s.getState().deleteLoan('loan1', { revertExpenseSideEffects: true });
  eq('ลบหนี้ → คืนยอดบัญชี', bal(), 100000);
  eq('ลบหนี้ → ไม่เหลือบรรทัด', txCount(), 0);
  eq('ลบหนี้ → ไม่มีรายการกำพร้า', orphanTx(), 0);
  eq('ลบหนี้ → หนี้หาย', (s.getState().data.loans ?? []).length, 0);

  // ===================================================================
  // Task 3 — revert = false: ผู้ใช้เลือกเก็บรายจ่ายไว้ → ยอดต้องไม่ขยับ
  // (รายจ่ายยังอยู่ บรรทัดยังอยู่ ไม่ใช่กำพร้า)
  // ===================================================================
  setup();
  const extraId3 = addExtraWithPayment(5000);
  s.getState().deleteExtraPayment('loan1', extraId3, { revertExpenseSideEffect: false });
  eq('ไม่ revert → รายจ่ายยังอยู่ ยอดยังหักอยู่', bal(), 95000);
  eq('ไม่ revert → บรรทัดยังอยู่', txCount(), 1);
  eq('ไม่ revert → ไม่ใช่รายการกำพร้า', orphanTx(), 0);

  // ===================================================================
  // Task 4 — รายจ่ายที่ไม่ผูกบัญชี → ลบได้ ยอดไม่ขยับ ไม่พัง
  // ===================================================================
  setup();
  s.getState().addExtraPayment('loan1', {
    date: '2026-07-15', amount: 2000, createExpenseEntry: true,
  } as never);
  const extraId4 = s.getState().data.loans![0].extraPayments[0].id;
  eq('ไม่ผูกบัญชี → ยอดไม่ขยับ', bal(), 100000);
  s.getState().deleteExtraPayment('loan1', extraId4, { revertExpenseSideEffect: true });
  eq('ลบโปะที่ไม่ผูกบัญชี → ยอดคงเดิม', bal(), 100000);
  eq('ลบโปะที่ไม่ผูกบัญชี → ไม่มีบรรทัด', txCount(), 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
