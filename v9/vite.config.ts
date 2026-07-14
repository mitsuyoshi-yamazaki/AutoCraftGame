import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'ui',
  server: { host: '0.0.0.0' },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
