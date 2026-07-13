/**
 * F46 — แทนชื่อ class สีดิบด้วย token (1:1 เท่านั้น)
 *   node scripts/codemod-theme-classes.mjs src/components/dashboard
 *
 * กฎ: การแทนต้องได้สีโหมดสว่าง "เท่าเดิมเป๊ะ" ทุกตัว
 * (verify-theme.ts R0 บังคับว่าค่า token โหมดสว่าง = ค่า slate เดิม)
 * ห้ามใส่การแทนที่เปลี่ยนสีโหมดสว่างลงตารางนี้เด็ดขาด
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// เรียงจากเจาะจงไปกว้างสำคัญมาก: hover:bg-slate-50 ต้องมาก่อน bg-slate-50
// ไม่งั้นได้ hover:bg-surface ซึ่งผิด (hover บนการ์ดต้องสว่างขึ้นในโหมดมืด)
const RULES = [
  // --- พื้น: hover/focus/disabled มาก่อนตัวเปล่าเสมอ ---
  [/\bhover:bg-slate-50\b/g, 'hover:bg-hover'],
  [/\bfocus:bg-slate-50\b/g, 'focus:bg-hover'],
  [/\bdisabled:bg-slate-50\b/g, 'disabled:bg-hover'],
  [/\bhover:bg-slate-100\b/g, 'hover:bg-raised'],
  [/\bbg-slate-50\/(\d+)\b/g, 'bg-surface/$1'],
  [/\bbg-slate-50\b/g, 'bg-surface'],
  [/\bbg-slate-100\/(\d+)\b/g, 'bg-raised/$1'],
  [/\bbg-slate-100\b/g, 'bg-raised'],
  [/\bbg-slate-200\b/g, 'bg-track'],
  [/\bdisabled:bg-slate-300\b/g, 'disabled:bg-ink-300'],
  [/\bbg-slate-300\b/g, 'bg-ink-300'],
  [/\bbg-slate-900\/(\d+)\b/g, 'bg-overlay/$1'],
  [/\bbg-slate-900\b/g, 'bg-overlay'],
  [/\bbg-white\/(\d+)\b/g, 'bg-card/$1'],
  [/\bbg-white\b/g, 'bg-card'],

  // --- ตัวหนังสือ (ramp ตรงขั้นต่อขั้น) ---
  [/\bhover:text-slate-(\d00)\b/g, 'hover:text-ink-$1'],
  [/\bplaceholder:text-slate-(\d00)\b/g, 'placeholder:text-ink-$1'],
  [/\btext-slate-(\d00)\b/g, 'text-ink-$1'],

  // --- เส้นขอบ / เส้นคั่น ---
  [/\bhover:border-slate-(\d00)\b/g, 'hover:border-ink-$1'],
  [/\bborder-slate-(\d00)\b/g, 'border-ink-$1'],
  [/\bdivide-slate-(\d00)\b/g, 'divide-ink-$1'],

  // --- tint ของ badge ---
  [/\bbg-emerald-50\b/g, 'bg-income-light'],
  [/\bbg-red-50\b/g, 'bg-expense-light'],
  [/\bbg-rose-50\b/g, 'bg-expense-light'],
  [/\bbg-amber-50\b/g, 'bg-warning-light'],
  [/\bbg-blue-50\b/g, 'bg-primary-light'],
  [/\bbg-emerald-100\b/g, 'bg-income-tint'],
  [/\bbg-red-100\b/g, 'bg-expense-tint'],
  [/\bbg-amber-100\b/g, 'bg-warning-tint'],
  [/\bbg-blue-100\b/g, 'bg-primary-tint'],
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
