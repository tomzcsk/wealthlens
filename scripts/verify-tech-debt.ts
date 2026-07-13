/**
 * Verification for F49 — หนี้เทคนิค.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-tech-debt.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NAV_ITEMS } from '../src/lib/nav';
import type { BankAccount, BankTransaction } from '../src/types';
import { EXPENSE_CATEGORIES } from '../src/types/expense-categories';
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

console.log('\n— T5: ไม่มีสำเนาสีหมวดใน src/components —');
{
  // กฎ: **ห้าม component ผูกชื่อหมวด → hex เอง** ต้องดึงจาก EXPENSE_CATEGORIES
  //
  // ทำไมไม่สแกน "hex ใดก็ตามที่ตรงกับสีหมวด" แบบที่แผนเขียนไว้: สีหมวดคือสีจาก
  // จานสี Tailwind มาตรฐาน (indigo/cyan/amber/emerald…) ซึ่งของอย่างอื่นก็ใช้
  // โดยชอบธรรม — YEAR_COLORS (สีของ**ปี**) ใน MultiYearComparison และ
  // COLOR_CAVEAT (#F59E0B) ใน NetWorthHistoryChart ชนกันพอดี. ประตูที่ดักของ
  // ถูกต้องด้วย = ประตูที่คนจะปิดทิ้ง. จึงดักที่ "การผูกหมวดกับสี" ซึ่งคือหนี้จริง
  const categoryKeys = Object.keys(EXPENSE_CATEGORIES).join('|');
  const mapping = new RegExp(`\\b(${categoryKeys})\\b\\s*:\\s*['"\`]#[0-9a-fA-F]{3,8}`, 'g');

  const files: string[] = [];
  const walk = (p: string): void => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) walk(join(p, e));
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      files.push(p);
    }
  };
  walk('src/components');

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const [hit] of src.matchAll(mapping)) offenders.push(`${file} ${hit.trim()}`);
    // ชื่อ CATEGORY_HEX_COLORS / CATEGORY_COLORS คือสำเนาที่เพิ่งถอดออกไป —
    // มันกลับมาเมื่อไหร่ ให้แดงทันที ไม่ต้องรอให้มีคนสังเกตว่าสีเพี้ยน
    if (/CATEGORY_(HEX_)?COLORS/.test(src)) offenders.push(`${file} CATEGORY_*COLORS`);
  }
  assert(
    `ไม่มี component ผูกชื่อหมวดกับ hex เอง (เจอ ${offenders.length})`,
    offenders.length === 0,
    offenders.slice(0, 5).join(' · '),
  );

  // และกราฟที่ต้องใช้สีหมวด ต้องดึงจาก canonical จริง ๆ (ไม่ใช่แค่ "ไม่มีสำเนา")
  for (const file of [
    'src/components/dashboard/ExpensePieChart.tsx',
    'src/components/analytics/TrendAnalysis.tsx',
  ]) {
    const src = readFileSync(file, 'utf8');
    assert(
      `${file.split('/').pop()} ดึงสีจาก EXPENSE_CATEGORIES`,
      src.includes('EXPENSE_CATEGORIES') && /\.hex\b/.test(src),
    );
  }
}

console.log('\n— T6: verify-mobile ตรวจทุกหน้าในทะเบียนเมนู —');
{
  const mobile = readFileSync('scripts/verify-mobile.ts', 'utf8');
  assert(
    'ROUTES derive จาก NAV_ITEMS ไม่ใช่พิมพ์มือ',
    mobile.includes('NAV_ITEMS'),
    'เพิ่มหน้าใหม่แล้วจะหลุดการตรวจเงียบ ๆ',
  );
  // กันเคสที่ import มาแต่ยังพิมพ์รายการมือทิ้งไว้ข้าง ๆ
  assert(
    'ไม่มีรายการ path พิมพ์มือหลงเหลือ',
    !/const ROUTES\s*=\s*\[\s*'\//.test(mobile),
  );
  console.log(`   (ทะเบียนมี ${NAV_ITEMS.length} หน้า)`);
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
