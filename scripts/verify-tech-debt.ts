/**
 * Verification for F49 — หนี้เทคนิค.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts
 */
import { readFileSync } from 'node:fs';

import type { BankAccount, BankTransaction } from '../src/types';
import { pruneEmptyBalanceKeys } from '../src/utils/balancePrune';

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

const acct = (
  id: string,
  balances: Record<string, Record<string, number>>,
): BankAccount => ({ id, name: id, balances }) as BankAccount;

const tx = (
  accountId: string,
  year: number,
  month: number,
  amount: number,
): BankTransaction =>
  ({
    id: `${accountId}-${year}-${month}-${amount}`,
    accountId,
    year,
    month,
    amount,
  }) as BankTransaction;

console.log('\n— T1: เซลล์ยอด 0 ที่ไม่มีรายการ → หายไป —');
{
  const accounts = [acct('a1', { '2026': { '7': 1000, '8': 0 } })];
  const [pruned] = pruneEmptyBalanceKeys(accounts, []);
  assert(
    'เดือน 8 (ยอด 0, ไม่มีรายการ) หายไป',
    pruned.balances['2026']?.['8'] === undefined,
  );
  assert('เดือน 7 (ยอดจริง) ยังอยู่', pruned.balances['2026']?.['7'] === 1000);
}

console.log('\n— T2: เซลล์ยอด 0 ที่ "มีรายการ" → ต้องอยู่ต่อ (invariant F40) —');
{
  // ฝาก 1,000 แล้วถอน 1,000 ในเดือนเดียวกัน → ยอดเดือนนั้น = 0 แต่มีรายการ 2 บรรทัด
  // ลบเซลล์นี้ = Σ tx (0) ไม่มีเซลล์ให้เทียบ → invariant พัง
  const accounts = [acct('a1', { '2026': { '7': 0 } })];
  const txs = [tx('a1', 2026, 7, 1000), tx('a1', 2026, 7, -1000)];
  const [pruned] = pruneEmptyBalanceKeys(accounts, txs);
  assert('เซลล์ยอด 0 ที่มีรายการ ยังอยู่', pruned.balances['2026']?.['7'] === 0);
}

console.log('\n— ปีที่ว่างเปล่าหลังเก็บกวาด ต้องไม่เหลือเป็นเปลือกว่าง —');
{
  const accounts = [acct('a1', { '2026': { '7': 100 }, '2027': { '7': 0 } })];
  const [pruned] = pruneEmptyBalanceKeys(accounts, []);
  assert('ปี 2027 (เหลือแต่เซลล์ 0) หายทั้งปี', pruned.balances['2027'] === undefined);
  assert('ปี 2026 ยังอยู่', pruned.balances['2026']?.['7'] === 100);
}

console.log('\n— ไม่มีอะไรให้เก็บกวาด → คืน array เดิม (identity) —');
{
  const accounts = [acct('a1', { '2026': { '7': 100 } })];
  const out = pruneEmptyBalanceKeys(accounts, []);
  assert('คืน reference เดิม ไม่สร้าง object ใหม่ทิ้ง ๆ ขว้าง ๆ', out === accounts);
}

console.log('\n— T4: สูตรบวกยอดอยู่ที่เดียว —');
{
  // ไม่ได้เทียบ "ชื่อฟังก์ชัน" แต่เทียบ "สูตร" — addRawBalance ยังต้องมีอยู่ (มันคือ
  // ป้ายบอกว่าทางนี้จงใจไม่จดรายการ) แค่ต้องไม่เขียนเลขคณิตซ้ำเอง
  const store = readFileSync('src/stores/financeStore.ts', 'utf8');
  const formula = /balances\[\w+\]\?\.\[\w+\]\s*\?\?\s*0\)\s*\+\s*delta/g;
  const hits = [...store.matchAll(formula)].length;
  assert(
    `financeStore ไม่เขียนสูตรบวกยอดเอง (เจอ ${hits} ที่)`,
    hits === 0,
    'ต้องเรียก applyBankDelta แทน',
  );
  assert(
    'ชื่อ addRawBalance ยังอยู่ (ป้ายบอกเจตนา "ทางนี้ไม่จดรายการ")',
    store.includes('const addRawBalance'),
  );

  const utils = readFileSync('src/utils/bankAccounts.ts', 'utf8');
  assert('สูตรอยู่ใน bankAccounts.ts', new RegExp(formula.source).test(utils));
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
