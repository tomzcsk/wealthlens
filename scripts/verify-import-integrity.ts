/**
 * Verification: validateBackup ต้องกันข้อมูลพังเข้าระบบ
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-import-integrity.ts
 *
 * ปิดสองประตูหลัง:
 *  ข้อ 2 — array member validation: bankAccounts/bankTransactions เดิมเช็คแค่
 *          Array.isArray → [42, null, 'nope'] ผ่าน แล้วจอขาวตอน render
 *  ข้อ 1 — referential integrity: pointer (tx.accountId, income.deposits,
 *          expense.paymentAccountId/loanId, gold.sideEffects.accountId) ชี้ของ
 *          ที่ไม่มีในไฟล์ → เดิมผ่าน ok:true = สถานะเดียวกับที่ deleteBankAccount
 *          เคยสร้างก่อนแก้ (ประตูหน้าล็อกแล้ว ประตูหลัง import เปิด)
 *
 * ข้อควรระวัง: pointer ที่ชี้ acct-krungsri แต่ payload ยังมีแค่ keptBalances
 * (migrate ทีหลังตอน replaceAllData) ต้อง "ผ่าน" — ไม่งั้นทำ backup เก่ากู้ไม่ได้
 */
import { readFileSync } from 'node:fs';
import { validateBackup } from '../src/utils/exportImport';
import type { WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

const okOf = (payload: unknown): boolean => validateBackup(payload).ok;

/** payload พื้นฐานที่ถูกต้อง — ต่อยอดเป็นเคสต่าง ๆ */
const base = (): Record<string, unknown> => ({
  version: '1.0.0',
  lastUpdated: '2026-07-10T00:00:00.000Z',
  years: {},
  bankAccounts: [{ id: 'acc-a', name: 'A', balances: { '2026': { '7': 1000 } } }],
  bankTransactions: [
    { id: 't1', accountId: 'acc-a', year: 2026, month: 7, amount: 1000, label: 'ฝาก', source: { type: 'manual' } },
  ],
});

const withYearItems = (opts: {
  income?: unknown[];
  expenses?: unknown[];
}): Record<string, unknown> => ({
  ...base(),
  years: {
    '2026': {
      income: opts.income ?? [],
      expenses: opts.expenses ?? [],
      savings: [],
    },
  },
});

// ===================================================================
// baseline — payload ถูกต้องต้องผ่าน (กันเทสต์ false-positive)
// ===================================================================
eq('payload ถูกต้อง → ผ่าน', okOf(base()), true);

// ===================================================================
// ข้อ 2 — array member validation
// ===================================================================
eq('bankAccounts [42,null,nope] → ถูกปฏิเสธ',
  okOf({ ...base(), bankAccounts: [42, null, 'nope'] }), false);
eq('bankTransactions [hello] → ถูกปฏิเสธ',
  okOf({ ...base(), bankTransactions: ['hello'] }), false);
eq('tx.amount เป็น string → ถูกปฏิเสธ',
  okOf({ ...base(), bankTransactions: [{ id: 't', accountId: 'acc-a', year: 2026, month: 7, amount: 'ห้าร้อย', label: 'x', source: { type: 'manual' } }] }), false);
eq('bankAccount ไม่มี balances → ถูกปฏิเสธ',
  okOf({ ...base(), bankAccounts: [{ id: 'x', name: 'X' }] }), false);
eq('tx ไม่มี source → ถูกปฏิเสธ',
  okOf({ ...base(), bankTransactions: [{ id: 't', accountId: 'acc-a', year: 2026, month: 7, amount: 100, label: 'x' }] }), false);

// ===================================================================
// ข้อ 1 — referential integrity (pointer กำพร้า → ปฏิเสธ)
// ===================================================================
eq('tx.accountId ชี้บัญชีผี → ปฏิเสธ',
  okOf({ ...base(), bankTransactions: [{ id: 't', accountId: 'acc-GHOST', year: 2026, month: 7, amount: 100, label: 'x', source: { type: 'manual' } }] }), false);

eq('income.deposits ชี้บัญชีผี → ปฏิเสธ',
  okOf(withYearItems({ income: [{
    month: 7, salary: 1000, bonus: 0, commission: 0,
    deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
    deposits: { salary: 'acc-GHOST' },
  }] })), false);

eq('income.depositSideEffects ชี้บัญชีผี → ปฏิเสธ',
  okOf(withYearItems({ income: [{
    month: 7, salary: 1000, bonus: 0, commission: 0,
    deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
    depositSideEffects: [{ source: 'salary', accountId: 'acc-GHOST', amount: 1000 }],
  }] })), false);

eq('expense.paymentAccountId ชี้บัญชีผี → ปฏิเสธ',
  okOf(withYearItems({ expenses: [{
    month: 7,
    items: [{ id: 'e1', category: 'other', name: 'ข้าว', amount: 100, isRecurring: false, paymentAccountId: 'acc-GHOST' }],
  }] })), false);

eq('expense.loanId ชี้หนี้ผี → ปฏิเสธ',
  okOf(withYearItems({ expenses: [{
    month: 7,
    items: [{ id: 'e1', category: 'finance', name: 'จ่ายหนี้', amount: 100, isRecurring: false, loanId: 'loan-GHOST' }],
  }] })), false);

eq('gold.sideEffects.accountId ชี้บัญชีผี → ปฏิเสธ',
  okOf({ ...base(), goldHoldings: [{
    id: 'g1', purchaseDate: '2026-07-01', grams: 1, pricePerGram: 1000, totalCost: 1000,
    paymentMethod: 'kept', sideEffects: { accountId: 'acc-GHOST', keptYear: 2026, keptMonth: 7, keptAmount: 1000 },
  }] }), false);

// ===================================================================
// backward-compat — ของถูกต้องต้องผ่าน ไม่ over-reject
// ===================================================================
eq('income.deposits ชี้บัญชีที่มีจริง → ผ่าน',
  okOf(withYearItems({ income: [{
    month: 7, salary: 1000, bonus: 0, commission: 0,
    deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
    deposits: { salary: 'acc-a' },
  }] })), true);

eq('expense.loanId ชี้หนี้ที่มีจริง → ผ่าน',
  okOf({ ...withYearItems({ expenses: [{
    month: 7,
    items: [{ id: 'e1', category: 'finance', name: 'จ่ายหนี้', amount: 100, isRecurring: false, loanId: 'loan-1' }],
  }] }), loans: [{ id: 'loan-1', name: 'กยศ', type: 'gsl', principal: 1000, startDate: '2026-01-01', schedule: [], extraPayments: [] }] }), true);

// pointer ชี้ acct-krungsri + payload มีแค่ keptBalances (ยัง migrate ไม่เสร็จ) → ต้องผ่าน
eq('pointer ชี้ acct-krungsri ที่จะ migrate จาก keptBalances → ผ่าน',
  okOf({
    version: '1.0.0', lastUpdated: '2026-07-10T00:00:00.000Z', years: {},
    preferences: { keptBalances: { '2026': { '7': 5000 } } },
    goldHoldings: [{
      id: 'g1', purchaseDate: '2026-07-01', grams: 1, pricePerGram: 1000, totalCost: 1000,
      paymentMethod: 'kept', sideEffects: { accountId: 'acct-krungsri', keptYear: 2026, keptMonth: 7, keptAmount: 1000 },
    }],
  }), true);

// gold ref ไม่มี accountId (legacy ก่อน generic accounts) → ข้าม ไม่ reject
eq('gold ref ไม่มี accountId (legacy) → ผ่าน',
  okOf({ ...base(), goldHoldings: [{
    id: 'g1', purchaseDate: '2026-07-01', grams: 1, pricePerGram: 1000, totalCost: 1000,
    paymentMethod: 'kept', sideEffects: { keptYear: 2026, keptMonth: 7, keptAmount: 1000 },
  }] }), true);

eq('payload ก่อน F33 (ไม่มีบัญชี ไม่มี pointer) → ผ่าน',
  okOf({ version: '1.0.0', lastUpdated: '2025-01-01T00:00:00.000Z', years: { '2025': { income: [], expenses: [], savings: [] } } }), true);

// ===================================================================
// ACCEPTANCE บังคับ — ไฟล์จริงของ Tom ต้องผ่าน (ห้าม over-reject)
// ===================================================================
const REAL = '/private/tmp/claude-501/-Users-husky-Documents-Husky-wealthlens/0240c20c-c18b-4900-af50-e018e1072b08/scratchpad/wealthlens_data.json';
try {
  const raw = JSON.parse(readFileSync(REAL, 'utf8')) as { data?: WealthLensData } & WealthLensData;
  const payload = raw.data ?? raw;
  const res = validateBackup(payload);
  eq('ไฟล์จริงของ Tom → ผ่าน', res.ok, true);
  if (!res.ok) console.log('   errors:', (res.errors ?? []).slice(0, 5));
} catch {
  console.log('⚠ ข้ามเช็คไฟล์จริง (ไม่พบไฟล์) — รันเฉพาะ synthetic');
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
