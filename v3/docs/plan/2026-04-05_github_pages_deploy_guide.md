# GitHub Pages デプロイ — 残作業・動作確認ガイド

日付: 2026-04-05

## ローカル作業（完了済み）

以下のファイルが追加・変更されている:

| ファイル | 変更内容 |
|---------|---------|
| `v1/package.json` | `"build": "vite build"` 追加 |
| `v2/package.json` | `"build": "vite build"` 追加 |
| `v3/package.json` | `"build": "vite build"` 追加 |
| `v1/vite.config.ts` | `base` パス追加（環境変数で切替） |
| `v2/vite.config.ts` | `base` パス追加（環境変数で切替） |
| `v3/vite.config.ts` | `base` パス追加（環境変数で切替） |
| `site/index.html` | ホームページ（新規） |
| `site/screenshot_sample.png` | プレースホルダー画像（新規） |
| `.github/workflows/deploy-pages.yml` | GitHub Actions ワークフロー（新規） |

## ユーザーが行うべき作業

### 1. GitHub リポジトリの設定変更

1. https://github.com/mitsuyoshi-yamazaki/AutoCraftGame/settings/pages を開く
2. "Build and deployment" セクションの **Source** を **"GitHub Actions"** に変更する
   - デフォルトは "Deploy from a branch" になっている
   - これを変更しないとワークフローの deploy ジョブが失敗する

### 2. 変更を main ブランチにコミット・プッシュ

```bash
git add v1/package.json v2/package.json v3/package.json
git add v1/vite.config.ts v2/vite.config.ts v3/vite.config.ts
git add site/index.html site/screenshot_sample.png
git add .github/workflows/deploy-pages.yml
git commit -m "GitHub Pages ホスティングを設定"
git push origin main
```

### 3. GitHub Actions の実行を確認

push 後、自動的にワークフローが実行される。

1. https://github.com/mitsuyoshi-yamazaki/AutoCraftGame/actions を開く
2. "Deploy to GitHub Pages" ワークフローが実行中/完了しているか確認
3. build ジョブ → deploy ジョブの順に成功すれば完了

### 4. スクリーンショットの差し替え（任意）

`site/screenshot_sample.png` をv3のスクリーンショットに差し替える。
ファイル名を変更する場合は `site/index.html` の `<img>` タグの `src` も更新すること。

## 動作確認方法

### GitHub Pages（デプロイ後）

以下の URL にアクセスして動作を確認する:

| ページ | URL |
|-------|-----|
| ホーム | https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/ |
| v1 | https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v1/ |
| v2 | https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v2/ |
| v3 | https://mitsuyoshi-yamazaki.github.io/AutoCraftGame/v3/ |

**確認項目:**
- ホームページが表示され、v1/v2/v3 へのリンクが機能する
- 各バージョンのアプリケーションが正常に動作する（Canvas描画、ボタン操作など）
- アセット（CSS、JS、画像）が正しく読み込まれている（ブラウザのDevToolsのNetworkタブで404がないこと）

### ローカルでのビルド確認（デプロイ前に試す場合）

```bash
# v3 の例
cd v3
GITHUB_PAGES=true npm run build
# v3/ui/dist/ にビルド成果物が生成される

# ローカルでプレビュー（GitHub Pages と同じパス構成でサーブ）
cd /path/to/repo
mkdir -p _site
cp site/index.html _site/
cp site/screenshot_sample.png _site/
cp -r v1/ui/dist _site/v1
cp -r v2/ui/dist _site/v2
cp -r v3/ui/dist _site/v3
npx serve _site
# → http://localhost:3000/ でホームページが表示される
# ※ base パスが /AutoCraftGame/ のため、ローカルではアセットパスが一致しない。
#    完全な動作確認は GitHub Pages 上で行う。
```

## トラブルシューティング

### ワークフローが実行されない
- Settings → Pages → Source が "GitHub Actions" になっているか確認
- `.github/workflows/deploy-pages.yml` が main ブランチに存在するか確認

### deploy ジョブが権限エラー
- Settings → Pages → Source が "GitHub Actions" に変更されていない可能性がある
- リポジトリが public であるか、GitHub Pro/Team で Pages が有効であるか確認

### アセットが 404
- 各 `vite.config.ts` の `base` パスが正しいか確認（`/AutoCraftGame/v1/` など）
- ワークフロー内で `GITHUB_PAGES=true` 環境変数が設定されているか確認

### ホームページは表示されるがアプリが動かない
- ブラウザの DevTools → Console でエラーを確認
- pixi.js が WebGL/Canvas を要求するため、HTTPS 環境でないと動作しない場合がある（GitHub Pages は HTTPS なので通常問題なし）
