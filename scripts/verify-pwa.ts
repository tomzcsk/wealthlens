/**
 * Verification for F51 — PWA.
 *   npm run verify:pwa
 *
 * P3 คือกฎที่สำคัญที่สุด: ตัดเน็ตแล้วต้องเปิดแอปได้จริง ถ้าข้อนี้ไม่ผ่าน
 * อย่างอื่นไม่มีความหมาย — "PWA" ที่เปิดไม่ได้ตอนไม่มีเน็ตคือเว็บธรรมดา
 * ที่มีไอคอนสวย
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium } from 'playwright';

import seedData from '../src/data/seedData';

const PORT = 4193;

let failures = 0;
const assert = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = join('dist', url === '/' ? 'index.html' : url);
  if (!existsSync(file) || !extname(file)) file = join('dist', 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'text/plain');
  res.end(readFileSync(file));
});
await new Promise<void>((resolve) => {
  server.listen(PORT, resolve);
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
const page = await ctx.newPage();

/**
 * ตอนไม่มี SW การ reload แบบออฟไลน์จะพาไปหน้า error ของเบราว์เซอร์ (chrome-error://)
 * ซึ่งแตะ localStorage ไม่ได้เลย (SecurityError) — evaluate จึง throw ก่อนที่ assert
 * จะได้พูด. ประตูที่แดงต้อง "รายงานว่าแดง" ไม่ใช่ระเบิด: อ่านไม่ได้ = ถือว่าไม่ผ่าน
 */
const safeEvaluate = async <T>(fn: () => T, fallback: T): Promise<T> => {
  try {
    return await page.evaluate(fn);
  } catch {
    return fallback;
  }
};

// ─── P1: manifest ──────────────────────────────────────────────────────────
console.log('\n— P1: manifest —');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

const manifestHref = await page.evaluate(
  () => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? null,
);
assert('มี <link rel="manifest">', manifestHref !== null);

if (manifestHref) {
  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href);
    return res.json();
  }, manifestHref);

  assert('name = WealthLens', manifest.name === 'WealthLens', String(manifest.name));
  assert('display = standalone', manifest.display === 'standalone', String(manifest.display));
  assert('start_url มีค่า', Boolean(manifest.start_url));

  const icons = (manifest.icons ?? []) as Array<{ sizes: string; purpose?: string }>;
  assert('มีไอคอน 192', icons.some((i) => i.sizes === '192x192'));
  assert('มีไอคอน 512', icons.some((i) => i.sizes === '512x512'));
  assert(
    'มีไอคอน maskable',
    icons.some((i) => (i.purpose ?? '').includes('maskable')),
    'Android จะครอบมุมโลโก้ทิ้งถ้าไม่มี',
  );
}

const themeColors = await page.evaluate(() =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({
    content: m.getAttribute('content'),
    media: m.getAttribute('media'),
  })),
);
assert(
  'theme-color มีทั้งโหมดสว่างและมืด',
  themeColors.length >= 2 && themeColors.some((t) => (t.media ?? '').includes('dark')),
  'ไม่งั้นแถบสถานะขาวโพลนคาดบนหัวแอปมืด',
);
assert('title = WealthLens', (await page.title()) === 'WealthLens', await page.title());
assert(
  'มี apple-touch-icon',
  await page.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]')),
);

// ─── P2: service worker ────────────────────────────────────────────────────
console.log('\n— P2: service worker —');
await page.waitForTimeout(2500); // ให้ SW ลงทะเบียนและ precache เสร็จ

const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(reg?.active);
});
assert('service worker active', swReady);

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const urls: string[] = [];
  for (const name of names) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) urls.push(req.url);
  }
  return urls;
});
assert(
  'precache มี index.html',
  cached.some((u) => u.endsWith('/') || u.includes('index.html')),
);
assert(
  'precache มี JS',
  cached.some((u) => u.endsWith('.js')),
);
assert(
  'precache มี CSS',
  cached.some((u) => u.endsWith('.css')),
);

// ─── P5: เส้นที่ห้ามข้าม ───────────────────────────────────────────────────
console.log('\n— P5: ของที่ห้ามอยู่ใน cache —');
assert(
  'ไม่มี /api/gold-price ใน cache',
  !cached.some((u) => u.includes('/api/gold-price')),
  'ราคาทองสดถูกแช่ = net worth คิดจากราคาเมื่อวาน',
);
assert(
  'ไม่มีอะไรของ Google ใน cache',
  !cached.some((u) => u.includes('googleapis.com') || u.includes('accounts.google.com')),
  'token/response ค้างใน cache = บั๊ก + ความเสี่ยง',
);

// ─── P3: ตัดเน็ตแล้วต้องเปิดได้ (ข้อสำคัญที่สุด) ──────────────────────────
console.log('\n— P3: ตัดเน็ตแล้วเปิดแอปได้ —');
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' }).catch(() => {
  // ไม่มี SW = เบราว์เซอร์โหลดหน้าไม่ได้เลย reload จะ throw. นั่นคือคำตอบของ P3
  // อยู่แล้ว — ปล่อยให้ assert ข้างล่างเป็นคนบอก ไม่ใช่ crash ทั้งสคริปต์
});
await page.waitForTimeout(1500);

const offlineState = await safeEvaluate(
  () => ({
    hasMain: !!document.querySelector('main'),
    hasNav: !!document.querySelector('[aria-label="เมนูหลัก"]'),
    text: document.body.innerText.slice(0, 80),
  }),
  { hasMain: false, hasNav: false, text: 'อ่านหน้าไม่ได้ — เบราว์เซอร์ไม่ได้โหลดแอป' },
);
assert('ออฟไลน์: เห็น <main>', offlineState.hasMain, offlineState.text);
assert('ออฟไลน์: เห็นเมนู', offlineState.hasNav, offlineState.text);

// ─── P4: ออฟไลน์แล้วยังกรอกรายจ่ายได้ ─────────────────────────────────────
console.log('\n— P4: ออฟไลน์แล้วเขียนข้อมูลได้ —');
{
  const before = await safeEvaluate(() => {
    const raw = localStorage.getItem('wealthlens_data');
    return raw ? JSON.parse(raw).state.data.years['2025'].expenses.length : -1;
  }, -1);

  // เขียนผ่าน store จริง ไม่ใช่ยัด localStorage ตรง ๆ — ต้องพิสูจน์ว่า "แอปเขียนได้"
  // ไม่ใช่ "เราเขียน localStorage ได้"
  await page.goto(`http://localhost:${PORT}/monthly`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);

  // ไม่มี SW = หน้านี้เป็นหน้า error ของเบราว์เซอร์ ไม่มีปุ่มให้กด. รอสั้น ๆ แล้ว
  // ปล่อยให้ assert เป็นคนรายงาน แทนที่จะให้ timeout 30 วิของ Playwright โยน
  const added = await (async () => {
    try {
      await page
        .getByRole('button', { name: /เพิ่มค่าใช้จ่าย/ })
        .first()
        .click({ timeout: 5000 });
      await page.waitForTimeout(600);
      await page.getByLabel(/ชื่อรายการ/).fill('ทดสอบออฟไลน์', { timeout: 5000 });
      await page.getByLabel(/จำนวนเงิน/).fill('123', { timeout: 5000 });
      await page.getByRole('button', { name: /^บันทึก/ }).click({ timeout: 5000 });
      await page.waitForTimeout(900);
      return true;
    } catch (error) {
      console.log(`   (กรอกฟอร์มไม่ได้: ${(error as Error).message.split('\n')[0]})`);
      return false;
    }
  })();

  const after = await safeEvaluate(
    () => {
      const raw = localStorage.getItem('wealthlens_data');
      const rows = raw ? JSON.parse(raw).state.data.years['2025'].expenses : [];
      return {
        count: rows.length,
        found: JSON.stringify(rows).includes('ทดสอบออฟไลน์'),
      };
    },
    { count: -1, found: false },
  );
  assert(
    'ออฟไลน์: เพิ่มรายจ่ายได้',
    added && after.found,
    `แถวก่อน ${before} → หลัง ${after.count}`,
  );

  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  const survived = await safeEvaluate(
    () => (localStorage.getItem('wealthlens_data') ?? '').includes('ทดสอบออฟไลน์'),
    false,
  );
  assert('ออฟไลน์: reload แล้วข้อมูลยังอยู่', survived);
}

await ctx.setOffline(false);

// ─── P6: มี SW ใหม่รออยู่ → prompt ต้องเด้ง ───────────────────────────────
console.log('\n— P6: prompt อัปเดต —');
{
  // ไม่ได้จำลอง SW ใหม่จริง (ต้อง build สองรอบ) — ตรวจว่า "ทางเดิน" ครบ:
  // 1) โค้ดลงทะเบียนแบบ prompt (ไม่ใช่ autoUpdate) 2) มี UI ที่รอรับสัญญาณนั้น
  const config = readFileSync('vite.config.ts', 'utf8');
  assert(
    "registerType: 'prompt' (ไม่ใช่ autoUpdate)",
    /registerType:\s*'prompt'/.test(config),
    'autoUpdate = reload กลางคันตอนกรอกฟอร์ม ข้อมูลที่พิมพ์ค้างหาย',
  );
  assert('มี UpdatePrompt component', existsSync('src/components/pwa/UpdatePrompt.tsx'));
  const layout = readFileSync('src/components/layout/Layout.tsx', 'utf8');
  assert('Layout mount UpdatePrompt', layout.includes('UpdatePrompt'));
}

await browser.close();
server.close();

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
