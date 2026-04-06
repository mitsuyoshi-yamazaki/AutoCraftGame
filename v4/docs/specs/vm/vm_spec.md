# VM仕様書 — v4

キャラクターの行動を決定するプログラムを実行する仮想マシン（VM）の仕様。

## 1. アーキテクチャ概要

- 16bit ノイマン型アーキテクチャ
- プログラムとデータが同一メモリ空間に存在する
- I/O空間はメモリ空間とは分離されている
- プログラムカウンタはtick間で保持される
- プログラムは16bitワードの列としてメモリのアドレス0から配置される

## 2. データ型

- 1ワード = 16bit 符号なし整数（0-65535）
- 浮動小数点は扱わない
- nullは扱わない
- ゲームシステムの浮動小数値（角度、座標等）はI/Oにおいて整数に丸められる

## 3. メモリ空間

### 3-1. アドレス

- 16bitアドレス（0x0000-0xFFFF）
- 最大65536ワード

### 3-2. メモリサイズ

- MemoryCoreコンポーネント1個あたり1024ワード
- MemoryCore N個搭載時、メモリサイズ = N × 1024ワード
- 最大: MemoryCore 64個 = 65536ワード（アドレス空間の上限）

### 3-3. メモリの初期状態

- キャラクター生成時、全メモリは0で初期化される
- WRITEアクションにより外部から書き込まれた内容がプログラムとなる

### 3-4. アドレスのラッピング

全てのメモリアクセスにおいて、アドレスはメモリサイズで剰余を取る（`addr % memory_size`）。これにより、メモリ空間はリング状に振る舞う。

- 読み出し: `mem[addr % memory_size]`
- 書き込み: `mem[addr % memory_size] = value`

この規則はPC、LW、SW、JMP、PUSH/POP、および外部からのWRITEに共通して適用される。

例: メモリサイズ8の場合
- アドレス9への読み出し → アドレス1（9 % 8 = 1）を読み出す
- アドレス6から長さ4のWRITE → アドレス6, 7, 0, 1に書き込む

## 4. レジスタ

| レジスタ | 幅 | 用途 |
|---------|-----|------|
| r0 | 16bit | ゼロレジスタ（読み出しは常に0、書き込みは破棄） |
| r1-r6 | 16bit | 汎用レジスタ |
| r7 | 16bit | 汎用レジスタ（慣例上スタックポインタとして使用） |
| PC | 16bit | プログラムカウンタ |

- レジスタの初期値: 全て0（PCを含む）
- レジスタはtick間で保持される
- r0への書き込みは常に破棄され、r0の読み出しは常に0を返す

## 5. 命令セット

### 5-1. 命令フォーマット

命令は1ワード（16bit）または2ワード（32bit）。

**Format R（レジスタ間演算）:**
```
15       10 9   7 6   4 3   1 0
[opcode:6][rd:3][rs1:3][rs2:3][x:1]
```

**Format I（短即値付き）:**
```
15       10 9   7 6   4 3      0
[opcode:6][rd:3][rs:3][imm4:4]
```
imm4 は命令により符号なし(0-15)または符号付き(-8~+7)。各命令の定義に従う。

**Format W（16bit即値付き、2ワード命令）:**
```
1ワード目: [opcode:6][rd:3][rs:3][x:4]
2ワード目: [imm16:16]
```
PC は 2ワード目の次を指す（PC += 2）。

**Format B（短分岐）:**
```
15       10 9   7 6   4 3      0
[opcode:6][rs1:3][rs2:3][offset:4]
```
offset は符号付き4bit（-8~+7）。分岐先 = PC + offset。
遠方への分岐はレジスタ間接ジャンプまたはロング分岐命令を使用する。

**Format BL（ロング分岐、2ワード命令）:**
```
1ワード目: [opcode:6][rs1:3][rs2:3][x:4]
2ワード目: [target:16]
```
target は16bit絶対アドレス。条件成立時 PC = target。不成立時 PC += 2。

### 5-2. 不正命令

PCが指すワードの値が有効な命令としてデコードできない場合（オペコードが定義されていない値の場合）、NOPとして扱う（何もせずPC += 1）。

### 5-3. 命令一覧

#### 算術演算

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| ADD rd, rs1, rs2 | R | rd = (rs1 + rs2) mod 65536 | オーバーフローはラップ |
| SUB rd, rs1, rs2 | R | rd = (rs1 - rs2) mod 65536 | アンダーフローはラップ |
| MUL rd, rs1, rs2 | R | rd = (rs1 × rs2) mod 65536 | 下位16bitのみ |
| DIV rd, rs1, rs2 | R | rd = rs1 / rs2 | 整数除算。rs2=0 → rd=0 |
| MOD rd, rs1, rs2 | R | rd = rs1 % rs2 | rs2=0 → rd=0 |
| ADDI rd, rs, imm4 | I | rd = (rs + imm4) mod 65536 | imm4: 符号付き(-8~+7) |

#### 論理演算

| 命令 | 形式 | 動作 |
|------|------|------|
| AND rd, rs1, rs2 | R | rd = rs1 AND rs2（ビット演算） |
| OR rd, rs1, rs2 | R | rd = rs1 OR rs2 |
| XOR rd, rs1, rs2 | R | rd = rs1 XOR rs2 |
| SHL rd, rs1, rs2 | R | rd = rs1 << (rs2 mod 16)（論理左シフト） |
| SHR rd, rs1, rs2 | R | rd = rs1 >> (rs2 mod 16)（論理右シフト） |

#### メモリ操作

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| LW rd, rs, imm4 | I | rd = mem[(rs + imm4) % memory_size] | imm4: 符号付き。アドレスはラップ |
| SW rs, rd, imm4 | I | mem[(rd + imm4) % memory_size] = rs | imm4: 符号付き。アドレスはラップ |
| LI rd, imm16 | W | rd = imm16 | 2ワード命令 |

#### I/O操作

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| IN rd, rs | R | rd = io_read(rs) | rsの値をI/Oアドレスとして読み出し |
| OUT rs1, rs2 | R | io_write(rs1, rs2) | rs1=I/Oアドレス, rs2=値 |

#### 制御フロー

**短分岐（Format B、1ワード命令）:**

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| BEQ rs1, rs2, off4 | B | rs1 == rs2 → PC += off4 | off4: 符号付き(-8~+7) |
| BNE rs1, rs2, off4 | B | rs1 != rs2 → PC += off4 | off4: 符号付き(-8~+7) |
| BLT rs1, rs2, off4 | B | rs1 < rs2 → PC += off4 | 符号なし比較。off4: 符号付き(-8~+7) |
| BGE rs1, rs2, off4 | B | rs1 >= rs2 → PC += off4 | 符号なし比較。off4: 符号付き(-8~+7) |

短分岐の4bitオフセットは-8~+7ワードの範囲。遠方への分岐はロング分岐またはレジスタ間接ジャンプを使用する。

条件不成立時は次の命令（PC += 1）に進む。

**ロング分岐（Format BL、2ワード命令）:**

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| BEQL rs1, rs2, target | BL | rs1 == rs2 → PC = target | target: 16bit絶対アドレス |
| BNEL rs1, rs2, target | BL | rs1 != rs2 → PC = target | target: 16bit絶対アドレス |
| BLTL rs1, rs2, target | BL | rs1 < rs2 → PC = target | 符号なし比較。target: 16bit絶対アドレス |
| BGEL rs1, rs2, target | BL | rs1 >= rs2 → PC = target | 符号なし比較。target: 16bit絶対アドレス |

条件成立時は2ワード目の16bit値を絶対アドレスとしてPCに設定する。条件不成立時は2ワード目をスキップして次の命令（PC += 2）に進む。

**ジャンプ:**

| 命令 | 形式 | 動作 | 備考 |
|------|------|------|------|
| JMP imm16 | W | PC = imm16 | 2ワード命令（絶対アドレス） |
| JALR rd, rs | R | rd = PC + 1, PC = rs | 関数呼び出し用 |

遠方への条件分岐の典型パターン:
```
BEQ rs1, rs2, +2    ; 条件不成立なら次の JMP をスキップ
JMP far_target       ; 2ワード命令で遠方へジャンプ
```

または、ロング分岐を使用:
```
BEQL rs1, rs2, far_target   ; 2ワード命令で直接遠方へ条件分岐
```

#### スタック操作

| 命令 | 形式 | 動作 |
|------|------|------|
| PUSH rs | I | r7 = (r7 - 1) mod 65536, mem[r7 % memory_size] = rs |
| POP rd | I | rd = mem[r7 % memory_size], r7 = (r7 + 1) mod 65536 |

r7がスタックポインタとして使われる前提の命令。r7を別目的で使用している場合の動作は未定義ではなく、上記の通りr7を機械的に操作する。メモリアクセスのアドレスはラッピング規則に従う。

#### 特殊

| 命令 | 形式 | 動作 |
|------|------|------|
| HALT | - | このtickの実行を終了。次tickでPC続行 |

エイリアス（独立したオペコードを持たない）:
- `MOV rd, rs` = `ADD rd, rs, r0`
- `NOP` = `ADD r0, r0, r0`

## 6. I/O空間

メモリ空間とは独立したアドレス空間。IN/OUT命令でアクセスする。

### 6-1. 基本仕様

- ワードサイズ: メモリ空間と同一（16bit）
- 不在スロットのIN: 0を返す
- 不在スロットへのOUT: 無視（副作用なし）

### 6-2. コンポーネントI/Oレイアウト

コンポーネント種別ごとにベースアドレスを割り当て、各インスタンスは固定オフセットで配置される。

```
スロットアドレス = base(type) + index × SLOT_SIZE(type)
```

- インデックスは種別内で生成順に連番（0始まり、単調増加）
- コンポーネント破壊時は欠番になる（他のインデックスは変わらない）
- SLOT_SIZEは種別ごとに異なる

ベースアドレスの割り当て（具体値は実装時に確定）:
```
グローバル領域:  0x0000
Actuator:        0x1000
Harvester:       0x2000
Charger:         0x3000
Assembler:       0x4000
Processor:       0x5000
Sensor:          0x6000
Disassembler:    0x7000
Frame:           0x8000
MemoryCore:      0x9000
```

### 6-3. グローバル領域

キャラクター全体の情報。読み取り専用。

```
0x0000: エネルギー
0x0001: 耐久値
0x0002: X座標（整数丸め）
0x0003: Y座標（整数丸め）
0x0004: VX（整数丸め）
0x0005: VY（整数丸め）
0x0006: 現在のtick
```

### 6-4. ディスカバリ

各種別のベースアドレス直前に以下の情報を配置する:

- 存在コンポーネント数（statusが1のスロット数）
- 接続総数（欠番を含むインデックス上限）

各スロットの先頭にstatusフィールド（1=存在, 0=不在）がある。

### 6-5. スロット共通構造

```
+0x00  status    ; 1=存在, 0=不在（読み取り専用）
+0x01  command   ; アクションコマンド（書き込み → 予約確定）
+0x02~ 引数/結果 共用領域
```

## 7. アクション予約プロトコル（コマンドラスト方式）

全アクション共通の規約。

### 7-1. 予約の流れ

1. 引数フィールドに値を書き込む（OUT命令で1フィールドずつ）
2. commandフィールドに値を書き込む → **アクション予約が確定**
3. command書き込みにより引数領域がクリアされ、結果が格納される
4. 結果は即座にIN命令で読み出し可能

### 7-2. 各コンポーネントのスロットレイアウト

#### Actuator — MOVE

```
+0x00  status
+0x01  command         ; 1=MOVE
+0x02  direction       ; 移動方向（角度、0-359）→ 予約後: 0
```

#### Harvester — HARVEST

```
+0x00  status
+0x01  command         ; 1=HARVEST
```

#### Charger — RECHARGE

```
+0x00  status
+0x01  command         ; 1=RECHARGE
```

#### Assembler — PROCESS / CRAFT / ASSEMBLE / REPAIR

```
+0x00  status
+0x01  command         ; 1=PROCESS, 2=CRAFT, 3=ASSEMBLE, 4=REPAIR

command=3 (ASSEMBLE) の場合:
  引数:
    +0x02  frame_count
    +0x03  actuator_count
    +0x04  harvester_count
    +0x05  charger_count
    +0x06  assembler_count
    +0x07  processor_count
    +0x08  sensor_count
    +0x09  disassembler_count
    +0x0A  memorycore_count
  結果（command書き込み後）:
    +0x02  child_local_id（子のローカルID）
    +0x03~ 0

command=1 (PROCESS) の場合:
  引数:
    +0x02  recipe（加工レシピ）
  結果: +0x02 → 0

command=2 (CRAFT) の場合:
  引数:
    +0x02  component_type（コンポーネント種別）
  結果: +0x02 → 0

command=4 (REPAIR) の場合:
  引数: なし
  結果: なし
```

#### Processor — WRITE / ACTIVATE

```
+0x00  status
+0x01  command         ; 1=WRITE, 2=ACTIVATE

command=1 (WRITE) の場合:
  引数:
    +0x02  target_id      ; 対象のローカルID
    +0x03  src_addr       ; 自身のメモリ上のソースアドレス
    +0x04  dst_addr       ; 対象のメモリ上の書き込み先アドレス
    +0x05  length         ; 書き込みワード数
  結果: +0x02~ → 0

command=2 (ACTIVATE) の場合:
  引数:
    +0x02  target_id      ; 対象のローカルID
  結果: +0x02 → 0
```

WRITEによる書き込みは、対象のメモリに対してもラッピング規則が適用される。dst_addrからlengthワード分を書き込む際、アドレスが対象のメモリサイズを超える場合はラップアラウンドする。自身のメモリからの読み出し（src_addr）についても同様にラッピングが適用される。

#### Sensor — SENSE

SENSEは他のアクションとは異なり、command書き込み時に**即座に実行される**。SENSEはワールドの状態を変更しないため、世界更新フェーズでの一括実行を待つ必要がない。

```
+0x00  status
+0x01  command          ; 1=SENSE

引数:
  +0x02  filter          ; フィルタ値（後述）。command書き込み前に設定する

結果（command書き込みと同時に即座に格納）:
  +0x02  result_count    ; 検出件数（0-4）
  +0x03  entry_index     ; 選択中のエントリ番号（書き込みで切替）
  +0x04  entry_type      ; 選択エントリの種別（読み取り専用）
  +0x05  entry_angle     ; 選択エントリの角度（読み取り専用）
  +0x06  entry_distance  ; 選択エントリの距離（読み取り専用）
  +0x07  register_cmd    ; 1を書き込む → 選択エントリを登録
  +0x08  registered_id   ; 登録結果のローカルID（読み取り専用）
```

SENSEの即時実行により、同一tick内で以下のシーケンスが可能:
1. filterを書き込む
2. commandに1を書き込む → SENSEが即座に実行され、結果が格納される
3. result_count、entry_type、entry_angle、entry_distanceを読み出す
4. entry_indexを書き込んでエントリを切り替える
5. register_cmdを書き込んでエントリを登録する
6. registered_idを読み出してローカルIDを取得する

SENSEフィルタ値:

| 値 | 対象 |
|----|------|
| 0 | 全種別（フィルタなし） |
| 1 | Oreノード |
| 2 | Crystalノード |
| 3 | エネルギーノード |
| 4 | リソースノード（Ore + Crystal） |
| 5 | 全ノード（リソース + エネルギー） |
| 6 | 残骸 |
| 7 | アクティブキャラクター |
| 8 | 非アクティブキャラクター |
| 9 | 全キャラクター |

SENSE結果は近い順に最大4件。自分自身は結果に含まれない。
検知範囲: SENSE_RANGE。

#### Disassembler — DISASSEMBLE

```
+0x00  status
+0x01  command         ; 1=DISASSEMBLE
+0x02  target_id       ; 対象のローカルID → 予約後: 0
```

#### Frame / MemoryCore

アクションを持たない。statusフィールドのみ。

```
+0x00  status
```

## 8. 個別クエリ

登録済みローカルIDの対象の詳細情報を取得する。アクション予約ではなく、tick内で即時応答する。

### 8-1. クエリ用I/O領域

```
query_target_id    ; 対象のローカルID（書き込み）
query_cmd          ; 1を書き込む → クエリ実行
query_valid        ; 1=成功, 0=失敗（読み取り専用）
query_type         ; 対象の種別（読み取り専用）
query_angle        ; 自分からの現在の角度（読み取り専用）
query_distance     ; 自分からの現在の距離（読み取り専用）
query_prop0~       ; 種別依存属性（読み取り専用）
```

### 8-2. クエリ失敗条件

- 対象が消滅している
- 対象がSENSE_RANGE外にいる
- ローカルIDが無効

失敗時、全フィールドは0。query_valid = 0。

### 8-3. 種別依存属性

- **Character**: energy, durability, コンポーネント数, species
- **InactiveCharacter**: コンポーネント数
- **ResourceNode**: 種別(Ore/Crystal/Energy), 残量
- **Remains**: コンポーネント数

## 9. ローカルID

### 9-1. 概要

キャラクターごとにローカルIDテーブルを保持し、ゲームシステム内部のオブジェクトIDとの変換を行う。プログラムはシステムIDに直接アクセスしない。

### 9-2. テーブル管理

- テーブルはゲームシステム側が管理する
- キャラクター側のコスト（メモリ、基礎代謝等）にならない
- テーブル容量に上限はない
- テーブルはキャラクター死亡時に解放される

### 9-3. ID割り当て

- 登録のたびにカウンタをインクリメント（単調増加）
- 同じシステムIDを再度登録した場合、既存のローカルIDを返す
- 解放命令が提供される（解放されたIDは次の登録で再割り当て可能）

### 9-4. ID取得方法

**SENSE経由**: Sensorスロットで結果エントリを選択し、register_cmdを書き込む → registered_idにローカルIDが返る。

**ASSEMBLE経由**: Assemblerスロットのcommandを書き込むと、結果領域にchild_local_idが即時格納される。

### 9-5. ID解決（アクション実行時）

1. ローカルID → テーブル参照 → システムID
2. システムIDでオブジェクトを解決
3. 存在しない → アクション失敗
4. 射程外 → アクション失敗
5. 前提条件チェック → 実行 or 失敗

## 10. 実行モデル

### 10-1. tick内の実行

1. PCが指すアドレスの命令を読み出す（PCはメモリサイズでラップ: `PC % memory_size`）
2. 命令をデコードし実行する（不正命令はNOP）
3. PCを更新する（通常 +1、分岐/ジャンプ時は分岐先、2ワード命令は +2）
4. PC更新後、PCをメモリサイズでラップする（`PC = PC % memory_size`）
5. 実行命令数カウンタをインクリメントする
6. 以下のいずれかになるまで繰り返す:
   - HALT命令を実行した
   - 実行命令数が INSTRUCTIONS_PER_TICK に達した

### 10-2. tick間の状態保持

以下はtick間で保持される:
- PC（HALTまたは命令数上限で停止した次の位置）
- レジスタ r1-r7 の値
- メモリの内容

以下はtick間で保持されない:
- アクション予約（毎tick実行後にクリアされる）

### 10-3. 定数

| 定数 | 意味 | 暫定値 |
|------|------|--------|
| INSTRUCTIONS_PER_TICK | tickあたりの最大実行命令数 | 200 |
| WRITE_COST_PER_WORD | WRITEの1ワードあたりの追加エネルギーコスト。コスト = ceil(length × WRITE_COST_PER_WORD) | 0 |
