/**
 * Verification for F47 — mobile UX.
 *   npm run verify:mobile
 *
 * dark mode พิสูจน์ได้ด้วยการอ่านค่าสี แต่ mobile พิสูจน์ได้จาก "จอที่ render
 * แล้ว" เท่านั้น — element ล้นขอบ, ปุ่มเล็กกว่านิ้ว, แถบล่างครบไหม วัดจาก DOM จริง
 *
 * เปิด dist/ ที่ 390×844 (iPhone) แล้ววิ่งทุกหน้า + เช็คเดสก์ท็อป 1280px ปิดท้าย
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { chromium, type Page } from 'playwright';

import seedData from '../src/data/seedData';
import { NAV_ITEMS } from '../src/lib/nav';
import type { WealthLensData } from '../src/types';

const PORT = 4178;

/**
 * ทองขนาด "ของจริง" — seedData ไม่มี goldHoldings เลย หน้า /gold จึงเคยถูกวัด
 * ตอนที่มันว่างเปล่า (ไม่มีแถว = ไม่มีอะไรล้น = เขียวหลอก ๆ) ยอดของ Tom จริง ๆ คือ
 * ระดับ ฿130,340 / ฿65,170 ต่อบาททอง — ตัวเลขที่ยาวพอจะดันช่องแตกบนจอ 390px
 * ประตูที่ผ่านด้วยข้อมูลสวยกว่าความจริง คือประตูที่โกหก
 */
const VERIFY_DATA: WealthLensData = {
  ...seedData,
  goldHoldings: [
    {
      id: 'g1',
      purchaseDate: '2026-06-10',
      brand: 'MTS Gold',
      type: 'bar',
      purity: '96.5',
      weightBaht: 2,
      totalCost: 130_340,
      paymentMethod: 'cash',
    },
    {
      id: 'g2',
      purchaseDate: '2024-12-15',
      brand: 'ฮั่วเซ่งเฮง',
      type: 'bar',
      purity: '96.5',
      weightBaht: 5,
      totalCost: 214_750,
      paymentMethod: 'cash',
    },
  ],
  preferences: {
    ...seedData.preferences,
    // ตั้ง spot ไว้ให้คอลัมน์ "มูลค่าตลาด" มีตัวเลขจริง + updatedAt สด ๆ เพื่อกัน
    // auto-fetch จาก สมาคมค้าทองคำ ตอนรัน gate (ผลลัพธ์จะได้ deterministic)
    goldSpotPrice: {
      '96.5': 52_150,
      '99.99': 54_400,
      updatedAt: new Date().toISOString(),
    },
  },
};
/**
 * ทุกหน้าในทะเบียนเมนู (F49) — เดิมเป็นรายการพิมพ์มือ เพิ่มหน้าใหม่แล้วมันหลุด
 * การตรวจเงียบ ๆ (F48 รอดมาได้เพราะมีคนจำได้ว่าต้องมาเติม '/growth' เอง).
 * `/report/:year` ไม่อยู่ในทะเบียนโดยตั้งใจ — มันคือกระดาษ A4 ไม่ใช่หน้าจอ (F47 spec)
 */
const ROUTES = NAV_ITEMS.map((item) => item.path);

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

/** เปิดหน้าโดยมีข้อมูลจริงของ Tom อยู่ใน LocalStorage แล้ว */
const openApp = async (width: number, height: number): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width, height } });
  // store เริ่มต้นเป็น "หน้าว่าง" (buildInitialState → emptyData) — ถ้าไม่ seed
  // เราจะไปทดสอบตารางเปล่า ซึ่งไม่มีคอลัมน์ให้ล้นตั้งแต่แรก = ทดสอบหลอกตัวเอง
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
    ['wealthlens_data', VERIFY_DATA] as const,
  );
  return ctx.newPage();
};

const page = await openApp(390, 844);

for (const route of ROUTES) {
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  console.log(`\n── ${route}`);

  /*
   * M0 — เรากำลังดู dashboard จริง ไม่ใช่หน้า login (กัน gate เน่าเงียบ ๆ)
   *
   * ประตู login คือ `requireSignIn = isReady && !isSignedIn` ใน Layout.tsx
   * เบราว์เซอร์ headless ไม่มีวัน sign in — ถ้าวันหนึ่ง .env.verify หาย หรือ
   * vite เลิกอ่าน .env.[mode] แล้ว client id จริงหลุดเข้า bundle ทุกหน้าจะ
   * กลายเป็น LoginPage: ไม่มีตาราง ไม่มีปุ่ม M1-M5 จะ "ผ่าน" หมดโดยไม่ได้วัดอะไร
   * assert นี้จึงต้องดังก่อนใครเพื่อน
   */
  const shell = await page.evaluate(() => ({
    loginCta: !!document.body.textContent?.includes('เข้าสู่ระบบด้วย Gmail'),
    main: !!document.querySelector('main'),
    navMenu: !!document.querySelector('[aria-label="เมนูหลัก"]'),
  }));
  assert(
    'M0 กำลังวัด dashboard จริง (ไม่ใช่หน้า login)',
    !shell.loginCta && shell.main && shell.navMenu,
    shell.loginCta ? 'เจอปุ่ม "เข้าสู่ระบบด้วย Gmail" — auth ยังไม่ถูกปิดในบิลด์นี้' : 'ไม่เจอ shell ของ dashboard (main + เมนูหลัก)',
  );

  // M0b — ข้อมูล seed ของ Tom โหลดเข้า store จริง (ไม่งั้นตารางว่าง = ไม่มีอะไรให้ล้น)
  if (route === '/') {
    const rows = await page.evaluate(
      () => document.querySelectorAll('table tbody tr').length,
    );
    assert(`M0 ข้อมูล seed โหลดจริง (แถวตาราง ${rows} ≥ 12)`, rows >= 12);
  }

  // M1: ไม่มีอะไรล้นขอบจอ
  const bleed = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('*')]
      .filter((e) => e.getBoundingClientRect().right > vw + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}`);
    return {
      scrollW: document.documentElement.scrollWidth,
      vw,
      culprits: [...new Set(over)].slice(0, 5),
    };
  });
  assert(
    `M1 ไม่ล้นขอบจอ (scrollWidth ${bleed.scrollW} ≤ ${bleed.vw})`,
    bleed.scrollW <= bleed.vw,
    bleed.culprits.join(', '),
  );

  // M2: ปุ่มกดโดน ≥ 44px
  const small = await page.evaluate(() => {
    const sel = 'button, a, select, input[type=checkbox]';
    return [...document.querySelectorAll(sel)]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (e.closest('[data-tap-exempt]')) return false;
        return r.height < 44;
      })
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[${(e.textContent || '').trim().slice(0, 12)}] ${Math.round(
            e.getBoundingClientRect().height,
          )}px`,
      );
  });
  assert(
    `M2 ปุ่มทุกตัว ≥ 44px (เล็กเกิน ${small.length} ตัว)`,
    small.length === 0,
    small.slice(0, 6).join(' · '),
  );

  // M3: แถบล่างครบและบอกตำแหน่งปัจจุบัน
  const nav = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="bottom-nav"]');
    if (!bar) return null;
    const tabs = [...bar.querySelectorAll('a, button')];
    return {
      tabs: tabs.length,
      current: tabs.filter((t) => t.getAttribute('aria-current') === 'page').length,
    };
  });
  assert('M3 แถบล่างมี 5 ช่อง', nav?.tabs === 5, nav ? `ได้ ${nav.tabs}` : 'ไม่เจอแถบล่าง');
  const expectCurrent = ['/', '/monthly', '/accounts', '/analytics'].includes(route);
  assert(
    `M3 แถบปัจจุบันติดธง aria-current (คาด ${expectCurrent ? 1 : 0})`,
    nav?.current === (expectCurrent ? 1 : 0),
    nav ? `ได้ ${nav.current}` : 'ไม่เจอแถบล่าง',
  );

  // M4: ตารางกว้างเกินจอ → ต้องตรึงคอลัมน์แรก
  const tables = await page.evaluate(() =>
    [...document.querySelectorAll('table')].map((t) => {
      const wide = t.scrollWidth > document.documentElement.clientWidth;
      const first = t.querySelector('tbody tr > *:first-child');
      const sticky = first ? getComputedStyle(first).position === 'sticky' : false;
      return { wide, sticky, rows: t.querySelectorAll('tbody tr').length, w: t.scrollWidth };
    }),
  );
  for (const [i, t] of tables.entries()) {
    if (!t.wide || t.rows === 0) continue;
    assert(`M4 ตาราง #${i + 1} (กว้าง ${t.w}px เกินจอ) ตรึงคอลัมน์แรก`, t.sticky);
  }

  /*
   * M7: ข้อความห้ามล้นออกนอก "ช่องของตัวเอง"
   *
   * M1 จับได้แค่ของที่ล้นออกนอก "จอ" — แต่บั๊กที่ Tom เจอบน /gold คือข้อความล้น
   * ออกนอก grid cell ของตัวเอง (col-span-1 ≈ 20px แต่ "30.49g" กิน 41px) แล้ว
   * ไหลไปนอนใต้ปุ่ม ขาย โดยหน้าเพจไม่ได้กว้างเกินจอเลยสักพิกเซล
   *
   * นับเฉพาะ leaf (ไม่มี element ลูก) ที่มีข้อความ และ overflow เป็น visible
   * เท่านั้น — ตัวที่ตั้งใจให้เลื่อนได้ (overflow-x-auto) ไม่ใช่บั๊ก
   *
   * หมายเหตุ: ห้ามประกาศฟังก์ชัน "มีชื่อ" ในบล็อก evaluate (tsx/esbuild keepNames
   * แทรก __name → ReferenceError ในหน้าเว็บ) — เขียนเป็นนิพจน์ล้วน
   */
  const spill = await page.evaluate(() =>
    [...(document.querySelector('main')?.querySelectorAll('*') ?? [])]
      .filter((e) => {
        if (e.childElementCount > 0) return false;
        if (!(e.textContent ?? '').trim()) return false;
        const cs = getComputedStyle(e);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return false;
        return e.scrollWidth > e.clientWidth + 1;
      })
      .map(
        (e) =>
          `"${(e.textContent ?? '').trim().slice(0, 16)}" ต้องการ ${e.scrollWidth}px ช่องกว้าง ${e.clientWidth}px`,
      ),
  );
  assert(
    `M7 ข้อความไม่ล้นช่องตัวเอง (ล้น ${spill.length} จุด)`,
    spill.length === 0,
    spill.slice(0, 8).join(' · '),
  );

  // M5: ปุ่มลอยไม่ทับ control อื่น
  const fabClash = await page.evaluate(() => {
    const fab = document.querySelector('[data-testid="add-fab"]');
    if (!fab) return 'ไม่เจอปุ่มลอย';
    const r = fab.getBoundingClientRect();
    const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
    return fab.contains(top) ? null : `ทับกับ ${top?.tagName}`;
  });
  assert('M5 ปุ่มลอยกดโดน ไม่มีอะไรทับ', fabClash === null, String(fabClash));
}

// เดสก์ท็อป 1280 — ต้องไม่มีอะไรของมือถือโผล่
console.log('\n── เดสก์ท็อป 1280×800');
const desk = await openApp(1280, 800);
await desk.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await desk.waitForTimeout(400);
/*
 * หมายเหตุการวัด: ห้ามประกาศฟังก์ชัน "มีชื่อ" ในบล็อก evaluate — tsx/esbuild
 * (keepNames) จะแทรก helper __name เข้าไปในฟังก์ชันที่ถูก serialize ส่งไป
 * เบราว์เซอร์ แล้วพังด้วย "ReferenceError: __name is not defined" ในหน้าเว็บ
 * จึงเขียนเป็นนิพจน์ล้วน (checkVisibility มีใน Chromium ≥105)
 */
const deskState = await desk.evaluate(() => ({
  bottomNav: document.querySelector('[data-testid="bottom-nav"]')?.checkVisibility() ?? false,
  fab: document.querySelector('[data-testid="add-fab"]')?.checkVisibility() ?? false,
  sidebar: document.querySelector('aside')?.checkVisibility() ?? false,
  hamburger: !!document.querySelector('[aria-label="เปิดเมนู"]'),
}));
assert('M6 เดสก์ท็อป: ไม่มีแถบล่าง', !deskState.bottomNav);
assert('M6 เดสก์ท็อป: ไม่มีปุ่มลอย', !deskState.fab);
assert('M6 เดสก์ท็อป: sidebar อยู่ครบ', deskState.sidebar);
assert('M6 แฮมเบอร์เกอร์ถูกลบทิ้งแล้ว (เมนูอยู่แถบล่าง)', !deskState.hamburger);

await browser.close();
server.close();

console.log(failures === 0 ? '\n✅ ผ่านทั้งหมด' : `\n❌ ล้มเหลว ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
