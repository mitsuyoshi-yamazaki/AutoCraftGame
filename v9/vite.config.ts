import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * 素のスクリプトで置いているもの。ES module ではないので vite のモジュールグラフに載らず、
 * 何もしないと静的ビルドから漏れる（開発サーバーでは配信されるので気づきにくい）。
 * 視覚言語ダッシュボード一式も、ビルド成果物へそのまま持っていく。
 */
const PLAIN_ASSETS = [
  'simulation-ui-kit',
  'visual-language-model.js',
  'visual-language-draw.js',
  'visual-language-controls.js',
  'visual-language.js',
  'visual-language.css',
  'visual-language.html',
  // 録画用の字幕台本（src/tools/recording-script.ts が書き出す。無くてもUIは動く）
  'recording-captions.json',
];

const copyPlainAssets = () => ({
  name: 'copy-plain-assets',
  closeBundle(): void {
    const from = resolve(__dirname, 'ui');
    const to = resolve(__dirname, 'ui/dist');
    for (const entry of PLAIN_ASSETS) {
      const source = resolve(from, entry);
      if (!existsSync(source)) continue; // 台本は任意（生成していない環境もある）
      cpSync(source, resolve(to, entry), { recursive: true });
    }
  },
});

export default defineConfig({
  root: 'ui',
  server: { host: '0.0.0.0' },
  plugins: [copyPlainAssets()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
