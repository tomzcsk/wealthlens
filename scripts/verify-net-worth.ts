/**
 * Verification for F38 — net worth.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-net-worth.ts
 */
import { computeNetWorth } from '../src/utils/netWorth';
import type { WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

const emptyData = {
  version: '1',
  lastUpdated: '2026-07-09T00:00:00.000Z',
  years: {},
} as unknown as WealthLensData;

// --- ว่างเปล่า → 0 ทุกช่อง ไม่ NaN ---
const zero = computeNetWorth(emptyData, { marketValue: 0, totalInvested: 0 }, [], []);
eq('assets ว่าง = 0', zero.totalAssets, 0);
eq('liabilities ว่าง = 0', zero.totalLiabilities, 0);
eq('netWorth ว่าง = 0', zero.netWorth, 0);
eq('ไม่ NaN', Number.isNaN(zero.netWorth), false);

// --- ธนาคาร + ออม (ตัดหมวด gold) ---
const data = {
  version: '1',
  lastUpdated: '2026-07-09T00:00:00.000Z',
  bankAccounts: [
    { id: 'a', name: 'A', balances: { '2025': { '1': 100000 }, '2026': { '1': -20000 } } },
  ],
  years: {
    '2026': {
      income: [],
      expenses: [],
      savings: [
        {
          month: 1,
          items: [
            { id: 's1', category: 'investment-dime', name: 'Dime', amount: 200000, isRecurring: true },
            { id: 's2', category: 'gold', name: 'ทองคำ', amount: 100000, isRecurring: false },
            { id: 's3', category: 'travel', name: 'ออมเที่ยว', amount: 20000, isRecurring: false },
          ],
        },
      ],
    },
  },
} as unknown as WealthLensData;

const nw = computeNetWorth(data, { marketValue: 130000, totalInvested: 100000 }, [], []);
const line = (b: typeof nw, key: string) => b.assets.find((l) => l.key === key)?.amount;
eq('ธนาคาร = ยอดสะสมทุกปี', line(nw, 'bank'), 80000);
eq('ทองใช้ราคาตลาด', line(nw, 'gold'), 130000);
eq('ออมตัดหมวด gold ออก', line(nw, 'savings'), 220000);
eq('totalAssets', nw.totalAssets, 430000);
eq('ไม่มีหนี้ → netWorth = assets', nw.netWorth, 430000);

// --- ทอง fallback เป็นราคาทุนเมื่อยังไม่ตั้ง spot ---
const noSpot = computeNetWorth(data, { marketValue: 0, totalInvested: 100000 }, [], []);
eq('fallback ราคาทุน', noSpot.assets.find((l) => l.key === 'gold')?.amount, 100000);
eq('ติดธง isCostBasis', noSpot.assets.find((l) => l.key === 'gold')?.isCostBasis, true);
eq('มี spot → ไม่ติดธง', nw.assets.find((l) => l.key === 'gold')?.isCostBasis, undefined);

// --- savingsByCategory ---
eq('savingsByCategory ไม่มี gold', nw.savingsByCategory.some((s) => s.category === 'gold'), false);
eq('savingsByCategory dime', nw.savingsByCategory.find((s) => s.category === 'investment-dime')?.amount, 200000);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
