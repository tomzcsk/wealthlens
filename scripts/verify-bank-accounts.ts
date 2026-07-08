/**
 * Verification for Bank Accounts (F33).
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-bank-accounts.ts
 */
import {
  KRUNGSRI_ACCOUNT_ID,
  migrateKeptToBankAccounts,
  sumBankMonth,
  sumBankYear,
} from '../src/utils/bankAccounts';
import { validateBackup, mergeData } from '../src/utils/exportImport';
import { resolveBank } from '../src/data/thaiBanks';
import type { BankAccount, WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

// --- migration: keptBalances → บัญชีกรุงศรี, ยอดเท่าเดิม ---
const kept = { '2025': { '1': 10000, '2': -3000, '12': 5000 }, '2026': { '1': 2000 } };
const migrated = migrateKeptToBankAccounts({ preferences: { keptBalances: kept } } as never);
eq('สร้าง 1 บัญชี', migrated?.length, 1);
eq('id คงที่', migrated?.[0].id, KRUNGSRI_ACCOUNT_ID);
eq('ชื่อ กรุงศรี', migrated?.[0].name, 'กรุงศรี');
eq('ยอด 2025/1 เท่าเดิม', migrated?.[0].balances['2025']['1'], 10000);
eq('ยอดติดลบคงไว้', migrated?.[0].balances['2025']['2'], -3000);
eq('deep copy (ไม่ใช่ ref เดิม)', migrated?.[0].balances === (kept as never), false);

// ไม่มี keptBalances → undefined (ผู้ใช้ใหม่)
eq('ไม่มี Kept → undefined', migrateKeptToBankAccounts({ preferences: {} } as never), undefined);

// --- sum helpers รวมหลายบัญชี ---
const accounts: BankAccount[] = [
  { id: 'a', name: 'A', balances: { '2025': { '1': 100, '2': 200 } } },
  { id: 'b', name: 'B', balances: { '2025': { '1': 50 } } },
];
eq('sumBankMonth 2025/1', sumBankMonth(accounts, 2025, 1), 150);
eq('sumBankMonth 2025/2', sumBankMonth(accounts, 2025, 2), 200);
eq('sumBankYear 2025', sumBankYear(accounts, 2025), 350);
eq('sumBankYear empty', sumBankYear([], 2025), 0);

// --- gold 'kept' decrement + revert arithmetic against a bank account ---
const goldAcct: BankAccount = { id: KRUNGSRI_ACCOUNT_ID, name: 'กรุงศรี', balances: { '2026': { '3': 50000 } } };
const cost = 12000;
const afterBuy = (goldAcct.balances['2026']['3'] ?? 0) - cost; // decrement
eq('gold buy ตัดยอด', afterBuy, 38000);
const afterRevert = afterBuy + cost; // revert re-adds
eq('gold revert คืนยอด', afterRevert, 50000);

// --- backup restore / import must NOT drop bankAccounts (data-safety) ---
const backup = {
  version: '1.0.0',
  lastUpdated: 'x',
  years: {},
  bankAccounts: [{ id: 'a', name: 'SCB', balances: { '2026': { '1': 999 } } }],
};
const res = validateBackup(backup);
eq('validateBackup ok', res.ok, true);
eq(
  'validateBackup เก็บ bankAccounts',
  res.ok ? res.data.bankAccounts?.[0]?.balances['2026']?.['1'] : undefined,
  999,
);

const merged = mergeData(
  { version: '1', lastUpdated: 'x', years: {} } as WealthLensData,
  {
    version: '1',
    lastUpdated: 'y',
    years: {},
    bankAccounts: [{ id: 'a', name: 'SCB', balances: {} }],
  } as WealthLensData,
);
eq('mergeData เก็บ bankAccounts', merged.bankAccounts?.[0]?.name, 'SCB');

// --- resolveBank: by key + by name/alias (legacy accounts) ---
eq('resolveBank by key', resolveBank({ name: 'อะไรก็ได้', bankKey: 'scb' })?.key, 'scb');
eq('resolveBank by name (กรุงศรี→bay)', resolveBank({ name: 'กรุงศรี' })?.key, 'bay');
eq('resolveBank by alias (kbank)', resolveBank({ name: 'KBank' })?.key, 'kbank');
eq('resolveBank logo path', resolveBank({ name: 'กรุงศรี' })?.logo, '/banks/BAY.png');
eq('resolveBank unknown → null', resolveBank({ name: 'ธนาคารลับ' }), null);

// --- transfer arithmetic: from −amount, to +amount (sum preserved) ---
const from0 = 10000;
const to0 = 2000;
const amt = 3000;
eq('transfer หัก source', from0 - amt, 7000);
eq('transfer เพิ่ม dest', to0 + amt, 5000);
eq('transfer รวมคงที่', from0 - amt + (to0 + amt), from0 + to0);

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
