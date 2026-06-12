/**
 * Hand-computed verification for resolveTaxAllowances + calculateThaiPIT.
 * Repo has no test runner — run with: npx tsx scripts/verify-tax-allowances.ts
 *
 * Scenario: เงินได้ 1,000,000 | ปกส 9,000 | PVD 28,800
 *   ประกันชีวิต 150,000 → applied 100,000 (cap รวมสุขภาพ)
 *   พ่อแม่ 2 คน → 60,000
 *   RMF 480,000 → cap 30% = 300,000 (กลุ่มเกษียณ 328,800 ยังไม่ชน 500k)
 *   ดอกเบี้ยบ้าน 120,000 → 100,000
 *   บริจาคการศึกษา 10,000 → ×2 = 20,000 (ฐานบริจาค 242,200 → cap 24,220)
 *   บริจาคทั่วไป 50,000 → cap 10% ของ 222,200 = 22,220
 *   รวมลดหย่อนรายช่อง = 602,220 | taxable = 199,980 | ภาษี = 2,499
 */
import {
  calculateThaiPIT,
  EMPTY_TAX_ALLOWANCES,
  resolveTaxAllowances,
} from '../src/utils/taxCalculator';

const expectEq = (label: string, actual: number, expected: number): void => {
  if (Math.abs(actual - expected) > 0.005) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`✅ ${label} = ${actual}`);
};

const resolved = resolveTaxAllowances(
  {
    ...EMPTY_TAX_ALLOWANCES,
    lifeInsurance: 150_000,
    parentsCount: 2,
    rmf: 480_000,
    homeLoanInterest: 120_000,
    donationEducation: 10_000,
    donationGeneral: 50_000,
  },
  1_000_000,
  9_000,
  28_800,
);

const get = (key: string): number =>
  resolved.lines.find((l) => l.key === key)?.applied ?? NaN;

expectEq('life applied', get('lifeInsurance'), 100_000);
expectEq('parents applied', get('parents'), 60_000);
expectEq('rmf applied', get('rmf'), 300_000);
expectEq('homeLoan applied', get('homeLoanInterest'), 100_000);
expectEq('donationEdu applied', get('donationEducation'), 20_000);
expectEq('donationGeneral applied', get('donationGeneral'), 22_220);
expectEq('total', resolved.total, 602_220);

const capped = resolved.lines.filter((l) => l.capped).map((l) => l.key);
const expectedCapped = ['lifeInsurance', 'rmf', 'homeLoanInterest', 'donationGeneral'];
if (JSON.stringify([...capped].sort()) !== JSON.stringify([...expectedCapped].sort())) {
  throw new Error(`capped flags wrong: ${capped.join(', ')}`);
}
console.log(`✅ capped flags = ${capped.join(', ')}`);

const result = calculateThaiPIT({
  income: 1_000_000,
  socialSecurity: 9_000,
  providentFund: 28_800,
  extraAllowances: resolved.total,
});
expectEq('taxableIncome', result.taxableIncome, 199_980);
expectEq('totalTax', result.totalTax, 2_499);

// กลุ่มเกษียณชน 500k: PVD 28,800 + RMF 480,000 (≤30% ของ 2M) = 508,800
const grouped = resolveTaxAllowances(
  { ...EMPTY_TAX_ALLOWANCES, rmf: 480_000 },
  2_000_000,
  9_000,
  28_800,
);
expectEq(
  'rmf trimmed by group cap',
  grouped.lines.find((l) => l.key === 'rmf')?.applied ?? NaN,
  471_200,
);

// ค่าว่าง/ติดลบ → 0 ทั้งหมด
const empty = resolveTaxAllowances(
  { ...EMPTY_TAX_ALLOWANCES, rmf: -5, childrenCount: -1 },
  1_000_000,
  0,
  0,
);
expectEq('negative inputs clamp to 0', empty.total, 0);

console.log('\n🎉 all tax allowance checks passed');
