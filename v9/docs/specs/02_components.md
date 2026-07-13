# コンポーネント仕様

コンポーネントは物質の一種であり（原子構成・安定性を持つ）、特殊なアクションを実行できる点のみが
通常物質と異なる。種類は8種。原子構成と生成/分解レシピは [craft_tree](../plan/craft_tree/spec_draft.md)
（データ実体: `src/craft/`）で定義される。

## 共通属性

| 属性 | 説明 |
|------|------|
| id | 世界で一意の数値ID |
| type | 物質ID（Assembler等の8種） |
| durability | 現在耐久度。0で残骸化 |
| maxDurability | 種別ごとの最大耐久度（パラメータ） |
| repairCount | これまでに受けた修理の回数（修理コスト逓増に使用） |
| connections | 辺インデックス0〜5ごとの接続先コンポーネントID（なければ空） |

## 耐久度

- 減少（すべて決定論的）:
  - **経年劣化**: AGE_INTERVAL tickごとに1減少。全コンポーネントが対象
  - **使用劣化**: アクションを実行するたびに実行コンポーネントが1減少。
    継続動作（Actuatorの作動中・Processorの実行中）は CONTINUOUS_WEAR_INTERVAL tickごとに1減少
- 耐久度が0になったコンポーネントは**残骸（wreck）**になる:
  - すべての機能が停止する（アクション実行不可、Processorは実行されない、Storageは内容物を保持し続ける）
  - 物体としては残存し、接続も維持される（グループの死重になる）
  - Disassemblerで分解できる（RXレシピ、内容物があるStorageの場合は内容物も散布される）
  - 自発変化（崩壊）の対象になる（[04_craft_energy.md](04_craft_energy.md)）

## 修理（REPAIR）

- Assemblerのアクション。対象は同グループのコンポーネント（自身も可、残骸は不可）
- n回目（n = 対象のrepairCount + 1）の修理コスト:
  - エネルギー: REPAIR_BASE_ENERGY × n
  - 材料: 対象種別の修理材料（下表）×1
- 効果: 耐久度を REPAIR_AMOUNT 回復する（maxDurabilityを超えない）。repairCountが1増える
- 修理材料（各コンポーネントの分解出力から1種を指定。分解回収で修理が回るようにする）:

| コンポーネント | 修理材料 |
|---|---|
| Assembler | ChargedBinder |
| Disassembler | ChargedBinder |
| Processor | EncodedFragment |
| MemoryCore | EncodedFragment |
| Actuator | ConductiveGel |
| Sensor | PatternChain |
| Harvester | ConductiveGel |
| Storage | BindingShard |

- 設計意図: 修理コストの逓増により、生涯総修理コストは回数の2乗で増加する。
  一時的・局所的には修理が有利（組立済み構造を保てる）だが、大局的には再生産が必ず有利になる（R4）

## 各コンポーネントのアクション

アクションの操作メモリ（opmem）レイアウトとI/Oアドレスは [03_program_io.md](03_program_io.md) を参照。
エネルギーコストの値は [05_parameters.md](05_parameters.md)。

### Assembler

| アクション | 内容 |
|---|---|
| SET_RECIPE | 構成レシピを切り替える。RECONFIG_ENERGY を消費し RECONFIG_TICKS を要する。完了までアクション不可 |
| CRAFT | 構成中のレシピを1回実行する。材料を同グループのStorageから引き当て（不足なら失敗）、レシピのエネルギーコストを消費し、CRAFT_TICKS 後に生成物をStorageへ格納する（容量不足分は足元に散布） |
| ASSEMBLE | 構成中のレシピがコンポーネント生成（RC系）のとき、生成物を「接続先コンポーネント（ローカルID）の辺e」に接続された状態で組み立てる。eはAUTO(0xFF)可。新規コンポーネント側は対面辺 (e+3) mod 6 を使用。接続先0で自由設置（自座標からSPAWN_OFFSET距離。**方位は自由設置のたびに60°回転する** — 同じ場所への積み上げによる衝突連鎖を防ぐ）。完了時に接続先が不到達・辺が使用済みの場合、**生成物は自由設置され結果コードで通知される**（材料は消費済みのため）。Processorは停止状態（run_flag=0, PC=0）で生成される |
| REPAIR | 上記のとおり |

- 専用のACTIVATEアクションはない。子Processorの起動はv8と同様、
  外部opmem書込で対象の run_flag に1を書くことで行う（[03_program_io.md](03_program_io.md)）

- Assemblerは材料バッファを持たない。材料・エネルギーは常に同グループのStorage群から
  ID昇順に引き当てる
- 構成レシピの初期値は「なし」（SET_RECIPEするまでCRAFT/ASSEMBLE不可）

### Harvester

| アクション | 内容 |
|---|---|
| HARVEST | 射程 HARVEST_RANGE 内の、**フィルタに適合する**最近傍の回収対象（MatterNode/EnergyNode/地面の物体/散布エネルギー。同距離はID昇順)から1回分を回収し、同グループの「空きがある最小IDのStorage」へ格納する。物質は HARVEST_MATTER_RATE 個/回、エネルギーは HARVEST_ENERGY_RATE/回（ノードの残量・流量制限まで）。格納先がなければ失敗 |

- 対象は自動選択のみだが、フィルタ（全種/エネルギーのみ/特定物質のみ）で絞り込める。
  Sensorがなくても動作する = 最小祖先が成立する（特定の材料を集めるにはフィルタを使う）

### Disassembler

| アクション | 内容 |
|---|---|
| DISASSEMBLE | 射程 DISASSEMBLE_RANGE 内の対象コンポーネント/残骸（一時IDまたはローカルIDで指定）を分解する。DISASSEMBLE_TICKS 後、対象のRXレシピの出力を自グループのStorageへ格納する（不足分は散布）。対象は世界から除去され、対象が属していたグループは接続を再計算する |

- 対象が自グループか他グループか、活性か残骸かをシステムは区別しない（判断はプログラムの責任）
- 対象がStorageの場合、内容物（物質・エネルギー）はその場に散布される

### Actuator

| アクション | 内容 |
|---|---|
| THRUST | 操作メモリの方向（0〜255 = 0〜2π）と強さ（0〜THRUST_MAX）に従い、毎tick自グループへ推進力を加える。作動中は毎tick THRUST_ENERGY_PER_UNIT × 強さ を消費し、耐久度が1減る。強さ0で停止 |

### Sensor

| アクション | 内容 |
|---|---|
| SCAN | SCAN_ENERGY を消費し、射程 SCAN_RANGE 内の近傍オブジェクトを距離昇順に最大 SCAN_MAX_RESULTS 件、操作メモリへ書き出す。各エントリ: 種別コード（物質ID/ノード種別）、残骸フラグ、距離（量子化）、方向（0〜255）、一時ID。一時IDは次回SCANまで有効で、DISASSEMBLE等の対象指定に使える |

### Storage

| アクション | 内容 |
|---|---|
| TRANSFER | 対象Storage（ローカルID指定。**同グループまたは近接範囲内**＝I/Oアクセス規則と同一）へ、指定した物質×個数またはエネルギー量を転送する。対象の容量を超える分は転送されない |

- 近接転送を許すのは、別グループとして組み立てた子個体へ起動前に資源・エネルギーを
  分与するためである（複製シナリオの要件。[06_ancestor_scenario.md](06_ancestor_scenario.md)）

- 容量: 物質は総原子数で MATTER_CAPACITY まで、エネルギーは ENERGY_CAPACITY まで
- 受動的な格納・引出（Harvesterの格納、Assemblerの引当等）はアクションではなく即時に行われる

### Processor / MemoryCore

- Processorはプログラムを実行する（[03_program_io.md](03_program_io.md)）。
  実行中は毎tick PROC_TICK_COST のエネルギーを消費する（グループのStorageから。
  不足した場合そのtickは実行されない = 飢餓状態。耐久度の経年劣化は続く）
- MemoryCoreはアクションを持たない。pmem領域をI/O経由で提供する

## アクションの共通規則

- アクションは操作メモリへの書込（トリガ）で発動する。発動したtickの
  アクションフェーズで判定・実行される（[00_world_objects.md](00_world_objects.md) のフェーズ順）
- 同一tickの実行順序はコンポーネントID昇順
- 失敗（材料不足・射程外・容量不足等）は操作メモリのステータスコードで通知される。
  エネルギーは成功時のみ消費する（判定コストは取らない: 最もシンプルな解釈）
- 多tickアクション（SET_RECIPE, CRAFT, ASSEMBLE, DISASSEMBLE）の進行中は
  同コンポーネントの新規アクションを受け付けない（ステータス=BUSY）
