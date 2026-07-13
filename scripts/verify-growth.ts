/**
 * Verification for F48 — หน้าเติบโต.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts
 */
import type { WealthLensData } from '../src/types';
import { endOfMonth, monthsIn, parseYm, toYm } from '../src/utils/monthRange';
import { buildSavingsRateSeries, rollingAverage } from '../src/utils/savingsRate';
import { buildNetWorthHistory, growthBetween } from '../src/utils/netWorthHistory';

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

console.log('\n— monthRange —');
assert('toYm(2025, 7) = 2025-07', toYm(2025, 7) === '2025-07');
assert('toYm เติมศูนย์หน้า', toYm(2025, 1) === '2025-01');
assert('parseYm คืนตัวเลข', parseYm('2025-07').year === 2025 && parseYm('2025-07').month === 7);
{
  const months = monthsIn({ '2024': {}, '2025': {} } as never);
  assert(`สองปี = 24 เดือน (ได้ ${months.length})`, months.length === 24);
  assert('เรียงจากเก่าไปใหม่', months[0] === '2024-01' && months[23] === '2025-12');
}
{
  // วันสิ้นเดือนต้องถูกจริง ไม่ใช่ 30 ทุกเดือน — ใช้เป็น referenceDate ของหนี้
  const feb = endOfMonth('2024-02');
  assert('ก.พ. 2024 (ปีอธิกสุรทิน) = 29', feb.getDate() === 29, String(feb.getDate()));
  const dec = endOfMonth('2025-12');
  assert('ธ.ค. 2025 = 31', dec.getDate() === 31);
}

/** ข้อมูลจำลองแบบสั้นที่สุดที่ยังสมจริง */
const emptyYear = () => ({ income: [], expenses: [], savings: [] });

console.log('\n— G4: "ไม่มีข้อมูล" ไม่ใช่ "เป็นศูนย์" —');
{
  // ปี 2023 ของ Tom: มีรายได้ ไม่มีรายจ่ายรายการเลย
  const data = {
    years: {
      '2023': {
        ...emptyYear(),
        income: [
          {
            month: 1,
            salary: 80_000,
            bonus: 0,
            commission: 20_000,
            deductions: { tax: 5_000, socialSecurity: 750, providentFund: 2_400, gsl: 0 },
          },
        ],
        expenses: [], // ← ไม่มีรายจ่ายเลย
      },
    },
  } as unknown as WealthLensData;

  const series = buildSavingsRateSeries(data);
  const jan = series.find((p) => p.ym === '2023-01')!;
  assert(
    'เดือนที่ไม่มีข้อมูลรายจ่าย → rate = null (ไม่ใช่ 1.0)',
    jan.rate === null,
    `ได้ ${String(jan.rate)}`,
  );
  assert('netAll ยังคำนวณได้ตามปกติ', jan.netAll > 0);
  assert(
    'netAll = 80,000 − 8,150 + 20,000 = 91,850 (ผ่าน calculateNetAll)',
    jan.netAll === 91_850,
    String(jan.netAll),
  );
}

console.log('\n— savings rate: เดือนที่มีข้อมูลครบ —');
{
  const data = {
    years: {
      '2025': {
        ...emptyYear(),
        income: [
          {
            month: 1,
            salary: 100_000,
            bonus: 0,
            commission: 0,
            deductions: { tax: 0, socialSecurity: 0, providentFund: 0, gsl: 0 },
          },
        ],
        expenses: [
          { month: 1, items: [{ id: 'a', category: 'housing', name: 'บ้าน', amount: 25_000 }] },
        ],
      },
    },
  } as unknown as WealthLensData;

  const jan = buildSavingsRateSeries(data).find((p) => p.ym === '2025-01')!;
  assert('netAll = 100,000', jan.netAll === 100_000);
  assert('จ่าย = 25,000', jan.spent === 25_000);
  assert('เหลือ = 75,000', jan.kept === 75_000);
  assert('rate = 0.75', jan.rate === 0.75);
}

console.log('\n— rollingAverage ข้ามช่องว่างโดยไม่นับมันเป็นศูนย์ —');
{
  const pts = [
    { ym: '2025-01', netAll: 0, spent: 0, kept: 0, rate: 0.5 },
    { ym: '2025-02', netAll: 0, spent: 0, kept: 0, rate: null },
    { ym: '2025-03', netAll: 0, spent: 0, kept: 0, rate: 0.7 },
  ];
  const avg = rollingAverage(pts, 3);
  // เดือนที่ 3: มีค่าจริง 2 ค่า (0.5, 0.7) → เฉลี่ย 0.6 ไม่ใช่ (0.5+0+0.7)/3 = 0.4
  assert('เฉลี่ยข้ามค่า null ไม่นับเป็น 0', avg[2] !== null && Math.abs(avg[2]! - 0.6) < 1e-9, String(avg[2]));
  assert('หน้าต่างที่ไม่มีค่าจริงเลย → null', rollingAverage([pts[1]], 3)[0] === null);
}

/** บัญชีจำลอง — balances[ปี][เดือน] = กระแสเงินของเดือนนั้น ไม่ใช่ยอดคงเหลือ */
const acct = (id: string, name: string, balances: Record<string, Record<string, number>>) => ({
  id,
  name,
  balances,
});

console.log('\n— G2: ยอดบัญชีเป็นผลรวมสะสม เดือนที่เว้นว่างต้องไม่ร่วงเป็น 0 —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [
      // ม.ค. +100k · ก.พ. ไม่มีรายการเลย · มี.ค. +50k
      acct('a1', 'กรุงศรี', { '2025': { '1': 100_000, '3': 50_000 } }),
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;
  assert('ม.ค. = 100,000', at('2025-01').assets === 100_000);
  assert(
    'ก.พ. (ไม่มีรายการ) ยังเป็น 100,000 ไม่ใช่ 0',
    at('2025-02').assets === 100_000,
    String(at('2025-02').assets),
  );
  assert('มี.ค. = 150,000 (สะสม)', at('2025-03').assets === 150_000);
}

console.log('\n— G3 + G7: บัญชีใหม่โผล่ = จุดกระโดด ไม่ใช่ "รวยขึ้น" —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [
      acct('a1', 'กรุงศรี', { '2025': { '1': 100_000 } }),
      acct('a2', 'เงินสด', { '2025': { '6': 150_000 } }), // เริ่มติดตาม มิ.ย.
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;

  assert('G7 ก่อนเริ่มติดตาม นับแค่บัญชีเดียว', at('2025-05').accountsCovered === 1);
  assert('G7 พ.ค. = 100,000 (เงินสดยังไม่ถูกนับ)', at('2025-05').assets === 100_000);
  assert('G3 มิ.ย. ติดธง isTrackingJump', at('2025-06').isTrackingJump === true);
  assert('G3 มิ.ย. บอกชื่อบัญชีใหม่', at('2025-06').newAccounts.join() === 'เงินสด');
  assert('G3 ม.ค. ก็เป็นจุดกระโดด (บัญชีแรกโผล่)', at('2025-01').isTrackingJump === true);
  assert('เดือนอื่นไม่ใช่จุดกระโดด', at('2025-05').isTrackingJump === false);
  assert(
    'G3 % เติบโตที่คร่อมจุดกระโดด = null (ไม่ใช่ +150%)',
    growthBetween(at('2025-05'), at('2025-06')) === null,
  );
  assert(
    '% เติบโตที่ไม่คร่อมจุดกระโดด คำนวณได้ตามปกติ',
    growthBetween(at('2025-04'), at('2025-05')) === 0,
  );
}

console.log('\n— G5: netWorth ติดลบได้ ห้าม clamp —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [acct('a1', 'กรุงศรี', { '2025': { '1': 10_000 } })],
  } as unknown as WealthLensData;
  const plans = [
    { planId: 'p1', name: 'รถ', totalAmount: 500_000, instances: [], remainingAmount: 500_000 },
  ] as never;
  const h = buildNetWorthHistory(data, () => null, [], plans);
  const jan = h.find((p) => p.ym === '2025-01')!;
  assert('netWorth ติดลบ ไม่ถูก clamp เป็น 0', jan.netWorth < 0, String(jan.netWorth));
  assert('หนี้ผ่อน = ยอดเต็ม (ยังไม่มีงวดที่จ่าย)', jan.debts === 500_000, String(jan.debts));
}

console.log('\n— G6: ทองไม่มีราคาตลาด → ราคาทุน + ติดธง —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [],
    goldHoldings: [{ id: 'g1', purchaseDate: '2025-01-15', weightBaht: 1, totalCost: 40_000 }],
  } as unknown as WealthLensData;

  const noPrice = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => noPrice.find((p) => p.ym === ym)!;
  assert('ไม่มีราคาตลาด → ใช้ราคาทุน 40,000', at('2025-01').assets === 40_000);
  assert('ติดธง goldIsCostBasis', at('2025-01').goldIsCostBasis === true);

  const withPrice = buildNetWorthHistory(data, () => 50_000, [], []);
  const jan2 = withPrice.find((p) => p.ym === '2025-01')!;
  assert('มีราคาตลาด → 1 บาททอง × 50,000', jan2.assets === 50_000);
  assert('ไม่ติดธงราคาทุน', jan2.goldIsCostBasis === false);
}

console.log('\n— ทองที่ยังไม่ซื้อ / ขายไปแล้ว ต้องไม่อยู่ในสินทรัพย์ —');
{
  const data = {
    years: { '2025': { income: [], expenses: [], savings: [] } },
    bankAccounts: [],
    goldHoldings: [
      // ซื้อ มี.ค. ขาย ก.ย. → นับเฉพาะ มี.ค.–ส.ค.
      {
        id: 'g1',
        purchaseDate: '2025-03-10',
        weightBaht: 1,
        totalCost: 40_000,
        sold: { soldDate: '2025-09-05', soldPrice: 45_000 },
      },
    ],
  } as unknown as WealthLensData;

  const h = buildNetWorthHistory(data, () => null, [], []);
  const at = (ym: string) => h.find((p) => p.ym === ym)!;
  assert('ก.พ. (ยังไม่ซื้อ) = 0', at('2025-02').assets === 0);
  assert('เม.ย. (ถืออยู่) = 40,000', at('2025-04').assets === 40_000);
  assert(
    'ต.ค. (ขายไปแล้ว) = 0 ไม่ใช่ค้างอยู่ตลอดกาล',
    at('2025-10').assets === 0,
    String(at('2025-10').assets),
  );
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
