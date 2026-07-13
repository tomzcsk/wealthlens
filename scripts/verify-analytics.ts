/**
 * Verification for F50 — หน้าวิเคราะห์.
 *   npm run verify:analytics
 *
 * A1–A5 วัดจากจอจริงที่ 390×844 (มือถือ) — ความสูงหน้ากับ "แผงของแท็บอื่น
 * ยังอยู่ใน DOM ไหม" มีอยู่แค่ในหน้าที่ render แล้วเท่านั้น
 * ประตูกันซากตรวจด้วย fs/grep — โค้ดตายที่ยังอยู่ = วันหนึ่งมีคน import กลับมา
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { chromium, type Page } from 'playwright';

import seedData from '../src/data/seedData';

const PORT = 4192;

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

// ─── ประตูกันซาก (ไม่ต้องเปิดเบราว์เซอร์) ────────────────────────────────────
console.log('\n— ซากของที่ลบไปแล้ว ต้องไม่เหลือ —');
const DELETED = [
  'src/components/analytics/BudgetForecast.tsx',
  'src/hooks/useForecast.ts',
  'src/utils/forecast.ts',
  'src/components/analytics/AnomalyAlerts.tsx',
  'src/stores/anomalyStore.ts',
];
for (const file of DELETED) {
  assert(`ไฟล์ถูกลบจริง: ${file}`, !existsSync(file));
}

const srcFiles: string[] = [];
const walk = (p: string): void => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e));
  } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
    srcFiles.push(p);
  }
};
walk('src');

const DEAD_SYMBOLS = [
  'BudgetForecast',
  'useForecast',
  'utils/forecast',
  'AnomalyAlerts',
  'anomalyStore',
];
const importers: string[] = [];
for (const file of srcFiles) {
  const src = readFileSync(file, 'utf8');
  for (const symbol of DEAD_SYMBOLS) {
    if (src.includes(symbol)) importers.push(`${file} → ${symbol}`);
  }
}
assert(
  `ไม่มีใครอ้างถึงของที่ลบไปแล้ว (เจอ ${importers.length})`,
  importers.length === 0,
  importers.slice(0, 5).join(' · '),
);

console.log('\n— toast แจ้งเตือนต้องไม่ตายไปกับแผง —');
{
  const layout = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  assert('Layout ยังเรียก useAnomalyAlertEffect()', layout.includes('useAnomalyAlertEffect'));
  assert('useAnomalies ยังอยู่', existsSync('src/hooks/useAnomalies.ts'));
  assert('anomalyDetection ยังอยู่', existsSync('src/utils/anomalyDetection.ts'));
}

// ─── A1–A5: จอจริง ──────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !extname(file)) file = join('dist', 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'text/plain');
  res.end(readFileSync(file));
});
await new Promise<void>((r) => {
  server.listen(PORT, r);
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(
  ([key, data]) => {
    localStorage.setItem(
      key as string,
      JSON.stringify({
        state: {
          data,
          selectedYear: 2025,
          selectedMonth: 7,
          lastUpdated: new Date(0).toISOString(),
        },
        version: 1,
      }),
    );
  },
  ['wealthlens_data', seedData] as const,
);
const page: Page = await ctx.newPage();

/** หัวข้อ (h2/h3) ของแผงที่อยู่ใน DOM ตอนนี้ */
const panelsInDom = (): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('main h2, main h3')].map((h) => h.textContent?.trim() ?? ''),
  );

const TABS = [
  { id: 'years', ต้องมี: 'ภาพรวมทุกปี', ห้ามมี: ['Subscription', '48 เดือน'] },
  { id: 'trends', ต้องมี: '48 เดือน', ห้ามมี: ['Subscription', 'ภาพรวมทุกปี'] },
  { id: 'subs', ต้องมี: 'Subscription', ห้ามมี: ['48 เดือน', 'ภาพรวมทุกปี'] },
];

for (const tab of TABS) {
  await page.goto(`http://localhost:${PORT}/analytics?tab=${tab.id}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(900);

  console.log(`\n── แท็บ ${tab.id}`);

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  assert(`A1 สูง ${height}px ≤ 2200px`, height <= 2200);

  const panels = await panelsInDom();
  assert(
    `A3 แท็บนี้แสดงแผงที่ถูก (${tab.ต้องมี})`,
    panels.some((p) => p.includes(tab.ต้องมี)),
    panels.join(' | '),
  );
  for (const forbidden of tab.ห้ามมี) {
    assert(
      `A2 ไม่มีแผงของแท็บอื่นใน DOM (${forbidden})`,
      !panels.some((p) => p.includes(forbidden)),
      'lazy ที่แค่ hidden = โหลดครบเหมือนเดิม',
    );
  }

  const bleed = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return { scrollW: document.documentElement.scrollWidth, vw };
  });
  assert(`A5 ไม่ล้นขอบจอ (${bleed.scrollW} ≤ ${bleed.vw})`, bleed.scrollW <= bleed.vw);

  const tabs = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="analytics-tabs"]');
    if (!bar) return null;
    const buttons = [...bar.querySelectorAll('a, button')];
    return {
      count: buttons.length,
      small: buttons.filter((b) => b.getBoundingClientRect().height < 44).length,
      current: buttons.filter((b) => b.getAttribute('aria-current') === 'page').length,
    };
  });
  assert('A4 แถบแท็บมี 3 ปุ่ม', tabs?.count === 3, tabs ? `ได้ ${tabs.count}` : 'ไม่เจอแถบแท็บ');
  assert('A4 ทุกปุ่ม ≥ 44px', tabs?.small === 0, `เล็กเกิน ${tabs?.small}`);
  assert('A4 แท็บปัจจุบันมี aria-current', tabs?.current === 1);
}

console.log('\n— A3: ?tab= ที่ไม่รู้จัก ต้องตกกลับ years ไม่ใช่หน้าว่าง —');
await page.goto(`http://localhost:${PORT}/analytics?tab=ขยะ`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
{
  const panels = await panelsInDom();
  assert(
    'tab ขยะ → เห็นแท็บรายปี',
    panels.some((p) => p.includes('ภาพรวมทุกปี')),
    panels.join(' | ') || '(หน้าว่าง)',
  );
}

await browser.close();
server.close();

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
