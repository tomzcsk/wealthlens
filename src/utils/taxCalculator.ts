/**
 * Thai Personal Income Tax (PIT) calculator — simplified for WealthLens.
 *
 * Brackets used: post-2017 progressive table (still in force as of 2026):
 *   0 –   150,000 →  0%
 *   150 – 300,000 →  5%
 *   300 – 500,000 → 10%
 *   500 – 750,000 → 15%
 *   750 – 1,000,000 → 20%
 *   1M – 2M       → 25%
 *   2M – 5M       → 30%
 *   5M+           → 35%
 *
 * Allowances supported (the common ones for a salaried single filer):
 *   - 50% expense deduction (capped at 100,000)
 *   - Personal allowance: 60,000
 *   - Social Security paid (capped at 9,000)
 *   - Provident Fund paid (capped at 15% of income, max 500,000)
 *
 * Custom allowances (insurance, RMF, SSF, child, spouse) can be added via
 * the `extraAllowances` field for what-if scenarios.
 */
import type { TaxAllowanceInputs } from '@/types';
export interface TaxBracket {
  /** Lower bound (inclusive). */
  min: number;
  /** Upper bound (inclusive); `null` = open-ended top bracket. */
  max: number | null;
  rate: number;
}

export const TH_PIT_BRACKETS: ReadonlyArray<TaxBracket> = [
  { min: 0, max: 150_000, rate: 0 },
  { min: 150_000, max: 300_000, rate: 0.05 },
  { min: 300_000, max: 500_000, rate: 0.1 },
  { min: 500_000, max: 750_000, rate: 0.15 },
  { min: 750_000, max: 1_000_000, rate: 0.2 },
  { min: 1_000_000, max: 2_000_000, rate: 0.25 },
  { min: 2_000_000, max: 5_000_000, rate: 0.3 },
  { min: 5_000_000, max: null, rate: 0.35 },
];

export const PERSONAL_ALLOWANCE = 60_000;
export const EXPENSE_DEDUCTION_RATE = 0.5;
export const EXPENSE_DEDUCTION_CAP = 100_000;
export const SOCIAL_SECURITY_CAP = 9_000;
export const PROVIDENT_FUND_RATE_CAP = 0.15;
export const PROVIDENT_FUND_MAX = 500_000;

export interface TaxInput {
  /** Annual gross income (the assessable amount before any deductions). */
  income: number;
  /** Annual social security paid (will be capped at SOCIAL_SECURITY_CAP). */
  socialSecurity: number;
  /** Annual provident fund paid (capped at min(15% income, 500k)). */
  providentFund: number;
  /** Optional extra allowances (insurance, child, spouse, etc.) summed. */
  extraAllowances?: number;
}

export interface BracketBreakdown extends TaxBracket {
  /** Portion of taxable income that fell into this bracket. */
  taxableInBracket: number;
  /** Tax owed from this bracket alone. */
  taxFromBracket: number;
}

export interface TaxResult {
  grossIncome: number;
  expenseAllowance: number;
  personalAllowance: number;
  socialSecurityAllowance: number;
  providentFundAllowance: number;
  extraAllowances: number;
  totalAllowances: number;
  taxableIncome: number;
  brackets: BracketBreakdown[];
  totalTax: number;
  /** Effective tax rate against gross income (0..1). */
  effectiveRate: number;
}

const ZERO_RESULT = (gross: number): TaxResult => ({
  grossIncome: gross,
  expenseAllowance: 0,
  personalAllowance: 0,
  socialSecurityAllowance: 0,
  providentFundAllowance: 0,
  extraAllowances: 0,
  totalAllowances: 0,
  taxableIncome: 0,
  brackets: [],
  totalTax: 0,
  effectiveRate: 0,
});

export const calculateThaiPIT = (input: TaxInput): TaxResult => {
  const gross = Math.max(0, input.income);
  if (gross === 0) return ZERO_RESULT(0);

  const expenseAllowance = Math.min(
    gross * EXPENSE_DEDUCTION_RATE,
    EXPENSE_DEDUCTION_CAP,
  );
  const ssAllowance = Math.min(
    Math.max(0, input.socialSecurity),
    SOCIAL_SECURITY_CAP,
  );
  const pfCap = Math.min(gross * PROVIDENT_FUND_RATE_CAP, PROVIDENT_FUND_MAX);
  const pfAllowance = Math.min(Math.max(0, input.providentFund), pfCap);
  const extraAllowances = Math.max(0, input.extraAllowances ?? 0);

  const totalAllowances =
    expenseAllowance +
    PERSONAL_ALLOWANCE +
    ssAllowance +
    pfAllowance +
    extraAllowances;

  const taxableIncome = Math.max(0, gross - totalAllowances);

  const brackets: BracketBreakdown[] = [];
  let totalTax = 0;
  for (const bracket of TH_PIT_BRACKETS) {
    if (taxableIncome <= bracket.min) {
      brackets.push({ ...bracket, taxableInBracket: 0, taxFromBracket: 0 });
      continue;
    }
    const upper = bracket.max ?? Infinity;
    const portion = Math.min(taxableIncome, upper) - bracket.min;
    const tax = portion * bracket.rate;
    brackets.push({
      ...bracket,
      taxableInBracket: portion,
      taxFromBracket: tax,
    });
    totalTax += tax;
  }

  return {
    grossIncome: gross,
    expenseAllowance,
    personalAllowance: PERSONAL_ALLOWANCE,
    socialSecurityAllowance: ssAllowance,
    providentFundAllowance: pfAllowance,
    extraAllowances,
    totalAllowances,
    taxableIncome,
    brackets,
    totalTax,
    effectiveRate: gross > 0 ? totalTax / gross : 0,
  };
};

// ---------------------------------------------------------------------------
// Itemized allowances (ลดหย่อนรายช่อง)
// ---------------------------------------------------------------------------

export const SPOUSE_ALLOWANCE = 60_000;
export const CHILD_ALLOWANCE = 30_000;
export const CHILD_BORN_2561_ALLOWANCE = 60_000;
export const PARENT_ALLOWANCE = 30_000;
export const PARENT_COUNT_MAX = 4;
export const DISABLED_ALLOWANCE = 60_000;
export const PRENATAL_CAP = 60_000;
export const LIFE_HEALTH_COMBINED_CAP = 100_000;
export const HEALTH_INSURANCE_CAP = 25_000;
export const PARENT_HEALTH_INSURANCE_CAP = 15_000;
export const PENSION_INSURANCE_RATE_CAP = 0.15;
export const PENSION_INSURANCE_MAX = 200_000;
export const RMF_RATE_CAP = 0.3;
export const RMF_MAX = 500_000;
export const THAI_ESG_RATE_CAP = 0.3;
export const THAI_ESG_MAX = 300_000;
export const NATIONAL_SAVINGS_FUND_CAP = 30_000;
export const RETIREMENT_GROUP_CAP = 500_000;
export const HOME_LOAN_INTEREST_CAP = 100_000;
export const DONATION_RATE_CAP = 0.1;

/** All-zero inputs — ปีที่ยังไม่เคยกรอกใช้ก้อนนี้. */
export const EMPTY_TAX_ALLOWANCES: TaxAllowanceInputs = {
  spouseNoIncome: false,
  childrenCount: 0,
  childrenBorn2561Count: 0,
  parentsCount: 0,
  disabledCount: 0,
  prenatalCare: 0,
  lifeInsurance: 0,
  healthInsurance: 0,
  parentHealthInsurance: 0,
  pensionInsurance: 0,
  rmf: 0,
  thaiEsg: 0,
  nationalSavingsFund: 0,
  homeLoanInterest: 0,
  donationEducation: 0,
  donationGeneral: 0,
  other: 0,
};

export type TaxAllowanceLineKey =
  | 'spouse'
  | 'children'
  | 'childrenBorn2561'
  | 'parents'
  | 'disabled'
  | 'prenatalCare'
  | 'lifeInsurance'
  | 'healthInsurance'
  | 'parentHealthInsurance'
  | 'pensionInsurance'
  | 'rmf'
  | 'thaiEsg'
  | 'nationalSavingsFund'
  | 'homeLoanInterest'
  | 'donationEducation'
  | 'donationGeneral'
  | 'other';

export interface AllowanceLine {
  key: TaxAllowanceLineKey;
  label: string;
  /** มูลค่าตามที่กรอก (จำนวนคน × อัตรา; บริจาคการศึกษายังไม่ ×2). */
  entered: number;
  /** มูลค่าที่หักได้จริงหลังทุก cap. */
  applied: number;
  /** true เมื่อโดนเพดานตัด — UI ใช้โชว์ badge ส้ม. */
  capped: boolean;
}

export interface ResolvedAllowances {
  lines: AllowanceLine[];
  /** ผลรวม applied — ส่งเข้า calculateThaiPIT ผ่าน extraAllowances. */
  total: number;
}

/**
 * แปลงค่าลดหย่อนที่กรอก → ยอดหักได้จริงต่อช่องตามเพดานกฎหมาย.
 *
 * Cap ที่พึ่งพากันถูกคิดตามลำดับ:
 *  1. ประกันชีวิต+สุขภาพ: สุขภาพ ≤25k และรวมกัน ≤100k (ชีวิตกินโควต้าก่อน)
 *  2. กลุ่มเกษียณ PVD+บำนาญ+RMF+กอช ≤500k — PVD มาจาก payroll จริง
 *     ไม่โดนตัด ส่วนเกินตัดจาก RMF → บำนาญ → กอช
 *  3. บริจาคคิดท้ายสุดจากเงินได้หลังหักค่าใช้จ่าย+ลดหย่อนอื่นทั้งหมด:
 *     การศึกษา ×2 ก่อน (cap 10%) แล้วทั่วไป ≤10% ของยอดที่เหลือ
 */
export const resolveTaxAllowances = (
  inputs: TaxAllowanceInputs,
  grossIncome: number,
  paidSocialSecurity: number,
  paidProvidentFund: number,
): ResolvedAllowances => {
  const gross = Math.max(0, grossIncome);
  const amt = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);
  const count = (n: number): number => Math.floor(amt(n));

  // --- ครอบครัว (ไม่มีเพดานยกเว้นพ่อแม่ 4 คน) ---
  const spouse = inputs.spouseNoIncome ? SPOUSE_ALLOWANCE : 0;
  const children = count(inputs.childrenCount) * CHILD_ALLOWANCE;
  const childrenBorn2561 =
    count(inputs.childrenBorn2561Count) * CHILD_BORN_2561_ALLOWANCE;
  const parentsEntered = count(inputs.parentsCount) * PARENT_ALLOWANCE;
  const parents =
    Math.min(count(inputs.parentsCount), PARENT_COUNT_MAX) * PARENT_ALLOWANCE;
  const disabled = count(inputs.disabledCount) * DISABLED_ALLOWANCE;
  const prenatal = Math.min(amt(inputs.prenatalCare), PRENATAL_CAP);

  // --- ประกัน: ชีวิตกินโควต้ารวม 100k ก่อน สุขภาพได้ที่เหลือ (≤25k) ---
  const life = Math.min(amt(inputs.lifeInsurance), LIFE_HEALTH_COMBINED_CAP);
  const health = Math.min(
    amt(inputs.healthInsurance),
    HEALTH_INSURANCE_CAP,
    Math.max(0, LIFE_HEALTH_COMBINED_CAP - life),
  );
  const parentHealth = Math.min(
    amt(inputs.parentHealthInsurance),
    PARENT_HEALTH_INSURANCE_CAP,
  );

  // --- กลุ่มเกษียณ ≤500k: PVD จาก payroll ไม่โดนตัด ---
  const pfAllowance = Math.min(
    amt(paidProvidentFund),
    gross * PROVIDENT_FUND_RATE_CAP,
    PROVIDENT_FUND_MAX,
  );
  let pension = Math.min(
    amt(inputs.pensionInsurance),
    gross * PENSION_INSURANCE_RATE_CAP,
    PENSION_INSURANCE_MAX,
  );
  let rmf = Math.min(amt(inputs.rmf), gross * RMF_RATE_CAP, RMF_MAX);
  let savingsFund = Math.min(
    amt(inputs.nationalSavingsFund),
    NATIONAL_SAVINGS_FUND_CAP,
  );
  const groupOverflow = Math.max(
    0,
    pfAllowance + pension + rmf + savingsFund - RETIREMENT_GROUP_CAP,
  );
  if (groupOverflow > 0) {
    const cutRmf = Math.min(rmf, groupOverflow);
    rmf -= cutRmf;
    const cutPension = Math.min(pension, groupOverflow - cutRmf);
    pension -= cutPension;
    savingsFund -= Math.min(savingsFund, groupOverflow - cutRmf - cutPension);
  }

  const thaiEsg = Math.min(
    amt(inputs.thaiEsg),
    gross * THAI_ESG_RATE_CAP,
    THAI_ESG_MAX,
  );
  const homeLoan = Math.min(
    amt(inputs.homeLoanInterest),
    HOME_LOAN_INTEREST_CAP,
  );
  const other = amt(inputs.other);

  // --- บริจาค: ฐาน = เงินได้ − ค่าใช้จ่าย − ส่วนตัว − ปกส − PVD − ลดหย่อนอื่น ---
  const ssAllowance = Math.min(amt(paidSocialSecurity), SOCIAL_SECURITY_CAP);
  const expenseAllowance = Math.min(
    gross * EXPENSE_DEDUCTION_RATE,
    EXPENSE_DEDUCTION_CAP,
  );
  const nonDonationTotal =
    spouse + children + childrenBorn2561 + parents + disabled + prenatal +
    life + health + parentHealth + pension + rmf + savingsFund + thaiEsg +
    homeLoan + other;
  const donationBase = Math.max(
    0,
    gross - expenseAllowance - PERSONAL_ALLOWANCE - ssAllowance -
      pfAllowance - nonDonationTotal,
  );
  const donationEdu = Math.min(
    amt(inputs.donationEducation) * 2,
    donationBase * DONATION_RATE_CAP,
  );
  const donationGeneral = Math.min(
    amt(inputs.donationGeneral),
    Math.max(0, donationBase - donationEdu) * DONATION_RATE_CAP,
  );

  const lines: AllowanceLine[] = [
    { key: 'spouse', label: 'คู่สมรสไม่มีเงินได้', entered: spouse, applied: spouse, capped: false },
    { key: 'children', label: 'บุตร', entered: children, applied: children, capped: false },
    { key: 'childrenBorn2561', label: 'บุตรคนที่ 2+ (เกิด 2561+)', entered: childrenBorn2561, applied: childrenBorn2561, capped: false },
    { key: 'parents', label: 'อุปการะบิดามารดา', entered: parentsEntered, applied: parents, capped: count(inputs.parentsCount) > PARENT_COUNT_MAX },
    { key: 'disabled', label: 'อุปการะผู้พิการ/ทุพพลภาพ', entered: disabled, applied: disabled, capped: false },
    { key: 'prenatalCare', label: 'ฝากครรภ์/คลอดบุตร', entered: amt(inputs.prenatalCare), applied: prenatal, capped: prenatal < amt(inputs.prenatalCare) },
    { key: 'lifeInsurance', label: 'ประกันชีวิต', entered: amt(inputs.lifeInsurance), applied: life, capped: life < amt(inputs.lifeInsurance) },
    { key: 'healthInsurance', label: 'ประกันสุขภาพตนเอง', entered: amt(inputs.healthInsurance), applied: health, capped: health < amt(inputs.healthInsurance) },
    { key: 'parentHealthInsurance', label: 'ประกันสุขภาพพ่อแม่', entered: amt(inputs.parentHealthInsurance), applied: parentHealth, capped: parentHealth < amt(inputs.parentHealthInsurance) },
    { key: 'pensionInsurance', label: 'ประกันบำนาญ', entered: amt(inputs.pensionInsurance), applied: pension, capped: pension < amt(inputs.pensionInsurance) },
    { key: 'rmf', label: 'RMF', entered: amt(inputs.rmf), applied: rmf, capped: rmf < amt(inputs.rmf) },
    { key: 'thaiEsg', label: 'ThaiESG', entered: amt(inputs.thaiEsg), applied: thaiEsg, capped: thaiEsg < amt(inputs.thaiEsg) },
    { key: 'nationalSavingsFund', label: 'กอช', entered: amt(inputs.nationalSavingsFund), applied: savingsFund, capped: savingsFund < amt(inputs.nationalSavingsFund) },
    { key: 'homeLoanInterest', label: 'ดอกเบี้ยกู้บ้าน', entered: amt(inputs.homeLoanInterest), applied: homeLoan, capped: homeLoan < amt(inputs.homeLoanInterest) },
    { key: 'donationEducation', label: 'บริจาคการศึกษา (×2)', entered: amt(inputs.donationEducation), applied: donationEdu, capped: donationEdu < amt(inputs.donationEducation) * 2 },
    { key: 'donationGeneral', label: 'บริจาคทั่วไป', entered: amt(inputs.donationGeneral), applied: donationGeneral, capped: donationGeneral < amt(inputs.donationGeneral) },
    { key: 'other', label: 'อื่นๆ (มาตรการรายปี)', entered: other, applied: other, capped: false },
  ];

  return { lines, total: lines.reduce((sum, l) => sum + l.applied, 0) };
};
