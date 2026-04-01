# アプリケーション仕様

ゲームアプリケーション全体の構造と実行モデルを定義する。

---

## 技術スタック

| 項目 | 選定 | 理由 |
|------|------|------|
| 言語 | TypeScript | 型安全、JSONとの親和性、zod/spread等のコーディングスタイルと合致 |
| ランタイム | Node.js | ClaudeCodeからの直接実行が容易 |
| テスト | Vitest | 高速、検証事項をテストケースとして表現 |
| パッケージ管理 | npm | 標準的 |
| GUI | なし（プロトタイプ） | CUI出力でClaudeCodeが検証可能であれば十分 |

## プロジェクト構造

```
prototype/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── types.ts          ... 全体の型定義
│   ├── world.ts          ... マップ、資源ノード、ゲーム世界
│   ├── recipes.ts        ... 素材階層、レシピ定義
│   ├── character.ts      ... キャラクター、コンポーネント
│   ├── program.ts        ... Program評価（Condition/Action）
│   ├── replication.ts    ... 自己複製関連のAction実装
│   ├── simulation.ts     ... ゲームループ、ティック実行
│   └── cli.ts            ... CUIエントリポイント（シミュレーション実行・結果出力）
├── test/
│   ├── recipes.test.ts
│   ├── character.test.ts
│   ├── program.test.ts
│   ├── replication.test.ts  ... 検証事項3件のテスト
│   └── simulation.test.ts
└── programs/
    └── self-replicator.json  ... 自己複製を行うサンプルProgram
```

### 仕様ファイルとモジュールの対応

| 仕様ファイル | 実装モジュール |
|-------------|--------------|
| game_spec.md | recipes.ts, world.ts |
| character_spec.md | character.ts, types.ts |
| character_program_spec.md | program.ts |
| self_replication_spec.md | replication.ts |
| application_spec.md | simulation.ts, cli.ts |

## CUI出力仕様

シミュレーション実行時、以下をJSON形式で標準出力する:

```json
{
  "tick": 42,
  "characters": [
    {
      "id": "char-001",
      "position": { "x": 3, "y": 5 },
      "durability": 85,
      "inventory": { "Ore": 4, "Metal": 2 },
      "components": ["Frame", "Actuator", "Sensor", "Processor", "Harvester", "Assembler", "MemoryCore"]
    }
  ],
  "events": [
    { "type": "character_spawned", "parentId": "char-001", "childId": "char-002" },
    { "type": "character_died", "id": "char-003" }
  ]
}
```

CLIオプション:
- `--ticks N` — N ティック実行（デフォルト: 100）
- `--program <path>` — 初期ProgramのJSONファイルパス
- `--map-size WxH` — マップサイズ（デフォルト: 20x20）
- `--output <tick|final|events>` — 出力モード（毎ティック / 最終状態のみ / イベントのみ）

## 生成方法

プロトタイプの再生成手順:

1. specs_01/ の仕様ファイルを更新する
2. 仕様変更に対応するモジュールを特定する（上記対応表参照）
3. 該当モジュールと対応するテストを更新する
4. `npm test` で検証事項の通過を確認する
5. `npx tsx src/cli.ts --program programs/self-replicator.json` でシミュレーション実行

---

## 時間モデル — ティック制

- 離散ティック制。全キャラクターが1ティックに1アクションを実行する
- アクション = Processorからコンポーネントへの命令1回
- ティックの順序: 全キャラクターが同時に行動を決定し、順次実行する
- 行動決定フェーズでは全キャラクターが現在のWorld状態を参照してActionを決定する
- 実行フェーズではキャラクターID順に逐次実行される（先に実行されたActionの結果は後続に反映される）
- 衝突解決: 同一資源ノードへの同時HARVESTは両者成功（プロトタイプでは競合を扱わない）

## マップ

- 2Dグリッド、タイルベース
- タイル上に資源ノード（Ore鉱床、Crystal鉱床）が配置される
- 資源ノードは毎ティック全再生する（後述）

### 資源ノードの初期配置

マップを左右に二分し、3タイル間隔のグリッド状に配置する:

- **左半分**（x: 0, 3, 6, ...）: Ore鉱床
- **右半分**（x: floor(width/2), floor(width/2)+3, ...）: Crystal鉱床
- **y軸**: 0, 3, 6, ... の間隔

20x20マップの場合、Ore鉱床28個・Crystal鉱床28個が配置される。

### 資源ノードの再生

HARVESTにより資源ノードは枯渇（depleted）状態になる。
ゲームループのステップ5で全ノードが非枯渇状態にリセットされる（毎ティック全再生）。
これにより、同一ノードを毎ティック採取可能となる。

## ゲームループ

```
1. 全キャラクターの行動決定（各ProcessorがProgramを評価 — 現在のWorld状態を参照）
2. 全アクションの逐次実行（キャラクターID順）
3. 耐久値の自然劣化（全キャラクター -1）
4. 死亡判定（durability ≤ 0 のキャラクターを除去）
5. 資源ノードの全再生処理（全ノードを非枯渇状態にリセット）
6. ティックカウンタ++
```

全キャラクターが死亡した場合、残りティックを待たずシミュレーションを終了する。

## 初期状態

- マップ上に資源ノードが配置された状態
- プレイヤーが定義した初期キャラクター（Program付き）がマップ中央に配置される
- 初期キャラクターのProgramはJSONファイルとしてゲーム起動時に読み込む
- キャラクターIDは `char-001` から連番で付与される
