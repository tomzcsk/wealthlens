/**
 * Verification: ทุกหมวดที่ store สร้างได้ ต้อง import กลับได้
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-backup-categories.ts
 *
 * บั๊ก: `VALID_SAVINGS_CATEGORIES` ใน exportImport.ts ขาด 'gold' ทั้งที่
 * `SavingsCategory` มี และ financeStore สร้าง savings item หมวด 'gold' เองทุกครั้ง
 * ที่ซื้อทองด้วย paymentMethod: 'cash' → **ไฟล์ backup ของผู้ใช้เอง import กลับไม่ได้**
 *
 * เส้นทางกู้ข้อมูลทั้งสองเส้นใช้ validateBackup ตัวเดียวกัน (Import JSON +
 * F28 restore snapshot รายวัน) ส่วน Drive sync ไม่ validate เลย บั๊กจึงซ่อนสนิท:
 * ข้อมูลขึ้น Drive ปกติ สำรองรายวันปกติ แต่วันที่ต้องกู้จริงจะกู้ไม่ได้
 *
 * ไฟล์นี้ตรึงไว้ว่า **ทุกค่าใน SavingsCategory ต้องผ่าน validate** — เพิ่มหมวดใหม่
 * ในอนาคตแล้วลืมอัปเดต validator จะแดงที่นี่ทันที
 */
import { validateBackup } from '../src/utils/exportImport';
import type { SavingsCategory, WealthLensData } from '../src/types';

let failures = 0;
const eq = (label: string, a: unknown, b: unknown): void => {
  const ok = a === b;
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${String(a)} (expected ${String(b)})`);
};

/**
 * แหล่งความจริงเดียวของ "หมวดที่มีอยู่จริง" — Record บังคับให้ครบทุก key ของ
 * SavingsCategory ตอน compile. เพิ่มหมวดใหม่ใน types แล้วไม่เติมที่นี่ = typecheck แดง
 */
const ALL_CATEGORIES: Record<SavingsCategory, true> = {
  'investment-dime': true,
  travel: true,
  emergency: true,
  retirement: true,
  general: true,
  gold: true,
};

const payloadWith = (category: SavingsCategory): unknown => {
  const data: WealthLensData = {
    version: '1.0.0',
    lastUpdated: '2026-07-10T00:00:00.000Z',
    years: {
      '2026': {
        income: [],
        expenses: [],
        savings: [
          {
            month: 7,
            items: [
              { id: 's1', category, name: 'ทดสอบ', amount: 1000, date: '2026-07-01', isRecurring: false },
            ],
          },
        ],
      },
    },
  };
  return JSON.parse(JSON.stringify(data));
};

for (const category of Object.keys(ALL_CATEGORIES) as SavingsCategory[]) {
  const res = validateBackup(payloadWith(category));
  eq(`หมวด '${category}' import ได้`, res.ok, true);
}

// หมวดที่ไม่มีอยู่จริง ต้องถูกปฏิเสธ (validator ยังทำหน้าที่อยู่ ไม่ได้ปล่อยผ่านหมด)
eq(
  "หมวดมั่ว 'crypto' ถูกปฏิเสธ",
  validateBackup(payloadWith('crypto' as SavingsCategory)).ok,
  false,
);

// gold ที่ store สร้างเองจริง ๆ (ชื่อมี emoji + brand) ต้องรอดทั้งก้อน
const goldPayload = payloadWith('gold') as { years: Record<string, { savings: { items: { name: string }[] }[] }> };
goldPayload.years['2026'].savings[0].items[0].name = '🪙 ออโรร่า 1 บาท';
eq('gold item ที่ store สร้าง (ชื่อมี emoji) import ได้', validateBackup(goldPayload).ok, true);

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
