/**
 * Store-level integration test for F35 installment deduction.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-installment-deduction.ts
 * Shims localStorage first, then dynamically imports the store so zustand
 * persist creates cleanly in node.
 */
let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- localStorage shim (must be set BEFORE importing the store) ---
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
  const s = () => useFinanceStore.getState();
  const bal = (id: string, y: number, m: number): number =>
    (s().data.bankAccounts ?? []).find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;

  const acctId = s().addBankAccount('เทสต์');

  // 3-งวด plan, 2500 total → perInstallment round2(2500/3)=833.33, last=833.34
  const planId = s().addInstallmentPlan({
    name: 'ผ่อนเทส',
    category: 'other',
    totalAmount: 2500,
    totalMonths: 3,
    startYear: 2026,
    startMonth: 7,
    paymentAccountId: acctId,
  });

  eq('งวด1 ก.ค. หัก', bal(acctId, 2026, 7), -833.33);
  eq('งวด2 ส.ค. หัก', bal(acctId, 2026, 8), -833.33);
  eq('งวด3 ก.ย. หัก (เศษ)', bal(acctId, 2026, 9), -833.34);

  // งวด rows carry paymentAccountId + sideEffects
  const jul = s().data.years['2026'].expenses.find((e) => e.month === 7)!.items.find((it) => it.installment?.planId === planId)!;
  eq('งวด มี paymentAccountId', jul.paymentAccountId, acctId);
  eq('งวด มี sideEffects.deductAmount', jul.sideEffects?.deductAmount, 833.33);

  // delete plan → all reverted to 0
  s().deleteInstallmentPlan(planId);
  eq('ลบแผน คืน ก.ค.', bal(acctId, 2026, 7), 0);
  eq('ลบแผน คืน ส.ค.', bal(acctId, 2026, 8), 0);
  eq('ลบแผน คืน ก.ย.', bal(acctId, 2026, 9), 0);

  // plan WITHOUT account → no deduction
  const acct2 = s().addBankAccount('เทส2');
  s().addInstallmentPlan({ name: 'ผ่อนไม่หัก', category: 'other', totalAmount: 900, totalMonths: 3, startYear: 2027, startMonth: 1 });
  eq('ไม่เลือกบัญชี → ไม่หัก', bal(acct2, 2027, 1), 0);

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
};
void run();
