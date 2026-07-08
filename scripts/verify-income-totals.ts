/**
 * Verification for otherIncome (F32) — proves the new 4th income source flows
 * like commission AND that existing seed year totals are unchanged (otherIncome
 * defaults 0). Run:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-income-totals.ts
 */
import seedData from '../src/data/seedData';
import { calculateNetAll } from '../src/utils/calculations';
import { selectYearSummary, selectMonthSummary } from '../src/stores/selectors';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(actual)} (expected ${String(expected)})`);
};

// --- Backward-compat: seed year netAll UNCHANGED (otherIncome absent → 0) ---
const seedSnap = { data: seedData as unknown as import('../src/types').WealthLensData };
expectEq('2023 netAll unchanged', selectYearSummary(seedSnap, 2023).netAll, 1695936);
expectEq('2024 netAll unchanged', selectYearSummary(seedSnap, 2024).netAll, 2382922);
expectEq('2025 netAll unchanged', selectYearSummary(seedSnap, 2025).netAll, 2519109);
expectEq('2026 netAll unchanged', selectYearSummary(seedSnap, 2026).netAll, 890491);
// per-source sums unchanged
expectEq('2024 commission unchanged', selectYearSummary(seedSnap, 2024).commission, 1041800);
// new per-source field present and 0 for seed (no otherIncome anywhere)
expectEq('2024 otherIncome = 0', selectYearSummary(seedSnap, 2024).otherIncome, 0);

// --- calculateNetAll includes otherIncome (defaults 0 when omitted) ---
expectEq('calcNetAll with other', calculateNetAll({ salary: 100, bonus: 0, commission: 10, totalDeductions: 0, otherIncome: 5 }), 115);
expectEq('calcNetAll omit other', calculateNetAll({ salary: 100, bonus: 0, commission: 10, totalDeductions: 0 }), 110);

// --- otherIncome flows into month netAll + gross like commission ---
const synth = {
  data: {
    version: '1.0.0',
    lastUpdated: '',
    years: {
      '2099': {
        income: [{ month: 1, salary: 100, bonus: 0, commission: 0, otherIncome: 50, deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 } }],
        expenses: [],
        savings: [],
      },
    },
  } as unknown as import('../src/types').WealthLensData,
};
const ms = selectMonthSummary(synth, 2099, 1);
expectEq('otherIncome → month netAll', ms.netAll, 150);
expectEq('otherIncome → month gross', ms.gross, 150);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
