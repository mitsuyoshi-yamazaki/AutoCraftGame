# auto-craft-game v6 — 制御プリミティブ層の検証

## 概要

v5 をベースに、Processor/VM を使わない**制御プリミティブ層**を追加したバージョン。
「制御プリミティブだけで自己複製が可能か」を検証するプロトタイプ。

## v5 からの変更点

- **制御プリミティブ層の追加** (`src/primitives.ts`, `src/seeds.ts`)
  - キャラクターに `primitiveRules` と `assemblyTemplates` を追加
  - Processor を持たないキャラクターはプリミティブルールで制御される
  - VM と並存（Processor 搭載キャラクターは従来通り VM 制御）
- **ASSEMBLE 拡張**: テンプレートによるプリミティブの子への転写 + 変異
- **新条件型**: `can_assemble`, `can_craft`, `can_craft_missing`, `can_process`
- **v5 プログラム削除**: programs/, scripts/ の v5 用ファイルを削除
- **VM 関連コードは保持**: vm/, compiler/ は全て残存

## ディレクトリ構造

```
v6/
├── src/
│   ├── primitives.ts    ... プリミティブ評価器
│   ├── seeds.ts         ... 初期キャラクター定義（プリミティブベース）
│   ├── types.ts         ... PrimitiveRule, AssemblyTemplate 型追加
│   ├── character.ts     ... createPrimitiveCharacter 追加
│   ├── engine.ts        ... spawnPrimitiveCharacters 追加
│   ├── simulation.ts    ... プリミティブ評価パス追加（ステップ2）
│   ├── actions.ts       ... ASSEMBLE テンプレート転写 + 変異
│   └── vm/              ... VM 関連（v5 から変更なし）
├── scripts/
│   ├── primitive-test.ts   ... 集団テストスクリプト
│   └── primitive-debug.ts  ... 単体デバッグスクリプト
├── docs/
│   ├── specs/
│   │   └── primitives_spec.md  ... プリミティブ仕様
│   └── tuning/
│       └── 00_primitive_replication_attempt.md  ... 実験記録
└── test/                ... v5 テスト（全 411 通過）
```

## 技術スタック

- TypeScript + Node.js
- Vitest（テスト）

## 開発方針

- 共通ルール（/CLAUDE.md）に従う
- 仕様は `docs/specs/` に記載
- 実験結果は `docs/tuning/` に記録
- 実現できなかった場合も結果と分析を記録する
