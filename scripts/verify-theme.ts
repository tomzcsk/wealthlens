/**
 * Verification for F46 — theme layer.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-theme.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chartPalette } from '../src/lib/chartTheme';
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
  'bg-overlay': '#0f172a', // slate-900 (ฉากหลัง modal)
  'bg-logo': '#ffffff', // white (กระเบื้องโลโก้ธนาคาร — เดิมคือ bg-white)
  'bg-inverse': '#0f172a', // slate-900 (พื้น hero)
  'inverse-fg': '#ffffff', // white
  'inverse-muted': '#cbd5e1', // slate-300
  'inverse-dim': '#94a3b8', // slate-400

  // accent — ขั้นของ Tailwind เป๊ะทุกตัว
  // หัวใจ: ขั้น 600 ของ Tailwind "คือ" สีแบรนด์เดิมอยู่แล้ว
  //   blue-600 #2563eb = primary · emerald-600 #059669 = income · red-600 #dc2626 = expense
  //   amber-600 #d97706 = warning/savings · violet-600 #7c3aed = net
  // ดังนั้น text-emerald-600 → text-income-ink จึงไม่เปลี่ยนสีโหมดสว่างแม้แต่พิกเซลเดียว
  'c-primary': '#2563eb', // blue-600
  'c-primary-fill': '#3b82f6', // blue-500
  'c-primary-dark': '#1d4ed8', // blue-700
  'c-primary-on-fill': '#93c5fd', // blue-300
  'c-primary-ink': '#2563eb', // blue-600
  'c-primary-50': '#eff6ff',
  'c-primary-100': '#dbeafe',
  'c-primary-200': '#bfdbfe',
  'c-primary-300': '#93c5fd',
  'c-primary-700': '#1d4ed8',
  'c-primary-800': '#1e40af',
  'c-primary-900': '#1e3a8a',
  'c-income': '#059669', // emerald-600
  'c-income-fill': '#10b981', // emerald-500
  'c-income-dark': '#047857', // emerald-700
  'c-income-on-fill': '#6ee7b7', // emerald-300
  'c-income-ink': '#059669', // emerald-600
  'c-income-50': '#ecfdf5',
  'c-income-100': '#d1fae5',
  'c-income-200': '#a7f3d0',
  'c-income-300': '#6ee7b7',
  'c-income-700': '#047857',
  'c-income-800': '#065f46',
  'c-income-900': '#064e3b',
  'c-expense': '#dc2626', // red-600
  'c-expense-fill': '#ef4444', // red-500
  'c-expense-dark': '#b91c1c', // red-700
  'c-expense-on-fill': '#fca5a5', // red-300
  'c-expense-on-fill-100': '#fee2e2', // red-100 (ตัวหนังสือรองบนปุ่มแดง)
  'c-expense-ink': '#dc2626', // red-600
  'c-expense-50': '#fef2f2',
  'c-expense-100': '#fee2e2',
  'c-expense-200': '#fecaca',
  'c-expense-300': '#fca5a5',
  'c-expense-700': '#b91c1c',
  'c-expense-800': '#991b1b',
  'c-expense-900': '#7f1d1d',
  'c-warning': '#d97706', // amber-600
  'c-warning-fill': '#f59e0b', // amber-500
  'c-warning-dark': '#b45309', // amber-700
  'c-warning-on-fill': '#fcd34d', // amber-300
  'c-warning-ink': '#d97706', // amber-600
  'c-warning-50': '#fffbeb',
  'c-warning-100': '#fef3c7',
  'c-warning-200': '#fde68a',
  'c-warning-300': '#fcd34d',
  'c-warning-700': '#b45309',
  'c-warning-800': '#92400e',
  'c-warning-900': '#78350f',
  'c-net': '#7c3aed', // violet-600
  'c-net-fill': '#8b5cf6', // violet-500
  'c-net-dark': '#6d28d9', // violet-700
  'c-net-on-fill': '#c4b5fd', // violet-300
  'c-net-ink': '#7c3aed', // violet-600
  'c-net-50': '#f5f3ff',
  'c-net-100': '#ede9fe',
  'c-net-200': '#ddd6fe',
  'c-net-300': '#c4b5fd',
  'c-net-700': '#6d28d9',
  'c-net-800': '#5b21b6',
  'c-net-900': '#4c1d95',
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
const ACCENTS = ['c-income-ink', 'c-expense-ink', 'c-primary-ink'];
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

// ---------- R5: บทบาท "พื้น" กับ "หมึก" ต้องไม่ปนกัน (บั๊กที่งานนี้ปิด) ----------
// ก่อนหน้านี้ทั้งสองบทบาทใช้ token ตัวเดียวกัน พอ token สว่างขึ้นในโหมดมืด
// ปุ่มทุกปุ่มในแอปเลยกลายเป็นฟ้าซีดกับตัวหนังสือขาว = อ่านไม่ออก
const FAMILIES = ['primary', 'income', 'expense', 'warning', 'net'] as const;
const FILL_ROLES = ['', '-fill', '-dark', '-on-fill'] as const;

console.log('\n— R5a: พื้น (fill) ต้องไม่ขยับข้ามโหมด —');
for (const f of FAMILIES) {
  for (const role of FILL_ROLES) {
    const token = `c-${f}${role}`;
    assert(
      `${token}: สว่าง = มืด`,
      LIGHT[token] === DARK[token],
      `สว่าง ${LIGHT[token]} · มืด ${DARK[token]}`,
    );
  }
}
assert(
  'c-expense-on-fill-100: สว่าง = มืด',
  LIGHT['c-expense-on-fill-100'] === DARK['c-expense-on-fill-100'],
);

console.log('\n— R5b: หมึก (ink) โหมดมืดต้องอ่านออกบนการ์ด ≥ 4.5 —');
for (const f of FAMILIES) {
  const r = contrast(hexOf(DARK[`c-${f}-ink`]), hexOf(DARK['bg-card']));
  assert(`มืด: c-${f}-ink บนการ์ด = ${r.toFixed(2)}`, r >= 4.5);
}

console.log('\n— R5c: ตัวขาวบนปุ่ม — contrast เท่ากันเป๊ะสองโหมด —');
for (const f of FAMILIES) {
  const l = contrast('#ffffff', hexOf(LIGHT[`c-${f}`]));
  const d = contrast('#ffffff', hexOf(DARK[`c-${f}`]));
  assert(
    `white บน c-${f}: สว่าง ${l.toFixed(2)} = มืด ${d.toFixed(2)}`,
    Math.abs(l - d) < 0.0001,
  );
}

console.log('\n— R5d: หมึกต้องสว่างขึ้นจริงในโหมดมืด (ไม่ใช่ค่าเดิม) —');
for (const f of FAMILIES) {
  const token = `c-${f}-ink`;
  assert(`${token}: มืด ≠ สว่าง`, LIGHT[token] !== DARK[token]);
}

console.log('\n— R5e: chip กลับด้าน — ตัวหนังสือ chip อ่านออกบนพื้น chip ≥ 4.5 —');
for (const f of FAMILIES) {
  for (const [text, bg] of [
    ['700', '100'],
    ['800', '100'],
    ['900', '50'],
  ]) {
    for (const mode of [
      { name: 'สว่าง', map: LIGHT },
      { name: 'มืด', map: DARK },
    ]) {
      const r = contrast(hexOf(mode.map[`c-${f}-${text}`]), hexOf(mode.map[`c-${f}-${bg}`]));
      assert(`${mode.name}: c-${f}-${text} บน c-${f}-${bg} = ${r.toFixed(2)}`, r >= 4.5);
    }
  }
}

// ---------- R5f: hero กลับด้าน ----------
// หมึกบน hero (ขาว/เทาอ่อน/accent) ต้องค่าเดียวสองโหมด — มันอยู่บนพื้นเข้มเสมอ
// แต่ **ตัวพื้น hero เองไม่ต้องเท่ากันสองโหมด** — และห้ามเท่ากับพื้นหน้าด้วย
// (เคยเป็นบั๊กจริง: มืดแล้ว bg-inverse = bg-surface เป๊ะ → การ์ด hero กลืนหายทั้งใบ)
console.log('\n— R5f: hero กลับด้าน — หมึกคงที่ · พื้นต้องมืดและต้องเห็นเป็นการ์ด —');
for (const token of ['inverse-fg', 'inverse-muted', 'inverse-dim']) {
  assert(`${token}: สว่าง = มืด`, LIGHT[token] === DARK[token]);
}
for (const mode of [
  { name: 'สว่าง', map: LIGHT },
  { name: 'มืด', map: DARK },
]) {
  for (const token of ['inverse-fg', 'inverse-muted', 'inverse-dim']) {
    const r = contrast(hexOf(mode.map[token]), hexOf(mode.map['bg-inverse']));
    assert(`${mode.name}: ${token} บน bg-inverse = ${r.toFixed(2)}`, r >= 4.5);
  }
  for (const f of FAMILIES) {
    const r = contrast(
      hexOf(mode.map[`c-${f}-on-fill`]),
      hexOf(mode.map['bg-inverse']),
    );
    assert(
      `${mode.name}: c-${f}-on-fill บน bg-inverse = ${r.toFixed(2)}`,
      r >= 4.5,
    );
  }
  // การ์ดที่สีเท่าพื้นหน้าเป๊ะ = ไม่มีการ์ด
  assert(
    `${mode.name}: bg-inverse ≠ bg-surface (hero ต้องยังเป็นการ์ด)`,
    mode.map['bg-inverse'] !== mode.map['bg-surface'],
    `ทั้งคู่ = ${mode.map['bg-inverse']}`,
  );
}

// ---------- R5g: พื้นที่ต้อง "ไม่รู้จักโหมด" — ค่าเดียวกันเป๊ะสองโหมด ----------
// bg-overlay: ฉากหลัง modal ต้องมืดทั้งสองโหมด (ถ้าพลิกเป็นสว่าง ฉากหลังจะขาวโพลน)
// bg-logo   : กระเบื้องรองโลโก้ธนาคารจริง (PNG หมึกเข้ม) ต้องขาวเหมือนกระดาษเสมอ
console.log('\n— R5g: พื้นที่ค่าไม่ขยับข้ามโหมด (overlay / logo) —');
for (const token of ['bg-overlay', 'bg-logo']) {
  assert(
    `${token}: สว่าง = มืด`,
    LIGHT[token] === DARK[token],
    `สว่าง ${LIGHT[token]} · มืด ${DARK[token]}`,
  );
}
{
  const r = contrast(hexOf(LIGHT['bg-logo']), hexOf(DARK['bg-card']));
  assert(`bg-logo บนการ์ดมืด = ${r.toFixed(2)} (โลโก้หมึกเข้มต้องไม่จม)`, r >= 4.5);
}

// ---------- R6: จานสีกราฟ (Recharts รับ hex เท่านั้น ใช้ var() ไม่ได้) ----------
console.log('\n— chartPalette: ครบทั้งสองโหมดและไม่ซ้ำกัน —');
const lightChart = chartPalette('light');
const darkChart = chartPalette('dark');
for (const key of ['grid', 'axisLine', 'axisTick', 'cursorFill', 'cursorStroke'] as const) {
  assert(`${key} มีค่าโหมดสว่าง`, Boolean(lightChart[key]));
  assert(`${key} มีค่าโหมดมืด`, Boolean(darkChart[key]));
}
// เส้นตารางสีอ่อนบนพื้นมืด = เรืองแสง — ต้องต่างกันจริง
assert('grid ต่างกันสองโหมด', lightChart.grid !== darkChart.grid);
assert('เส้นตารางสว่างคือ #E2E8F0 เดิม', lightChart.grid === '#E2E8F0');

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
