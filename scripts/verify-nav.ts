/**
 * Verification for F47 — ทะเบียนเมนู.
 *   npx tsx --tsconfig tsconfig.app.json scripts/verify-nav.ts
 *
 * ทะเบียนนี้ป้อนทั้ง Sidebar (เดสก์ท็อป) และ BottomNav (มือถือ) — ถ้ามันเพี้ยน
 * เมนูสองชุดจะหลุดจากกันโดยไม่มี error ให้เห็น
 */
import { readFileSync } from 'node:fs';

import {
  NAV_ITEMS,
  desktopGroups,
  isNavActive,
  mobileMoreItems,
  mobilePrimaryItems,
} from '../src/lib/nav';

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

console.log('\n— แถบล่างมี 5 ช่อง: 4 เมนู + "อื่นๆ" —');
const primary = mobilePrimaryItems();
assert(
  `mobilePrimary = 4 พอดี (ได้ ${primary.length})`,
  primary.length === 4,
  'มากกว่านี้แถบล่างจะล้น น้อยกว่านี้จะมีช่องว่าง',
);

console.log('\n— ไม่มีอะไรตกหล่นหรือซ้ำ —');
const more = mobileMoreItems();
assert(
  'primary + more = ทั้งทะเบียน',
  primary.length + more.length === NAV_ITEMS.length,
);
const paths = NAV_ITEMS.map((i) => i.path);
assert('ไม่มี path ซ้ำ', new Set(paths).size === paths.length);
const labels = NAV_ITEMS.map((i) => i.label);
assert('ไม่มี label ซ้ำ', new Set(labels).size === labels.length);

console.log('\n— เดสก์ท็อป: ทุกเมนูอยู่ในกลุ่มใดกลุ่มหนึ่ง —');
const grouped = desktopGroups().flat();
assert(
  `desktopGroups ครอบทุกเมนู (${grouped.length}/${NAV_ITEMS.length})`,
  grouped.length === NAV_ITEMS.length,
);

console.log('\n— ทุกเมนูชี้ไป route ที่มีจริงใน App.tsx —');
// อ่าน App.tsx ตรง ๆ: เมนูที่ชี้ไป route ที่ไม่มี = ลิงก์ตาย ไม่มี error ให้เห็น
const app = readFileSync('src/App.tsx', 'utf8');
const routes = new Set(
  [...app.matchAll(/path="([^"]+)"/g)].map(([, p]) => `/${p}`),
);
routes.add('/'); // <Route index>
for (const item of NAV_ITEMS) {
  assert(`${item.label} → ${item.path}`, routes.has(item.path));
}

console.log('\n— isNavActive —');
const home = NAV_ITEMS.find((i) => i.path === '/')!;
const loans = NAV_ITEMS.find((i) => i.path === '/loans')!;
const monthly = NAV_ITEMS.find((i) => i.path === '/monthly')!;
assert("ภาพรวม active ที่ '/'", isNavActive(home, '/'));
assert("ภาพรวม ไม่ active ที่ '/monthly' (end)", !isNavActive(home, '/monthly'));
assert('รายเดือน active ที่ /monthly', isNavActive(monthly, '/monthly'));
assert('หนี้สิน active ที่ /installments ด้วย', isNavActive(loans, '/installments'));
assert('หนี้สิน ไม่ active ที่ /gold', !isNavActive(loans, '/gold'));

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
