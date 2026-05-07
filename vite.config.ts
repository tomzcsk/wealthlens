import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
