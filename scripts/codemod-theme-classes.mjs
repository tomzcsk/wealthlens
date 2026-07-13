/**
 * F46 — แทนชื่อ class สีดิบด้วย token (1:1 เท่านั้น)
 *   node scripts/codemod-theme-classes.mjs src/components/dashboard
 *
 * กฎเหล็ก: การแทนต้องได้สีโหมดสว่าง "เท่าเดิมเป๊ะ" ทุกตัว
 * (verify-theme.ts R0 บังคับว่าค่า token โหมดสว่าง = ค่า Tailwind ขั้นเดิม)
 * ห้ามใส่การแทนที่เปลี่ยนสีโหมดสว่างลงตารางนี้เด็ดขาด
 * ยกเว้นเดียวที่อนุมัติแล้ว: rose-* ยุบเข้า expense-* (แดงสองเฉดในแอปเดียวไม่มีเหตุผล)
 *
 * หัวใจของตารางนี้: "prefix บอกบทบาท"
 *   bg-<fam>-600   → พื้นปุ่ม   → token DEFAULT (ค่าไม่ขยับในโหมดมืด ตัวขาวบนปุ่มจึงยังอ่านออก)
 *   text-<fam>-600 → หมึกบนการ์ด → token -ink   (สว่างขึ้นในโหมดมืด ไม่งั้นจมหายไปกับการ์ด)
 * สองบรรทัดนี้เคยเป็นสีเดียวกัน จึงเคยใช้ token ตัวเดียวกัน — นั่นคือบั๊กที่งานนี้ปิด
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** ตัวแปรหน้า class ที่โปรเจกต์นี้ใช้จริง — เก็บไว้ในกลุ่มที่ 1 เสมอ */
const V = '(?:hover:|focus:|active:|group-hover:|disabled:)?';

/** ตระกูลสี Tailwind → token ของแอป (rose ยุบเข้า expense) */
const FAMILIES = [
  ['emerald', 'income'],
  ['red', 'expense'],
  ['rose', 'expense'],
  ['amber', 'warning'],
  ['blue', 'primary'],
  ['violet', 'net'],
];

/** กฎของหนึ่งตระกูล — เรียงเจาะจงไปกว้าง (500/600/700 ต้องมาก่อน 50/100/…) */
const familyRules = (fam, t) => [
  // --- พื้นเข้ม (fill) : ค่าไม่ขยับข้ามโหมด ---
  [new RegExp(`\\b(${V})bg-${fam}-500\\b`, 'g'), `$1bg-${t}-fill`],
  [new RegExp(`\\b(${V})bg-${fam}-600\\b`, 'g'), `$1bg-${t}`],
  [new RegExp(`\\b(${V})bg-${fam}-700\\b`, 'g'), `$1bg-${t}-dark`],
  // --- พื้น chip (อ่อน) : กลับด้านในโหมดมืด ---
  [new RegExp(`\\b(${V})bg-${fam}-(50|100|200|300)\\b`, 'g'), `$1bg-${t}-$2`],
  // --- เส้นขอบ chip ---
  [
    new RegExp(`\\b(${V})border-${fam}-(50|100|200|300)\\b`, 'g'),
    `$1border-${t}-$2`,
  ],
  // --- หมึก (ink) : สว่างขึ้นในโหมดมืด ---
  [new RegExp(`\\b(${V})border-${fam}-600\\b`, 'g'), `$1border-${t}-ink`],
  [new RegExp(`\\b(${V})ring-${fam}-600\\b`, 'g'), `$1ring-${t}-ink`],
  [new RegExp(`\\b(${V})text-${fam}-600\\b`, 'g'), `$1text-${t}-ink`],
  // --- ตัวหนังสือ chip : กลับด้านในโหมดมืด ---
  [new RegExp(`\\b(${V})text-${fam}-(700|800|900)\\b`, 'g'), `$1text-${t}-$2`],
  // --- ตัวหนังสือที่นั่งอยู่บนพื้นเข้ม/hero : ค่าไม่ขยับข้ามโหมด ---
  [new RegExp(`\\b(${V})text-${fam}-300\\b`, 'g'), `$1text-${t}-on-fill`],
];

const RULES = [
  // ================= พื้นกลาง (slate / white) =================
  // hover/focus/disabled มาก่อนตัวเปล่าเสมอ:
  // hover:bg-slate-50 ต้องได้ hover:bg-hover (โหมดมืด hover ต้องสว่างขึ้น) ไม่ใช่ hover:bg-surface
  [/\bhover:bg-slate-50\b/g, 'hover:bg-hover'],
  [/\bfocus:bg-slate-50\b/g, 'focus:bg-hover'],
  [/\bdisabled:bg-slate-50\b/g, 'disabled:bg-hover'],
  [/\bhover:bg-slate-100\b/g, 'hover:bg-raised'],
  [/\bbg-slate-50\b/g, 'bg-surface'],
  [/\bbg-slate-100\b/g, 'bg-raised'],
  [/\bbg-slate-200\b/g, 'bg-track'],
  [/\bdisabled:bg-slate-300\b/g, 'disabled:bg-ink-300'],
  [/\bbg-slate-300\b/g, 'bg-ink-300'],
  // bg-slate-900 มีสองบทบาท: /50 /40 = ฉากหลัง Modal (แปลงได้)
  // ส่วน bg-slate-900 เปล่า = พื้น hero (bg-inverse) — แก้มือไปแล้ว จงใจไม่ใส่กฎไว้ที่นี่
  // ถ้าเจอตัวเปล่าอีกให้หยุดคิดก่อน อย่าปล่อยให้ codemod เดาแทน
  [/\bbg-slate-900\/(\d+)\b/g, 'bg-overlay/$1'],
  [/\bbg-white\b/g, 'bg-card'],

  // ตัวหนังสือ / เส้นขอบ ramp กลาง (ขั้นต่อขั้น)
  [/\bhover:text-slate-(\d00)\b/g, 'hover:text-ink-$1'],
  [/\bplaceholder:text-slate-(\d00)\b/g, 'placeholder:text-ink-$1'],
  [/\btext-slate-(\d00)\b/g, 'text-ink-$1'],
  [/\bhover:border-slate-(\d00)\b/g, 'hover:border-ink-$1'],
  [/\bborder-slate-(\d00)\b/g, 'border-ink-$1'],
  [/\bdivide-slate-(\d00)\b/g, 'divide-ink-$1'],

  // ================= accent (สีดิบ → token) =================
  // ตัวหนังสือรองบนปุ่มแดง — ต้องมาก่อนกฎ chip ของ expense ที่จะกิน text-red-100 ไปเป็น -100
  [new RegExp(`\\b(${V})text-red-100\\b`, 'g'), '$1text-expense-on-fill-100'],
  ...FAMILIES.flatMap(([fam, t]) => familyRules(fam, t)),

  // ================= token เดิม → บทบาทที่ถูกต้อง =================
  // -light / -tint ถูกยุบเป็นขั้น 50 / 100 ของ ramp
  [
    new RegExp(`\\b(${V}(?:bg|ring|border|text)-)(primary|income|expense|warning)-light\\b`, 'g'),
    '$1$2-50',
  ],
  [
    new RegExp(`\\b(${V}(?:bg|ring|border|text)-)(primary|income|expense|warning)-tint\\b`, 'g'),
    '$1$2-100',
  ],
  // text-primary-dark = หมึก hover ที่เข้มขึ้นหนึ่งขั้น ไม่ใช่ "พื้นเข้ม"
  // ย้ายไปขั้น 700 ของ ramp → โหมดสว่างค่าเท่าเดิม (blue-700) โหมดมืดสว่างขึ้น (blue-200)
  // (hover:bg-primary-dark คงเดิม — นั่นคือพื้นปุ่มจริง ๆ)
  [new RegExp(`\\b(${V})text-(primary|income|expense|warning|net)-dark\\b`, 'g'), '$1text-$2-700'],
  // บทบาทหมึก: text/border/ring/divide ของ token เปล่า → -ink (สว่างขึ้นในโหมดมืด)
  // lookahead กัน text-primary-dark / text-primary-50 โดนกินซ้ำ, แต่ปล่อย /30 ผ่าน
  [
    new RegExp(
      `\\b(${V}(?:text|border|ring|divide)-)(primary|income|expense|net|savings|warning)(?![-\\w])`,
      'g',
    ),
    '$1$2-ink',
  ],
  // bg-* ของ token เปล่า = พื้นปุ่ม → คงไว้ตามเดิมโดยตั้งใจ (ไม่มีกฎ)
];

const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e));
  } else if (p.endsWith('.tsx')) {
    files.push(p);
  }
};
for (const arg of process.argv.slice(2)) walk(arg);

let touched = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [pattern, replacement] of RULES) {
    after = after.replace(pattern, replacement);
  }
  if (after !== before) {
    writeFileSync(file, after);
    touched += 1;
    console.log(`✏️  ${file}`);
  }
}
console.log(`\nแก้ ${touched} ไฟล์ จาก ${files.length} ไฟล์`);
