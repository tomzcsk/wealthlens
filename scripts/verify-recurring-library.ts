/**
 * Hand-computed verification for the recurring-fill library (master-list picker).
 * Repo has no test runner — run with:
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-recurring-library.ts
 *
 * Part 1 (pure) — buildRecurringExpenseLibrary:
 *   - classifies present / active / history correctly
 *   - dedupes by name (most-recent category wins)
 *   - infers stable amount (carry stable, 0 when it varies)
 *   - sorts active → history → present
 *
 * Part 2 (store-level) — the resurrection-proof fix for the 🗑️ button:
 *   deleting a library row must clear `isRecurring` on EVERY matching item in
 *   EVERY month/year, so `buildLibrary` (which walks back up to 36 months for
 *   the most recent month with any recurring item) can never resurrect it.
 *   These drive the real Zustand store the same way
 *   scripts/verify-installment-deduction.ts does.
 */
import {
  buildRecurringExpenseLibrary,
  buildRecurringSavingsLibrary,
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

const sav = (
  month: number,
  items: Array<{ name: string; category: string; amount: number; rec?: boolean }>,
) => ({
  month,
  items: items.map((it, i) => ({
    id: `s${month}-${i}`,
    category: it.category as never,
    name: it.name,
    amount: it.amount,
    isRecurring: it.rec ?? false,
  })),
});

// ===========================================================================
// Part 1 — pure buildRecurringExpenseLibrary classification
// ===========================================================================

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

// Only active + present — no old "history". Active set = March (most-recent
// recurring month) minus present. ChatGPT (last in Jan) must NOT appear.
//   present: Netflix
//   active:  ค่าไฟบ้าน, บ้าน
expectEq('library has 3 items (no history)', lib.length, 3);
expectEq('ChatGPT dropped (was history)', byName('ChatGPT'), undefined);

// Netflix is in April already → present
expectEq('Netflix → present', byName('Netflix')?.status, 'present');

// บ้าน + ค่าไฟบ้าน were recurring in March (most-recent recurring month) → active
expectEq('บ้าน → active', byName('บ้าน')?.status, 'active');
expectEq('ค่าไฟบ้าน → active', byName('ค่าไฟบ้าน')?.status, 'active');

// Amount inference: บ้าน single obs → 25000; ค่าไฟ varies (1200/1500/1000) → 0
expectEq('บ้าน amount carried', byName('บ้าน')?.amount, 25000);
expectEq('ค่าไฟบ้าน varies → 0', byName('ค่าไฟบ้าน')?.amount, 0);

// Present amount = the month's actual value (Netflix 419 in April)
expectEq('Netflix present amount', byName('Netflix')?.amount, 419);

// Sort order: active first, present last.
expectEq('first entry is active', lib[0]?.status, 'active');
expectEq('last entry is present (Netflix)', lib[lib.length - 1]?.status, 'present');

// Category from the active month (ค่าไฟ stayed utilities)
expectEq('ค่าไฟบ้าน category', byName('ค่าไฟบ้าน')?.category, 'utilities');

// ===========================================================================
// Part 2 — store-level "เลิกเป็นรายการประจำถาวร" (stopRecurring*)
// ===========================================================================

// localStorage shim MUST be installed before importing the store so zustand
// persist can create cleanly in node (same trick as verify-installment-deduction).
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

/**
 * Seed with "บ้าน" recurring across MULTIPLE months — crucially including
 * 2025-12, which is OLDER than the previous month. This is the exact shape
 * that made the old local-only 🗑️ fail: even after clearing recent months,
 * buildLibrary would step back 36 months and resurrect บ้าน from the oldest
 * recurring month. Netflix recurs alongside so a real recurring item proves
 * unaffected.
 */
const seedExpenses = (): WealthLensData => ({
  version: '1',
  lastUpdated: '2026-01-01',
  years: {
    '2025': {
      income: [],
      expenses: [
        exp(12, [{ name: 'บ้าน', category: 'housing', amount: 25000, rec: true }]),
      ],
      savings: [],
    },
    '2026': {
      income: [],
      expenses: [
        exp(1, [
          { name: 'บ้าน', category: 'housing', amount: 25000, rec: true },
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
        ]),
        exp(2, [{ name: 'บ้าน', category: 'housing', amount: 25000, rec: true }]),
        exp(3, [
          { name: 'บ้าน', category: 'housing', amount: 25000, rec: true },
          { name: 'Netflix', category: 'subscription', amount: 419, rec: true },
        ]),
      ],
      savings: [],
    },
  },
});

const seedSavings = (): WealthLensData => ({
  version: '1',
  lastUpdated: '2026-01-01',
  years: {
    '2026': {
      income: [],
      expenses: [
        exp(3, [{ name: 'บ้าน', category: 'housing', amount: 25000, rec: true }]),
      ],
      savings: [
        sav(1, [{ name: 'ออมทริป', category: 'general', amount: 5000, rec: true }]),
        sav(3, [{ name: 'ออมทริป', category: 'general', amount: 5000, rec: true }]),
      ],
    },
  },
});

const run = async (): Promise<void> => {
  const { useFinanceStore } = await import('../src/stores/financeStore');
  const s = () => useFinanceStore.getState();

  // --- stopRecurringExpense: retires across ALL months, resurrection-proof ---
  s().replaceAllData(seedExpenses());
  const before = buildRecurringExpenseLibrary(s().data, 2026, 6);
  expectEq('บ้าน listed before stop', before.some((e) => e.name === 'บ้าน'), true);

  s().stopRecurringExpense('บ้าน');

  const after = buildRecurringExpenseLibrary(s().data, 2026, 6);
  expectEq(
    'บ้าน gone after stop (current month)',
    after.find((e) => e.name === 'บ้าน'),
    undefined,
  );
  // Prove it cannot resurrect from an OLDER month: as of Feb the walk-back
  // would previously find บ้าน in Jan / Dec-2025.
  const stepped = buildRecurringExpenseLibrary(s().data, 2026, 2);
  expectEq(
    'บ้าน cannot resurrect from older month',
    stepped.find((e) => e.name === 'บ้าน'),
    undefined,
  );
  // A different recurring item is unaffected.
  expectEq('Netflix still recurs after บ้าน stop', after.find((e) => e.name === 'Netflix')?.status, 'active');

  // Amounts / ids / other items untouched — only the flag is flipped.
  const mar = s().data.years['2026'].expenses.find((e) => e.month === 3)!;
  const baanMar = mar.items.find((it) => it.name === 'บ้าน')!;
  expectEq('บ้าน amount untouched', baanMar.amount, 25000);
  expectEq('บ้าน id untouched', baanMar.id, 'm3-0');
  expectEq('บ้าน isRecurring cleared', baanMar.isRecurring, false);
  expectEq('Netflix isRecurring intact', mar.items.find((it) => it.name === 'Netflix')!.isRecurring, true);

  // --- name matching is case + whitespace insensitive ---
  s().replaceAllData(seedExpenses());
  s().stopRecurringExpense('  บ้าน '); // padded + spaces
  const wsLib = buildRecurringExpenseLibrary(s().data, 2026, 6);
  expectEq('whitespace-padded name matches', wsLib.find((e) => e.name === 'บ้าน'), undefined);
  s().stopRecurringExpense('netflix'); // lowercase vs stored "Netflix"
  const caseLib = buildRecurringExpenseLibrary(s().data, 2026, 6);
  expectEq('case-insensitive name matches', caseLib.find((e) => e.name === 'Netflix'), undefined);

  // --- stopRecurringSavings: savings only, never touches expenses ---
  s().replaceAllData(seedSavings());
  const sBefore = buildRecurringSavingsLibrary(s().data, 2026, 6);
  expectEq('ออมทริป listed before stop', sBefore.some((e) => e.name === 'ออมทริป'), true);

  s().stopRecurringSavings('ออมทริป');
  const sAfter = buildRecurringSavingsLibrary(s().data, 2026, 6);
  expectEq('ออมทริป gone after stop', sAfter.find((e) => e.name === 'ออมทริป'), undefined);
  // Expenses recurring set is untouched by a savings stop.
  const eStill = buildRecurringExpenseLibrary(s().data, 2026, 6);
  expectEq('stopRecurringSavings leaves expenses alone', eStill.find((e) => e.name === 'บ้าน')?.status, 'active');

  // --- no-op: a name that matches nothing must NOT bump lastUpdated ---
  s().replaceAllData(seedExpenses());
  const stampBefore = s().lastUpdated;
  s().stopRecurringExpense('ไม่มีรายการนี้จริง');
  expectEq('no match → lastUpdated unchanged', s().lastUpdated, stampBefore);
  s().stopRecurringSavings('ไม่มีรายการออมนี้');
  expectEq('no savings match → lastUpdated unchanged', s().lastUpdated, stampBefore);

  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

void run();
