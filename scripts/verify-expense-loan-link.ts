/**
 * Verification for F37 — expense → loan payment link.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-expense-loan-link.ts
 *
 * โปรเจกต์นี้ไม่มี test runner — สคริปต์นี้คือ test suite ของฟีเจอร์.
 */
import { validateBackup } from '../src/utils/exportImport';
import type { ExpenseItem } from '../src/types';

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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
