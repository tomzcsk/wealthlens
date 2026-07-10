/**
 * Verification for the deleteIncome ledger gap.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-delete-income.ts
 *
 * บั๊ก: `deleteIncome` กรองแถวรายได้ทิ้งอย่างเดียว ไม่ revert เงินฝากที่
 * `addIncome` เขียนผ่าน `withLedger` → เงินค้างในบัญชี + เหลือรายการเดินบัญชี
 * กำพร้าที่ชี้กลับไปยังแถวที่ไม่มีอยู่แล้ว (ผู้ใช้ลบเองไม่ได้เพราะ
 * `deleteBankTransaction` ปฏิเสธรายการที่มาจากต้นทาง).
 *
 * กฎเหล็กที่ไฟล์นี้ตรึงไว้: ลบรายได้แล้วยอดบัญชีต้องกลับไปเท่ากับก่อนกรอก
 * และสมุดรายการต้องไม่เหลือบรรทัดกำพร้า. เทียบ addIncome/updateIncome ที่
 * reconcile ครบอยู่แล้ว (verify-income-deposit.ts) — ไฟล์นี้คุมขาที่หลุด.
 */
import type { BankAccount, MonthlyIncome } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- localStorage shim (ต้องตั้งก่อน import store) ---
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const baseIncome: MonthlyIncome = {
  month: 7,
  salary: 80000,
  bonus: 50000,
  commission: 0,
  deductions: { tax: 12000, socialSecurity: 750, providentFund: 4000, gsl: 3250 },
};
// ยอดหักรวม = 20,000 → เงินเดือนเข้าบัญชี 60,000

const run = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const store = useFinanceStore;

  const accounts: BankAccount[] = [
    { id: 'acc-salary', name: 'กสิกร', type: 'salary', balances: {} },
    { id: 'acc-cash', name: 'เงินสด', type: 'cash', balances: {} },
  ];
  const reset = (): void =>
    store.setState((s) => ({
      data: {
        ...s.data,
        bankAccounts: accounts.map((a) => ({ ...a, balances: {} })),
        bankTransactions: [],
        years: {},
      },
    }));

  const bal = (id: string, y: number, m: number): number =>
    store.getState().data.bankAccounts?.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ??
    0;
  const txs = () => store.getState().data.bankTransactions ?? [];

  /** บรรทัดที่ source ชี้ไปยังแถวรายได้ที่ไม่มีอยู่แล้ว = กำพร้า */
  const orphanIncomeTxCount = (): number =>
    txs().filter((tx) => {
      if (tx.source.type !== 'income') return false;
      const rows = store.getState().data.years[String(tx.source.year)]?.income ?? [];
      return !rows.some((i) => i.month === tx.source.month);
    }).length;

  /** invariant F40: ทุก (บัญชี, ปี, เดือน) ที่มีรายการ → Σ tx.amount === balance */
  const ledgerMismatches = (): number => {
    const cells = new Map<string, number>();
    for (const tx of txs()) {
      const k = `${tx.accountId}|${tx.year}|${tx.month}`;
      cells.set(k, (cells.get(k) ?? 0) + tx.amount);
    }
    let bad = 0;
    for (const [k, sum] of cells) {
      const [id, y, m] = k.split('|');
      if (bal(id, Number(y), Number(m)) !== sum) bad += 1;
    }
    return bad;
  };

  const deposits = { salary: 'acc-salary', bonus: 'acc-cash' } as const;

  // ===================================================================
  // Task 1 — ลบรายได้ที่ฝากเงินไว้ → คืนยอด + ไม่เหลือรายการกำพร้า
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, deposits: { ...deposits } });
  eq('ตั้งต้น: ฝากเงินเดือน 60,000', bal('acc-salary', 2026, 7), 60000);
  eq('ตั้งต้น: ฝากโบนัส 50,000', bal('acc-cash', 2026, 7), 50000);
  eq('ตั้งต้น: มีรายการเดินบัญชี 2 บรรทัด', txs().length, 2);

  store.getState().deleteIncome(2026, 7);
  eq('ลบรายได้ → แถวรายได้หาย', store.getState().data.years['2026'].income.length, 0);
  eq('ลบรายได้ → คืนยอดบัญชีเงินเดือน', bal('acc-salary', 2026, 7), 0);
  eq('ลบรายได้ → คืนยอดเงินสด', bal('acc-cash', 2026, 7), 0);
  eq('ลบรายได้ → ไม่เหลือรายการเดินบัญชีของรายได้นั้น', txs().length, 0);
  eq('ลบรายได้ → ไม่มีรายการกำพร้า', orphanIncomeTxCount(), 0);
  eq('ลบรายได้ → invariant สมุดรายการยังตรง', ledgerMismatches(), 0);

  // ===================================================================
  // Task 2 — คืนด้วยยอดที่ "เคยฝากจริง" ไม่ใช่คำนวณใหม่
  // (บทเรียน F34/F39: recompute แล้วส่วนต่างค้างถาวร)
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, deposits: { ...deposits } });
  // แก้เงินเดือนหลังฝาก: 80,000 → 90,000 (ฝากจริงกลายเป็น 70,000)
  store.getState().addIncome(2026, { ...baseIncome, salary: 90000, deposits: { ...deposits } });
  eq('หลังแก้: ฝากจริง 70,000', bal('acc-salary', 2026, 7), 70000);
  store.getState().deleteIncome(2026, 7);
  eq('คืนด้วยยอดที่ลงจริง → บัญชีกลับเป็น 0', bal('acc-salary', 2026, 7), 0);

  // ===================================================================
  // Task 3 — เดือนอื่นและบัญชีอื่นต้องไม่ถูกแตะ
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, month: 6, deposits: { ...deposits } });
  store.getState().addIncome(2026, { ...baseIncome, month: 7, deposits: { ...deposits } });
  store.getState().deleteIncome(2026, 7);
  eq('ลบ ก.ค. → มิ.ย. ยังอยู่', store.getState().data.years['2026'].income.length, 1);
  eq('ลบ ก.ค. → ยอด มิ.ย. ไม่ขยับ', bal('acc-salary', 2026, 6), 60000);
  eq('ลบ ก.ค. → ยอด ก.ค. คืนเป็น 0', bal('acc-salary', 2026, 7), 0);
  eq('ลบ ก.ค. → เหลือรายการของ มิ.ย. เท่านั้น', txs().length, 2);
  eq('ลบ ก.ค. → ไม่มีกำพร้า', orphanIncomeTxCount(), 0);

  // ===================================================================
  // Task 4 — เงินถูกใช้ไปแล้ว → คืนแล้วยอดติดลบได้ ไม่ clamp
  // (ตัดสินใจไว้: revert เงียบ ๆ ดีกว่าล็อกผู้ใช้ไว้กับข้อมูลผิด)
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, deposits: { salary: 'acc-salary' } });
  store.getState().withdrawBank('acc-salary', 2026, 7, 60000, 'ใช้จ่าย');
  eq('ถอนหมด → ยอด 0', bal('acc-salary', 2026, 7), 0);
  store.getState().deleteIncome(2026, 7);
  eq('ลบรายได้ที่ใช้เงินไปแล้ว → ติดลบได้ ไม่ clamp', bal('acc-salary', 2026, 7), -60000);
  eq('ยอดถอนยังอยู่ในสมุด', txs().length, 1);
  eq('invariant ยังตรงแม้ติดลบ', ledgerMismatches(), 0);

  // ===================================================================
  // Task 5 — backward-compat: รายได้เก่าที่ไม่มี deposits → ไม่แตะบัญชี
  // ===================================================================
  reset();
  store.getState().setBankBalance('acc-salary', 2026, 7, 12345);
  store.getState().addIncome(2026, baseIncome); // ไม่มี deposits
  store.getState().deleteIncome(2026, 7);
  eq('รายได้ไม่มี deposits → ยอดบัญชีไม่ขยับ', bal('acc-salary', 2026, 7), 12345);

  // ===================================================================
  // Task 6 — เคสขอบ: ลบเดือน/ปีที่ไม่มีอยู่ → ไม่ throw ไม่พังยอด
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, deposits: { ...deposits } });
  store.getState().deleteIncome(2026, 11); // เดือนที่ไม่มีแถว
  eq('ลบเดือนที่ไม่มีแถว → ยอดคงเดิม', bal('acc-salary', 2026, 7), 60000);
  store.getState().deleteIncome(2099, 1); // ปีที่ไม่มี
  eq('ลบปีที่ไม่มี → ยอดคงเดิม', bal('acc-salary', 2026, 7), 60000);
  eq('ลบซ้ำไม่พัง invariant', ledgerMismatches(), 0);

  // ===================================================================
  // Task 7 — ลบซ้ำ (idempotent) → ไม่คืนเงินสองรอบ
  // ===================================================================
  reset();
  store.getState().addIncome(2026, { ...baseIncome, deposits: { salary: 'acc-salary' } });
  store.getState().deleteIncome(2026, 7);
  store.getState().deleteIncome(2026, 7);
  eq('ลบซ้ำ → ไม่คืนเงินซ้ำ (ไม่ติดลบ)', bal('acc-salary', 2026, 7), 0);

  console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
