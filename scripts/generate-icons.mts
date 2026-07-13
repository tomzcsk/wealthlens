/**
 * F51 — สร้างไอคอน PWA จาก public/favicon.svg
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-icons.mts
 *
 * ใช้ Playwright ที่ติดตั้งอยู่แล้ว rasterize แทนการเพิ่ม sharp/canvas เข้ามา
 * เพื่อทำรูปสี่รูป — รันครั้งเดียว ผลลัพธ์ commit ลง repo
 *
 * maskable ต้องมีพื้นทึบและโลโก้อยู่ใน safe zone: Android ครอบมุมได้ถึง 20%
 * ต่อด้าน พื้นโปร่ง = โลโก้โดนครอบมุมทิ้ง หรือกลายเป็นสี่เหลี่ยมดำ
 */
import { mkdirSync, readFileSync } from 'node:fs';

import { chromium } from 'playwright';

const svg = readFileSync('public/favicon.svg', 'utf8');
const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** logoScale = สัดส่วนความกว้างของโลโก้เทียบกับกรอบ */
const ICONS = [
  { file: 'icon-192.png', size: 192, logoScale: 0.72, bg: '#ffffff' },
  { file: 'icon-512.png', size: 512, logoScale: 0.72, bg: '#ffffff' },
  // safe zone: โลโก้กินแค่ 60% ตรงกลาง เผื่อ Android ครอบ 20% ต่อด้าน
  { file: 'icon-maskable-512.png', size: 512, logoScale: 0.6, bg: '#ffffff' },
  // iOS ครอบมุมเองอยู่แล้ว และไม่รองรับพื้นโปร่ง
  { file: 'apple-touch-icon.png', size: 180, logoScale: 0.68, bg: '#ffffff' },
];

mkdirSync('public/icons', { recursive: true });

const browser = await chromium.launch();
for (const icon of ICONS) {
  const page = await browser.newPage({
    viewport: { width: icon.size, height: icon.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(`
    <html><body style="margin:0">
      <div style="width:${icon.size}px;height:${icon.size}px;background:${icon.bg};
                  display:flex;align-items:center;justify-content:center">
        <img src="${svgDataUri}" style="width:${Math.round(icon.size * icon.logoScale)}px" />
      </div>
    </body></html>
  `);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: false });
  await page.close();
  console.log(`✅ public/icons/${icon.file} (${icon.size}px)`);
}
await browser.close();
