/**
 * Hand-computed verification for the ExpenseItem.date field + the validator
 * passthrough fix. Repo has no test runner — run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-date.ts
 *
 * Asserts that validateBackup / import round-trips the optional ExpenseItem
 * fields (date, reimbursement, installment) instead of silently dropping them,
 * and that a legacy row without `date` still validates and stays date-less.
 */
import { validateBackup } from '../src/utils/exportImport';
import type { ExpenseItem, WealthLensData } from '../src/types';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}: ${JSON.stringify(actual)}`);
};

const dated: ExpenseItem = {
  id: 'a',
  category: 'subscription',
  name: 'Claude AI',
  amount: 720,
  isRecurring: true,
  date: '2026-06-25',
  reimbursement: { status: 'pending' },
};

const legacy: ExpenseItem = {
  id: 'b',
  category: 'housing',
  name: 'บ้าน',
  amount: 60000,
  isRecurring: true,
  // no date — legacy row
};

const installmentRow: ExpenseItem = {
  id: 'c',
  category: 'finance',
  name: 'iPhone',
  amount: 5000,
  isRecurring: false,
  date: '2026-06-01',
  installment: {
    planId: 'p1',
    sequence: 2,
    totalMonths: 10,
    totalAmount: 50000,
    startYear: 2026,
    startMonth: 5,
  },
};

const data: WealthLensData = {
  version: '1.0.0',
  lastUpdated: '2026-06-25T00:00:00.000Z',
  years: {
    '2026': {
      income: [],
      expenses: [{ month: 6, items: [dated, legacy, installmentRow] }],
    },
  },
};

// Round-trip through JSON (mirrors export → import) then validate.
const parsed = JSON.parse(JSON.stringify(data));
const result = validateBackup(parsed);

expectEq('validateBackup ok', result.ok, true);
if (result.ok) {
  const items = result.data.years['2026'].expenses[0].items;
  expectEq('row count preserved', items.length, 3);

  const a = items.find((i) => i.id === 'a');
  expectEq('date preserved', a?.date, '2026-06-25');
  expectEq('reimbursement preserved', a?.reimbursement?.status, 'pending');

  const b = items.find((i) => i.id === 'b');
  expectEq('legacy row valid', b?.name, 'บ้าน');
  expectEq('legacy row has no date', b?.date, undefined);

  const c = items.find((i) => i.id === 'c');
  expectEq('installment preserved', c?.installment?.sequence, 2);
  expectEq('installment date preserved', c?.date, '2026-06-01');
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
