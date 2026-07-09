/**
 * Verification for F37 — expense → loan payment link.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
 *
 * โปรเจกต์นี้ไม่มี test runner — สคริปต์นี้คือ test suite ของฟีเจอร์.
 */
import { validateBackup } from '../src/utils/exportImport';
import {
  getPrincipalRemaining,
  getTotalPaid,
} from '../src/utils/loanCalculations';
import { finalizeSchedule } from '../src/utils/loanForm';
import type { ExpenseItem, Loan } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// ---------------------------------------------------------------------------
// Task 1 — import round-trip เก็บ loanId
// หมายเหตุ: validateBackup รับ *parsed object* (ไม่ใช่ JSON string) และ
// YearData.expenses เป็น array ของ MonthlyExpense (ไม่ใช่ object keyed by month).
// ---------------------------------------------------------------------------
const payload = {
  version: '1',
  lastUpdated: '2026-07-09T00:00:00.000Z',
  years: {
    '2026': {
      income: [],
      expenses: [
        {
          month: 7,
          items: [
            {
              id: 'exp-1',
              category: 'housing',
              name: 'บ้าน',
              amount: 30000,
              isRecurring: true,
              loanId: 'loan-house',
            },
          ],
        },
      ],
      savings: [],
    },
  },
};
const parsed = validateBackup(payload);
const importedItem: ExpenseItem | null = parsed.ok
  ? parsed.data.years['2026'].expenses[0].items[0]
  : null;
eq('backup มี loanId ผ่าน validate', parsed.ok, true);
eq('import เก็บ loanId', importedItem?.loanId, 'loan-house');

// backup เก่าไม่มี field ยัง import ได้
const legacyPayload = JSON.parse(JSON.stringify(payload));
delete legacyPayload.years['2026'].expenses[0].items[0].loanId;
const legacy = validateBackup(legacyPayload);
eq('backup เก่าไม่มี loanId ยัง import ได้', legacy.ok, true);
eq(
  'ไม่มี loanId → undefined',
  legacy.ok ? legacy.data.years['2026'].expenses[0].items[0].loanId : 'ERR',
  undefined,
);

// ---------------------------------------------------------------------------
// Task 2 — waterfall: ตารางทดสอบ 3 งวด ต้น 1000/งวด ดอก 100/งวด (รวม 1100/งวด)
// ---------------------------------------------------------------------------
const flatSchedule = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-08-05', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 2, dueDate: '2026-09-05', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 3, dueDate: '2026-10-05', principalAmount: 1000, interestAmount: 100 },
]);
const baseLoan: Loan = {
  id: 'loan-house',
  name: 'สินเชื่อบ้าน',
  type: 'mortgage',
  startDate: '2026-08-05',
  schedule: flatSchedule,
  scheduledPayments: [],
  extraPayments: [],
};
const refBeforeFirstDue = new Date('2026-08-01T00:00:00');

// จ่าย 2200 = 2 งวดเต็ม → ตัดต้น 2000, เหลือ 1000
const paidTwo: Loan = {
  ...baseLoan,
  scheduledPayments: [
    { id: 'sp1', date: '2026-08-05', amount: 1100 },
    { id: 'sp2', date: '2026-09-05', amount: 1100 },
  ],
};
eq('waterfall 2 งวดเต็ม', getPrincipalRemaining(paidTwo, refBeforeFirstDue), 1000);

// จ่าย 1650 = งวด 1 เต็ม (1100) + ครึ่งงวด 2 (550/1100) → ตัดต้น 1000 + 500 = 1500
const paidHalf: Loan = {
  ...baseLoan,
  scheduledPayments: [{ id: 'sp3', date: '2026-08-05', amount: 1650 }],
};
eq('waterfall เศษครึ่งงวด', getPrincipalRemaining(paidHalf, refBeforeFirstDue), 1500);

// จ่ายเกินทั้งตาราง → เงินต้นเหลือ 0 (ไม่ติดลบ)
const overpaid: Loan = {
  ...baseLoan,
  scheduledPayments: [{ id: 'sp4', date: '2026-08-05', amount: 99999 }],
};
eq('จ่ายเกิน → 0 ไม่ติดลบ', getPrincipalRemaining(overpaid, refBeforeFirstDue), 0);

// โปะตัดเงินต้นเต็มจำนวน (นอก waterfall)
const withExtra: Loan = {
  ...baseLoan,
  extraPayments: [{ id: 'x', date: '2026-08-10', amount: 500, createExpenseEntry: false }],
};
eq('โปะตัดต้นเต็ม', getPrincipalRemaining(withExtra, refBeforeFirstDue), 2500);

// regression F36: assumeOnSchedule ให้ผลเท่ากับ Σต้นของงวดที่ครบกำหนด
const assumed: Loan = { ...baseLoan, assumeOnSchedule: true };
const refAfterTwo = new Date('2026-09-20T00:00:00');
eq('assumeOnSchedule waterfall == Σต้น 2 งวด', getPrincipalRemaining(assumed, refAfterTwo), 1000);
eq('assumeOnSchedule totalPaid', getTotalPaid(assumed, refAfterTwo), 2200);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
