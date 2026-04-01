import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'ui',
  server: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
