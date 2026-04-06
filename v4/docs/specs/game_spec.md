# ゲーム仕様書 — v4

本仕様はv3仕様をベースとし、v4で変更された箇所を定義する。
本仕様に記載のない項目はv3仕様（v3/docs/specs/game_spec.md）に従う。

## 1. 数値の扱い

v3と同じ。

## 2. 物理モデル

v3と同じ。

## 3. 距離判定

v3と同じ。

## 4. MOVEアクション

### 4-1. 概要

v3と同じ（力の適用による移動）。

### 4-2. 方向指定

VMプログラムがActuatorスロットのdirectionフィールドに角度（0-359の整数）を書き込む。
v3のプログラムDSL（`{op: 'MOVE', direction: number | {register: number}}`）は廃止。

### 4-3〜4-6

v3と同じ。

## 5. アクションの変更

### 5-1. HARVEST / RECHARGE

基本動作はv3と同じ。対象指定はv3と同じ（最近接のオブジェクト）。
VMプログラムからはコンポーネントスロットのcommandフィールドに書き込むことで予約する。

### 5-1b. DISASSEMBLE

v3と同じ流出テーブルを使用する。
対象指定はローカルIDで行う（v3の最近接指定から変更）。

### 5-2. ASSEMBLE

#### 子の身体構成

v3では固定のコンポーネントリストだったが、v4ではランタイムに決定する。
AssemblerスロットのI/Oフィールドに各コンポーネント種別の個数を書き込む。

#### コンポーネント種別（v4）

| 種別 | 機能 |
|------|------|
| Frame | 耐久値の提供 |
| Actuator | MOVE |
| Harvester | HARVEST |
| Charger | RECHARGE |
| Assembler | PROCESS, CRAFT, ASSEMBLE, REPAIR |
| Processor | WRITE, ACTIVATE |
| Sensor | SENSE |
| Disassembler | DISASSEMBLE |
| MemoryCore | VMメモリの提供（1個あたり1024ワード） |

v3のRegisterコンポーネントは廃止。レジスタはVMに内蔵される（8本固定）。

#### 子の生成

- 配置位置: v3と同じ（SPAWN_DISTANCE、親の速度の逆方向、4方向試行）
- 子の初期状態:
  - inactive（VMは未起動、PC=0、全レジスタ=0、全メモリ=0）
  - 速度: {vx: 0, vy: 0}
  - インベントリ: 空
  - エネルギー: ASSEMBLE_ENERGY_TRANSFER
  - 耐久値: Frame数 × FRAME_DURABILITY
  - species: 親のspeciesを継承

#### 返り値

ASSEMBLEのcommand書き込み時に、子のローカルIDが即座に結果領域に格納される。
プログラムはこのIDを使って同一tick内でWRITE、ACTIVATEを予約できる。

### 5-3. WRITE

v3から大幅に変更。

#### 動作

親のメモリの指定範囲を、対象のメモリの指定位置にブロックコピーする。

- 引数: target_id（ローカルID）, src_addr, dst_addr, length
- 対象はローカルIDで指定する
- 対象はMemoryCoreコンポーネントを持っていなければならない
- エネルギーコストはlengthに比例する

#### 前提条件

- 実行キャラクターがProcessorコンポーネントを持つ
- 対象が存在し、INTERACT_RANGE内にいる
- 対象がMemoryCoreを持つ

### 5-3b. ACTIVATE

対象をローカルIDで指定する（v3の最近接指定から変更）。
ACTIVATEにより対象のVMが起動する（PC=0から実行開始）。

前提条件:
- 実行キャラクターがProcessorコンポーネントを持つ
- 対象が存在し、INTERACT_RANGE内にいる
- 対象がinactive（VM未起動）である

### 5-4. REPAIR

v3と同じ。

### 5-5. PROCESS / CRAFT

v3と同じ。レシピはv3に従う。
ただし、Registerコンポーネントのレシピは削除する。

#### v4 コンポーネントレシピ（Registerを除外）

| コンポーネント | 材料 |
|--------------|------|
| Frame | Metal × 3 |
| Actuator | Metal × 1, Circuit × 1 |
| Sensor | Circuit × 2 |
| Processor | Circuit × 3 |
| Harvester | Metal × 2 |
| Assembler | Metal × 2, Circuit × 1 |
| Disassembler | Metal × 2, Circuit × 1 |
| Charger | Metal × 1, Circuit × 2 |
| MemoryCore | Circuit × 2 |

### 5-6. SENSE

v3から大幅に変更。詳細は [vm/vm_spec.md](vm/vm_spec.md) セクション7（Sensorスロット）および セクション8（個別クエリ）を参照。

概要:
- 結果は近い順に最大4件（概要のみ: type, angle, distance）
- フィルタにより対象種別を絞り込み可能
- 検知範囲: SENSE_RANGE
- 自分自身は結果に含まれない
- 詳細情報は個別クエリで取得する

## 6. 死亡と残骸

v3と同じ。

### 6-1〜6-5

v3と同じ（残骸生成、衝突、GroundGrid、残骸吸収、ノード再生）。

ただし、Registerコンポーネントに関する記述を削除する:

#### DISASSEMBLE流出テーブル（v4）

v3からRegisterの行を削除。他は同一。

| コンポーネント | レシピ | 流出 | グリッド変換 | キャラクター取得 |
|--------------|--------|------|-------------|----------------|
| Frame | Metal×3 | Metal×1 | ore += 2 | Metal×2 |
| Actuator | Metal×1, Circuit×1 | Metal×1 | ore += 2 | Circuit×1 |
| Sensor | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |
| Processor | Circuit×3 | Circuit×1 | crystal += 2 | Circuit×2 |
| Harvester | Metal×2 | Metal×1 | ore += 2 | Metal×1 |
| Assembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Disassembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Charger | Metal×1, Circuit×2 | Circuit×1 | crystal += 2 | Metal×1, Circuit×1 |
| MemoryCore | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |

### 6-6. 質量計算

v3と同じ計算方法。ただし、Registerの原材料換算値（2）は削除。

| コンポーネント | 原材料換算値 |
|--------------|-------------|
| Frame | 6 |
| Actuator | 4 |
| Sensor | 4 |
| Processor | 6 |
| Harvester | 4 |
| Assembler | 6 |
| Disassembler | 6 |
| Charger | 6 |
| MemoryCore | 4 |

## 7. キャラクタープログラム

v3のプログラムモデル（Rule列、Condition、Action型、set_registers、FnValue等）は全て廃止。

キャラクターの行動はVMにより決定される。VMの仕様は [vm/vm_spec.md](vm/vm_spec.md) を参照。

### 7-1. active / inactive

- **active**: VMが起動している状態。毎tickプログラムが実行される
- **inactive**: VMが未起動の状態。プログラムは実行されない
- ASSEMBLEで生成された子はinactive
- ACTIVATEでinactiveからactiveに遷移する
- activeからinactiveへの遷移は存在しない

### 7-2. species

v3と同じ。キャラクター生成時に設定され、ASSEMBLEの際に親から子へ継承される。
初期キャラクターのspeciesはプログラム定義ファイルのname属性から決定される。

## 8. ゲームループ

v3のゲームループを以下のように変更する。

```
1.  EnergyNode エネルギー生産
2.  全activeキャラクターのVM実行（最大 INSTRUCTIONS_PER_TICK 命令）
    → 各キャラクターのアクション予約が確定する
3.  予約されたアクションを実行
    - 異なる種別のアクション: 同時実行可能
    - 同一コンポーネントスロットへの複数予約: 最後の予約のみ有効
    - 実行順: キャラクターIDの昇順
    - MOVE: 力を蓄積（物理ステップで適用）
    - HARVEST/RECHARGE/DISASSEMBLE/WRITE/ACTIVATE: 距離チェック + 実行
    - PROCESS/CRAFT/ASSEMBLE/REPAIR: 実行
    - SENSE: 実行（結果はSensorスロットに格納、次tickで読み出し可能）
    - エネルギーチェック、消費、失敗ペナルティ
4.  摩擦力の計算
5.  衝突検出 + 反発力
6.  物理更新（力 → 加速度 → 速度 → 位置）
7.  基礎代謝（加齢係数あり）の適用
8.  耐久値減衰（全キャラクター -1）
9.  死亡チェック（耐久値 ≤ 0 → 残骸生成 + 除去）
10. 残骸吸収
11. ノード再生
12. tick++
```

### 8-1. ステップ2: VM実行

各activeキャラクターについて、VMを実行する:
- PCが指すアドレスから命令を実行
- HALT命令または INSTRUCTIONS_PER_TICK に達するまで
- アクション予約はI/Oスロットへの書き込みにより行われる

### 8-2. ステップ3: アクション実行

全キャラクターのVM実行が完了した後、予約されたアクションを一括で実行する。

- 実行順: キャラクターIDの昇順
- 同一対象の同一アドレスへの複数WRITE: 実行順に書き込み、後勝ち
- ASSEMBLE失敗時: その子のローカルIDを使う後続アクションも失敗

### 8-3. エネルギーコスト

v3と同じ。ただし:
- WRITEのコスト: 基本コスト + length × WRITE_PER_WORD_COST
- NOOPは存在しない（アクション未予約でもNOOPコストは発生しない）

### 8-4. 加齢代謝

v3と同じ。

### 8-5. 物理更新

v3と同じ。

## 9. 定数

v3の定数に加え、以下を追加/変更する:

### 追加定数

| 定数 | 意味 | 暫定値 |
|------|------|--------|
| INSTRUCTIONS_PER_TICK | VMのtickあたり最大実行命令数 | 200 |
| MEMORYCORE_WORDS | MemoryCore 1個あたりのメモリワード数 | 1024 |
| WRITE_PER_WORD_COST | WRITEの1ワードあたりの追加エネルギーコスト | (調整) |

### 削除定数

- registersPerComponent（Registerコンポーネント廃止のため）

### 変更なし

v3のその他の定数（MOVE_FORCE, FRICTION_COEFFICIENT, COLLISION_STIFFNESS, INTERACT_RANGE, SPAWN_DISTANCE, SENSE_RANGE, 各オブジェクト半径、REMAINS_ABSORPTION_TICKS, NODE_REGENERATION_THRESHOLD, AGING_THRESHOLD_N, AGING_THRESHOLD_M 等）はv3と同じ。

## 10. 型定義

v3からの変更箇所:

### Character

```
Character = {
  id: string
  species: string
  position: Position
  velocity: Velocity
  components: ComponentType[]
  inventory: Inventory
  durability: number
  energy: number
  createdAt: number
  // --- v4 変更 ---
  active: boolean          // v3の program !== null に相当
  memory: number[]         // VMメモリ（MemoryCore依存サイズ）
  registers: number[8]     // VMレジスタ r0-r7（r0は常に0）
  pc: number               // プログラムカウンタ
  localIdTable: Map<number, string>  // ローカルID → システムID
  localIdCounter: number   // 次に割り当てるローカルID
}
```

### ComponentType

```
ComponentType =
  | 'Frame'
  | 'Actuator'
  | 'Harvester'
  | 'Charger'
  | 'Assembler'
  | 'Processor'
  | 'Sensor'
  | 'Disassembler'
  | 'MemoryCore'
```

v3の `'Register'` を削除。

### Program / Rule / Condition / Action 型

全て廃止。VMの命令セットに置き換え。

### SenseData

廃止。SENSEの結果はI/Oスロットを通じてVMプログラムが読み取る。
