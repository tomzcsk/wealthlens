/**
 * ประตูกันสีดิบกลับเข้ามา (F46)
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-no-hardcoded-colors.ts
 *
 * สคริปต์นี้ไม่ได้มีไว้ตรวจงานวันนี้ — codemod แปลงครบไปแล้ว
 * มันมีไว้ "ดัก" คนถัดไป (หรือตัวเราเองอีกสามเดือน) ที่เขียน component ใหม่
 * ด้วย bg-white / text-slate-500 แล้ว ship แอปที่มีการ์ดขาวจ้าอยู่ใบเดียว
 * กลางโหมดมืด — บั๊กแบบนี้ typecheck/lint/build จับไม่ได้เลยสักตัว
 *
 * กฎ: ใน src/**\/*.tsx ห้ามมี utility สีดิบของ Tailwind
 *   ❌ bg-slate-100, text-emerald-600, hover:bg-red-50, border-gray-200/40,
 *      from-slate-50, bg-white, bg-black
 *   ✅ bg-card, text-ink-500, text-income-700, bg-primary-fill (token)
 *   ✅ text-white — จงใจยกเว้น: มันนั่งบนพื้นสีเข้ม (ปุ่ม fill / hero กลับด้าน)
 *      ซึ่งค่าไม่ขยับข้ามโหมดอยู่แล้ว ขาวจึงถูกทั้งสองโหมด
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve('src');

/** ตระกูลสีของ Tailwind ทั้งหมด — ตัวไหนโผล่มาพร้อมเลขขั้น = สีดิบ */
const PALETTES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'emerald', 'green', 'red', 'rose', 'pink',
  'amber', 'yellow', 'orange',
  'blue', 'sky', 'cyan', 'indigo', 'violet', 'purple',
  'teal', 'lime', 'fuchsia',
].join('|');

/** prefix ที่ใช้สีได้ — รวม from/via/to ที่ codemod รอบแรกลืมไป (นั่นคือบั๊กใน LoginPage) */
const PROPS = 'bg|text|border|ring|divide|from|via|to|outline|decoration|accent|caret|shadow|fill|stroke';

/** ครอบ variant นำหน้าได้ทุกชั้น (hover: focus: dark: group-hover: md: …) และ /opacity ต่อท้าย */
const RAW_SCALE = new RegExp(
  String.raw`(?<![\w-])((?:[a-z-]+(?:\[[^\]]*\])?:)*)(${PROPS})-(${PALETTES})-(\d{2,3})(/\d{1,3})?(?![\w-])`,
  'g',
);

/** bg-white / bg-black เปล่า ๆ — text-white ไม่นับ (ดูหัวไฟล์) */
const RAW_BW = new RegExp(
  String.raw`(?<![\w-])((?:[a-z-]+(?:\[[^\]]*\])?:)*)(bg|border|ring|divide|from|via|to)-(white|black)(/\d{1,3})?(?![\w-])`,
  'g',
);

/** token ที่ควรใช้แทน — เดาให้เท่าที่เดาได้ ไม่ต้องครบทุกขั้น */
const SUGGEST: Record<string, string> = {
  slate: 'ink-* (text/border) หรือ bg-card / bg-surface / bg-raised / bg-track',
  gray: 'ink-* / bg-raised',
  zinc: 'ink-*',
  neutral: 'ink-*',
  stone: 'ink-*',
  emerald: 'income-* (text-income-ink · bg-income · chip income-50/700)',
  green: 'income-*',
  teal: 'income-*',
  red: 'expense-* (text-expense-ink · bg-expense · chip expense-50/700)',
  rose: 'expense-*',
  pink: 'expense-*',
  amber: 'warning-* / savings-*',
  yellow: 'warning-*',
  orange: 'warning-*',
  blue: 'primary-* (text-primary-ink · bg-primary · chip primary-50/700)',
  sky: 'primary-*',
  cyan: 'primary-*',
  indigo: 'primary-*',
  violet: 'net-* (text-net-ink · bg-net · chip net-50/700)',
  purple: 'net-*',
  fuchsia: 'net-*',
  lime: 'income-*',
  white: 'bg-card (พื้นการ์ด) · bg-logo (กระเบื้องโลโก้ ขาวจริงทั้งสองโหมด) · bg-inverse-fg (veil บน hero)',
  black: 'bg-overlay (ฉากหลัง modal) · bg-inverse (พื้น hero)',
};

/**
 * ข้อยกเว้น — ต้องมีเหตุผลเขียนไว้เสมอ
 * เป้าหมายคือ "ศูนย์" ถ้าต้องเพิ่มบรรทัดที่นี่ ให้คิดอีกรอบก่อนว่ามัน
 * ควรเป็น token ใหม่หรือเปล่า (เคส BankAvatar แก้ด้วย bg-logo ไม่ใช่ข้อยกเว้น)
 */
const ALLOW: ReadonlyArray<{ file: string; reason: string }> = [];

interface Violation {
  file: string;
  line: number;
  match: string;
  family: string;
  text: string;
}

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') ? [p] : [];
  });

const violations: Violation[] = [];
const files = tsxFiles(SRC);

for (const file of files) {
  const rel = relative(process.cwd(), file);
  if (ALLOW.some((a) => a.file === rel)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const re of [RAW_SCALE, RAW_BW]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        violations.push({
          file: rel,
          line: i + 1,
          match: m[0],
          family: m[3],
          text: text.trim(),
        });
      }
    }
  });
}

console.log(`— สแกน ${files.length} ไฟล์ .tsx ใต้ src/ —\n`);

if (violations.length === 0) {
  console.log('✅ ไม่พบสีดิบของ Tailwind — ทุก component ใช้ token ทั้งหมด');
  console.log('   (text-white ไม่นับ: มันนั่งบนพื้นเข้มที่ค่าไม่ขยับข้ามโหมด)');
  process.exit(0);
}

console.log('❌ พบสีดิบของ Tailwind — คลาสพวกนี้ "ไม่รู้จักโหมดมืด"');
console.log('   ผลคือแอปโหมดมืดจะมีการ์ดขาวจ้า/ตัวหนังสือเข้มบนพื้นเข้มอยู่ตรงนี้');
console.log('   ให้ใช้ token จาก src/index.css แทน (ดู tailwind.config.js)\n');

for (const v of violations) {
  console.log(`  ${v.file}:${v.line}  ${v.match}`);
  console.log(`      ${v.text.slice(0, 100)}`);
  const hint = SUGGEST[v.family];
  if (hint) console.log(`      → ใช้แทน: ${hint}`);
  console.log('');
}

console.log(`❌ ล้มเหลว ${violations.length} จุด`);
process.exit(1);
