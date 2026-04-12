# ゲームシステム仕様 — v7

本文書はゲーム世界の**法則**を定める。
世界の初期状態は `initial_state.md` で定義する。
Processor の VM は `vm/vm_spec.md` で定義する。

---

## 1. 数値の扱い

- **座標**: 浮動小数点数
- **ゲームロジック量**（エネルギー格納量、資源量、レシピ材料数、組立時間）: **整数**

丸め規則: 消費は切り上げ (ceil)、獲得は切り捨て (floor)。ゲームロジック量にのみ適用。

---

## 2. 世界モデル

### 2-1. 座標系

ワールドは連続な 2 次元平面。

```
Position = { x: number, y: number }
```

原点 (0, 0) はワールドの左上角。x 軸は右方向、y 軸は下方向を正とする。
ワールドには有限の矩形範囲 `(0, 0)` - `(width, height)` がある。

### 2-2. オブジェクト

v7 の世界にはシステム上の「キャラクター」概念は存在しない。世界に存在するのは全て**オブジェクト (WorldObject)** であり、以下の種別がある。

| 種別 | 説明 |
|------|------|
| コンポーネント | Assembler, Processor。それぞれが独立した物体 |
| 中間生成物 | Metal, Circuit。それぞれが独立した物体 |
| 原材料 | Ore, Crystal。それぞれが独立した物体 |
| エネルギー | エネルギー量を持つ物体 |

全オブジェクトは以下の共通属性を持つ:

| 属性 | 型 | 説明 |
|------|----|------|
| `id` | string | ワールド内で一意な識別子 |
| `position` | Position | 現在の座標 |
| `orientation` | number | 向き（ラジアン）。v7.0.0 では全て 0（右方向）で固定 |

### 2-3. オブジェクトの統一的表現

実装上、全オブジェクトは統一された型として扱う。個別の種別は具象型として表現する。

```
WorldObject (interface)
├── ComponentObject (Assembler, Processor)
├── MaterialObject (Ore, Crystal, Metal, Circuit)
└── EnergyObject
```

### 2-4. ランダム移動

- 全オブジェクトは毎 tick ランダムに移動する
- 各オブジェクトが個別にランダムな方向・距離を移動する
- 移動は**決定論的でなくてよい**（Math.random 等の使用を許容）
- 移動距離の最大値は定数 `RANDOM_MOVE_DISTANCE` で定める

### 2-5. ワールド境界

ワールドの矩形範囲外にはみ出したオブジェクトは、最も近いワールド内の位置に補正される（クランプ）。

```
x = clamp(x, 0, width)
y = clamp(y, 0, height)
```

### 2-6. 衝突

v7.0.0 では衝突判定を**省略する**。全てのオブジェクトは互いに衝突せず、重なりを許容する。

---

## 3. 距離判定（近接）

### 3-1. 距離関数

```
distance(a, b) = sqrt((a.x - b.x)² + (a.y - b.y)²)
```

### 3-2. 近接の定義

2 つのオブジェクト間のユークリッド距離が **近接距離 (`PROXIMITY_RANGE`)** 以下であるとき、「近接している」とする。近接距離は全アクション・全コンポーネント種別で**一律**。

### 3-3. 近接の用途

- Assembler が材料・エネルギーを周囲から吸収する範囲
- Processor が他オブジェクトにアクセス可能と判定される範囲（SCAN、操作メモリアクセス、Processor メモリアクセス）
- 生成物の放出位置の基準

---

## 4. オブジェクト種別

### 4-1. エネルギーオブジェクト

- **格納量** (`amount`: 整数) を持つ
- 周囲のコンポーネント（Assembler）に吸収されると、その分だけ格納量が減る
- 格納量が 0 になったらオブジェクトは世界から消滅する

### 4-2. 原材料オブジェクト (Ore, Crystal)

- **資源量** (`amount`: 整数) を持つ
- 周囲のコンポーネント（Assembler）に吸収されると、その分だけ資源量が減る
- 資源量が 0 になったらオブジェクトは世界から消滅する

### 4-3. 中間生成物 (Metal, Circuit)

- 1 つの中間生成物が 1 つのオブジェクトとして世界に配置される
- 数量の概念はない（1 オブジェクト = 1 単位）
- Assembler に吸収されるとオブジェクトは世界から消滅する

### 4-4. コンポーネント (Assembler, Processor)

- 1 つのコンポーネントが 1 つのオブジェクトとして世界に配置される
- 耐久度なし、代謝なし、加齢なし
- 各コンポーネントは**操作メモリ** (5 節) を持つ

### 4-5. オブジェクト種別 ID

I/O のスキャン結果等で使用する種別 ID。

| ID | 種別 |
|----|------|
| 0 | （未設定 / 無効） |
| 1 | Assembler |
| 2 | Processor |
| 10 | Ore |
| 11 | Crystal |
| 12 | Metal |
| 13 | Circuit |
| 20 | Energy |

---

## 5. コンポーネント共通仕様: 操作メモリ

### 5-1. 概要

各コンポーネントは**操作メモリ (operation memory)** を持つ。これはそのコンポーネントを操作するための外部インターフェースである。

- コンポーネント種別ごとに**固定長**
- 外部の Processor が近接距離内のコンポーネントの操作メモリに対して読み書きを行う

### 5-2. 共通領域

全コンポーネント種別に共通する領域。

| オフセット | 名称 | R/W | 説明 |
|------------|------|-----|------|
| 0 | `current_action` | R | 現在実行中のアクション。0 = なし。外部から書き換え不可 |
| 1 | `action_trigger` | W | 実行するアクション種別を書き込む。書き込み後 **1 tick でクリア**される |

`action_trigger` にアクション種別が書き込まれると、そのアクションがトリガーされる。アクション実行中に書き込まれた場合、実行中のアクションは中断され新しいアクションが開始される（6-5 節参照）。

### 5-3. アクション固有領域

共通領域の後に、コンポーネント種別固有のパラメータ・状態領域が配置される。

### 5-4. アクション実行プロトコル

外部の Processor がコンポーネントにアクションを実行させる手順:

1. Processor が SCAN で近接コンポーネントの一覧を取得する
2. 対象のローカル ID を指定して操作メモリにアクセスする
3. パラメータ領域に引数を書き込む
4. `action_trigger` にアクション種別を書き込む → アクションがトリガーされる

### 5-5. 操作メモリの可読性

外部の Processor は対象コンポーネントの操作メモリを**全て読み取り可能**。

---

## 6. Assembler 仕様

### 6-1. 状態

Assembler は以下の状態を持つ:

| 状態 | `current_action` 値 | 説明 |
|------|---------------------|------|
| **idle** | 0 | 何もしていない |
| **gathering** | 1 (ASSEMBLE) | ASSEMBLE がトリガーされ、材料・エネルギーを回収中 |
| **assembling** | 1 (ASSEMBLE) | 材料充足。組立中（残り n tick） |

`assemble_status` フィールドで gathering (1) と assembling (2) を区別する。

### 6-2. アクション一覧

| アクション | `action_trigger` 値 | 説明 |
|------------|---------------------|------|
| ASSEMBLE | 1 | レシピに従い材料を回収し、生成物を組み立てる |

### 6-3. 操作メモリレイアウト

| オフセット | 名称 | R/W | 説明 |
|------------|------|-----|------|
| 0 | `current_action` | R | 共通: 現在実行中のアクション（0=なし, 1=ASSEMBLE） |
| 1 | `action_trigger` | W | 共通: アクショントリガー（1=ASSEMBLE）。1 tick でクリア |
| 2 | `recipe` | R/W | ASSEMBLE 用: レシピ ID（1〜4）。0 = 未設定 |
| 3 | `assemble_status` | R | ASSEMBLE 用: 0 = idle, 1 = gathering, 2 = assembling |
| 4 | `assemble_progress` | R | ASSEMBLE 用: 組立フェーズの残り tick 数（assembling 時のみ有効） |

操作メモリサイズ: **5 ワード**

### 6-4. ASSEMBLE 動作フロー

```
[idle] (current_action = 0)
  ↓  action_trigger に 1 が書き込まれた AND recipe が有効値 (1〜4)
[gathering] (current_action = 1, assemble_status = 1)
  毎 tick: 近接範囲内の材料オブジェクト・エネルギーオブジェクトから必要量を吸収
  ↓  全材料 + エネルギーが充足
[assembling] (current_action = 1, assemble_status = 2)
  残り tick 数をカウントダウン
  ↓  assemble_progress = 0
[idle] (current_action = 0)
  生成物を前方（0 度方向 = 右方向）に放出
  assemble_status をリセット
```

### 6-5. gathering/assembling 中の再トリガー

ASSEMBLE が実行中（gathering または assembling）に再度 `action_trigger` に 1 が書き込まれた場合:

1. レシピが変更されていれば、新しいレシピの材料リストを確定する
2. 回収済みの材料・エネルギーのうち、新レシピに**不要なもの**を近接範囲に放出する
3. 新レシピの gathering を開始する（必要量から回収済み分を差し引いた残りを回収）

レシピが同一の場合でも、再トリガーにより gathering がリスタートされる（進行中の assembling はキャンセルされる）。

### 6-6. 材料吸収の詳細

- 毎 tick、近接範囲内の材料オブジェクト・エネルギーオブジェクトを走査する
- 必要な種別の材料/エネルギーが見つかれば、**1 tick あたり各種別 1 単位**を吸収する
  - 吸収速度上限はパラメータ `ABSORB_RATE` で調整可能
- 原材料オブジェクト (Ore, Crystal): 対象の `amount` が 1 減る。0 になったら消滅
- 中間生成物 (Metal, Circuit): 1 オブジェクト = 1 単位。吸収されたら消滅
- エネルギーオブジェクト: 対象の `amount` が必要量分減る。0 になったら消滅

### 6-7. 生成物の放出

組立完了時、生成物は Assembler の前方（orientation 方向）に放出される。放出位置は Assembler の位置から orientation 方向に一定距離離れた地点。

### 6-8. レシピ未設定時の挙動

`recipe` が 0（未設定）の Assembler は何もしない。`action_trigger` に 1 が書き込まれても、`recipe` が 0 であれば ASSEMBLE は開始されない。

---

## 7. Processor 仕様

### 7-1. 状態

| 状態 | 説明 |
|------|------|
| **stopped** | 停止中。プログラムを実行しない |
| **running** | 実行中。毎 tick 最大 `INSTRUCTIONS_PER_TICK` 命令を実行 |

### 7-2. 内部メモリ

- サイズ: **1024 ワード**（16bit 符号なし整数 x 1024）
- プログラムとデータが同一メモリ空間に格納される（von Neumann 方式）
- レジスタ: r0〜r7（r0 は常に 0）
- プログラムカウンタ (PC): 初期値 0

### 7-3. 命令セット

v5/v6 の 16bit 命令セットをそのまま使用する。**CHECKPOINT は廃止**。

| 命令 | 説明 |
|------|------|
| ADD, SUB, MUL, DIV, MOD | 算術演算 |
| ADDI | 即値加算 |
| AND, OR, XOR, SHL, SHR | ビット演算 |
| LW, SW | メモリ読み書き |
| LI | 即値ロード |
| IN, OUT | I/O 読み書き |
| BEQ, BNE, BLT, BGE | 分岐（PC 相対、4bit 符号付きオフセット） |
| BEQL, BNEL, BLTL, BGEL | 分岐（PC 相対、16bit 符号付きロングオフセット） |
| JMP | 無条件ジャンプ（PC 相対、16bit 符号付きオフセット） |
| JALR | リンク付きジャンプ（レジスタ値を絶対 PC として扱う — 位置独立ではない） |
| PUSH, POP | スタック操作 |
| HALT | 実行停止（次 tick で PC=0 から再開） |

**位置独立性**: BEQL/BNEL/BLTL/BGEL および JMP の第 2 ワードは、その命令の PC からの符号付き相対オフセット。これによりプログラムはメモリ上のどのアドレスに配置されても動作する（JALR を除く）。

### 7-4. アクション一覧

| アクション | `action_trigger` 値 | 説明 |
|------------|---------------------|------|
| SCAN | 1 | 近接範囲内のオブジェクト一覧を取得する |

SCAN は `action_trigger` に 1 を書き込むと**即座に**実行される（次 tick を待たない）。

### 7-5. 操作メモリレイアウト

| オフセット | 名称 | R/W | 説明 |
|------------|------|-----|------|
| 0 | `current_action` | R | 共通: 現在実行中のアクション（0=なし） |
| 1 | `action_trigger` | W | 共通: アクショントリガー（1=SCAN） |
| 2 | `run_flag` | R/W | 0 = stopped, 1 = running。書き込みで状態遷移 |
| 3 | `scan_filter` | R/W | SCAN 用: 対象フィルタ（後述） |
| 4 | `scan_count` | R | SCAN 用: 結果件数 |
| 5〜36 | `scan_results` | R | SCAN 用: 結果配列（4 ワード/件 x 最大 8 件 = 32 ワード） |

操作メモリサイズ: **37 ワード**

### 7-6. SCAN フィルタ

`scan_filter` の値と対象:

| 値 | 対象 |
|----|------|
| 0 | 全種別 |
| 1 | Assembler のみ |
| 2 | Processor のみ |
| 3 | 材料（Ore, Crystal, Metal, Circuit） |
| 4 | エネルギー |

### 7-7. SCAN 結果のレイアウト

SCAN 実行後、結果が `scan_results` 領域に格納される。最大 8 件、距離の近い順にソート。

各エントリ（4 ワード）:

| オフセット (相対) | 名称 | 説明 |
|-------------------|------|------|
| +0 | `id` | 対象のローカル ID |
| +1 | `type` | 対象のオブジェクト種別 ID（4-5 節参照） |
| +2 | `distance` | 距離（整数） |
| +3 | `aux` | 補助情報（種別依存） |

補助情報 (`aux`) の内容:

- Assembler: `current_action` 値
- Processor: `run_flag` 値
- 材料: 種別 ID
- エネルギー: 格納量

### 7-8. 実行モデル

- 初期状態は **stopped**
- 他の Processor が `run_flag` に 1 を書き込むと **running** に遷移
- running 状態では毎 tick 最大 `INSTRUCTIONS_PER_TICK` 命令を実行する
- HALT に到達すると当該 tick の実行を終了し、次 tick で PC=0 から再開する
- 命令上限に到達した場合、次 tick で中断点から再開する

### 7-9. エネルギーコスト

Processor の tick あたりエネルギーコストは **0**。起動状態になれば常に実行し続けられる。

### 7-10. 複数 Processor の実行順

- 同一 tick ではオブジェクト ID 順で実行される
- 先に実行された Processor の書き込みは後続から即座に観測可能

---

## 8. I/O アドレスマッピング

Processor の IN/OUT 命令で読み書きするアドレス空間。

### 8-1. 自身の状態 (0x0000〜0x00FF)

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x0000 | `SELF_POS_X` | R | 自身の X 座標（整数部） |
| 0x0001 | `SELF_POS_Y` | R | 自身の Y 座標（整数部） |
| 0x0002 | `SELF_TICK` | R | 現在の tick（下位 16bit） |

### 8-2. 自身の操作メモリ (0x0100〜0x01FF)

Processor 自身の操作メモリを I/O 空間経由で読み書きする。

| アドレス | 対応する操作メモリ | R/W |
|----------|---------------------|-----|
| 0x0100 | `current_action` (offset 0) | R |
| 0x0101 | `action_trigger` (offset 1) | W |
| 0x0102 | `run_flag` (offset 2) | R/W |
| 0x0103 | `scan_filter` (offset 3) | R/W |
| 0x0104 | `scan_count` (offset 4) | R |
| 0x0105〜0x0124 | `scan_results` (offset 5〜36) | R |

### 8-3. 外部コンポーネント操作メモリアクセス (0x1000〜0x1FFF)

ローカル ID を指定して、対象コンポーネントの操作メモリを読み書きする。オートインクリメント付き。

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x1000 | `OPMEM_TARGET_ID` | W | 操作対象のローカル ID |
| 0x1001 | `OPMEM_OFFSET` | W | 操作メモリ内のオフセット |
| 0x1002 | `OPMEM_VALUE` | R/W | IN で読み取り / OUT で即座に書き込み |
| 0x1003 | `OPMEM_TARGET_TYPE` | R | 対象のコンポーネント種別（`OPMEM_TARGET_ID` 設定後に読み取り可能） |
| 0x1004 | `OPMEM_AUTO_VALUE` | R/W | 読み書き後、`OPMEM_OFFSET` が自動的に +1 される |

プロトコル（1 ワード単位）:

1. `OPMEM_TARGET_ID` にローカル ID を書き込む
2. `OPMEM_OFFSET` にオフセットを書き込む
3. `OPMEM_VALUE` を IN で読むか OUT で書く

プロトコル（連続書き込み — オートインクリメント）:

1. `OPMEM_TARGET_ID` にローカル ID を書き込む
2. `OPMEM_OFFSET` に開始オフセットを書き込む
3. `OPMEM_AUTO_VALUE` に OUT で書く（→ 書き込み後 `OPMEM_OFFSET` が +1）
4. 3 を繰り返す

### 8-4. 外部 Processor メモリアクセス (0x2000〜0x2FFF)

ローカル ID を指定して、別の Processor の内部メモリ（プログラムメモリ）を読み書きする。オートインクリメント付き。

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x2000 | `PMEM_TARGET_ID` | W | 対象 Processor のローカル ID |
| 0x2001 | `PMEM_ADDR` | W | 対象メモリのアドレス（0〜1023） |
| 0x2002 | `PMEM_VALUE` | R/W | 読み取り / 書き込み値 |
| 0x2003 | `PMEM_AUTO_VALUE` | R/W | 読み取り / 書き込み後、`PMEM_ADDR` が自動的に +1 される |

プロトコル（1 ワード単位）:

1. `PMEM_TARGET_ID` にローカル ID を書き込む
2. `PMEM_ADDR` にアドレスを書き込む
3. `PMEM_VALUE` を IN で読むか OUT で書く

プロトコル（連続コピー — オートインクリメント）:

1. `PMEM_TARGET_ID` にローカル ID を書き込む
2. `PMEM_ADDR` に開始アドレスを書き込む
3. `PMEM_AUTO_VALUE` に OUT で書く（→ 書き込み後 `PMEM_ADDR` が +1）
4. 3 を繰り返す

連続コピーでは 1 ワードあたり 1 命令（OUT）で書き込める。1024 ワード全体のコピーには 1024 + 2（ID + ADDR セットアップ）= 1026 命令が必要。読み取りも同様に `PMEM_AUTO_VALUE` を IN で連続読み取り可能。

### 8-5. ローカル ID の管理

- SCAN 結果に含まれるローカル ID は、そのスキャンを実行した Processor に対して一意
- ローカル ID は tick をまたいで保持される（対象がアクセス可能である限り）
- 対象がアクセス不能になった場合（近接範囲外に出た等）、そのローカル ID は無効になる
- 無効なローカル ID を指定した読み取りは 0 を返す。書き込みは無視される
- ローカル ID テーブルは Processor が破壊されるか、プログラムが明示的に破棄しない限り永続する

### 8-5a. I/O レジスタの永続性

以下の I/O レジスタは tick をまたいで値を保持する（明示的に上書きされるまで変化しない）:

- `OPMEM_TARGET_ID` (0x1000)
- `OPMEM_OFFSET` (0x1001)
- `PMEM_TARGET_ID` (0x2000)
- `PMEM_ADDR` (0x2001)

これにより、tick を跨いだ連続コピー等の操作が自然に動作する。

### 8-6. 複数 Processor のアクセス競合

- 複数 Processor が同一対象に書き込みは**許容**（実行順による後勝ち）
- 実行中の Processor への書き込みも**許容**

---

## 9. レシピテーブル

### 9-1. レシピ一覧

Assembler が生成可能な全生成物と、それに必要な材料の一覧。レシピ ID 0 は**未設定**を表す。

#### 原材料 → 中間生成物

| レシピ ID | 生成物 | 材料 |
|-----------|--------|------|
| 1 | Metal | Ore x 2 |
| 2 | Circuit | Crystal x 2 |

#### 中間生成物 → コンポーネント

| レシピ ID | 生成物 | 材料 |
|-----------|--------|------|
| 3 | Assembler | Metal x 2, Circuit x 1 |
| 4 | Processor | Circuit x 3 |

### 9-2. エネルギーコスト

全てのレシピにおいて、材料に加えてエネルギーが必要。エネルギーも材料と同様に近接範囲内のエネルギーオブジェクトから吸収する。

| レシピ ID | 生成物 | エネルギーコスト |
|-----------|--------|------------------|
| 1 | Metal | （調整） |
| 2 | Circuit | （調整） |
| 3 | Assembler | （調整） |
| 4 | Processor | （調整） |

### 9-3. 組立時間

材料充足後の組立フェーズに要する tick 数。

| レシピ ID | 生成物 | 組立時間 (tick) |
|-----------|--------|-----------------|
| 1 | Metal | （調整） |
| 2 | Circuit | （調整） |
| 3 | Assembler | （調整） |
| 4 | Processor | （調整） |

---

## 10. ゲームループ

```
v7 ゲームループ:

1. 全 running Processor のプログラム実行（オブジェクト ID 順）
   → SCAN は即時実行。操作メモリへの書き込みが確定する
2. Assembler 処理（全 Assembler をオブジェクト ID 順に処理）
   2-1. action_trigger のチェック → 新規 ASSEMBLE の開始 or 再トリガー
   2-2. gathering 中の Assembler: 材料・エネルギーの吸収
   2-3. 材料充足チェック → assembling 遷移
   2-4. assembling 中の Assembler: progress カウントダウン
   2-5. 組立完了 → 生成物放出、状態リセット
   2-6. action_trigger のクリア
3. ランダム移動（全オブジェクト）
4. ワールド境界補正（全オブジェクト）
5. tick++
```

### 10-1. ステップ 1: Processor 実行

各 running Processor について、オブジェクト ID 順に:

- PC が指すアドレスから命令を実行
- HALT または `INSTRUCTIONS_PER_TICK` に達するまで
- SCAN は `action_trigger` 書き込み時に即時実行（結果が即座に操作メモリに反映される）
- 操作メモリへの書き込み（I/O 空間経由）は即座に対象に反映される

### 10-2. ステップ 2: Assembler 処理

全 Assembler をオブジェクト ID 順に処理する:

1. `action_trigger` が 1 であれば:
   - idle 状態: `recipe` が有効値 (1〜4) なら gathering を開始
   - gathering/assembling 状態: 再トリガー処理（6-5 節）
2. gathering 中: 近接範囲内から材料・エネルギーを吸収（6-6 節）
3. 全材料 + エネルギーが充足した場合: assembling に遷移、`assemble_progress` にレシピの組立時間を設定
4. assembling 中: `assemble_progress` を -1
5. `assemble_progress` が 0 になった場合: 生成物を前方に放出、idle に戻る
6. `action_trigger` を 0 にクリア

---

## 11. 自己複製と変異

### 11-1. 自己複製の仕組み

v7 では「キャラクター」が存在しないため、自己複製は以下の協調動作として実現される:

1. Assembler が新しいコンポーネント（Assembler, Processor）を生産する
2. Processor が新しいコンポーネントの操作メモリを設定する（レシピ設定、起動等）
3. Processor が新しい Processor にプログラムメモリをコピーする
4. Processor が新しい Processor を起動する

### 11-2. 近接維持

近接を維持する仕組みは**設けない**。偶然の近接のみに依存する。十分な初期資源で成立を図る。

### 11-3. 変異

- メモリコピーは**完全にノイズなしのコピー**
- システム的な変異メカニズムは存在しない
- 以下の「自然な」変異が発生しうる:
  - メモリコピー完了前に Processor 間の距離が離れ、コピーが不完全
  - 稼働中 Processor へのメモリ書き込みによる予期せぬ動作

---

## 12. 定数一覧

### ワールド定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `WORLD_WIDTH` | ワールドの幅 | （調整） |
| `WORLD_HEIGHT` | ワールドの高さ | （調整） |

### 距離・移動定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `PROXIMITY_RANGE` | 近接判定距離 | （調整） |
| `RANDOM_MOVE_DISTANCE` | ランダム移動の最大距離 | （調整） |
| `SPAWN_OFFSET` | 生成物放出時の Assembler からの距離 | （調整） |

### Assembler 定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `ABSORB_RATE` | 1 tick あたりの各種別吸収上限 | 1 |
| `ASSEMBLY_TIME_1` | レシピ 1 (Metal) の組立時間 | （調整） |
| `ASSEMBLY_TIME_2` | レシピ 2 (Circuit) の組立時間 | （調整） |
| `ASSEMBLY_TIME_3` | レシピ 3 (Assembler) の組立時間 | （調整） |
| `ASSEMBLY_TIME_4` | レシピ 4 (Processor) の組立時間 | （調整） |
| `ASSEMBLY_ENERGY_1` | レシピ 1 のエネルギーコスト | （調整） |
| `ASSEMBLY_ENERGY_2` | レシピ 2 のエネルギーコスト | （調整） |
| `ASSEMBLY_ENERGY_3` | レシピ 3 のエネルギーコスト | （調整） |
| `ASSEMBLY_ENERGY_4` | レシピ 4 のエネルギーコスト | （調整） |

### Processor 定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `INSTRUCTIONS_PER_TICK` | tick あたり最大実行命令数 | 1000 |
| `PROCESSOR_MEMORY_SIZE` | Processor 内部メモリサイズ（ワード数） | 1024 |
| `SCAN_MAX_RESULTS` | SCAN 結果の最大件数 | 8 |

---

## 13. 型定義

```typescript
type Position = { readonly x: number; readonly y: number }

type ObjectTypeId = 0 | 1 | 2 | 10 | 11 | 12 | 13 | 20

// --- オブジェクト種別 ---

type AssemblerObject = {
  readonly id: string
  readonly type: 'Assembler'            // ObjectTypeId = 1
  readonly position: Position
  readonly orientation: number           // v7.0.0 では常に 0
  readonly operationMemory: number[]     // 5 ワード
  // 内部状態（gathering 中の回収済み材料等）
  readonly gathered: {
    readonly ore: number
    readonly crystal: number
    readonly metal: number
    readonly circuit: number
    readonly energy: number
  }
}

type ProcessorObject = {
  readonly id: string
  readonly type: 'Processor'            // ObjectTypeId = 2
  readonly position: Position
  readonly orientation: number           // v7.0.0 では常に 0
  readonly operationMemory: number[]     // 37 ワード
  readonly memory: number[]              // 1024 ワード（プログラムメモリ）
  readonly registers: number[]           // r0〜r7
  readonly pc: number                    // プログラムカウンタ
  readonly localIdTable: Map<number, string>  // tick をまたいで永続
  readonly localIdCounter: number
  readonly ioRegisters: {               // tick をまたいで永続
    readonly opMemTargetId: number
    readonly opMemOffset: number
    readonly pmemTargetId: number
    readonly pmemAddr: number
  }
}

type MaterialType = 'Ore' | 'Crystal' | 'Metal' | 'Circuit'

type MaterialObject = {
  readonly id: string
  readonly type: MaterialType           // ObjectTypeId = 10〜13
  readonly position: Position
  readonly orientation: number           // v7.0.0 では常に 0
  readonly amount: number                // Ore, Crystal のみ使用。Metal, Circuit は常に 1
}

type EnergyObject = {
  readonly id: string
  readonly type: 'Energy'               // ObjectTypeId = 20
  readonly position: Position
  readonly orientation: number           // v7.0.0 では常に 0
  readonly amount: number                // エネルギー格納量
}

type WorldObject = AssemblerObject | ProcessorObject | MaterialObject | EnergyObject

// --- 世界 ---

type World = {
  readonly objects: readonly WorldObject[]
  readonly tick: number
  readonly nextId: number
  readonly width: number
  readonly height: number
}
```
