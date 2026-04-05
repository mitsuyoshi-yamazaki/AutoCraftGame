# GitHub Pages ホスティング実装計画

日付: 2026-04-05

## 目的

v1, v2, v3 の GUI アプリケーションを GitHub Pages で静的ホスティングする。
将来のバージョン追加にも対応できる構成とする。

## 要件

1. ビルド成果物は main ブランチにコミットしない
2. ホームページ（リポジトリルート）から v1, v2, v3 へのリンクを提供する
3. 将来の v4, v5... が追加された場合も同様にホスティングする
4. remote の main ブランチ更新時に GitHub Pages も自動更新される
5. ホスティング関連ファイルは `site/` ディレクトリにまとめる

## 方式: GitHub Actions + Pages Artifact デプロイ

### 概要

GitHub Actions の **Pages Artifact デプロイ** は、2022年末に導入された GitHub Pages の新しいデプロイ方式。
従来の gh-pages ブランチ方式と異なり、ビルド成果物をブランチにコミットせず、GitHub Actions の Artifact として直接 Pages 基盤にアップロードする。

### 仕組み

1. ワークフローの build ジョブで静的ファイルを生成
2. `actions/upload-pages-artifact` でビルド成果物を Artifact としてアップロード
3. `actions/deploy-pages` が Artifact を取得し、GitHub Pages にデプロイ

Pages 基盤が成果物を管理するため、gh-pages ブランチは不要。

### セットアップ

リポジトリの Settings → Pages → Build and deployment → Source を **"GitHub Actions"** に変更する必要がある（デフォルトは "Deploy from a branch"）。

### 公式ドキュメント

- GitHub Docs: Publishing with a custom GitHub Actions workflow
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site#publishing-with-a-custom-github-actions-workflow
- actions/upload-pages-artifact: https://github.com/actions/upload-pages-artifact
- actions/deploy-pages: https://github.com/actions/deploy-pages
- GitHub Pages starter workflows: https://github.com/actions/starter-workflows/tree/main/pages

### 利点

- ブランチ管理が不要（成果物は GitHub Pages 基盤が管理）
- main ブランチがクリーンに保たれる
- ワークフロー内で成果物の組み立てが完結する
- `GITHUB_TOKEN` の permissions で制御でき、追加のシークレット不要

## リポジトリ情報

- リポジトリ: `https://github.com/mitsuyoshi-yamazaki/AutoCraftGame`
- Pages URL: `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/`
- base パス: `/AutoCraftGame/`（大文字に注意）

## 変更箇所

### 1. 各バージョンの vite.config.ts — `base` パス追加

GitHub Pages では `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v1/` のような URL 構成になる。
Vite のビルド時に `base` を設定しないと、アセットのパスが `/assets/...` となり 404 になる。

```typescript
// v1/vite.config.ts
export default defineConfig({
  root: 'ui',
  base: process.env.GITHUB_PAGES ? '/AutoCraftGame/v1/' : '/',
  // ...
});
```

各バージョンの vite.config.ts に同様の変更を加える。
環境変数 `GITHUB_PAGES=true` はワークフロー内でのみ設定される。ローカル開発時は `/` のまま。

**対象ファイル:** `v1/vite.config.ts`, `v2/vite.config.ts`, `v3/vite.config.ts`

### 2. 各バージョンの package.json — `build` スクリプト追加

現在どのバージョンにも `build` スクリプトがない。

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

**対象ファイル:** `v1/package.json`, `v2/package.json`, `v3/package.json`

### 3. ホームページ — `site/index.html`

`site/` ディレクトリにホームページを配置。各バージョンへのリンクと簡単な説明を含む。

```
site/
└── index.html
```

CSS フレームワーク不使用。最小限の `<style>` で十分。

### 4. GitHub Actions ワークフロー — `site/deploy-pages.yml`

ワークフロー定義ファイルは `.github/workflows/` に配置する必要がある（GitHub の仕様）。
ただし `site/` ディレクトリから `.github/workflows/` へのシンボリックリンクは不可のため、ワークフローファイルのみ `.github/workflows/` に直接配置する。

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build v1
        working-directory: v1
        env:
          GITHUB_PAGES: 'true'
        run: npm ci && npm run build

      - name: Build v2
        working-directory: v2
        env:
          GITHUB_PAGES: 'true'
        run: npm ci && npm run build

      - name: Build v3
        working-directory: v3
        env:
          GITHUB_PAGES: 'true'
        run: npm ci && npm run build

      - name: Assemble site
        run: |
          mkdir -p _site
          cp site/index.html _site/
          cp -r v1/ui/dist _site/v1
          cp -r v2/ui/dist _site/v2
          cp -r v3/ui/dist _site/v3

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 5. 将来バージョンへの対応

v4 以降を追加する際の手順:

1. `v4/vite.config.ts` に `base: process.env.GITHUB_PAGES ? '/AutoCraftGame/v4/' : '/'` を追加
2. `v4/package.json` に `"build": "vite build"` スクリプトを追加
3. `.github/workflows/deploy-pages.yml` に v4 のビルド + コピーステップを追加
4. `site/index.html` に v4 へのリンクを追加

## ビルド出力の構造

```
_site/                        ← GitHub Pages にデプロイされるディレクトリ
├── index.html                ← ホームページ
├── v1/
│   ├── index.html
│   └── assets/
├── v2/
│   ├── index.html
│   └── assets/
└── v3/
    ├── index.html
    └── assets/
```

**公開 URL:**
- ホーム: `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/`
- v1: `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v1/`
- v2: `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v2/`
- v3: `https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v3/`

## 前提条件（手動設定）

GitHub リポジトリの Settings → Pages → Build and deployment → Source を **"GitHub Actions"** に変更する。

## 未確認事項

- ワークフロー内でのテスト実行の要否
- ホームページの内容の詳細

## 実装順序

1. 各バージョンの `package.json` に `build` スクリプトを追加
2. 各バージョンの `vite.config.ts` に `base` を追加
3. ローカルで各バージョンのビルドが成功することを確認
4. `site/index.html` を作成
5. `.github/workflows/deploy-pages.yml` を作成
6. main へ push → GitHub Actions の動作を確認（Settings で Source 変更後）
