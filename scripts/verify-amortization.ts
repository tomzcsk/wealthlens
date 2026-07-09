/**
 * Verification for F36 — mortgage amortization generator.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-amortization.ts
 */
import { generateAmortizationSchedule } from '../src/utils/amortization';

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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
