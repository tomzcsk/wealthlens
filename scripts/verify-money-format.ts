/**
 * Verification for app-wide money formatting (F55): "สตางค์เมื่อมีเศษ".
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-money-format.ts
 *
 * กฎ: formatTHB/formatNumber แบบ bare (ไม่ระบุ decimals) โชว์สตางค์เฉพาะเมื่อยอด
 * มีเศษจริง; ระบุ 0 บังคับเลขเต็ม (เลขวิ่ง KPI/hero), 2 บังคับสตางค์ (ตารางผ่อน),
 * compact ไม่แตะ (แกนกราฟ).
 */
import {
  formatTHB,
  formatTHBAuto,
  formatNumber,
  formatNumberAuto,
} from '../src/utils/formatters';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown): void => {
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)} (expected ${JSON.stringify(want)})`);
};

// bare = auto
eq('bare เลขเต็ม → ไม่มีสตางค์', formatTHB(3965), '฿3,965');
eq('bare มีเศษ → โชว์สตางค์', formatTHB(3965.5), '฿3,965.50');
eq('bare เศษยาว → ปัด 2 ตำแหน่ง', formatTHB(1234.567), '฿1,234.57');
eq('bare ติดลบมีเศษ', formatTHB(-3965.5), '฿-3,965.50');
eq('bare NaN → ฿0 ปลอดภัย', formatTHB(NaN), '฿0');
eq('formatTHBAuto = bare', formatTHBAuto(500.25), '฿500.25');

// explicit ยังบังคับได้ (เลขวิ่ง / ตารางผ่อน / กราฟ)
eq('decimals:0 บังคับเต็ม (KPI/hero กันกระตุก)', formatTHB(3965.5, { decimals: 0 }), '฿3,966');
eq('decimals:2 บังคับสตางค์ (ผ่อน)', formatTHB(3965, { decimals: 2 }), '฿3,965.00');
eq('compact ไม่แตะ (แกนกราฟ)', formatTHB(1_230_000, { compact: true }), '฿1.23M');

// formatNumber (ไม่มี ฿): bare ยังเต็ม (ใช้กับ count/weight ด้วย), Auto = โชว์เมื่อมีเศษ
eq('formatNumber bare ยังเต็ม', formatNumber(1234), '1,234');
eq('formatNumberAuto เต็ม → ไม่มีสตางค์', formatNumberAuto(1234), '1,234');
eq('formatNumberAuto มีเศษ → โชว์สตางค์', formatNumberAuto(1234.5), '1,234.50');
eq('formatNumberAuto NaN → 0', formatNumberAuto(NaN), '0');

// float dust: ผลลบเงินได้เศษจิ๋วแบบ exponential (2584.1−1799−785.1 = -1.1e-13 ที่ควร
// เป็น 0). numeral คืน "NaN" กับเลขแบบนี้ → การ์ดโชว์ "฿NaN". ต้องปัดเป็น ฿0.
const dust = 2584.1 - 1799 - 785.1; // ≈ -1.1368683772161603e-13
eq('float dust → finite (safeNumber ปล่อยผ่าน)', Number.isFinite(dust), true);
eq('float dust bare → ฿0 (เคยเป็น ฿NaN)', formatTHB(dust), '฿0');
eq('float dust decimals:0 → ฿0', formatTHB(dust, { decimals: 0 }), '฿0');
eq('float dust decimals:2 → ฿0.00', formatTHB(dust, { decimals: 2 }), '฿0.00');
eq('เศษ 0.004 ปัดลง → ฿0', formatTHB(0.004), '฿0');
eq('formatNumberAuto float dust → 0 (เคย NaN)', formatNumberAuto(dust), '0');
eq('formatNumber(dust, decimals:2) → 0.00', formatNumber(dust, { decimals: 2 }), '0.00');

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
