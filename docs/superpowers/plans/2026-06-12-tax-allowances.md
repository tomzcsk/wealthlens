# Itemized Tax Allowances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ขยายหน้า 🧮 คำนวณภาษีจากช่องลดหย่อนก้อนเดียว เป็นช่องรายรายการครบชุดกรมสรรพากร พร้อม auto-cap, persist แยกตามปี, Drive sync

**Architecture:** ข้อมูลเก็บที่ root ของ `WealthLensData` เป็น `taxAllowances?: { [year]: TaxAllowanceInputs }` (pattern เดียวกับ `loans`). Pure function `resolveTaxAllowances` ใน `taxCalculator.ts` แปลงค่าที่กรอก → รายการ `{ entered, applied, capped }` ต่อช่อง แล้วส่งยอดรวมเข้า `calculateThaiPIT` เดิมผ่าน `extraAllowances`. UI เป็น component ใหม่ `TaxAllowanceForm` เขียนเข้า store ทุก edit (LocalStorage ทันที → Drive debounce 2s ผ่าน pipeline เดิม)

**Tech Stack:** React 18 + TypeScript strict + Zustand + Tailwind. Repo ไม่มี test runner — verify ด้วย typecheck/lint + verification script (`npx tsx`) + manual บน dev server

**Spec:** `docs/superpowers/specs/2026-06-12-tax-allowances-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | เพิ่ม `TaxAllowanceInputs` + field `taxAllowances` บน `WealthLensData` |
| `src/utils/taxCalculator.ts` | Modify | เพิ่ม cap constants, `EMPTY_TAX_ALLOWANCES`, `resolveTaxAllowances` |
| `scripts/verify-tax-allowances.ts` | Create | Verification script เคสคำนวณมือ (แทน unit test — repo ไม่มี runner) |
| `src/stores/financeStore.ts` | Modify | action `setTaxAllowances(year, inputs)` |
| `src/utils/exportImport.ts` | Modify | `validateBackup`/`mergeData` passthrough `taxAllowances` |
| `src/components/forms/TaxAllowanceForm.tsx` | Create | Form 5 กลุ่ม + badge cap |
| `src/pages/TaxCalculatorPage.tsx` | Modify | ถอด lump-sum field, ต่อ form + resolved lines เข้า breakdown |
| `features.json` | Modify | เพิ่ม F27 + อัปเดต progressSummary |

---

### Task 1: Types

**Files:**
- Modify: `src/types/index.ts` (วาง interface ใหม่หลัง `GoldSpotPrice` ~line 126, เพิ่ม field ใน `WealthLensData` หลัง `loans` ~line 51)

- [ ] **Step 1.1: เพิ่ม `TaxAllowanceInputs` interface** — วางหลัง `GoldSpotPrice` interface:

```ts
/**
 * Itemized PIT allowance inputs for one tax year — what Tom types on the
 * 🧮 tax page. Count fields are จำนวนคน; everything else is THB actually
 * paid. Legal caps are deliberately NOT applied at entry —
 * `resolveTaxAllowances` applies them at calculation time, so the raw
 * inputs stay faithful if the law's ceilings change.
 */
export interface TaxAllowanceInputs {
  /** คู่สมรสไม่มีเงินได้ → 60,000. */
  spouseNoIncome: boolean;
  /** บุตร → 30,000/คน. */
  childrenCount: number;
  /** บุตรคนที่ 2 เป็นต้นไปที่เกิดตั้งแต่ พ.ศ. 2561 → 60,000/คน. */
  childrenBorn2561Count: number;
  /** บิดามารดาอายุ 60+ (เงินได้ ≤30,000/ปี) → 30,000/คน สูงสุด 4 คน. */
  parentsCount: number;
  /** ผู้พิการ/ทุพพลภาพในอุปการะ → 60,000/คน. */
  disabledCount: number;
  /** ค่าฝากครรภ์/คลอดบุตร — ยอดจ่ายจริง (cap 60,000). */
  prenatalCare: number;
  /** เบี้ยประกันชีวิต (คุ้มครอง ≥10 ปี) — cap 100,000 ร่วมกับสุขภาพ. */
  lifeInsurance: number;
  /** เบี้ยประกันสุขภาพตนเอง — cap 25,000 และรวมประกันชีวิต ≤100,000. */
  healthInsurance: number;
  /** เบี้ยประกันสุขภาพบิดามารดา — cap 15,000. */
  parentHealthInsurance: number;
  /** เบี้ยประกันชีวิตแบบบำนาญ — ≤15% เงินได้, ≤200,000, กลุ่มเกษียณ 500k. */
  pensionInsurance: number;
  /** RMF — ≤30% เงินได้, ≤500,000, กลุ่มเกษียณ 500k. */
  rmf: number;
  /** ThaiESG — ≤30% เงินได้, ≤300,000 (แยกจากกลุ่มเกษียณ). */
  thaiEsg: number;
  /** กอช — cap 30,000, กลุ่มเกษียณ 500k. */
  nsf: number;
  /** ดอกเบี้ยเงินกู้ที่อยู่อาศัย — cap 100,000. */
  homeLoanInterest: number;
  /** บริจาคการศึกษา/กีฬา/รพ.รัฐ — นับ ×2, cap 10% หลังหักลดหย่อนอื่น. */
  donationEducation: number;
  /** บริจาคทั่วไป — cap 10% ของยอดหลังหักบริจาคการศึกษาแล้ว. */
  donationGeneral: number;
  /** มาตรการรายปี เช่น Easy E-Receipt — ไม่ cap. */
  other: number;
}
```

- [ ] **Step 1.2: เพิ่ม field ใน `WealthLensData`** — ต่อท้าย `loans?: Loan[];` (หลัง comment block ของ loans):

```ts
  /**
   * Itemized PIT allowance inputs keyed by 4-digit tax year. These are
   * annual filing inputs, not monthly ledger rows — so they live at the
   * root (pattern: `loans`/`goldHoldings`), not under YearData. Optional
   * so payloads written before this feature still hydrate.
   */
  taxAllowances?: { [year: string]: TaxAllowanceInputs };
```

- [ ] **Step 1.3: Verify**

Run: `npm run typecheck`
Expected: ผ่านเงียบๆ ไม่มี error

- [ ] **Step 1.4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(tax): TaxAllowanceInputs schema + taxAllowances บน WealthLensData"
```

---

### Task 2: `resolveTaxAllowances` + verification script

**Files:**
- Modify: `src/utils/taxCalculator.ts` (ต่อท้ายไฟล์)
- Create: `scripts/verify-tax-allowances.ts`

- [ ] **Step 2.1: เพิ่ม import ที่หัวไฟล์ `taxCalculator.ts`**

```ts
import type { TaxAllowanceInputs } from '@/types';
```

- [ ] **Step 2.2: เพิ่ม constants + types + function ต่อท้ายไฟล์**

```ts
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
export const NSF_CAP = 30_000;
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
  nsf: 0,
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
  | 'nsf'
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
  let nsf = Math.min(amt(inputs.nsf), NSF_CAP);
  const groupOverflow = Math.max(
    0,
    pfAllowance + pension + rmf + nsf - RETIREMENT_GROUP_CAP,
  );
  if (groupOverflow > 0) {
    const cutRmf = Math.min(rmf, groupOverflow);
    rmf -= cutRmf;
    const cutPension = Math.min(pension, groupOverflow - cutRmf);
    pension -= cutPension;
    nsf -= Math.min(nsf, groupOverflow - cutRmf - cutPension);
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
    life + health + parentHealth + pension + rmf + nsf + thaiEsg +
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
    { key: 'nsf', label: 'กอช', entered: amt(inputs.nsf), applied: nsf, capped: nsf < amt(inputs.nsf) },
    { key: 'homeLoanInterest', label: 'ดอกเบี้ยกู้บ้าน', entered: amt(inputs.homeLoanInterest), applied: homeLoan, capped: homeLoan < amt(inputs.homeLoanInterest) },
    { key: 'donationEducation', label: 'บริจาคการศึกษา (×2)', entered: amt(inputs.donationEducation), applied: donationEdu, capped: donationEdu < amt(inputs.donationEducation) * 2 },
    { key: 'donationGeneral', label: 'บริจาคทั่วไป', entered: amt(inputs.donationGeneral), applied: donationGeneral, capped: donationGeneral < amt(inputs.donationGeneral) },
    { key: 'other', label: 'อื่นๆ (มาตรการรายปี)', entered: other, applied: other, capped: false },
  ];

  return { lines, total: lines.reduce((sum, l) => sum + l.applied, 0) };
};
```

- [ ] **Step 2.3: สร้าง `scripts/verify-tax-allowances.ts`** — เคสคำนวณมือ:

```ts
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
if (JSON.stringify(capped.sort()) !== JSON.stringify([...expectedCapped].sort())) {
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
```

หมายเหตุ: `npx tsx` ต้อง resolve alias `@/types` — ถ้า tsx ไม่อ่าน alias ให้แก้ import ใน script เป็น relative ได้ แต่ตัว `taxCalculator.ts` ใช้ alias ตาม convention โปรเจกต์ ถ้า tsx fail เรื่อง alias ให้รันด้วย `npx tsx --tsconfig tsconfig.app.json` หรือเปลี่ยน import ใน `taxCalculator.ts` เป็น `../types` (relative ก็ใช้ได้เหมือนกันในไฟล์ utils อื่น — เช็ค `loanCalculations.ts` ว่าใช้แบบไหนแล้วทำตาม)

- [ ] **Step 2.4: รัน verification**

Run: `npx tsx scripts/verify-tax-allowances.ts`
Expected: `🎉 all tax allowance checks passed` (ทุกบรรทัด ✅)

- [ ] **Step 2.5: Typecheck + commit**

```bash
npm run typecheck && npm run lint
git add src/utils/taxCalculator.ts scripts/verify-tax-allowances.ts
git commit -m "feat(tax): resolveTaxAllowances — cap รายช่อง + กลุ่มเกษียณ + บริจาค"
```

---

### Task 3: Store action

**Files:**
- Modify: `src/stores/financeStore.ts`

- [ ] **Step 3.1: เพิ่ม import type** — ใน import block ของ types ที่หัวไฟล์ เพิ่ม `TaxAllowanceInputs`

- [ ] **Step 3.2: ประกาศ action ใน `interface FinanceState`** — วางหลัง declarations ของ loans (หลัง `deleteExtraPayment`):

```ts
  // --- Tax allowances ------------------------------------------------------
  /**
   * Replace the itemized PIT allowance inputs for one tax year. The tax
   * page writes the whole object on every keystroke (single-screen form),
   * so field-level patching isn't needed.
   */
  setTaxAllowances: (year: number, inputs: TaxAllowanceInputs) => void;
```

- [ ] **Step 3.3: Implement action** — วางใน store body ใกล้ๆ กลุ่ม loan actions ตาม pattern `addIncome`:

```ts
      setTaxAllowances: (year, inputs) =>
        set((state) => {
          const stamp = nowIso();
          return {
            data: {
              ...state.data,
              lastUpdated: stamp,
              taxAllowances: {
                ...state.data.taxAllowances,
                [String(year)]: inputs,
              },
            },
            lastUpdated: stamp,
          };
        }),
```

- [ ] **Step 3.4: Typecheck + commit**

```bash
npm run typecheck
git add src/stores/financeStore.ts
git commit -m "feat(tax): setTaxAllowances store action"
```

---

### Task 4: JSON backup passthrough

**Files:**
- Modify: `src/utils/exportImport.ts` (`validateBackup` ~line 366, `mergeData` ~line 478)

> Path import JSON backup สร้างก้อนใหม่เฉพาะ `version/lastUpdated/years` —
> ถ้าไม่เพิ่ม passthrough ค่าลดหย่อนจะหายตอน import backup
> (Drive sync path ปลอดภัยอยู่แล้วเพราะ `replaceAllData` spread ทั้งก้อน)

- [ ] **Step 4.1: `validateBackup`** — ก่อน `return { ok: true, ... }` เพิ่ม:

```ts
  // Pass through the itemized tax allowances if present. Light-touch
  // validation: accept the object shape as-is — resolveTaxAllowances
  // clamps bad values (negative/NaN) to 0 at calculation time anyway.
  const taxAllowances = isObject(parsed.taxAllowances)
    ? (parsed.taxAllowances as WealthLensData['taxAllowances'])
    : undefined;
```

แล้วเพิ่มใน object ที่ return:

```ts
  return {
    ok: true,
    data: {
      version: parsed.version as string,
      lastUpdated: parsed.lastUpdated as string,
      years,
      ...(taxAllowances ? { taxAllowances } : {}),
    },
  };
```

- [ ] **Step 4.2: `mergeData`** — merge รายปี (ของ import ทับปีที่ชนกัน):

```ts
export const mergeData = (
  local: WealthLensData,
  imported: WealthLensData,
): WealthLensData => {
  const years: WealthLensData['years'] = { ...local.years };
  for (const [yearKey, yearData] of Object.entries(imported.years)) {
    years[yearKey] = yearData;
  }
  const taxAllowances =
    local.taxAllowances || imported.taxAllowances
      ? { ...local.taxAllowances, ...imported.taxAllowances }
      : undefined;
  return {
    version: local.version,
    lastUpdated: new Date().toISOString(),
    years,
    ...(taxAllowances ? { taxAllowances } : {}),
  };
};
```

- [ ] **Step 4.3: Typecheck + commit**

```bash
npm run typecheck
git add src/utils/exportImport.ts
git commit -m "feat(tax): taxAllowances passthrough ใน JSON backup import/merge"
```

---

### Task 5: `TaxAllowanceForm` component

**Files:**
- Create: `src/components/forms/TaxAllowanceForm.tsx`

- [ ] **Step 5.1: สร้าง component** — data-driven form 5 กลุ่ม:

```tsx
import { type ReactNode } from 'react';

import type { TaxAllowanceInputs } from '@/types';
import {
  type AllowanceLine,
  type TaxAllowanceLineKey,
} from '@/utils/taxCalculator';
import { formatNumber, formatTHB } from '@/utils/formatters';

interface TaxAllowanceFormProps {
  value: TaxAllowanceInputs;
  /** Resolved lines จาก resolveTaxAllowances — ใช้โชว์ badge cap. */
  lines: AllowanceLine[];
  onChange: (next: TaxAllowanceInputs) => void;
}

type MoneyKey = {
  [K in keyof TaxAllowanceInputs]: TaxAllowanceInputs[K] extends number
    ? K
    : never;
}[keyof TaxAllowanceInputs];

interface MoneyFieldDef {
  key: MoneyKey;
  lineKey: TaxAllowanceLineKey;
  label: string;
  hint: string;
}

interface CountFieldDef {
  key: MoneyKey;
  lineKey: TaxAllowanceLineKey;
  label: string;
  hint: string;
}

interface FieldGroup {
  title: string;
  counts?: CountFieldDef[];
  money?: MoneyFieldDef[];
}

const GROUPS: FieldGroup[] = [
  {
    title: '👨‍👩‍👧 ครอบครัว',
    counts: [
      { key: 'childrenCount', lineKey: 'children', label: 'บุตร', hint: '30,000/คน' },
      { key: 'childrenBorn2561Count', lineKey: 'childrenBorn2561', label: 'บุตรคนที่ 2+ (เกิด 2561+)', hint: '60,000/คน' },
      { key: 'parentsCount', lineKey: 'parents', label: 'พ่อแม่ (อายุ 60+)', hint: '30,000/คน สูงสุด 4' },
      { key: 'disabledCount', lineKey: 'disabled', label: 'ผู้พิการ/ทุพพลภาพ', hint: '60,000/คน' },
    ],
    money: [
      { key: 'prenatalCare', lineKey: 'prenatalCare', label: 'ฝากครรภ์/คลอดบุตร', hint: 'สูงสุด 60,000' },
    ],
  },
  {
    title: '🛡️ ประกัน',
    money: [
      { key: 'lifeInsurance', lineKey: 'lifeInsurance', label: 'ประกันชีวิต', hint: 'รวมสุขภาพ ≤100,000' },
      { key: 'healthInsurance', lineKey: 'healthInsurance', label: 'ประกันสุขภาพตนเอง', hint: '≤25,000' },
      { key: 'parentHealthInsurance', lineKey: 'parentHealthInsurance', label: 'ประกันสุขภาพพ่อแม่', hint: '≤15,000' },
      { key: 'pensionInsurance', lineKey: 'pensionInsurance', label: 'ประกันบำนาญ', hint: '≤15% ของเงินได้, ≤200,000' },
    ],
  },
  {
    title: '📈 ลงทุน/เกษียณ',
    money: [
      { key: 'rmf', lineKey: 'rmf', label: 'RMF', hint: '≤30%, กลุ่มเกษียณรวม ≤500,000' },
      { key: 'thaiEsg', lineKey: 'thaiEsg', label: 'ThaiESG', hint: '≤30%, ≤300,000' },
      { key: 'nsf', lineKey: 'nsf', label: 'กอช', hint: '≤30,000' },
    ],
  },
  {
    title: '🏠 บ้าน',
    money: [
      { key: 'homeLoanInterest', lineKey: 'homeLoanInterest', label: 'ดอกเบี้ยเงินกู้บ้าน', hint: '≤100,000' },
    ],
  },
  {
    title: '🎁 บริจาค + อื่นๆ',
    money: [
      { key: 'donationEducation', lineKey: 'donationEducation', label: 'บริจาคการศึกษา/รพ.รัฐ', hint: 'นับ ×2, ≤10%' },
      { key: 'donationGeneral', lineKey: 'donationGeneral', label: 'บริจาคทั่วไป', hint: '≤10%' },
      { key: 'other', lineKey: 'other', label: 'อื่นๆ (เช่น Easy E-Receipt)', hint: 'ตามมาตรการปีนั้น' },
    ],
  },
];

const findLine = (
  lines: AllowanceLine[],
  key: TaxAllowanceLineKey,
): AllowanceLine | undefined => lines.find((l) => l.key === key);

export const TaxAllowanceForm = ({
  value,
  lines,
  onChange,
}: TaxAllowanceFormProps): ReactNode => {
  const setNumber = (key: MoneyKey, raw: string): void => {
    const digits = raw.replace(/[^\d]/g, '');
    onChange({ ...value, [key]: digits === '' ? 0 : Number(digits) });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">ลดหย่อน</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.spouseNoIncome}
            onChange={(e) =>
              onChange({ ...value, spouseNoIncome: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-slate-700">
            คู่สมรสไม่มีเงินได้ <span className="text-slate-400">(60,000)</span>
          </span>
        </label>
      </header>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-3">
          <legend className="text-sm font-semibold text-slate-600">
            {group.title}
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.counts?.map((f) => (
              <CountField
                key={f.key}
                def={f}
                count={value[f.key]}
                line={findLine(lines, f.lineKey)}
                onChange={(raw) => setNumber(f.key, raw)}
              />
            ))}
            {group.money?.map((f) => (
              <MoneyField
                key={f.key}
                def={f}
                amount={value[f.key]}
                line={findLine(lines, f.lineKey)}
                onChange={(raw) => setNumber(f.key, raw)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
};

interface CountFieldProps {
  def: CountFieldDef;
  count: number;
  line: AllowanceLine | undefined;
  onChange: (raw: string) => void;
}

const CountField = ({ def, count, line, onChange }: CountFieldProps): ReactNode => (
  <label className="block">
    <span className="text-xs font-medium text-slate-600">
      {def.label} <span className="text-slate-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={count === 0 ? '' : String(count)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-xs text-slate-500">คน</span>
      {line && line.applied > 0 && (
        <span className="text-xs tabular-nums text-slate-500">
          = {formatTHB(line.applied)}
        </span>
      )}
      <CapBadge line={line} />
    </div>
  </label>
);

interface MoneyFieldProps {
  def: MoneyFieldDef;
  amount: number;
  line: AllowanceLine | undefined;
  onChange: (raw: string) => void;
}

const MoneyField = ({ def, amount, line, onChange }: MoneyFieldProps): ReactNode => (
  <label className="block">
    <span className="text-xs font-medium text-slate-600">
      {def.label} <span className="text-slate-400">({def.hint})</span>
    </span>
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        value={amount === 0 ? '' : formatNumber(amount)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums text-right focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <CapBadge line={line} />
    </div>
  </label>
);

const CapBadge = ({ line }: { line: AllowanceLine | undefined }): ReactNode => {
  if (!line || !line.capped) return null;
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      ใช้ได้ {formatTHB(line.applied)}
    </span>
  );
};

export default TaxAllowanceForm;
```

หมายเหตุ: เช็ค signature จริงของ `formatNumber`/`formatTHB` ใน `src/utils/formatters` ก่อนใช้ (page เดิมใช้ทั้งคู่อยู่แล้ว — ตามแบบเดิม)

- [ ] **Step 5.2: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint
git add src/components/forms/TaxAllowanceForm.tsx
git commit -m "feat(tax): TaxAllowanceForm — ช่องลดหย่อน 5 กลุ่ม + badge cap"
```

---

### Task 6: ต่อเข้า `TaxCalculatorPage`

**Files:**
- Modify: `src/pages/TaxCalculatorPage.tsx`

- [ ] **Step 6.1: แก้ imports** — เพิ่ม:

```ts
import { TaxAllowanceForm } from '@/components/forms/TaxAllowanceForm';
import {
  calculateThaiPIT,
  EMPTY_TAX_ALLOWANCES,
  resolveTaxAllowances,
} from '@/utils/taxCalculator';
```

(แทน import `calculateThaiPIT` เดิม — และถ้า `formatNumber` ไม่ถูกใช้แล้วหลังถอด lump-sum field ให้เอาออกจาก import ด้วย กัน lint unused)

- [ ] **Step 6.2: ถอด lump-sum state** — ลบ `const [extraInput, setExtraInput] = useState('')` และ `extraAllowances` memo และ JSX `<label>` "ลดหย่อนเพิ่มเติม (ประกัน, RMF, ...)" ทั้งบล็อก (บรรทัด ~134-149 เดิม)

- [ ] **Step 6.3: อ่าน/เขียน store + resolve** — เพิ่มใน component body:

```ts
  const storedAllowances = useFinanceStore(
    (s) => s.data.taxAllowances?.[String(selectedYear)],
  );
  const allowanceInputs = storedAllowances ?? EMPTY_TAX_ALLOWANCES;
  const setTaxAllowances = useFinanceStore((s) => s.setTaxAllowances);

  const grossIncome =
    summary.salary +
    (includeBonus ? summary.bonus : 0) +
    (includeCommission ? summary.commission : 0);

  const resolvedAllowances = useMemo(
    () =>
      resolveTaxAllowances(
        allowanceInputs,
        grossIncome,
        deductionBreakdown.socialSecurity,
        deductionBreakdown.providentFund,
      ),
    [allowanceInputs, grossIncome, deductionBreakdown],
  );
```

แล้วแก้ `result` memo ให้ใช้ `grossIncome` + `resolvedAllowances.total`:

```ts
  const result = useMemo(
    () =>
      calculateThaiPIT({
        income: grossIncome,
        socialSecurity: deductionBreakdown.socialSecurity,
        providentFund: deductionBreakdown.providentFund,
        extraAllowances: resolvedAllowances.total,
      }),
    [grossIncome, deductionBreakdown, resolvedAllowances],
  );
```

- [ ] **Step 6.4: วาง form ใน JSX** — หลัง section เลือกปี/toggle (ก่อน grid 2 คอลัมน์):

```tsx
      <TaxAllowanceForm
        value={allowanceInputs}
        lines={resolvedAllowances.lines}
        onChange={(next) => setTaxAllowances(selectedYear, next)}
      />
```

- [ ] **Step 6.5: Breakdown panel แสดงรายช่อง** — แทนบล็อก `{result.extraAllowances > 0 && (<Row label="หักลดหย่อนอื่นๆ" ... />)}` ด้วย:

```tsx
          {resolvedAllowances.lines
            .filter((l) => l.applied > 0)
            .map((l) => (
              <Row key={l.key} label={`หัก${l.label}`} value={-l.applied} tone="muted" />
            ))}
```

- [ ] **Step 6.6: Typecheck + lint + commit**

```bash
npm run typecheck && npm run lint
git add src/pages/TaxCalculatorPage.tsx
git commit -m "feat(tax): ต่อช่องลดหย่อนรายช่องเข้าหน้าคำนวณภาษี + persist ตามปี"
```

---

### Task 7: Manual verification + features.json

**Files:**
- Modify: `features.json`

- [ ] **Step 7.1: รัน dev server แล้วเช็คเคสจริง**

Run: `npm run dev` → เปิดหน้า 🧮 คำนวณภาษี แล้วตรวจ:

1. กรอกประกันชีวิต `150,000` → badge ส้ม "ใช้ได้ ฿100,000" + panel ขวาแสดง −฿100,000
2. กรอกพ่อแม่ `5` คน → badge (เกิน 4 คน) applied = ฿120,000
3. ติ๊ก "รวมคอม" → cap % (RMF/บำนาญ) คำนวณใหม่ทันที
4. Refresh browser → ค่าที่กรอกอยู่ครบ (persist)
5. สลับปี 2025 ↔ 2026 → ค่าลดหย่อนแยกกันคนละชุด ปีที่ไม่เคยกรอกว่างหมด
6. DevTools → Application → LocalStorage → key `wealthlens_data` มี `taxAllowances`
7. (ถ้า login Drive อยู่) sync indicator ขึ้น Syncing → Synced หลังแก้ค่า 2 วิ

- [ ] **Step 7.2: เช็ค export/import รอบเดียว**

Settings → Export backup → เปิดไฟล์ดูว่ามี `taxAllowances` → Import กลับ (merge) → ค่ายังอยู่

- [ ] **Step 7.3: เพิ่ม F27 ใน `features.json`** — ใส่ใน `phases[4].features` (phase_4):

```json
{
  "id": "F27",
  "name": "Itemized Tax Allowances (ลดหย่อนรายช่อง)",
  "description": "หน้าคำนวณภาษีรองรับช่องลดหย่อนครบชุดกรมสรรพากร — auto-cap, persist แยกตามปี, Drive sync",
  "status": "completed",
  "priority": "P1",
  "phase": "phase_4",
  "acceptanceCriteria": [
    "ช่องลดหย่อนครบ 5 กลุ่ม: ครอบครัว/ประกัน/ลงทุน/บ้าน/บริจาค+อื่นๆ",
    "ช่องครอบครัวกรอกเป็นจำนวนคน ระบบคูณอัตราให้",
    "Cap อัตโนมัติทุกช่อง + กลุ่มเกษียณรวม ≤500,000 + บริจาคคิดท้ายสุด ≤10%",
    "Badge แสดงยอดที่ใช้ได้จริงเมื่อกรอกเกิน cap",
    "Persist แยกตามปีใน WealthLensData.taxAllowances + Drive sync + JSON backup",
    "Payload เก่าไม่มี field ยัง hydrate ได้ (optional, backward-compat)"
  ],
  "estimatedHours": 6,
  "dependencies": [],
  "checkpoint": {
    "completed": true,
    "completedAt": "2026-06-12",
    "notes": "Spec: docs/superpowers/specs/2026-06-12-tax-allowances-design.md"
  }
}
```

และอัปเดต `progressSummary`: `totalFeatures: 35`, `completed: 35`

- [ ] **Step 7.4: Commit ปิดงาน**

```bash
git add features.json
git commit -m "docs: F27 itemized tax allowances — completed"
```

---

## Self-Review Notes

- Spec coverage: schema (Task 1), cap rules ทุกแถวในตาราง spec (Task 2 + verification), persist/sync (Task 3), JSON backup (Task 4), UI 5 กลุ่ม + badge + panel รายช่อง + เปลี่ยนปี (Task 5-6), edge cases ค่าติดลบ/รายได้ 0 (Task 2 clamps + script), manual verification (Task 7) ✓
- Type consistency: `TaxAllowanceInputs` (types) ↔ `resolveTaxAllowances(inputs, gross, ss, pf)` ↔ `setTaxAllowances(year, inputs)` ↔ props ของ `TaxAllowanceForm` ตรงกันทุกจุด ✓
- ไม่มี placeholder — โค้ดเต็มทุก step ✓
