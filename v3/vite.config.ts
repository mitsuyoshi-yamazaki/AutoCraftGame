import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'ui',
  base: process.env.GITHUB_PAGES ? '/AutoCraftGame/v3/' : '/',
  server: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
