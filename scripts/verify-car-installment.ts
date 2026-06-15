/**
 * Hand-computed verification for car installment plan (F30).
 * Repo has no test runner — run with: npx tsx scripts/verify-car-installment.ts
 */
import seedData from '../src/data/seedData';
import {
  applyCarInstallmentTags,
  buildInstallmentSchedule,
  carSequenceFor,
  removeInstallmentTags,
} from '../src/utils/installments';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(actual)} (expected ${String(expected)})`);
};

// --- carSequenceFor ---
expectEq('seq มิ.ย. 2026', carSequenceFor(2026, 6), 39);
expectEq('seq ม.ค. 2024', carSequenceFor(2024, 1), 10);
expectEq('seq มี.ค. 2028 (งวดสุดท้าย)', carSequenceFor(2028, 3), 60);
expectEq('seq มี.ค. 2023 (ก่อนเริ่ม)', carSequenceFor(2023, 3), null);
expectEq('seq เม.ย. 2028 (เกินแผน)', carSequenceFor(2028, 4), null);

// --- applyCarInstallmentTags (idempotent, ไม่แตะ amount) ---
const tagged = applyCarInstallmentTags(seedData.years, 'test-car-plan');
const jan24Car = tagged['2024'].expenses
  .find((e) => e.month === 1)
  ?.items.find((it) => it.name === 'รถยนต์' && it.category === 'vehicle');
expectEq('Jan 2024 car sequence', jan24Car?.installment?.sequence, 10);
expectEq('Jan 2024 car totalMonths', jan24Car?.installment?.totalMonths, 60);
expectEq('Jan 2024 car planId', jan24Car?.installment?.planId, 'test-car-plan');
expectEq('Jan 2024 car amount unchanged', jan24Car?.amount, 23722);
expectEq('Jan 2024 car isRecurring unchanged', jan24Car?.isRecurring, true);

// 2023 ไม่ถูกแตะ (ไม่มีแถวรถ)
const car2023 = tagged['2023'].expenses
  .find((e) => e.month === 4)
  ?.items.find((it) => it.name === 'รถยนต์');
expectEq('2023 ไม่มีแถวรถ', car2023, undefined);

// --- removeInstallmentTags ---
const untagged = removeInstallmentTags(tagged, 'test-car-plan');
const jan24u = untagged['2024'].expenses
  .find((e) => e.month === 1)
  ?.items.find((it) => it.name === 'รถยนต์');
expectEq('untag removes metadata', jan24u?.installment, undefined);
expectEq('untag keeps amount', jan24u?.amount, 23722);

// --- buildInstallmentSchedule ---
const carMeta = jan24Car!.installment!;
const sched = buildInstallmentSchedule(
  carMeta,
  new Map([[10, { amount: 23722, itemId: 'x' }]]),
);
expectEq('schedule length', sched.length, 60);
expectEq('งวด 1 = เม.ย. 2023', `${sched[0].year}-${sched[0].month}`, '2023-4');
expectEq('งวด 39 = มิ.ย. 2026', `${sched[38].year}-${sched[38].month}`, '2026-6');
expectEq('งวด 60 = มี.ค. 2028', `${sched[59].year}-${sched[59].month}`, '2028-3');
expectEq('งวด 10 materialized', sched[9].materialized, true);
expectEq('งวด 10 itemId', sched[9].itemId, 'x');
expectEq('งวด 1 projected', sched[0].materialized, false);
expectEq('งวด 1 amount = perInstallment', sched[0].amount, 23722);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
