/**
 * Verification: รายจ่ายรุ่นเก่า (มี sideEffects แต่ไม่มีบรรทัดในสมุด) ลบ/แก้แล้ว
 * ยอดบัญชีต้องถูกต้อง — เส้นทางเดียวกับ gold fallback (addRawBalance)
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-legacy-expense-deduction.ts
 *
 * บั๊ก: reconcileExpenseLedger revoke ด้วยบรรทัดที่ "มีจริง" — รายจ่ายที่เขียน
 * ช่วง F34→F40 มี paymentAccountId + sideEffects (หักยอดนอกสมุดไปแล้ว) แต่ไม่มี
 * bankTransaction ให้ revoke → ลบ = เงินไม่คืน, แก้ = หักซ้ำ. ทองมี addRawBalance
 * รับเคสนี้ รายจ่ายไม่มี (จนงานนี้)
 *
 * legacy expense = pointer ที่ referential check ผ่าน (accountId ชี้บัญชีที่มีจริง)
 * จึง import เข้าได้ — ต้องกันที่ mutation ด้วย ไม่ใช่แค่ import
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
  const bal = (): number =>
    s.getState().data.bankAccounts?.find((a) => a.id === 'acc')?.balances['2026']?.['7'] ?? 0;
  const bal2 = (id: string, m: number): number =>
    s.getState().data.bankAccounts?.find((a) => a.id === id)?.balances['2026']?.[String(m)] ?? 0;
  const txCount = (): number => (s.getState().data.bankTransactions ?? []).length;
  const txSum = (id: string, m: number): number =>
    (s.getState().data.bankTransactions ?? [])
      .filter((t) => t.accountId === id && t.year === 2026 && t.month === m)
      .reduce((a, t) => a + t.amount, 0);
  const mismatches = (): number => {
    const d = s.getState().data;
    const cells = new Map<string, number>();
    for (const t of d.bankTransactions ?? []) {
      const k = `${t.accountId}|${t.year}|${t.month}`;
      cells.set(k, (cells.get(k) ?? 0) + t.amount);
    }
    let bad = 0;
    for (const [k, sum] of cells) {
      const [id, y, m] = k.split('|');
      const b = d.bankAccounts?.find((a) => a.id === id)?.balances?.[y]?.[m] ?? 0;
      if (Math.round(b * 100) !== Math.round(sum * 100)) bad += 1;
    }
    return bad;
  };

  /** สภาพ F34→F40: รายจ่ายมี sideEffects (หักนอกสมุด) แต่ยังไม่มีบรรทัด */
  const seedLegacy = (accounts: WealthLensData['bankAccounts']): void =>
    s.setState((st) => ({
      data: {
        ...st.data,
        bankAccounts: accounts,
        bankTransactions: [],
        years: {
          '2026': {
            income: [], savings: [],
            expenses: [{
              month: 7,
              items: [{
                id: 'e1', category: 'other', name: 'ของ', amount: 1200, isRecurring: false,
                paymentAccountId: 'acc',
                sideEffects: { accountId: 'acc', deductYear: 2026, deductMonth: 7, deductAmount: 1200 },
              }],
            }],
          },
        },
      } as WealthLensData,
    }));

  const oneAcct = (): WealthLensData['bankAccounts'] => [
    { id: 'acc', name: 'A', balances: { '2026': { '7': 10000 } } },
  ];

  // ===================================================================
  // Task 1 — ลบ legacy expense → คืนยอดนอกสมุด
  // ===================================================================
  seedLegacy(oneAcct());
  eq('ตั้งต้น: ยอดสะท้อนหัก 1,200 แล้ว', bal(), 10000);
  eq('ตั้งต้น: ไม่มีบรรทัด', txCount(), 0);
  s.getState().deleteExpense(2026, 7, 'e1');
  eq('ลบ legacy → คืนเงิน (11,200)', bal(), 11200);
  eq('ลบ legacy → ไม่เกิดบรรทัดลอย', txCount(), 0);
  eq('ลบ legacy → invariant ตรง', mismatches(), 0);

  // ===================================================================
  // Task 2 — แก้ยอด legacy 1,200 → 2,000 (หักเพิ่ม 800 สุทธิ)
  //   คืนของเก่านอกสมุด (+1,200) แล้วหักใหม่ผ่านบรรทัด (−2,000) = 9,200
  // ===================================================================
  seedLegacy(oneAcct());
  s.getState().updateExpense(2026, 7, 'e1', { amount: 2000 });
  eq('แก้ 1200→2000 → ยอด 9,200 (ไม่หักซ้ำ)', bal(), 9200);
  eq('แก้ legacy → เกิดบรรทัดใหม่ 1 (−2,000)', txCount(), 1);
  // เซลล์กลายเป็น "ผสม": opening (นอกสมุด) + บรรทัดใหม่. F40 รองรับด้วยบรรทัด
  // virtual "ยอดก่อนมีรายการ" — Σtx=balance strict ยกเว้นเซลล์ผสม. พิสูจน์แทน
  // ว่าเงินไม่หาย: balance − Σtx = opening ที่คาดหวัง (11,200 = 10,000 + คืน 1,200)
  eq('แก้ legacy → opening ถูก (เงินไม่หาย)', bal() - txSum('acc', 7), 11200);

  // ===================================================================
  // Task 3 — ย้ายบัญชี legacy: acc → acc2
  //   คืน acc นอกสมุด (+1,200) แล้วหัก acc2 ผ่านบรรทัด (−1,200)
  // ===================================================================
  seedLegacy([
    { id: 'acc', name: 'A', balances: { '2026': { '7': 10000 } } },
    { id: 'acc2', name: 'B', balances: { '2026': { '7': 5000 } } },
  ]);
  s.getState().updateExpense(2026, 7, 'e1', {
    paymentAccountId: 'acc2',
    sideEffects: { accountId: 'acc2', deductYear: 2026, deductMonth: 7, deductAmount: 1200 },
  });
  eq('ย้ายบัญชี → acc คืนเป็น 11,200', bal2('acc', 7), 11200);
  eq('ย้ายบัญชี → acc2 หักเหลือ 3,800', bal2('acc2', 7), 3800);
  // acc เป็นเซลล์ผสม (opening 11,200 คืนแล้ว ไม่มีบรรทัดเหลือ); acc2 มีบรรทัด −1,200
  // opening 5,000. พิสูจน์เงินไม่หายทั้งคู่ผ่าน balance − Σtx = opening
  eq('ย้ายบัญชี → acc opening ถูก', bal2('acc', 7) - txSum('acc', 7), 11200);
  eq('ย้ายบัญชี → acc2 opening ถูก', bal2('acc2', 7) - txSum('acc2', 7), 5000);

  // ===================================================================
  // Task 4 — NORMAL (มีบรรทัด) ต้องไม่ regress: add → delete คืนครบ
  // ===================================================================
  s.setState((st) => ({
    data: { ...st.data, bankAccounts: [{ id: 'acc', name: 'A', balances: {} }], bankTransactions: [], years: {} } as WealthLensData,
  }));
  s.getState().addExpense(2026, 7, {
    id: 'n1', category: 'other', name: 'ปกติ', amount: 500, isRecurring: false, paymentAccountId: 'acc',
  } as never);
  eq('normal: หัก 500', bal(), -500);
  eq('normal: มีบรรทัด 1', txCount(), 1);
  // addExpense สร้าง id เอง — อ่าน id จริงก่อนลบ (ไม่ใช่ 'n1' ที่ส่งไป)
  const realId = s.getState().data.years['2026'].expenses.flatMap((m) => m.items)[0].id;
  s.getState().deleteExpense(2026, 7, realId);
  eq('normal: ลบคืนเป็น 0', bal(), 0);
  eq('normal: บรรทัดหาย', txCount(), 0);

  // ===================================================================
  // Task 5 — รายจ่ายไม่ผูกบัญชี (ไม่มี oldDed ไม่มีบรรทัด) → ไม่แตะยอด
  // ===================================================================
  s.setState((st) => ({
    data: { ...st.data, bankAccounts: [{ id: 'acc', name: 'A', balances: { '2026': { '7': 3000 } } }], bankTransactions: [], years: {
      '2026': { income: [], savings: [], expenses: [{ month: 7, items: [{ id: 'p1', category: 'other', name: 'ไม่ผูก', amount: 100, isRecurring: false }] }] } },
    } as WealthLensData,
  }));
  s.getState().deleteExpense(2026, 7, 'p1');
  eq('ไม่ผูกบัญชี: ลบแล้วยอดคงเดิม', bal(), 3000);
  eq('ไม่ผูกบัญชี: ไม่เกิดบรรทัด', txCount(), 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
