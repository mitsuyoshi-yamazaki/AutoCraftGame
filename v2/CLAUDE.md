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
test/                   ... テスト
programs/
└── self-replicator.json
docs/specs/             ... 仕様書
docs/plan/              ... 実装計画
```

## コマンド

全コマンドは `v2/` ディレクトリで実行する。

- `npm test` — 全テスト実行
- `npm run sim` — シミュレーション実行（`npx tsx src/cli.ts`）
- `npm run sim -- --ticks 200 --program programs/self-replicator.json` — オプション付き実行
