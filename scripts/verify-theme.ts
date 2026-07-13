/**
 * Verification for F46 — theme layer.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-theme.ts
 */
import { cycleTheme, resolveTheme, type ThemeMode } from '../src/lib/theme';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ได้ ${String(actual)} ควรเป็น ${String(expected)}`}`);
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

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
