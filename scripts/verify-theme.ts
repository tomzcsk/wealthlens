/**
 * Verification for F46 — theme layer.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-theme.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cycleTheme, resolveTheme, type ThemeMode } from '../src/lib/theme';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ได้ ${String(actual)} ควรเป็น ${String(expected)}`}`);
};

const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

console.log('\n— resolveTheme: เมทริกซ์ 3 โหมด × 2 สถานะเครื่อง —');
check('light + เครื่องสว่าง → light', resolveTheme('light', false), 'light');
check('light + เครื่องมืด → light', resolveTheme('light', true), 'light');
check('dark + เครื่องสว่าง → dark', resolveTheme('dark', false), 'dark');
check('dark + เครื่องมืด → dark', resolveTheme('dark', true), 'dark');
check('system + เครื่องสว่าง → light', resolveTheme('system', false), 'light');
check('system + เครื่องมืด → dark', resolveTheme('system', true), 'dark');

console.log('\n— cycleTheme: วนครบวงกลับที่เดิม —');
check('system → light', cycleTheme('system'), 'light');
check('light → dark', cycleTheme('light'), 'dark');
check('dark → system', cycleTheme('dark'), 'system');
const round: ThemeMode = cycleTheme(cycleTheme(cycleTheme('system')));
check('วนสามครั้งกลับที่เดิม', round, 'system');

// ---------- อ่านค่าจริงจาก index.css (ไม่ใช่ค่าที่คัดลอกมาไว้ในเทสต์) ----------
const css = readFileSync(resolve('src/index.css'), 'utf8');

const blockOf = (selector: string): string => {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`หา selector ${selector} ใน index.css ไม่เจอ`);
  return css.slice(i, css.indexOf('}', i));
};

/** '--ink-500: 100 116 139;' → { 'ink-500': '100 116 139' } */
const tokensIn = (block: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
};

const LIGHT = tokensIn(blockOf(':root {'));
const DARK = tokensIn(blockOf('.dark {'));

const hexOf = (channels: string): string =>
  '#' +
  channels
    .split(/\s+/)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('');

const luminance = (hex: string): number => {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ---------- R0: โหมดสว่างต้องเท่าค่า Tailwind เดิมเป๊ะ (กฎเหล็กข้อ 1) ----------
// นี่คือหลักฐานว่าโหมดสว่างไม่ขยับ: token ที่ไปแทน slate-500 ต้องเป็น slate-500 จริง ๆ
const LIGHT_MUST_EQUAL: Record<string, string> = {
  'ink-900': '#0f172a', // slate-900
  'ink-800': '#1e293b', // slate-800
  'ink-700': '#334155', // slate-700
  'ink-600': '#475569', // slate-600
  'ink-500': '#64748b', // slate-500
  'ink-400': '#94a3b8', // slate-400
  'ink-300': '#cbd5e1', // slate-300
  'ink-200': '#e2e8f0', // slate-200
  'ink-100': '#f1f5f9', // slate-100
  'bg-card': '#ffffff', // white
  'bg-surface': '#f8fafc', // slate-50
  'bg-hover': '#f8fafc', // slate-50 (hover บนการ์ดขาว)
  'bg-raised': '#f1f5f9', // slate-100
  'bg-track': '#e2e8f0', // slate-200
  'color-income-light': '#ecfdf5', // emerald-50
  'color-expense-light': '#fef2f2', // red-50
  'color-warning-light': '#fffbeb', // amber-50
  'color-primary-light': '#eff6ff', // blue-50
};

console.log('\n— R0: โหมดสว่างต้องเท่าค่าเดิมเป๊ะ —');
for (const [token, expected] of Object.entries(LIGHT_MUST_EQUAL)) {
  const actual = LIGHT[token] ? hexOf(LIGHT[token]) : '(ไม่มี)';
  assert(`${token} = ${expected}`, actual === expected, `ได้ ${actual}`);
}

// ---------- R1: token ทุกตัวมีค่าครบสองโหมด ----------
console.log('\n— R1: token ครบสองโหมด —');
for (const token of Object.keys(LIGHT)) {
  if (token.startsWith('cat-')) continue; // สีหมวดกราฟ ค่าเดียวสองโหมดโดยตั้งใจ
  assert(`${token} มีค่าโหมดมืด`, DARK[token] !== undefined);
}

// ---------- R2–R4: contrast ----------
const TEXT_TIERS = ['ink-900', 'ink-800', 'ink-700', 'ink-600', 'ink-500'];
const FAINT_TIER = ['ink-400'];
const LINE_TIERS = ['ink-300', 'ink-200', 'ink-100'];
const ACCENTS = ['color-income', 'color-expense', 'color-primary'];
const SURFACES = ['bg-card', 'bg-surface'];

const ratio = (map: Record<string, string>, fg: string, bg: string): number =>
  contrast(hexOf(map[fg]), hexOf(map[bg]));

console.log('\n— R2: ชั้นเนื้อความ ≥ 4.5 —');
for (const mode of [
  { name: 'สว่าง', map: LIGHT },
  { name: 'มืด', map: DARK },
]) {
  for (const fg of TEXT_TIERS) {
    for (const bg of SURFACES) {
      const r = ratio(mode.map, fg, bg);
      assert(`${mode.name}: ${fg} บน ${bg} = ${r.toFixed(2)}`, r >= 4.5);
    }
  }
}

console.log('\n— R3: ชั้นจาง ≥ 2.4 · ชั้นเส้น > 1.02 —');
for (const mode of [
  { name: 'สว่าง', map: LIGHT },
  { name: 'มืด', map: DARK },
]) {
  for (const bg of SURFACES) {
    for (const fg of FAINT_TIER) {
      const r = ratio(mode.map, fg, bg);
      assert(`${mode.name}: ${fg} บน ${bg} = ${r.toFixed(2)}`, r >= 2.4);
    }
    for (const fg of LINE_TIERS) {
      const r = ratio(mode.map, fg, bg);
      // ชั้นเส้นที่ contrast = 1.00 คือเส้นที่หายสนิทไปกับพื้น
      // เกณฑ์ 1.02 ไม่ใช่ 1.05 เพราะของเดิมเองก็คาบเส้น:
      // ink-100 บน bg-surface โหมดสว่าง = 1.052 (slate-100 บน slate-50)
      assert(`${mode.name}: ${fg} บน ${bg} = ${r.toFixed(3)} (ต้องเห็น)`, r > 1.02);
    }
  }
}

console.log('\n— R3b: accent ในโหมดมืด ≥ 4.5 บนการ์ด —');
for (const fg of ACCENTS) {
  const r = contrast(hexOf(DARK[fg]), hexOf(DARK['bg-card']));
  assert(`มืด: ${fg} = ${r.toFixed(2)}`, r >= 4.5);
}

console.log('\n— R4: ที่สว่างต่ำกว่า 7:1 → มืดต้องไม่แย่กว่าสว่าง —');
for (const fg of [...TEXT_TIERS, ...FAINT_TIER, ...LINE_TIERS]) {
  for (const bg of SURFACES) {
    const l = ratio(LIGHT, fg, bg);
    if (l >= 7) continue; // เหลือเฟือแล้ว ไม่ต้องคุม
    const d = ratio(DARK, fg, bg);
    assert(
      `${fg} บน ${bg}: มืด ${d.toFixed(2)} ≥ สว่าง ${l.toFixed(2)}`,
      d >= l,
    );
  }
}

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
