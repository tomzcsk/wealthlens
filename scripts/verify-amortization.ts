/**
 * Verification for F36 — mortgage amortization generator.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts
 */
import { generateAmortizationSchedule } from '../src/utils/amortization';
import {
  getLoanSummary,
  getMergedPaymentLog,
  getPrincipalRemaining,
  getTotalPaid,
} from '../src/utils/loanCalculations';
import { finalizeSchedule } from '../src/utils/loanForm';
import type { Loan } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- เคสจริงของ Tom: 3,047,222.30 @ 3.75%/ปี จ่าย 30,000/เดือน ---
const tom = generateAmortizationSchedule({
  openingBalance: 3047222.3,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('เคส Tom สร้างตารางได้', tom.ok, true);
if (tom.ok) {
  const { rows, totalInterest, totalPaid } = tom;
  eq('จำนวนงวด', rows.length, 123);
  eq('งวด 1 ดอก', rows[0].interestAmount, 9522.57);
  eq('งวด 1 ต้น', rows[0].principalAmount, 20477.43);
  eq('งวด 1 วันครบกำหนด', rows[0].dueDate, '2026-08-05');
  eq('งวด 2 วันครบกำหนด', rows[1].dueDate, '2026-09-05');
  eq('งวดสุดท้ายวันครบกำหนด', rows[122].dueDate, '2036-10-05');
  eq(
    'งวดสุดท้ายรวม',
    Math.round((rows[122].principalAmount + rows[122].interestAmount) * 100) / 100,
    11727.32,
  );
  const sumPrincipal =
    Math.round(rows.reduce((a, r) => a + r.principalAmount, 0) * 100) / 100;
  eq('Σ ต้น = ยอดตั้งต้นเป๊ะ', sumPrincipal, 3047222.3);
  eq('Σ ดอก', Math.round(totalInterest * 100) / 100, 624505.02);
  eq('จ่ายรวม', Math.round(totalPaid * 100) / 100, 3671727.32);
  eq('installmentNumber ไล่ 1..N', rows[122].installmentNumber, 123);
}

// --- guards ---
const tooLow = generateAmortizationSchedule({
  openingBalance: 3047222.3,
  annualRatePercent: 3.75,
  monthlyPayment: 9000, // < ดอกงวดแรก 9,522.57
  firstDueDate: '2026-08-05',
});
eq('ค่างวดต่ำกว่าดอก → PAYMENT_TOO_LOW', tooLow.ok === false && tooLow.error, 'PAYMENT_TOO_LOW');

const zeroBalance = generateAmortizationSchedule({
  openingBalance: 0,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('ยอด 0 → INVALID_INPUT', zeroBalance.ok === false && zeroBalance.error, 'INVALID_INPUT');

const zeroPayment = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 3.75,
  monthlyPayment: 0,
  firstDueDate: '2026-08-05',
});
eq('ค่างวด 0 → INVALID_INPUT', zeroPayment.ok === false && zeroPayment.error, 'INVALID_INPUT');

const badDate = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 3.75,
  monthlyPayment: 30000,
  firstDueDate: '',
});
eq('วันที่ว่าง → INVALID_INPUT', badDate.ok === false && badDate.error, 'INVALID_INPUT');

const tooLong = generateAmortizationSchedule({
  openingBalance: 10000000,
  annualRatePercent: 5,
  monthlyPayment: 42000, // ดอกงวดแรก 41,666.67 → ผ่อนได้แต่ยาวเกิน 600 งวด
  firstDueDate: '2026-08-05',
});
eq('ยาวเกินเพดาน → TOO_MANY_PERIODS', tooLong.ok === false && tooLong.error, 'TOO_MANY_PERIODS');

// --- ดอกเบี้ย 0% ---
const zeroRate = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 0,
  monthlyPayment: 30000,
  firstDueDate: '2026-08-05',
});
eq('0% สร้างได้', zeroRate.ok, true);
if (zeroRate.ok) {
  eq('0% → 4 งวด', zeroRate.rows.length, 4);
  eq('0% → ดอกรวม 0', zeroRate.totalInterest, 0);
  eq('0% → งวดสุดท้ายเป็นเศษ', zeroRate.rows[3].principalAmount, 10000);
}

// --- clamp สิ้นเดือน: 31 ม.ค. + 1 เดือน → 28 ก.พ. ---
const clamp = generateAmortizationSchedule({
  openingBalance: 100000,
  annualRatePercent: 0,
  monthlyPayment: 30000,
  firstDueDate: '2026-01-31',
});
eq('งวด 2 clamp สิ้นเดือน', clamp.ok && clamp.rows[1].dueDate, '2026-02-28');

// --- assumeOnSchedule ---
const mortgage: Loan = {
  id: 'test-mortgage',
  name: 'สินเชื่อบ้าน',
  type: 'mortgage',
  startDate: '2026-08-05',
  schedule: tom.ok ? finalizeSchedule(tom.rows) : [],
  scheduledPayments: [],
  extraPayments: [],
  assumeOnSchedule: true,
};
// อ้างอิงวันที่: 2026-10-10 → งวด 1 (ส.ค.) และ 2 (ก.ย.) และ 3 (5 ต.ค.) ครบกำหนดแล้ว
const ref = new Date('2026-10-10T00:00:00');
const first3Total = mortgage.schedule
  .slice(0, 3)
  .reduce((a, i) => a + i.totalAmount, 0);
const first3Principal = mortgage.schedule
  .slice(0, 3)
  .reduce((a, i) => a + i.principalAmount, 0);

eq('assumeOnSchedule: totalPaid = 3 งวดแรก',
  Math.round(getTotalPaid(mortgage, ref) * 100) / 100,
  Math.round(first3Total * 100) / 100);
eq('assumeOnSchedule: เงินต้นคงเหลือ',
  Math.round(getPrincipalRemaining(mortgage, ref) * 100) / 100,
  Math.round((3047222.3 - first3Principal) * 100) / 100);
eq('log มี 3 รายการหักตามตาราง', getMergedPaymentLog(mortgage, ref).length, 3);
eq('log label', getMergedPaymentLog(mortgage, ref)[0].label, 'หักตามตาราง');

// โปะ 100,000 → ทั้ง remaining และ principalRemaining ลดอีก 100,000
const withExtra: Loan = {
  ...mortgage,
  extraPayments: [{ id: 'x1', date: '2026-09-20', amount: 100000, createExpenseEntry: false }],
};
eq('โปะลดเงินต้น',
  Math.round(getPrincipalRemaining(withExtra, ref) * 100) / 100,
  Math.round((3047222.3 - first3Principal - 100000) * 100) / 100);

// ปิด flag → พฤติกรรมเดิมเป๊ะ
const noFlag: Loan = { ...mortgage, assumeOnSchedule: false };
eq('ปิด flag → totalPaid 0', getTotalPaid(noFlag, ref), 0);
eq('ปิด flag → log ว่าง', getMergedPaymentLog(noFlag, ref).length, 0);
eq('ปิด flag → เงินต้นคงเหลือเต็ม',
  Math.round(getPrincipalRemaining(noFlag, ref) * 100) / 100, 3047222.3);

// ไม่มี field เลย (payload เดิม) → เหมือนปิด
const legacy: Loan = { ...mortgage };
delete (legacy as { assumeOnSchedule?: boolean }).assumeOnSchedule;
eq('ไม่มี field → totalPaid 0', getTotalPaid(legacy, ref), 0);

// summary มี principalRemaining
eq('summary.principalRemaining',
  Math.round(getLoanSummary(mortgage, ref).principalRemaining * 100) / 100,
  Math.round((3047222.3 - first3Principal) * 100) / 100);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
