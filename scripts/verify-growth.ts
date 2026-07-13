/**
 * Verification for F48 — หน้าเติบโต.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-growth.ts
 */
import { endOfMonth, monthsIn, parseYm, toYm } from '../src/utils/monthRange';

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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
