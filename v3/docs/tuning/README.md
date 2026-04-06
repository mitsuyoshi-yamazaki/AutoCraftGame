# パラメータ調整ガイド

## 概要

v3のシミュレーション挙動は3種類のパラメータで制御される:

1. **定数（ゲーム法則）** — アクションコスト、基礎代謝、物理パラメータなど
2. **初期状態** — ノード配置、初期キャラクター数・エネルギーなど
3. **Program** — キャラクターの行動戦略

## 動作確認の方法

### 方法1: チューニングスクリプト（推奨）

`scripts/tuning-run.ts` は統計的なスナップショットを定期出力するスクリプト。パラメータ探索に最適。

```bash
cd v3
npx tsx scripts/tuning-run.ts --ticks 5000 --seed 42
```

#### オプション一覧

| オプション | デフォルト | 説明 |
|-----------|----------|------|
| `--ticks N` | 5000 | 実行tick数 |
| `--seed N` | 42 | 乱数シード（配置の再現に使用） |
| `--snapshot-interval N` | 100 | スナップショットの記録間隔 |
| `--initial-energy N` | 5000 | 初期キャラクターのエネルギー |
| `--counts N[,N,...]` | 3 | 種族ごとの初期個体数（カンマ区切り） |
| `--map-size WxH` | 20x20 | マップサイズ |
| `--ore-nodes N` | 15 | OreNode数 |
| `--crystal-nodes N` | 15 | CrystalNode数 |
| `--energy-nodes N` | 12 | EnergyNode数 |
| `--node-remaining N` | 80 | 各ResourceNodeの初期remaining |
| `--energy-prod-rate N` | 150 | EnergyNodeの生産量/tick |
| `--energy-max-stored N` | 3000 | EnergyNodeの最大蓄積量 |

#### 出力形式

スナップショットはTSV形式で出力される。各行に以下の情報を含む:

- `tick` — 現在のtick
- `chars` — 総キャラクター数
- 各種族の個体数
- `resNodes` — 残存ResourceNode数
- `energy` — 全EnergyNodeの蓄積エネルギー合計
- `remains` — 残骸数
- `births` / `deaths` — スナップショット間の誕生・死亡数

#### 実行例: 複数seedの比較

```bash
for seed in 42 123 999; do
  echo "=== seed $seed ==="
  npx tsx scripts/tuning-run.ts --ticks 5000 --seed $seed --snapshot-interval 500
  echo
done
```

#### 種族を追加する場合

`scripts/tuning-run.ts` 内の `programFiles` 配列に新しいプログラムのパスを追加し、`--counts` で各種族の初期数を指定する。

```bash
# 2種族 (Replicator×3, Scavenger×2) の例
npx tsx scripts/tuning-run.ts --counts 3,2
```

### 方法2: CLIによる詳細確認

`src/cli.ts` は1体のキャラクターで開始し、詳細なイベントログを確認できる。

```bash
npx tsx src/cli.ts --program programs/self-replicator.json --ticks 500 --seed 42 --output events
```

| オプション | デフォルト | 説明 |
|-----------|----------|------|
| `--ticks N` | 100 | 実行tick数 |
| `--program <path>` | (必須) | ProgramのJSONファイル |
| `--seed N` | 42 | 乱数シード |
| `--initial-energy N` | 5000 | 初期エネルギー |
| `--world-size WxH` | 20x20 | マップサイズ |
| `--energy-nodes N` | 12 | EnergyNode数 |
| `--node-remaining N` | 80 | 各ResourceNodeの初期remaining |
| `--output <mode>` | final | 出力モード: `tick` / `final` / `events` |

出力モード:
- `tick` — 毎tick JSON出力（キャラ数、ノード数、イベント）
- `final` — 最終状態のJSON出力（全キャラクターの詳細）
- `events` — 全イベント（誕生・死亡）のJSON出力

### 方法3: GUIでの目視確認

```bash
npm run ui
```

ブラウザでリアルタイムに動作を確認できる。個体の選択・情報表示・速度調整が可能。

## パラメータ変更箇所

### 1. 定数（ゲーム法則）

ファイル: `src/constants.ts`

| カテゴリ | 定数名 | 現在値 | 説明 |
|---------|--------|-------|------|
| **アクションコスト** | | | |
| | `ENERGY_COST_MOVE` | 10 | 移動 |
| | `ENERGY_COST_HARVEST` | 10 | 資源採掘 |
| | `ENERGY_COST_RECHARGE` | 5 | エネルギー回収 |
| | `ENERGY_COST_PROCESS` | 20 | 原料→加工素材 |
| | `ENERGY_COST_CRAFT` | 20 | 加工素材→コンポーネント |
| | `ENERGY_COST_ASSEMBLE` | 50 | コンポーネント→キャラクター |
| | `ENERGY_COST_WRITE` | 10 | Program複製 |
| | `ENERGY_COST_ACTIVATE` | 10 | キャラクター起動 |
| | `ENERGY_COST_SENSE` | 5 | 周囲探索 |
| | `ENERGY_COST_REPAIR` | 200 | 耐久度回復 |
| | `ENERGY_COST_DISASSEMBLE` | 15 | 残骸分解 |
| **失敗ペナルティ** | | | |
| | `ACTION_FAILURE_COST_RATIO` | 0.8 | 前提条件不足時、コストの80%を消費 |
| **基礎代謝** | | | |
| | `METABOLISM.Frame` | 1 | Frame 1個あたり/tick |
| | `METABOLISM.Actuator` | 2 | |
| | `METABOLISM.Sensor` | 2 | |
| | `METABOLISM.Processor` | 3 | |
| | `METABOLISM.Harvester` | 2 | |
| | `METABOLISM.Assembler` | 3 | |
| | `METABOLISM.Disassembler` | 2 | |
| | `METABOLISM.Charger` | 2 | |
| | `METABOLISM.MemoryCore` | 1 | |
| | `INVENTORY_METABOLISM_PER_ITEM` | 1 | インベントリ内アイテム1個あたり/tick |
| **エネルギー蓄積代謝** | | | |
| | `ENERGY_METABOLISM_THRESHOLD` | 3000 | この値以下では追加代謝なし |
| | `ENERGY_METABOLISM_SCALE` | 9,000,000 | floor(excess²/SCALE) で追加代謝を算出 |
| **エネルギー回収・移転** | | | |
| | `RECHARGE_AMOUNT` | 200 | RECHARGE 1回の回収量 |
| | `ASSEMBLE_ENERGY_TRANSFER` | 500 | ASSEMBLE時の子への移転量 |
| | `REPAIR_AMOUNT` | 100 | REPAIR 1回あたりの耐久度回復量 |
| **耐久度** | | | |
| | `FRAME_DURABILITY` | 300 | Frame 1個あたりの初期耐久度 |
| **物理** | | | |
| | `MOVE_FORCE` | 80 | MOVE時に加える力 |
| | `FRICTION_COEFFICIENT` | 0.8 | 粘性摩擦係数 |
| | `COLLISION_STIFFNESS` | 200 | 衝突時のばね定数 |
| | `VELOCITY_CLAMP_THRESHOLD` | 0.01 | この速度以下はゼロにクランプ |
| **オブジェクト半径** | | | |
| | `CHARACTER_RADIUS` | 0.4 | キャラクターの半径 |
| | `RESOURCE_NODE_RADIUS` | 0.4 | ResourceNodeの半径 |
| | `ENERGY_NODE_RADIUS` | 0.4 | EnergyNodeの半径 |
| | `REMAINS_RADIUS` | 0.3 | 残骸の半径 |
| **距離** | | | |
| | `INTERACT_RANGE` | 1.5 | アクション対象との最大距離 |
| | `SPAWN_DISTANCE` | 1.2 | ASSEMBLE時の子の配置距離 |

### 2. 初期状態

ファイル: `src/world.ts` の `DEFAULT_WORLD_CONFIG`

```typescript
export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 20,
  height: 20,
  oreNodeCount: 15,
  crystalNodeCount: 15,
  nodeRemaining: 80,
  energyNodeCount: 12,
  energyProductionRate: 150,
  energyMaxStored: 3000,
};
```

CLIやチューニングスクリプトのオプションでも上書き可能。

### 3. Program

ファイル: `programs/` ディレクトリのJSONファイル

- `programs/self-replicator.json` — バランス型自己複製（Replicator）
- `programs/scavenger.json` — 残骸漁り型（Scavenger, Disassemblerで残骸から資源回収）
- `programs/opportunist.json` — 日和見型（Opportunist, Harvester+Disassemblerの9コンポーネント構成）
- 新しいProgramを作成して使用可能

## 調整記録

パラメータ変更の結果は本ディレクトリ（`docs/tuning/`）に記録する。

| 記録 | 内容 |
|------|------|
| [001_baseline.md](001_baseline.md) | 初期パラメータでのベースライン分析（Replicator単種、20×20） |
| [002_multi_species_baseline.md](002_multi_species_baseline.md) | 3種族ベースライン（20×20、高密度） |
| [003_large_world_baseline.md](003_large_world_baseline.md) | 大規模ワールド(40×40) + SENSE_RANGE + wander |
| [004_state_machine.md](004_state_machine.md) | レジスタ状態機械の導入 |
| [005_variant_competition.md](005_variant_competition.md) | 戦略バリアント間の競争（40×40） |
| [006_large_world_variant_competition.md](006_large_world_variant_competition.md) | 大規模ワールド(60×60)バリアント競争 |
| [007_10k_tick_stability.md](007_10k_tick_stability.md) | 10,000 tick安定共存の探索（ノード増・energyMaxStored低下） |
| [008_resource_regeneration.md](008_resource_regeneration.md) | リソースノード再生システム(v3.13.0)の影響分析 |
| [009_regeneration_tuning.md](009_regeneration_tuning.md) | リソースノード再生パラメータの最適化（最良設定: abs=600, thr=50, nodeRem=225） |
| [010_new_species.md](010_new_species.md) | 新種族（Settler/Recycler）の投入と生態系への影響 |
| [011_four_species_coexistence.md](011_four_species_coexistence.md) | 4種族以上の長期共存パラメータ��索（最良設定: eProd=135, eN=65） |
