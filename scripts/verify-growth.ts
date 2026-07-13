/**
 * Verification for F48 — หน้าเติบโต.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts
 */
import type { WealthLensData } from '../src/types';
import { endOfMonth, monthsIn, parseYm, toYm } from '../src/utils/monthRange';
import { buildSavingsRateSeries, rollingAverage } from '../src/utils/savingsRate';

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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
