/**
 * Verification for expense payment-source deduction (F34).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-payment.ts
 */
import type {
  BankAccount,
  ExpenseSideEffectRefs,
  WealthLensData,
} from '../src/types';
import {
  applyBankDelta,
  reconcileBankDeduction,
} from '../src/utils/bankAccounts';
import { validateBackup } from '../src/utils/exportImport';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};
const bal = (accts: BankAccount[], id: string, y: number, m: number): number =>
  accts.find((a) => a.id === id)?.balances[String(y)]?.[String(m)] ?? 0;
const mk = (): BankAccount[] => [
  { id: 'A', name: 'A', balances: { '2026': { '7': 1000 } } },
  { id: 'B', name: 'B', balances: {} },
];
const ded = (accountId: string, amount: number): ExpenseSideEffectRefs => ({
  accountId,
  deductYear: 2026,
  deductMonth: 7,
  deductAmount: amount,
});

const a1 = applyBankDelta(mk(), 'A', 2026, 7, -300);
eq('applyBankDelta หัก', bal(a1, 'A', 2026, 7), 700);
eq('applyBankDelta ไม่ mutate ต้นฉบับ', bal(mk(), 'A', 2026, 7), 1000);
const a2 = applyBankDelta(mk(), 'B', 2026, 8, -50);
eq('applyBankDelta สร้างเดือนใหม่', bal(a2, 'B', 2026, 8), -50);
const a3 = applyBankDelta(mk(), 'ghost', 2026, 7, -999);
eq('applyBankDelta บัญชีหาย = ไม่เปลี่ยน', bal(a3, 'A', 2026, 7), 1000);

const add = reconcileBankDeduction(mk(), undefined, ded('A', 200));
eq('add หัก A', bal(add, 'A', 2026, 7), 800);
const del = reconcileBankDeduction(add, ded('A', 200), undefined);
eq('delete คืน A', bal(del, 'A', 2026, 7), 1000);
const chg = reconcileBankDeduction(add, ded('A', 200), ded('A', 350));
eq('แก้ยอด A', bal(chg, 'A', 2026, 7), 650);
const mv = reconcileBankDeduction(add, ded('A', 200), ded('B', 200));
eq('ย้าย: A คืน', bal(mv, 'A', 2026, 7), 1000);
eq('ย้าย: B หัก', bal(mv, 'B', 2026, 7), -200);
const same = reconcileBankDeduction(add, ded('A', 200), ded('A', 200));
eq('เบิก flip ไม่หักซ้ำ', bal(same, 'A', 2026, 7), 800);

// --- backup restore must PRESERVE paymentAccountId + sideEffects (data-safety) ---
const backup = {
  version: '1.0.0',
  lastUpdated: 'x',
  // บัญชี A ต้องมีจริง — paymentAccountId + sideEffects ชี้มา (referential integrity)
  bankAccounts: [{ id: 'A', name: 'A', balances: { '2026': { '7': -500 } } }],
  years: {
    '2026': {
      income: [],
      savings: [],
      expenses: [
        {
          month: 7,
          items: [
            {
              id: 'e1',
              category: 'housing',
              name: 'ค่าไฟ',
              amount: 500,
              isRecurring: false,
              paymentAccountId: 'A',
              sideEffects: {
                accountId: 'A',
                deductYear: 2026,
                deductMonth: 7,
                deductAmount: 500,
              },
            },
          ],
        },
      ],
    },
  },
} as unknown;
const res = validateBackup(backup);
eq('validateBackup ok', res.ok, true);
const restored = res.ok
  ? (res.data as WealthLensData).years['2026'].expenses[0].items[0]
  : undefined;
eq('restore เก็บ paymentAccountId', restored?.paymentAccountId, 'A');
eq('restore เก็บ sideEffects.deductAmount', restored?.sideEffects?.deductAmount, 500);

// --- F35: per-งวด deduction distributes across months ---
let accts3: BankAccount[] = [{ id: 'C', name: 'C', balances: {} }];
for (const [y, m, amt] of [[2026, 7, 1000], [2026, 8, 1000], [2026, 9, 500]] as const) {
  accts3 = reconcileBankDeduction(accts3, undefined, {
    accountId: 'C',
    deductYear: y,
    deductMonth: m,
    deductAmount: amt,
  });
}
eq('งวด1 ก.ค.', bal(accts3, 'C', 2026, 7), -1000);
eq('งวด2 ส.ค.', bal(accts3, 'C', 2026, 8), -1000);
eq('งวด3 ก.ย.', bal(accts3, 'C', 2026, 9), -500);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
