/**
 * Verification for multi-loan + user-created loans (F31).
 * Repo has no test runner — run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-multi-loan.ts
 */
import { gslLoan } from '../src/data/seedData';
import { getLoanSummary, getScheduleTotal } from '../src/utils/loanCalculations';
import { scaffoldSchedule, finalizeSchedule } from '../src/utils/loanForm';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(actual)} (expected ${String(expected)})`);
};
const expectClose = (label: string, actual: number, expected: number): void => {
  const ok = Math.abs(actual - expected) < 1e-6;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual} (expected ~${expected})`);
};

// --- scaffoldSchedule: monthly ---
const m = scaffoldSchedule('2026-01-15', 3, 'monthly');
expectEq('monthly count', m.length, 3);
expectEq('monthly row1 num', m[0].installmentNumber, 1);
expectEq('monthly row1 due', m[0].dueDate, '2026-01-15');
expectEq('monthly row2 due', m[1].dueDate, '2026-02-15');
expectEq('monthly row3 due', m[2].dueDate, '2026-03-15');
expectEq('monthly row1 principal=0', m[0].principalAmount, 0);
expectEq('monthly row1 interest=0', m[0].interestAmount, 0);

// --- scaffoldSchedule: month-end clamp ---
const clamp = scaffoldSchedule('2026-01-31', 2, 'monthly');
expectEq('clamp row2 due (Feb)', clamp[1].dueDate, '2026-02-28');

// --- scaffoldSchedule: yearly ---
const y = scaffoldSchedule('2020-06-10', 2, 'yearly');
expectEq('yearly row2 due', y[1].dueDate, '2021-06-10');

// --- finalizeSchedule: totals + ratios ---
const fin = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-01-15', principalAmount: 1000, interestAmount: 100 },
  { installmentNumber: 2, dueDate: '2026-02-15', principalAmount: 3000, interestAmount: 0 },
]);
expectEq('finalize row1 total', fin[0].totalAmount, 1100);
expectEq('finalize row2 total', fin[1].totalAmount, 3000);
expectClose('finalize row1 ratio', fin[0].principalRatio, 0.25);
expectClose('finalize row2 ratio', fin[1].principalRatio, 0.75);
expectClose('finalize ratio sum', fin[0].principalRatio + fin[1].principalRatio, 1);

// --- finalizeSchedule: zero-principal guard (ไม่ NaN) ---
const zero = finalizeSchedule([
  { installmentNumber: 1, dueDate: '2026-01-15', principalAmount: 0, interestAmount: 500 },
]);
expectEq('zero-principal ratio', zero[0].principalRatio, 0);
expectEq('zero-principal total', zero[0].totalAmount, 500);

// --- ความปลอดภัยของ seed กยศ (ไม่แตะ schema/seed/calc → ต้อง self-consistent) ---
expectEq('กยศ schedule 15 งวด', gslLoan.schedule.length, 15);
expectEq('กยศ scheduledPayments 22 rows', gslLoan.scheduledPayments.length, 22);
const summary = getLoanSummary(gslLoan);
const handTotal = gslLoan.schedule.reduce((a, i) => a + i.totalAmount, 0);
expectEq('กยศ scheduleTotal = hand-sum', summary.scheduleTotal, handTotal);
expectEq('กยศ scheduleTotal = getScheduleTotal', summary.scheduleTotal, getScheduleTotal(gslLoan));
expectEq('กยศ remaining >= 0', summary.remaining >= 0, true);
expectEq('กยศ progress in [0,1]', summary.progressFraction >= 0 && summary.progressFraction <= 1, true);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
