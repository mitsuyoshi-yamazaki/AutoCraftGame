# パラメータ調整ガイド

## 概要

v2のシミュレーション挙動は2種類のパラメータで制御される:

1. **定数（ゲーム法則）** — アクションコスト、基礎代謝、エネルギー回収量など
2. **初期状態** — ノード配置、初期キャラクターのエネルギーなど

## 1. 定数の変更

### ファイル: `src/constants.ts`

全ての定数はこのファイルで定義されている。値を変更して `npm test` で検証する。

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
| | `ENERGY_COST_REPAIR` | 100 | 耐久度回復（エネルギーのみ、素材消費なし） |
| | `ENERGY_COST_DISASSEMBLE` | 15 | 残骸分解 |
| **失敗ペナルティ** | | | |
| | `ACTION_FAILURE_COST_RATIO` | 0.8 | 前提条件不足の失敗時、コストの80%を消費 |
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
| | `REPAIR_AMOUNT` | 200 | REPAIR 1回あたりの耐久度回復量 |
| **耐久度** | | | |
| | `FRAME_DURABILITY` | 200 | Frame 1個あたりの初期耐久度 |

### 注意点

- テスト（特に `actions.test.ts`, `energy.test.ts`）は定数の具体的な値に依存するアサーションを含む。定数を変更したら `npm test` で全テスト通過を確認すること
- アクションコストと基礎代謝のバランスが重要。基礎代謝がアクションコストより大きいと、行動するほど有利ではなく「存在するだけで消耗する」状態になる

## 2. 初期状態の変更

### 方法A: CLIパラメータ（ランダム配置）

```bash
npm run sim -- --program programs/self-replicator.json \
  --ticks 500 \
  --map-size 20x20 \
  --initial-energy 5000 \
  --energy-nodes 8 \
  --node-remaining 50 \
  --seed 42 \
  --output events
```

| パラメータ | デフォルト | 説明 |
|-----------|----------|------|
| `--ticks N` | 100 | 実行tick数 |
| `--program <path>` | (必須) | ProgramのJSONファイル |
| `--map-size WxH` | 20x20 | マップサイズ |
| `--initial-energy N` | 5000 | 初期キャラクターのエネルギー |
| `--energy-nodes N` | 8 | EnergyNodeの数 |
| `--node-remaining N` | 50 | 各ResourceNodeの初期remaining |
| `--seed N` | 42 | 乱数シード（同じシードで同じ配置が再現） |
| `--output <mode>` | final | 出力モード: tick / final / events |

CLIではノードがランダムに配置されるため、キャラクターとノードの距離が遠くなりうる。`--seed` を変えることで異なる配置を試せる。

### 方法B: テストコード内で直接指定（決定論的配置）

`test/integration.test.ts` のようにWorldオブジェクトを直接構築し、ノード位置を手動で指定する。

```typescript
const world: World = {
  width: 20,
  height: 20,
  resourceNodes: [
    { position: { x: 4, y: 5 }, type: 'OreNode', remaining: 50 },
    { position: { x: 6, y: 5 }, type: 'CrystalNode', remaining: 50 },
  ],
  energyNodes: [
    { position: { x: 5, y: 4 }, productionRate: 300, stored: 2000, maxStored: 5000 },
  ],
  remains: [],
  characters: [character],
  nextCharacterId: 2,
  tick: 0,
};
```

この方法は検証に最適。ノード配置を完全に制御でき、再現性がある。

### 方法C: ワールド生成のデフォルト値を変更

`src/world.ts` の `DEFAULT_WORLD_CONFIG` を変更する。

```typescript
export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 20,
  height: 20,
  oreNodeCount: 12,
  crystalNodeCount: 12,
  nodeRemaining: 50,
  energyNodeCount: 8,
  energyProductionRate: 100,
  energyMaxStored: 2000,
};
```

## 3. Programの変更

キャラクターの行動戦略は `programs/` ディレクトリのJSONファイルで定義する。

- `programs/self-replicator.json` — 自己複製を行うサンプルProgram
- 新しいProgramを作成して `--program` で指定可能

## 調整記録

パラメータ変更の結果は本ディレクトリ（`docs/tuning/`）に記録する。

| 記録 | 内容 |
|------|------|
| [001_initial_baseline.md](001_initial_baseline.md) | 初期値での自己複製検証（理想的配置で成功） |
