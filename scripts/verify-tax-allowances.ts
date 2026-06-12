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

// ประกันสุขภาพโดนบีบโดยโควต้ารวม: ชีวิต 90,000 + สุขภาพ 25,000
// → สุขภาพเหลือ min(25,000, 25,000, 100,000−90,000) = 10,000
const squeezed = resolveTaxAllowances(
  { ...EMPTY_TAX_ALLOWANCES, lifeInsurance: 90_000, healthInsurance: 25_000 },
  1_000_000,
  0,
  0,
);
expectEq(
  'health squeezed by combined 100k cap',
  squeezed.lines.find((l) => l.key === 'healthInsurance')?.applied ?? NaN,
  10_000,
);

// กลุ่มเกษียณ cascade เกิน RMF ไปตัดบำนาญ:
// gross 2M | PVD 300,000 (= 15% cap พอดี) | บำนาญ 200,000 | RMF 480,000 | กอช 30,000
// group = 1,010,000, overflow 510,000 → RMF 480,000 → 0,
// บำนาญตัดอีก 30,000 → 170,000, กอช ไม่โดน → 30,000
const cascade = resolveTaxAllowances(
  {
    ...EMPTY_TAX_ALLOWANCES,
    pensionInsurance: 200_000,
    rmf: 480_000,
    nationalSavingsFund: 30_000,
  },
  2_000_000,
  9_000,
  300_000,
);
const cascadeGet = (key: string): number =>
  cascade.lines.find((l) => l.key === key)?.applied ?? NaN;
expectEq('cascade: rmf cut to 0', cascadeGet('rmf'), 0);
expectEq('cascade: pension cut to 170k', cascadeGet('pensionInsurance'), 170_000);
expectEq('cascade: กอช untouched', cascadeGet('nationalSavingsFund'), 30_000);

// พ่อแม่เกิน 4 คน → ตัดเหลือ 4 × 30,000 = 120,000 และ flag capped
const manyParents = resolveTaxAllowances(
  { ...EMPTY_TAX_ALLOWANCES, parentsCount: 5 },
  1_000_000,
  0,
  0,
);
const parentsLine = manyParents.lines.find((l) => l.key === 'parents');
expectEq('parents capped at 4 persons', parentsLine?.applied ?? NaN, 120_000);
if (parentsLine?.capped !== true) {
  throw new Error('parents line should be flagged capped');
}
console.log('✅ parents line capped flag = true');

// ลดหย่อนท่วมเงินได้: gross 200,000 − ค่าใช้จ่าย 100k − ส่วนตัว 60k −
// ชีวิต 100k − ดอกเบี้ยบ้าน 100k → donationBase = 0 → บริจาคทั่วไปหักไม่ได้
const overAllowed = resolveTaxAllowances(
  {
    ...EMPTY_TAX_ALLOWANCES,
    lifeInsurance: 100_000,
    homeLoanInterest: 100_000,
    donationGeneral: 50_000,
  },
  200_000,
  0,
  0,
);
expectEq(
  'donationGeneral = 0 when allowances exceed income',
  overAllowed.lines.find((l) => l.key === 'donationGeneral')?.applied ?? NaN,
  0,
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
