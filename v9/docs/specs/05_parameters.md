# パラメータ 仕様

すべて暫定値（シミュレータ実装後の実測で調整する）。実装では `src/params.ts` に定義し、
ここに列挙のない定数をコードへハードコードしてはならない。

## ワールド

| 定数 | 値 | 説明 |
|------|:---:|------|
| WORLD_WIDTH / WORLD_HEIGHT | 100 × 100 | v8と同じ |
| PROXIMITY_RANGE | 3.0 | I/Oアクセス・TRANSFER・HARVEST・DISASSEMBLEの射程 |
| SCAN_RANGE | 10.0 | SensorのSCAN射程 |
| SCAN_MAX_RESULTS | 8 | SCAN/CSCAN結果の最大件数 |

## VM

| 定数 | 値 | 説明 |
|------|:---:|------|
| instructionsPerTick | 10000 | v8と同じ |
| PMEM_WORDS | 1024 | Processorのメモリ語数 |
| MEMCORE_WORDS | 1024 | MemoryCoreの記憶語数 |
| PROC_TICK_COST | 1 | Processor実行のエネルギー/tick（v9新設） |

## 物理

| 定数 | 値 | 説明 |
|------|:---:|------|
| COMPONENT_RADIUS | 0.4 | 単独コンポーネントの衝突半径（グループは×√メンバー数） |
| FRICTION_COEFFICIENT | 0.8 | v3と同じ |
| COLLISION_STIFFNESS | 200.0 | v3と同じ |
| VELOCITY_CLAMP_THRESHOLD | 0.01 | v3と同じ |
| MASS_PER_ATOM | 1 | 質量=原子数×この係数 |
| THRUST_FORCE_UNIT | 1.0 | 推進力 = magnitude × この係数（magnitude 0〜255） |
| THRUST_MAX | 255 | magnitudeの上限 |
| THRUST_ENERGY_DIVISOR | 16 | 推進エネルギー/tick = ceil(magnitude / 16) |

## 耐久度・修理

| 定数 | 値 | 説明 |
|------|:---:|------|
| MAX_DURABILITY | 全種 1000 | 種別ごとの表に拡張可能。暫定で一律 |
| AGE_INTERVAL | 10 | このtick数ごとに全コンポーネントの耐久度-1（無操作寿命 10000 tick） |
| CONTINUOUS_WEAR_INTERVAL | 10 | 継続動作（Processor実行・Actuator作動）の追加摩耗間隔（稼働寿命 約5000 tick） |
| REPAIR_BASE_ENERGY | 40 | n回目の修理エネルギー = 40 × n |
| REPAIR_AMOUNT | 400 | 1回の修理で回復する耐久度 |

## Assembler

| 定数 | 値 | 説明 |
|------|:---:|------|
| RECONFIG_ENERGY | 30 | SET_RECIPEのエネルギー |
| RECONFIG_TICKS | 5 | SET_RECIPEの所要tick |
| CRAFT_TICKS_BASE | 5 | 最下層・精製レシピの所要tick |
| CRAFT_TICKS_INTERMEDIATE | 10 | 中間物質レシピの所要tick |
| CRAFT_TICKS_COMPONENT | 30 | コンポーネント生成（ASSEMBLE）の所要tick |
| SPAWN_OFFSET | 1.0 | 自由設置時のオフセット距離（+x方向。v8と同じ） |

## Harvester / Disassembler

| 定数 | 値 | 説明 |
|------|:---:|------|
| HARVEST_MATTER_RATE | 1 | 1回のHARVESTで回収する物質個数 |
| HARVEST_ENERGY_RATE | 40 | 1回のHARVESTで回収するエネルギー（ノード流量残まで） |
| HARVEST_ACTION_COST | 2 | HARVESTのエネルギーコスト |
| DISASSEMBLE_TICKS | 15 | DISASSEMBLEの所要tick |
| DISASSEMBLE_ACTION_COST | 15 | DISASSEMBLEのエネルギーコスト（RXレシピのコストとして計上） |

## Sensor / Storage / その他アクション

| 定数 | 値 | 説明 |
|------|:---:|------|
| SCAN_ENERGY | 5 | SCANのエネルギー |
| CSCAN_ENERGY | 1 | CSCANのエネルギー |
| TRANSFER_ENERGY | 1 | TRANSFERのエネルギー |
| MATTER_CAPACITY | 200 | Storageの物質容量（総原子数） |
| ENERGY_CAPACITY | 2000 | Storageのエネルギー容量 |

## 資源ノード

| 定数 | 値 | 説明 |
|------|:---:|------|
| ENERGY_NODE_COUNT | 30 | EnergyNode数 |
| ENERGY_NODE_FLOW | 100 | EnergyNodeの毎tick流出上限 |
| NODE_COUNT_abundant / common / limited / rare | 40 / 20 / 12 / 6 | 物質種別ごとのMatterNode数 |
| NODE_AMOUNT_abundant / common / limited / rare | 400 / 200 / 100 / 40 | MatterNode1つの初期量 |

参考: この構成での世界のI原子総量 = InfoSeedノード 6×40 = 240（+初期個体分）。
コンポーネント一式はI原子9を要するため、世界は最大でも約26個体分のIしか持たない。
**希少資源の枯渇が分解・捕食による再利用を強制する**（意図された淘汰圧）。

## 自発変化

| 定数 | 値 | 説明 |
|------|:---:|------|
| SPONTANEOUS_STABILITY_THRESHOLD | 10 | src/craft/stability.ts と同値 |
| DECAY_PROBABILITY | 1/2000 | 対象（残骸・地面のコンポーネント）ごと毎tickの崩壊確率 |
