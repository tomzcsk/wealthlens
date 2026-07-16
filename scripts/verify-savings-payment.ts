/**
 * Store-level verification for F53 — savings "จ่ายผ่าน" deduction.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-savings-payment.ts
 * Shims localStorage first, then dynamically imports the store so zustand
 * persist creates cleanly in node (same pattern as verify-installment-deduction).
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
  const { findBankAccountUsage, isBankAccountDeletable } = await import(
    '../src/utils/bankAccountUsage'
  );
  const s = () => useFinanceStore.getState();
  const bal = (id: string, y: number, m: number): number =>
    (s().data.bankAccounts ?? []).find((a) => a.id === id)?.balances[String(y)]?.[
      String(m)
    ] ?? 0;
  const cell = (id: string, y: number, m: number): number | undefined =>
    (s().data.bankAccounts ?? []).find((a) => a.id === id)?.balances[String(y)]?.[
      String(m)
    ];
  const savingsTxs = (savingsId: string) =>
    (s().data.bankTransactions ?? []).filter(
      (tx) => tx.source.type === 'savings' && tx.source.savingsId === savingsId,
    );
  const itemOf = (y: number, m: number, id: string) =>
    s()
      .data.years[String(y)]?.savings.find((r) => r.month === m)
      ?.items.find((it) => it.id === id);
  const lastSavingsId = (y: number, m: number): string => {
    const items =
      s().data.years[String(y)]?.savings.find((r) => r.month === m)?.items ?? [];
    return items[items.length - 1]!.id;
  };

  const acctA = s().addBankAccount('บัญชี A');
  const acctB = s().addBankAccount('บัญชี B');

  // --- 1) add + บัญชี → หักยอด + บรรทัด savings + sideEffects ---
  s().addSavings(2026, 7, {
    category: 'travel',
    name: 'ออมเที่ยว',
    amount: 5000,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id1 = lastSavingsId(2026, 7);
  eq('1. add หักบัญชี A', bal(acctA, 2026, 7), -5000);
  eq('1. มีบรรทัด savings 1 บรรทัด', savingsTxs(id1).length, 1);
  eq('1. tx ติดลบ', savingsTxs(id1)[0]?.amount, -5000);
  eq('1. sideEffects.deductAmount', itemOf(2026, 7, id1)?.sideEffects?.deductAmount, 5000);

  // --- 2) add ไม่ระบุบัญชี → bank state ไม่ขยับเลย (reference เดิม) ---
  const beforeAccounts = s().data.bankAccounts;
  const beforeTxs = s().data.bankTransactions;
  s().addSavings(2026, 7, {
    category: 'general',
    name: 'ออมเฉยๆ',
    amount: 999,
    isRecurring: false,
  });
  eq('2. ไม่ระบุบัญชี → bankAccounts ref เดิม', s().data.bankAccounts === beforeAccounts, true);
  eq('2. ไม่ระบุบัญชี → bankTransactions ref เดิม', s().data.bankTransactions === beforeTxs, true);

  // --- 3) แก้ยอด → revoke เก่า apply ใหม่ เหลือบรรทัดเดียว ---
  s().updateSavings(2026, 7, id1, { amount: 7000 });
  eq('3. แก้ยอด → หักใหม่', bal(acctA, 2026, 7), -7000);
  eq('3. ยังมีบรรทัดเดียว', savingsTxs(id1).length, 1);

  // --- 4) ย้ายบัญชี A→B ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: acctB });
  eq('4. ย้าย: A คืนยอด', bal(acctA, 2026, 7), 0);
  eq('4. ย้าย: B โดนหัก', bal(acctB, 2026, 7), -7000);

  // --- 5) ถอดบัญชีออก → คืนยอด + sideEffects/บรรทัดหาย ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: undefined });
  eq('5. ถอดบัญชี: B คืนยอด', bal(acctB, 2026, 7), 0);
  eq('5. sideEffects หาย', itemOf(2026, 7, id1)?.sideEffects, undefined);
  eq('5. บรรทัดหาย', savingsTxs(id1).length, 0);
  // F49: เซลล์ 0 ที่ไม่มีรายการรองรับต้องถูกกวาด
  eq('5. เซลล์ 0 กำพร้าของ B ถูกกวาด', cell(acctB, 2026, 7), undefined);

  // --- 6) ลบรายการ → คืนยอด, บรรทัดหาย, แถวเดือน (ว่างได้) ยังอยู่ ---
  s().updateSavings(2026, 7, id1, { paymentAccountId: acctA });
  eq('6. ผูกกลับ → หัก', bal(acctA, 2026, 7), -7000);
  s().deleteSavings(2026, 7, id1);
  eq('6. ลบ → คืนยอด', bal(acctA, 2026, 7), 0);
  eq('6. บรรทัดหาย', savingsTxs(id1).length, 0);
  eq(
    '6. แถวเดือนยังอยู่',
    s().data.years['2026'].savings.some((r) => r.month === 7),
    true,
  );

  // --- 7) F44: บัญชีที่มีออมผูกลบไม่ได้ ---
  s().addSavings(2026, 8, {
    category: 'travel',
    name: 'ออมสิงหา',
    amount: 100,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id7 = lastSavingsId(2026, 8);
  eq('7. usage.savings นับถูก', findBankAccountUsage(s().data, acctA).savings.length, 1);
  eq('7. ลบบัญชีไม่ได้', isBankAccountDeletable(s().data, acctA), false);
  s().updateSavings(2026, 8, id7, { paymentAccountId: undefined });
  eq('7. ถอดแล้วลบได้', isBankAccountDeletable(s().data, acctA), true);

  // --- 8) ทอง: item ที่ทองสร้าง (cash) ถูกแก้ให้ผูกบัญชี → ลบทองต้องคืนครบ ---
  const goldId = s().addGoldHolding({
    purchaseDate: '2026-09-10',
    brand: 'ทดสอบ',
    type: 'bar',
    purity: '96.5',
    weightBaht: 1,
    totalCost: 40000,
    paymentMethod: 'cash',
  });
  const goldItemId = lastSavingsId(2026, 9);
  s().updateSavings(2026, 9, goldItemId, { paymentAccountId: acctA });
  eq('8. ออมทองผูกบัญชี → หัก', bal(acctA, 2026, 9), -40000);
  s().deleteGoldHolding(goldId, { revertSideEffects: true });
  eq('8. ลบทอง → ยอดคืนครบ', bal(acctA, 2026, 9), 0);
  eq('8. ไม่มีบรรทัดค้าง', savingsTxs(goldItemId).length, 0);
  eq(
    '8. item ออมของทองถูกลบ',
    itemOf(2026, 9, goldItemId) === undefined,
    true,
  );

  // --- 9) ลบบรรทัด savings จากสมุดตรง = no-op (ต้องไปลบที่ต้นทาง) ---
  s().addSavings(2026, 10, {
    category: 'travel',
    name: 'ออมตุลา',
    amount: 500,
    isRecurring: false,
    paymentAccountId: acctA,
  });
  const id9 = lastSavingsId(2026, 10);
  const tx9 = savingsTxs(id9)[0]!;
  s().deleteBankTransaction(tx9.id);
  eq('9. ลบ tx จากสมุดตรง = no-op', savingsTxs(id9).length, 1);
  eq('9. ยอดไม่ขยับ', bal(acctA, 2026, 10), -500);

  // --- 10) เซลล์ 0 ที่ "มีรายการรองรับ" ต้องอยู่ต่อ (F49) ---
  // ฝาก 600 (manual) + ออมหัก 600 ในเดือนเดียวกัน → เซลล์ = 0 แต่มี 2 บรรทัด
  s().depositBank(acctB, 2026, 11, 600);
  s().addSavings(2026, 11, {
    category: 'general',
    name: 'ออมพฤศจิกา',
    amount: 600,
    isRecurring: false,
    paymentAccountId: acctB,
  });
  eq('10. เซลล์ = 0', bal(acctB, 2026, 11), 0);
  eq('10. เซลล์ 0 ที่มีรายการต้องอยู่ต่อ', cell(acctB, 2026, 11), 0);

  // --- 11) backup restore ต้องคง paymentAccountId + sideEffects ของรายการออม ---
  const { validateBackup } = await import('../src/utils/exportImport');
  const backup = {
    version: '1.0.0',
    lastUpdated: 'x',
    // บัญชี A ต้องมีจริง — paymentAccountId + sideEffects ชี้มา (referential integrity)
    bankAccounts: [{ id: 'A', name: 'A', balances: { '2026': { '7': -5000 } } }],
    years: {
      '2026': {
        income: [],
        expenses: [],
        savings: [
          {
            month: 7,
            items: [
              {
                id: 's1',
                category: 'travel',
                name: 'ออมเที่ยว',
                amount: 5000,
                isRecurring: false,
                paymentAccountId: 'A',
                sideEffects: {
                  accountId: 'A',
                  deductYear: 2026,
                  deductMonth: 7,
                  deductAmount: 5000,
                },
              },
            ],
          },
        ],
      },
    },
  } as unknown;
  const res11 = validateBackup(backup);
  eq('11. validateBackup ok', res11.ok, true);
  const restored11 = res11.ok
    ? (res11.data as import('../src/types').WealthLensData).years['2026'].savings[0]
        .items[0]
    : undefined;
  eq('11. restore เก็บ paymentAccountId', restored11?.paymentAccountId, 'A');
  eq('11. restore เก็บ sideEffects.deductAmount', restored11?.sideEffects?.deductAmount, 5000);

  console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
};
void run();
