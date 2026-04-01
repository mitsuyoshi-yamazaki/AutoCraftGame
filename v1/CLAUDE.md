# auto-craft-game v1 — 自己複製の検証

## 概要

自己複製可能な自律キャラクターが構築できるかを検証するプロトタイプ。
ゲーム仕様に不備がなく、実現性があり、要件を満たしているかを確認する目的で作成する。

## 仕様

ゲーム仕様は `docs/specs/` に格納されている。実装の根拠は常にここを参照すること。

| ファイル | 内容 |
|---------|------|
| `docs/specs/requirements.md` | 要件・検証事項 |
| `docs/specs/application_spec.md` | アプリケーション全体（時間モデル、マップ、ゲームループ、技術スタック、プロジェクト構造） |
| `docs/specs/game_spec.md` | クラフトシステム（素材階層、レシピ、加工ルール） |
| `docs/specs/character_spec.md` | キャラクターのコンポーネントシステム、損傷・死亡モデル |
| `docs/specs/character_program_spec.md` | ルールベースProgram仕様（Condition、Action、JSON形式） |
| `docs/specs/self_replication_spec.md` | 自己複製メカニズム（クワイン構造、複製手順） |

## 技術スタック

- TypeScript + Node.js
- Vitest（テスト）
- pixi.js v8（2D描画エンジン — Canvas/WebGL）
- Vite（GUI・Storybookのバンドル）
- Storybook（@storybook/html-vite — UIコンポーネントカタログ）

## プロジェクト構造

```
src/                          ... ゲームロジック（純粋関数、DOM非依存）
├── types.ts                  ... 全体の型定義
├── world.ts                  ... マップ、資源ノード、ゲーム世界
├── recipes.ts                ... 素材階層、レシピ定義
├── character.ts              ... キャラクター、コンポーネント
├── program.ts                ... Program評価（Condition/Action）
├── replication.ts            ... 自己複製関連のAction実装
├── simulation.ts             ... ゲームループ、ティック実行
└── cli.ts                    ... CUIエントリポイント
ui/                           ... ブラウザGUI（Canvas描画）
├── index.html                ... エントリHTML
├── main.ts                   ... UIコントローラー（タイマー制御、DOM更新）
├── renderer.ts               ... Canvas描画（セル単位の関数 + Rendererクラス）
├── style.css                 ... スタイル
└── stories/                  ... Storybookストーリー
    ├── helpers.ts             ... Canvas生成ヘルパー
    ├── ResourceNode.stories.ts
    ├── Character.stories.ts
    ├── GridOverview.stories.ts
    └── proposals/             ... デザイン提案（履歴として保持）
test/
├── recipes.test.ts
├── character.test.ts
├── program.test.ts
├── replication.test.ts
└── simulation.test.ts
programs/
└── self-replicator.json
.storybook/                   ... Storybook設定
docs/specs/                   ... ゲーム仕様書
docs/ui_spec/                 ... GUI仕様書（要件定義・アーキテクチャ）
```

## コマンド

全コマンドは `v1/` ディレクトリで実行する。

- `npm test` — 全テスト実行
- `npm run sim` — シミュレーション実行（`npx tsx src/cli.ts`）
- `npm run sim -- --ticks 200 --program programs/self-replicator.json` — オプション付き実行
- `npm run ui` — GUI起動（Vite dev server）
- `npm run storybook` — Storybook起動（port 6006）
- `npm run build-storybook` — Storybook静的ビルド

## GUI アーキテクチャ

- `ui/` は `src/` のゲームロジックをimportして利用する（`@/` エイリアス → `src/`）
- ゲームロジック（`src/`）はDOM非依存。GUI（`ui/`）がCanvasに描画する
- `ui/renderer.ts` はpixi.js Graphicsを返すセル単位の関数（`createEmptyCellGraphics`, `createResourceNodeGraphics`, `createCharacterGraphics`）をexportし、Rendererクラスとstoriesの両方から利用される
- pixi.js v8: `Application.init()` は非同期。`Renderer` クラスも `async init()` で初期化する
- Vite設定は `vite.config.ts`（root: ui）、Vitest設定は `vitest.config.ts`（root: プロジェクトルート）で分離
- Storybook設定は `.storybook/main.ts` の `viteFinal` で `@` エイリアスを設定

## GUI開発ルール

- ゲームロジック（`src/`）を変更しない。GUI（`ui/`）はimportして利用するだけ
- GUI仕様は `docs/ui_spec/` を参照する
- `ui/renderer.ts` の描画関数はセル単位でexportし、Rendererクラスとstoriesの両方から利用する
- 新しい描画要素を追加した場合は対応するStoryも追加する
- デザイン変更の提案時は `ui/stories/proposals/` に複数案をStoryとして実装し、Storybookで視覚比較する。採用後も提案Storyは削除せず履歴として残す
- Vite設定（`vite.config.ts`, root: ui）とVitest設定（`vitest.config.ts`）は分離されている。混同しないこと

## 検証の完了基準

以下の3つがテストで通過すること:

1. Programの組立指示でBody構成を自由に決定できる
2. MemoryCoreのデータコピーでProgramが正しく伝達される
3. Program内の組立指示の変更で進化（異なる構成の娘）が実現できる
