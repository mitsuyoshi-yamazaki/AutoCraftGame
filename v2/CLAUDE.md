# auto-craft-game v2 — 淘汰圧の導入

## 概要

v1（自己複製の検証）に淘汰圧を導入するバージョン。
資源の有限化、エネルギーモデル、行動コスト、残骸・分解を実装する。

## 仕様

ゲーム仕様は `docs/specs/` に格納されている。

| ファイル | 内容 |
|---------|------|
| `docs/specs/README.md` | バージョン概要・スコープ |
| `docs/specs/game_spec.md` | ゲームシステム仕様（資源、エネルギー、アクション、ゲームループ） |
| `docs/specs/initial_state.md` | 初期状態仕様（ノード配置、初期キャラクター） |
| `docs/specs/issues.md` | v1から解決すべき課題 |

v1の仕様のうち、game_spec.mdに記載のない部分はv1を踏襲する。

## プロジェクト構造

```
src/
├── types.ts            ... 型定義
├── constants.ts        ... 全定数定義（エネルギーコスト、代謝等）
├── recipes.ts          ... 素材階層、レシピ定義
├── world.ts            ... マップ、ResourceNode, EnergyNode, Remains
├── character.ts        ... キャラクター、コンポーネント、エネルギー
├── program.ts          ... Program評価（Condition/Action）
├── actions.ts          ... 各Actionの実行ロジック
├── simulation.ts       ... ゲームループ（8ステップ）
└── cli.ts              ... CLIエントリポイント
ui/                     ... ブラウザGUI（pixi.js描画）
├── index.html          ... エントリHTML
├── main.ts             ... UIコントローラー（タイマー制御、DOM更新）
├── renderer.ts         ... pixi.js描画（セル単位の関数 + Rendererクラス）
├── style.css           ... スタイル
└── stories/            ... Storybookストーリー
    ├── helpers.ts
    ├── ResourceNode.stories.ts
    ├── EnergyNode.stories.ts
    ├── Remains.stories.ts
    ├── Character.stories.ts
    └── GridOverview.stories.ts
.storybook/             ... Storybook設定
test/                   ... テスト
programs/
└── self-replicator.json
docs/specs/             ... ゲーム仕様書
docs/ui_spec/           ... GUI仕様書
docs/plan/              ... 実装計画
docs/tuning/            ... パラメータ調整記録
```

## コマンド

全コマンドは `v2/` ディレクトリで実行する。

- `npm test` — 全テスト実行
- `npm run sim` — シミュレーション実行（`npx tsx src/cli.ts`）
- `npm run sim -- --ticks 200 --program programs/self-replicator.json` — オプション付き実行
- `npm run ui` — GUI起動（Vite dev server）
- `npm run storybook` — Storybook起動（port 6006）

## GUI アーキテクチャ

- `ui/` は `src/` のゲームロジックをimportして利用する（`@/` エイリアス → `src/`）
- ゲームロジック（`src/`）はDOM非依存。GUI（`ui/`）がpixi.jsで描画する
- `ui/renderer.ts` はpixi.js Graphicsを返すセル単位の関数をexportし、Rendererクラスとstoriesの両方から利用される
- pixi.js v8: `Application.init()` は非同期。`Renderer` クラスも `async init()` で初期化する
- Vite設定は `vite.config.ts`（root: ui）、Vitest設定は `vitest.config.ts`（root: プロジェクトルート）で分離
- Storybook設定は `.storybook/main.ts` の `viteFinal` で `@` エイリアスを設定

## GUI開発ルール

- ゲームロジック（`src/`）を変更しない。GUI（`ui/`）はimportして利用するだけ
- GUI仕様は `docs/ui_spec/` を参照する
- `ui/renderer.ts` の描画関数はセル単位でexportし、Rendererクラスとstoriesの両方から利用する
- 新しい描画要素を追加した場合は対応するStoryも追加する
