# 調整記録 001: 初期ベースライン

## 日付

2026-04-01

## 目的

定数の初期値で自己複製が成立するか検証する。

## 定数設定

### アクションコスト

| アクション | コスト |
|-----------|-------|
| MOVE | 10 |
| HARVEST | 10 |
| RECHARGE | 5 |
| PROCESS | 20 |
| CRAFT | 20 |
| ASSEMBLE | 50 |
| WRITE | 10 |
| ACTIVATE | 10 |
| SENSE | 5 |
| REPAIR | 20 |
| DISASSEMBLE | 15 |

### 基礎代謝（コンポーネント別）

| コンポーネント | コスト/tick |
|---------------|-----------|
| Frame | 1 |
| Actuator | 2 |
| Sensor | 2 |
| Processor | 3 |
| Harvester | 2 |
| Assembler | 3 |
| Disassembler | 2 |
| Charger | 2 |
| MemoryCore | 1 |
| インベントリ1個あたり | 1 |

最小構成（8コンポーネント）の基礎代謝: 1+2+2+3+2+3+2+1 = **16/tick**

### その他

| 定数 | 値 |
|------|---|
| ACTION_FAILURE_COST_RATIO | 0.8 |
| RECHARGE_AMOUNT | 200 |
| ASSEMBLE_ENERGY_TRANSFER | 500 |
| FRAME_DURABILITY | 200 |

## テスト環境（統合テスト）

CLIのランダム配置ではなく、統合テスト内で手動配置した決定論的な初期状態を使用。

### 初期状態

- マップ: 20×20
- キャラクター: (5,5)、MIN_COMPONENTS（8種）、初期エネルギー5000
- ResourceNode:
  - OreNode (4,5) remaining=50
  - CrystalNode (6,5) remaining=50
- EnergyNode:
  - (5,4) productionRate=300, stored=2000, maxStored=5000

キャラクターの上下左右にOre・Crystal・Energyが隣接しているため、MOVEなしでHARVEST/RECHARGEが可能。

### Program

RECHARGE優先（energy < 2000 かつ隣接EnergyNode）→ WRITE → ASSEMBLE → CRAFT（各コンポーネントを「まだ持っていなければ」craft）→ PROCESS → HARVEST → NOOP

## 結果

**自己複製成功**（500 tick以内に `character_spawned` イベント発生）。

統合テスト `integration.test.ts > character can complete full self-replication` 通過。

### 挙動の概要

1. キャラクターは隣接ノードからHARVEST/RECHARGEを繰り返す
2. Ore/Crystalを採掘 → PROCESS → CRAFTで各コンポーネントを製造
3. 全8コンポーネントが揃ったらASSEMBLE → WRITE
4. 子キャラクターが生成され、親のProgramがコピーされる
5. 子はASSEMBLE_ENERGY_TRANSFER=500のエネルギーを持って開始する

### 観察された課題

1. **CLIのランダム配置では自己複製に至らない**: ノードがキャラクターから遠い場合、MOVEのエネルギーコスト+基礎代謝でEnergyNodeに到達する前にエネルギーが枯渇する。初期計画の100単位のアクションコスト・基礎代謝ではなおさら厳しかった（実装計画から1桁下げて現在の値に調整した経緯あり）
2. **サンプルProgramの設計が不十分**: `programs/self-replicator.json` はCLIのランダム配置を前提としたMOVE戦略を持つが、ノード配置によっては機能しない。Program自体の調整も必要

## 結論

定数の現在値で、理想的な初期配置（全ノードが隣接）において自己複製は成立する。

次のステップとして:
- CLIのランダム配置で機能するProgramの設計
- ランダム配置でも自己複製が成立するパラメータバランスの調整
- 複数回の自己複製・世代交代が持続するか（淘汰圧が効いているか）の検証
