# v2 実装計画

## 概要

v2はv1のゲームロジックに淘汰圧を導入するバージョンである。
まずCLIのみのゲームロジックを実装し、UIは後続作業とする。

v1のコードを流用せず、v2の仕様に基づいてゼロから実装する（v1の設計パターンは参考にする）。

## 技術スタック

v1と同一:
- TypeScript + Node.js（ESM）
- Vitest（テスト）
- tsx（CLI実行）
- npm（パッケージ管理）

## プロジェクト構造

```
v2/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── CLAUDE.md
├── docs/
│   ├── specs/              ... 仕様書（策定済み）
│   └── plan/               ... 本計画
├── src/
│   ├── types.ts            ... 型定義
│   ├── constants.ts        ... 全定数定義（エネルギーコスト、代謝等）
│   ├── recipes.ts          ... 素材階層、レシピ定義（Disassembler, Charger追加）
│   ├── world.ts            ... マップ、ResourceNode, EnergyNode, Remains, タイル占有
│   ├── character.ts        ... キャラクター、コンポーネント、エネルギー
│   ├── program.ts          ... Program評価（Condition/Action）、エネルギー消費
│   ├── actions.ts          ... 各Actionの実行ロジック（HARVEST, RECHARGE, DISASSEMBLE等）
│   ├── simulation.ts       ... ゲームループ（8ステップ）
│   └── cli.ts              ... CLIエントリポイント
├── test/
│   ├── constants.test.ts
│   ├── recipes.test.ts
│   ├── world.test.ts
│   ├── character.test.ts
│   ├── program.test.ts
│   ├── actions.test.ts
│   ├── simulation.test.ts
│   └── energy.test.ts      ... エネルギーモデル統合テスト
└── programs/
    └── self-replicator.json ... v2用自己複製Program
```

### v1からの構造変更点

- `constants.ts` を新設: エネルギーコスト、代謝コスト等の定数が多いため独立ファイルに分離
- `actions.ts` を新設: v1では `program.ts` 内にAction実行ロジックがあったが、v2ではAction数と複雑さが増すため分離
- `replication.ts` は廃止: v2のスコープでは自己複製の検証ヘルパーは不要。ASSEMBLE/WRITE/ACTIVATEは `actions.ts` に統合
- `energy.test.ts` を新設: エネルギーモデル（消費・回収・代謝・失敗ペナルティ）の統合テスト

## 実装順序

依存関係の少ないモジュールから順に実装する。各モジュール実装後に対応テストを作成・通過を確認する。

### Phase 1: プロジェクト基盤

#### Step 1-1: プロジェクト初期化
- `package.json`, `tsconfig.json`, `vitest.config.ts` を作成
- `npm install` で依存関係をインストール
- `v2/CLAUDE.md` を作成

#### Step 1-2: 型定義 — `types.ts`
v2で追加・変更される型を定義する。

新規・変更の型:
- `ResourceNode`: `depleted: boolean` → `remaining: number`
- `EnergyNode`: 新規（position, productionRate, stored, maxStored）
- `Remains`: 新規（position, components, inventory）
- `Character`: `energy: number` フィールド追加
- `ComponentType`: `'Disassembler'`, `'Charger'` 追加
- `Action`: `RECHARGE`, `DISASSEMBLE` 追加。`HARVEST` はv1形式を維持
- `Condition`: `energy_below` 追加
- `NearbyTargetType`: `'Remains'`, `'EnergyNode'` 追加
- `World`: `energyNodes`, `remains` フィールド追加

テスト: 型定義のみなのでテスト不要。

#### Step 1-3: 定数定義 — `constants.ts`
game_spec.md セクション10の全定数を定義する。

- アクション別エネルギーコスト（11種、全て仮値）
- 失敗ペナルティ率（0.8）
- コンポーネント別代謝コスト（9種、全て仮値）
- インベントリ代謝コスト（仮値）
- エネルギー回収・移転量（仮値）
- FRAME_DURABILITY（200）

仮値は100〜1000のオーダーで設定し、実装完了後に調整する。

テスト: `constants.test.ts` — 全定数が正の整数であることの検証。

### Phase 2: データ層

#### Step 2-1: レシピ — `recipes.ts`
v1のレシピに以下を追加:
- `Disassembler: Metal x2 + Circuit x1`
- `Charger: Metal x1 + Circuit x2`
- コンポーネントの原料換算関数（保存則の検証用）
- MIN_COMPONENTSにChargerを追加

テスト: `recipes.test.ts`
- 全レシピの入出力確認（v1のテストを踏襲 + Disassembler, Charger）
- 原料換算関数のテスト

#### Step 2-2: ワールド — `world.ts`
v1のワールド管理に以下を追加・変更:
- `ResourceNode`: remaining管理、枯渇判定・除去
- `EnergyNode`: 生産処理（stored += productionRate, 上限クランプ）
- `Remains`: 生成、アイテム取得、空の残骸除去
- タイル占有チェック関数（指定位置が占有されているか）
- `createWorld`: EnergyNode配置を追加、占有衝突回避
- `regenerateResources` を廃止

テスト: `world.test.ts`
- ResourceNodeのremaining減少・枯渇除去
- EnergyNodeの生産・上限クランプ
- Remainsの生成・アイテム取得・除去
- タイル占有チェック（Character, Remains, ResourceNode, EnergyNodeが占有）
- ワールド生成時の占有衝突なし

#### Step 2-3: キャラクター — `character.ts`
v1のキャラクター管理に以下を追加・変更:
- `energy` フィールドの追加
- 基礎代謝算出関数（コンポーネント構成 + インベントリ量から算出、ceil丸め）
- `createCharacter`: 初期エネルギー引数追加
- `createInactiveCharacter`: エネルギー引数追加（親からの移転分）
- ComponentTypeに Disassembler, Charger を含める

テスト: `character.test.ts`
- エネルギー付きキャラクター生成
- 基礎代謝算出（コンポーネント数・種類による変動、インベントリ量による変動）
- 基礎代謝のceil丸め確認

### Phase 3: アクション実行

#### Step 3-1: Program評価 — `program.ts`
v1のProgram評価に以下を追加・変更:
- `energy_below` Conditionの評価
- `nearby` に `Remains`, `EnergyNode` タイプを追加
- findTargetsで Remains, EnergyNode を探索

テスト: `program.test.ts`
- `energy_below` Conditionの評価
- `nearby` で Remains, EnergyNode を検知

#### Step 3-2: アクション実行 — `actions.ts`
全Actionの実行ロジックを実装する。各Actionに共通のエネルギーチェック・消費処理を含む。

**共通処理**:
- エネルギーチェック: energy < cost → 実行せず失敗（エネルギー消費なし）
- 成功時: コスト全額消費
- 前提条件不足の失敗時: ceil(コスト × ACTION_FAILURE_COST_RATIO) 消費

**各Action**:
- `MOVE`: 隣接タイルへ移動。移動先が占有されていたら失敗（ペナルティ）
- `HARVEST`: 隣接タイルのResourceNodeから資源1個取得。対象なしで失敗（ペナルティ）
- `RECHARGE`: 隣接タイルのEnergyNodeからエネルギー回収。対象なしで失敗（ペナルティ）
- `PROCESS`: v1と同様 + エネルギー消費
- `CRAFT`: v1と同様 + エネルギー消費
- `ASSEMBLE`: コスト = ENERGY_COST_ASSEMBLE + ASSEMBLE_ENERGY_TRANSFER。子にエネルギー移転。隣接空きタイル必要
- `WRITE`: v1と同様 + エネルギー消費
- `ACTIVATE`: v1と同様 + エネルギー消費
- `SENSE`: v1と同様 + エネルギー消費
- `REPAIR`: v1と同様 + エネルギー消費
- `DISASSEMBLE`: 隣接タイルの残骸から1アイテム取得。Componentは構成素材に分解
- `NOOP`: コスト0、常に成功

テスト: `actions.test.ts`
- 各Actionの成功ケース（エネルギー消費の確認を含む）
- エネルギー不足時の失敗（エネルギー消費なし）
- 前提条件不足の失敗（ペナルティ消費）
- HARVEST: 隣接タイルのResourceNodeから取得、remaining減少
- RECHARGE: 隣接タイルのEnergyNodeからエネルギー回収、stored減少
- ASSEMBLE: エネルギー移転の確認、占有タイルスキップ
- DISASSEMBLE: inventoryアイテムはそのまま、Componentは構成素材に分解
- MOVE: 占有タイルへの移動失敗

### Phase 4: ゲームループ

#### Step 4-1: シミュレーション — `simulation.ts`
v2の8ステップゲームループを実装する。

```
1. EnergyNodeのエネルギー生産
2. 全キャラクターがアクションを決定
3. アクションの順次実行（エネルギーチェック・消費）
4. エネルギー基礎代謝の適用
5. 耐久度自然減衰（-1/tick）
6. 死亡判定（→ 残骸生成 + キャラクター除去）
7. 枯渇ResourceNode除去
8. tick++
```

テスト: `simulation.test.ts`
- 1tickの全ステップが正しい順序で実行される
- EnergyNodeの生産が毎tick行われる
- 基礎代謝がtickごとに適用される
- 死亡時に残骸が生成される（エネルギーは散逸）
- 枯渇ResourceNodeが除去される
- 全キャラクター死亡でシミュレーション終了

### Phase 5: 統合・CLI

#### Step 5-1: エネルギーモデル統合テスト — `energy.test.ts`
複数tickにわたるエネルギーの流れを検証する統合テスト。

- キャラクターがRECHARGEでエネルギーを回収し、行動を継続できる
- エネルギーが枯渇すると行動不能になり、耐久度減衰で死亡する
- 基礎代謝がコンポーネント数に比例する（多コンポーネント個体は高コスト）
- 失敗ペナルティがエネルギーを消費する
- ASSEMBLEで子にエネルギーが移転される

#### Step 5-2: CLIエントリポイント — `cli.ts`
v1のCLIを基にv2用に拡張する。

CLIオプション（v1互換 + v2拡張）:
- `--ticks N` — 実行ティック数（デフォルト: 100）
- `--program <path>` — 初期ProgramのJSONファイルパス
- `--map-size WxH` — マップサイズ（デフォルト: 20x20）
- `--output <tick|final|events>` — 出力モード
- `--initial-energy N` — 初期キャラクターのエネルギー
- `--energy-nodes N` — EnergyNodeの数
- `--node-remaining N` — ResourceNodeの初期remaining

出力JSON（v1拡張）:
```json
{
  "tick": 42,
  "characters": [
    {
      "id": "char-001",
      "position": { "x": 3, "y": 5 },
      "durability": 85,
      "energy": 1500,
      "inventory": { "Ore": 4, "Metal": 2 },
      "components": ["Frame", "Actuator", "Sensor", "Processor", "Harvester", "Assembler", "Charger", "MemoryCore"]
    }
  ],
  "energyNodes": [...],
  "resourceNodes": [...],
  "remains": [...],
  "events": [...]
}
```

#### Step 5-3: サンプルProgram — `programs/self-replicator.json`
v2の仕様に対応した自己複製Programを作成する。
v1のProgramをベースに以下を追加:
- `energy_below` による RECHARGE 優先ルール
- EnergyNodeへの移動ルール
- `RECHARGE` アクション
- Chargerの製造を含む ASSEMBLE 指示

#### Step 5-4: 動作確認
- `npm test` で全テスト通過を確認
- `npm run sim -- --ticks 200 --program programs/self-replicator.json` でシミュレーション実行
- 出力から以下を確認:
  - キャラクターがエネルギーを回収しながら活動している
  - 資源が減少している（ResourceNodeのremaining）
  - エネルギーが消費・回復のサイクルを形成している
  - 自己複製が成功する（十分なエネルギーと資源がある場合）
  - 死亡時に残骸が生成される

## 定数の初期値設定方針

全定数は実装完了後に調整するが、初期値として以下の方針で設定する。

### 基準: 最小自己複製サイクル

最小構成キャラクター（8コンポーネント: Frame, Actuator, Sensor, Processor, Harvester, Assembler, Charger, MemoryCore）が自己複製を1回完了するのに必要なアクション数を概算する。

必要アクション数（概算）:
- MOVE + HARVEST（資源採掘）: Ore 16 + Crystal 18 = 34回のHARVEST + 移動
- MOVE + RECHARGE（エネルギー回収）: 複数回
- PROCESS: Metal 8 + Circuit 10 = 18回（Ore 16→Metal 8, Crystal 20→Circuit 10）
  - 注: Charger追加でCrystal 20, Circuit 10が必要
- CRAFT: 8回（8コンポーネント）
- ASSEMBLE: 1回
- WRITE: 1回
- ACTIVATE: 1回
- 合計: 約100〜150 tick

### 初期値（100単位のオーダー）

```
ENERGY_COST_MOVE        = 100
ENERGY_COST_HARVEST     = 100
ENERGY_COST_RECHARGE    = 50   (低め: エネルギー回収自体は安くする)
ENERGY_COST_PROCESS     = 200
ENERGY_COST_CRAFT       = 200
ENERGY_COST_ASSEMBLE    = 500  (高コスト)
ENERGY_COST_WRITE       = 100
ENERGY_COST_ACTIVATE    = 100
ENERGY_COST_SENSE       = 50
ENERGY_COST_REPAIR      = 200
ENERGY_COST_DISASSEMBLE = 150

ACTION_FAILURE_COST_RATIO = 0.8

METABOLISM_FRAME         = 10
METABOLISM_ACTUATOR      = 20
METABOLISM_SENSOR        = 20
METABOLISM_PROCESSOR     = 30
METABOLISM_HARVESTER     = 20
METABOLISM_ASSEMBLER     = 30
METABOLISM_DISASSEMBLER  = 20
METABOLISM_CHARGER       = 20
METABOLISM_MEMORYCORE    = 10
INVENTORY_METABOLISM_PER_ITEM = 5

RECHARGE_AMOUNT          = 500
ASSEMBLE_ENERGY_TRANSFER = 2000

FRAME_DURABILITY         = 200
```

最小構成（8コンポーネント）の基礎代謝:
= 10 + 20 + 20 + 30 + 20 + 30 + 20 + 10 = 160/tick

1回の自己複製サイクル（〜150 tick）で必要な基礎代謝: 150 × 160 = 24,000
アクションコスト概算: 〜15,000
合計: 〜39,000

→ RECHARGE_AMOUNT = 500 × 約80回のRECHARGE = 40,000 が必要
→ EnergyNode生産レートとノード数で供給量を調整

初期状態の定数:
```
NODE_DEFAULT_REMAINING       = 50
ENERGY_NODE_COUNT            = 8
ENERGY_NODE_PRODUCTION_RATE  = 200
ENERGY_NODE_MAX_STORED       = 2000
INITIAL_CHARACTER_ENERGY     = 5000
```
