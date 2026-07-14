import { defineConfig } from 'vitest/config';

// UI用の vite.config.ts は root:'ui' のため、テストは専用configでプロジェクトルートを見る
export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.{test,spec}.ts'],
  },
});
