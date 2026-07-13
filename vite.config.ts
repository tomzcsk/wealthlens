import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Build-time metadata shown in the sidebar footer (version · hash · time). */
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };
let gitCommit = 'local';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  /* not a git checkout (e.g. some CI) — fall back to 'local' */
}
const buildTime = new Date().toISOString();

/**
 * Same-origin proxy สำหรับราคาทอง — goldtraders.or.th ไม่เปิด CORS
 * และ proxy ฟรีภายนอก (chnwt.dev, corsproxy.io, allorigins) ทยอยปิด/พังหมด
 * จึง proxy ผ่าน origin ตัวเอง: dev/preview ใช้ Vite proxy นี้,
 * production ใช้ rewrite ใน vercel.json (path เดียวกัน: /api/gold-price)
 */
const goldPriceProxy = {
  '/api/gold-price': {
    target: 'https://www.goldtraders.or.th',
    changeOrigin: true,
    rewrite: () => '/api/GoldPrices/Latest',
  },
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      // prompt ไม่ใช่ autoUpdate: reload เงียบ ๆ กลางคันตอนกรอกฟอร์ม =
      // ข้อมูลที่พิมพ์ค้างหาย (F51)
      registerType: 'prompt',
      // SW ใน dev = แก้โค้ดแล้วไม่เห็นผลจนกว่าจะ hard-reload แล้วเสียเวลา
      // ไล่หาบั๊กที่ไม่มีอยู่จริง
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'WealthLens',
        short_name: 'WealthLens',
        description: 'บัญชีส่วนตัว — รายรับ รายจ่าย ความมั่งคั่ง',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'th',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // โลโก้ธนาคาร 23 ไฟล์ + ฟอนต์ → precache ใหญ่กว่า default 2 MB
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // กฎเหล็กข้อ 1 — ราคาทองสด ห้ามแช่
            urlPattern: /\/api\/gold-price/,
            handler: 'NetworkOnly',
          },
          {
            // กฎเหล็กข้อ 2 — Drive/OAuth ห้ามแช่
            urlPattern:
              /^https:\/\/(www\.googleapis\.com|accounts\.google\.com|oauth2\.googleapis\.com)\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: goldPriceProxy,
  },
  preview: {
    proxy: goldPriceProxy,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Manual vendor chunking.
         *
         * Splits heavy third-party deps into their own long-cached chunks
         * so a code change in one library doesn't bust the cache for the
         * others, and so the initial Overview load doesn't ship code it
         * doesn't need (e.g. Recharts only ships once Analytics or the
         * dashboard charts mount).
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('recharts') || id.includes('victory-vendor') || id.includes('d3-')) {
            return 'vendor-recharts';
          }
          if (
            id.includes('react-router-dom') ||
            id.includes('react-router') ||
            id.includes('@remix-run')
          ) {
            return 'vendor-router';
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'vendor-react';
          }
          if (id.includes('@react-oauth/google')) {
            return 'vendor-auth';
          }
          if (id.includes('zustand')) {
            return 'vendor-state';
          }
          if (id.includes('numeral') || id.includes('date-fns') || id.includes('uuid')) {
            return 'vendor-utils';
          }
          return undefined;
        },
      },
    },
  },
});
