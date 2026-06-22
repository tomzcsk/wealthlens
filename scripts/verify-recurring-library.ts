/**
 * Hand-computed verification for the recurring-fill library (master-list picker).
 * Repo has no test runner — run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-recurring-library.ts
 *
 * Builds a synthetic WealthLensData and asserts buildRecurringExpenseLibrary:
 *   - classifies present / active / history correctly
 *   - dedupes by name (most-recent category wins)
 *   - infers stable amount (carry stable, 0 when it varies)
 *   - sorts active → history → present
 */
import {
  buildRecurringExpenseLibrary,
  type RecurringLibraryEntry,
} from '../src/utils/recurringTemplate';
import type { WealthLensData } from '../src/types';

let failures = 0;
const expectEq = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.error(`✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  } else {
    console.log(`✓ ${label}`);
  }
};

const exp = (
  month: number,
  items: Array<{ name: string; category: string; amount: number; rec?: boolean }>,
) => ({
  month,
  items: items.map((it, i) => ({
    id: `m${month}-${i}`,
    category: it.category as never,
    name: it.name,
    amount: it.amount,
    isRecurring: it.rec ?? false,
  })),
});

// Timeline (2026): build the library AS OF month 4 (April).
//  - Jan: Netflix 419 (rec), ค่าไฟ 1000 (rec), ChatGPT 720 (rec)
//  - Feb: Netflix 419 (rec), ค่าไฟ 1500 (rec)            ← ChatGPT dropped
//  - Mar: Netflix 419 (rec), ค่าไฟ 1200 (rec), บ้าน 25000 (rec)  ← most-recent recurring month = "active"
//  - Apr (target): Netflix already present (rec)
const data: WealthLensData = {
  version: '1',
  lastUpdated: '2026-04-01',
  years: {
    '2026': {
      income: [],
      expenses: [
        exp(1, [
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
          { name: 'ค่าไฟบ้าน', category: 'utilities', amount: 1000, rec: true },
          { name: 'ChatGPT', category: 'subscription', amount: 720, rec: true },
        ]),
        exp(2, [
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
          { name: 'ค่าไฟบ้าน', category: 'utilities', amount: 1500, rec: true },
        ]),
        exp(3, [
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
          { name: 'ค่าไฟบ้าน', category: 'utilities', amount: 1200, rec: true },
          { name: 'บ้าน', category: 'housing', amount: 25000, rec: true },
        ]),
        exp(4, [
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
        ]),
      ],
      savings: [],
    },
  },
};

const lib = buildRecurringExpenseLibrary(data, 2026, 4);
const byName = (n: string): RecurringLibraryEntry | undefined =>
  lib.find((e) => e.name === n);

// Four distinct recurring names ever seen: Netflix, ค่าไฟบ้าน, ChatGPT, บ้าน
expectEq('library has 4 distinct items', lib.length, 4);

// Netflix is in April already → present
expectEq('Netflix → present', byName('Netflix')?.status, 'present');

// บ้าน + ค่าไฟบ้าน were recurring in March (most-recent recurring month) → active
expectEq('บ้าน → active', byName('บ้าน')?.status, 'active');
expectEq('ค่าไฟบ้าน → active', byName('ค่าไฟบ้าน')?.status, 'active');

// ChatGPT last recurred in Jan (not in active month, not present) → history
expectEq('ChatGPT → history', byName('ChatGPT')?.status, 'history');

// Amount inference: บ้าน single obs → 25000; ค่าไฟ varies (1200/1500/1000) → 0
expectEq('บ้าน amount carried', byName('บ้าน')?.amount, 25000);
expectEq('ค่าไฟบ้าน varies → 0', byName('ค่าไฟบ้าน')?.amount, 0);
expectEq('ChatGPT single obs → 720', byName('ChatGPT')?.amount, 720);

// Sort order: active(s) first, then history, then present last.
expectEq('last entry is present (Netflix)', lib[lib.length - 1]?.status, 'present');
expectEq('first entry is active', lib[0]?.status, 'active');

// Category dedup uses most-recent occurrence (ค่าไฟ stayed utilities)
expectEq('ค่าไฟบ้าน category', byName('ค่าไฟบ้าน')?.category, 'utilities');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
