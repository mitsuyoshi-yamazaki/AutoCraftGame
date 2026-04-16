# ゲームシステム仕様 — v8

本文書はゲーム世界の**法則**を定める。
世界の初期状態は `initial_state.md` で定義する。
Processor の VM は `vm/vm_spec.md` で定義する。

v7 との主な違い:

- **接続 (Connection)** という仕組みを導入。コンポーネント同士が接続された状態を表す
- 接続中のコンポーネント群は **GroupObject** という単一の WorldObject として扱われる（剛体として移動）
- Processor からのアクセス可能性判定に「同じ連結成分内」を追加
- Assembler の ASSEMBLE に接続対象指定を追加。Processor/Assembler に DISCONNECT アクションを追加
- 操作メモリをアクションごとに分離された領域構造に再編
- 外部操作メモリアクセスに **ローカル ID 変換専用 I/O アドレス** を追加

---

## 1. 数値の扱い

- **座標**: 浮動小数点数
- **ゲームロジック量**（エネルギー格納量、資源量、レシピ材料数、組立時間）: **整数**
- **オブジェクト ID**: 16bit 符号なし整数

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

v8 の世界にはシステム上の「キャラクター」概念は存在しない。世界に存在するのは全て**オブジェクト (WorldObject)** であり、以下の種別がある。

| 種別 | 説明 |
|------|------|
| グループ (Group) | 接続状態にある複数のコンポーネントを束ねる剛体オブジェクト |
| コンポーネント | Assembler, Processor |
| 中間生成物 | Metal, Circuit |
| 原材料 | Ore, Crystal |
| エネルギー | エネルギー量を持つ物体 |

全オブジェクトは以下の共通属性を持つ:

| 属性 | 型 | 説明 |
|------|----|------|
| `id` | number | ワールド内で一意な 16bit 符号なし整数 |
| `position` | Position | 現在の座標 |
| `orientation` | number | 向き（度）。v8.0.0 では常に 0（右方向）で固定 |

### 2-3. グループオブジェクト (GroupObject)

**GroupObject** は接続状態にある複数のコンポーネントを 1 つの剛体として扱うためのオブジェクトである。

- 独自の ID と `position` を持つ
- 接続中の全コンポーネント (メンバー) の ID を保持する
- メンバー間の**直接接続エッジ** (無向辺のリスト) を保持する
- メンバーの `position` は常に `(0, 0)`（グループ内のローカル位置であり、v8 では全メンバー同位置）
- メンバーが物理的に「どこに存在するか」は全てグループの `position` を基準に判断される

単体（非接続）のコンポーネントは GroupObject にラップされない。それぞれ独立した WorldObject として自身の `position` を持つ。接続されると、GroupObject にメンバーとして加入し、自身の `position` は `(0, 0)` に設定される。

### 2-4. オブジェクトの統一的表現

```
WorldObject (interface)
├── GroupObject
├── ComponentObject (Assembler, Processor)
├── MaterialObject (Ore, Crystal, Metal, Circuit)
└── EnergyObject
```

コンポーネントは `groupId` フィールドを持ち、グループに属する場合はそのグループ ID、単体なら `null` を保持する。

### 2-5. ランダム移動

- **単体のオブジェクト**（非接続コンポーネント、材料、エネルギー）は毎 tick 個別にランダム移動する
- **グループオブジェクト**は毎 tick 単一オブジェクトとして 1 回だけランダム移動する（メンバーは動かず、グループの `position` のみが動く）
- 移動は決定論的でなくてよい
- 移動距離の最大値は定数 `RANDOM_MOVE_DISTANCE` で定める

### 2-6. ワールド境界

矩形範囲外にはみ出したオブジェクトは、最も近いワールド内の位置に補正される（クランプ）。グループオブジェクトも 1 つのオブジェクトとして補正される（メンバーは自動的に追随）。

```
x = clamp(x, 0, width)
y = clamp(y, 0, height)
```

### 2-7. 衝突

v8.0.0 では衝突判定を**省略する**。全てのオブジェクトは互いに衝突せず、重なりを許容する。

---

## 3. 距離判定とアクセス可能性

### 3-1. 距離関数

```
distance(a, b) = sqrt((a.x - b.x)² + (a.y - b.y)²)
```

### 3-2. コンポーネントの実効位置

コンポーネントに対する距離計算では、**グループに属していればグループの位置、単体なら自身の位置**を用いる。

```
effective_position(c) = c.groupId ? groups[c.groupId].position : c.position
```

### 3-3. 近接の定義

2 つのコンポーネントの実効位置のユークリッド距離が **近接距離 (`PROXIMITY_RANGE`)** 以下であるとき、「近接している」とする。近接距離は全アクション・全コンポーネント種別で**一律**。

### 3-4. アクセス可能性

Processor または Assembler から他のオブジェクト (target) へのアクセス可能性は、次のいずれかを満たすとき成立する:

1. **近接**: 自身と target が近接している（3-3 節）
2. **連結成分**: 自身と target が同じ GroupObject に属している

アクセス可能なオブジェクトに対してのみ、SCAN 結果への出現・操作メモリアクセス・プログラムメモリアクセスが可能。

### 3-5. 近接の用途

- Assembler が材料・エネルギーを周囲から吸収する範囲（コンポーネントではなく材料/エネルギー相手なので近接のみ）
- Processor の SCAN の対象範囲
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
- `groupId` を持ち、グループに属する場合はそのグループ ID を保持する

### 4-5. グループ (GroupObject)

- 独自の ID と `position` を持つ
- `members`: メンバーのコンポーネント ID の配列
- `edges`: メンバー間の直接接続エッジ（無向辺のリスト、各辺は 2 つの ID の組）
- メンバーが 0 個になった場合、GroupObject は世界から消滅する
- 操作メモリを持たない（Processor の I/O で直接アクセスすることはない）

### 4-6. オブジェクト種別 ID

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
| 30 | Group |

---

## 5. 接続

### 5-1. 接続とは

接続はコンポーネント同士を繋ぐ無向の論理的エッジである。接続されたコンポーネント群は 1 つの GroupObject として扱われる。

- 接続は Assembler の ASSEMBLE アクションによってのみ生成される（単独の CONNECT プリミティブは存在しない）
- 接続は Assembler/Processor の DISCONNECT アクションによってのみ削除される
- 1 つのコンポーネントが持てる接続数に**上限はない**

### 5-2. 連結成分

GroupObject.members と GroupObject.edges によって定義される無向グラフの**連結成分は常に GroupObject そのもの**である。すなわち、1 つの GroupObject 内の全メンバーは任意のメンバーから辿り着ける。

DISCONNECT によって連結性が失われた場合（エッジ削除で 2 つの連結成分に分離する場合）、GroupObject は**自動的に 2 つに分裂する**（5-4 節）。

### 5-3. 接続の生成

Assembler が ASSEMBLE でコンポーネント（Assembler または Processor）を生産する際、操作メモリの `connection_target_id` スロットに接続対象のコンポーネント ID を指定できる。

生成物の取り出し時 (ejection):

1. `connection_target_id` に有効な ID が指定されていて、かつその対象が Assembler からアクセス可能である（3-4 節）場合、生成物は対象と直接接続される
2. そうでない場合、生成物は非接続で Assembler の正面に配置される

接続成立時のグループ遷移:

- 対象がグループに属している場合: 生成物はそのグループに加入（`memberIds` と `edges` に追加）
- 対象が単体（非接続）の場合: 新しい GroupObject を作成し、Assembler の接続対象 (= その単体) と生成物の両方をメンバーに追加、エッジを追加。新グループの `position` は対象の `position` を引き継ぐ
- 対象が Assembler 自身 (self) の場合: self が単体なら新グループを作成、self がグループに属していれば生成物をそのグループに加入させる

### 5-4. 接続の削除

DISCONNECT アクションは、それを受けたコンポーネントの直接接続エッジを 1 本削除する。

実行手順:

1. アクションを受けたコンポーネント (受信側) と引数で指定された対象 (引数側) の間に**直接エッジ**があるかを確認する
2. 無ければ何もしない（no-op）
3. あれば: `edges` からそのエッジを削除し、削除後に連結成分を再計算する
4. 連結成分が依然 1 つであれば GroupObject の構造は維持される
5. 2 つに分裂した場合:
    - 元の GroupObject にはどちらか一方の連結成分が残る
    - もう一方は新しい GroupObject として独立する（`position` は元のグループの `position` を引き継ぐ）
    - 各連結成分のサイズが 1 の場合、その単一メンバーは単体 WorldObject に戻る（GroupObject は消滅する）
6. 各メンバーの `groupId` は適切に更新される

### 5-5. 接続のコスト

接続の生成・削除には**エネルギーコストはかからない**。

---

## 6. コンポーネント共通仕様: 操作メモリ

### 6-1. 概要

各コンポーネントは**操作メモリ (operation memory)** を持つ。これはそのコンポーネントを操作するための外部インターフェースである。

- コンポーネント種別ごとに**固定長**
- Processor がアクセス可能な（3-4 節）コンポーネントの操作メモリに対して読み書きを行う

### 6-2. 領域分離の原則

v8 では、各アクションは操作メモリ上の**専用の領域**を占有する。複数のアクションが同時に実行される可能性がある場合、それぞれの引数・状態スロットは独立した領域を持つ。

各アクション領域は独自の `trigger` スロット（W）を持つ。このスロットに 1 を書き込むことで当該アクションがトリガーされる。`trigger` スロットはアクション処理後に自動的に 0 にクリアされる。

複数のアクションのトリガーが同一 tick で書き込まれた場合、それぞれは独立に処理される（ただし同時実行不能な組み合わせはコンポーネント種別ごとに仕様で定める）。

### 6-3. 操作メモリの可読性

Processor はアクセス可能な対象コンポーネントの操作メモリを**全て読み取り可能**。特定のスロットは書き込み専用または読み書き可能。

---

## 7. Assembler 仕様

### 7-1. 状態

Assembler は ASSEMBLE アクションに関して以下の状態を持つ:

| 状態 | `assemble_status` 値 | 説明 |
|------|---------------------|------|
| **idle** | 0 | ASSEMBLE を実行していない |
| **gathering** | 1 | 材料・エネルギー回収中 |
| **assembling** | 2 | 材料充足。組立中（残り n tick） |

### 7-2. アクション一覧

| アクション | 領域 | 説明 |
|------------|------|------|
| ASSEMBLE | ASSEMBLE 領域 | レシピに従い材料を回収し、生成物を組み立てる |
| DISCONNECT | DISCONNECT 領域 | 自身に接続している特定のコンポーネントとのエッジを 1 本削除する |

ASSEMBLE と DISCONNECT は**同時実行可能**（独立した領域で独立に処理される）。ASSEMBLE 実行中に DISCONNECT をトリガーしても ASSEMBLE は中断されない。

### 7-3. 操作メモリレイアウト

| オフセット | 名称 | R/W | 説明 |
|------------|------|-----|------|
| **ASSEMBLE 領域** | | | |
| 0 | `assemble_trigger` | W | ASSEMBLE トリガー（1=開始）。処理後にクリア |
| 1 | `recipe` | R/W | レシピ ID（1〜4）。0 = 未設定 |
| 2 | `connection_target_id` | R/W | 生成物を接続する対象のコンポーネント ID。0 = 非接続 |
| 3 | `assemble_status` | R | 0 = idle, 1 = gathering, 2 = assembling |
| 4 | `assemble_progress` | R | 組立フェーズの残り tick 数 |
| 5 | `last_product_id` | R/W | 最後に生成したコンポーネントの ID。トリガー時に 0 クリア、ejection 時に書き込み。プログラム側からも明示的に書き換え可能（前回値の手動クリア等のため） |
| **DISCONNECT 領域** | | | |
| 6 | `disconnect_trigger` | W | DISCONNECT トリガー（1=実行）。処理後にクリア |
| 7 | `disconnect_target_id` | R/W | 切断対象のコンポーネント ID |

操作メモリサイズ: **8 ワード**

### 7-4. ASSEMBLE 動作フロー

```
[idle] (assemble_status = 0)
  ↓  assemble_trigger に 1 が書き込まれた AND recipe が有効値 (1〜4)
  ↓  last_product_id を 0 クリア
[gathering] (assemble_status = 1)
  毎 tick: 近接範囲内の材料オブジェクト・エネルギーオブジェクトから必要量を吸収
  ↓  全材料 + エネルギーが充足
[assembling] (assemble_status = 2)
  残り tick 数をカウントダウン
  ↓  assemble_progress = 0
  生成物を生成
  接続対象の到達可能性を確認し、接続可能なら接続、不可能なら非接続で前方に配置
  last_product_id に生成物の ID を書き込み
[idle]
```

### 7-5. gathering/assembling 中の再トリガー

ASSEMBLE が実行中（gathering または assembling）に再度 `assemble_trigger` に 1 が書き込まれた場合:

1. `last_product_id` を 0 クリア
2. レシピが変更されていれば、新しいレシピの材料リストを確定
3. 回収済みの材料・エネルギーのうち、新レシピに**不要なもの**を近接範囲に放出
4. 新レシピの gathering を開始する（必要量から回収済み分を差し引いた残りを回収）

レシピが同一の場合でも、再トリガーにより gathering がリスタートされる（進行中の assembling はキャンセルされる）。

### 7-6. 材料吸収の詳細

- 毎 tick、近接範囲内の材料オブジェクト・エネルギーオブジェクトを走査する
- 必要な種別の材料/エネルギーが見つかれば、**1 tick あたり各種別 1 単位**を吸収する
  - 吸収速度上限はパラメータ `ABSORB_RATE` で調整可能
- 原材料オブジェクト (Ore, Crystal): 対象の `amount` が 1 減る。0 になったら消滅
- 中間生成物 (Metal, Circuit): 1 オブジェクト = 1 単位。吸収されたら消滅
- エネルギーオブジェクト: 対象の `amount` が必要量分減る。0 になったら消滅

吸収時の「近接範囲」は Assembler の実効位置（グループに属していればグループ位置）を基準に判定する。

### 7-7. 生成物の放出と接続

組立完了時の処理:

1. `connection_target_id` を読み取る
2. **接続対象の到達可能性判定**:
    - 指定された ID のオブジェクトが存在し、Assembler からアクセス可能（3-4 節）であれば「到達可能」
    - ID が 0 または無効、あるいは到達不能であれば「非接続」
3. **接続可能な場合**:
    - 新しい生成物を作成し、接続対象のグループに加入させる（5-3 節）
    - 生成物の `position` は `(0, 0)`（ローカル位置）
4. **非接続の場合**:
    - 生成物を Assembler の前方（orientation 方向）に配置する
    - Assembler 自身がグループに属している場合、生成物は**グループの位置**を基準として配置される
5. `last_product_id` に生成物の ID を書き込む
6. 状態を idle に戻す

### 7-8. DISCONNECT 動作

`disconnect_trigger` に 1 が書き込まれると、次の Component action phase（10 節）で実行される:

1. `disconnect_target_id` の値を読み取る
2. Assembler がグループに属していなければ no-op
3. グループの `edges` に `{Assembler.id, disconnect_target_id}` のエッジが存在するか確認
4. 存在すれば 5-4 節に従いエッジを削除し連結成分を再計算
5. 存在しなければ no-op

`disconnect_trigger` は処理後にクリアされる。

### 7-9. レシピ未設定時の挙動

`recipe` が 0（未設定）の Assembler に `assemble_trigger` が書き込まれても ASSEMBLE は開始されない。

---

## 8. Processor 仕様

### 8-1. 状態

| 状態 | 説明 |
|------|------|
| **stopped** | 停止中。プログラムを実行しない |
| **running** | 実行中。毎 tick 最大 `INSTRUCTIONS_PER_TICK` 命令を実行 |

### 8-2. 内部メモリ

- サイズ: **1024 ワード**（16bit 符号なし整数 x 1024）
- プログラムとデータが同一メモリ空間に格納される（von Neumann 方式）
- メモリ空間は**循環的**（どのアドレスにも「始点」や「原点」としての特権はなく、アドレス計算は常に mod 1024 で行われる）
- レジスタ: r0〜r7（r0 は常に 0）
- プログラムカウンタ (PC): 初期値 0

#### 8-2a. 基準アドレスについて

循環メモリには本来「原点」は存在しないが、システム実装上はいずれかのワードを「基準点」として表現する必要がある。本仕様では、この基準点を**アドレス 0** と呼ぶ。v7 と同じ扱い。

### 8-3. 命令セット

v7 と同一。LABEL/JMPL/LWL/SWL を含む 16bit 命令セット。

v7 の `docs/specs/game_spec.md` 7-3 節および 7-3a 節を参照。

### 8-4. アクション一覧

| アクション | 領域 | 説明 |
|------------|------|------|
| SCAN | SCAN 領域 | 近接範囲内（非接続）のオブジェクト一覧を取得 |
| CONNECTION_SCAN | CONNECTION_SCAN 領域 | 同グループ内の他メンバー一覧を取得 |
| DISCONNECT | DISCONNECT 領域 | 自身に直接接続している特定のコンポーネントとのエッジを削除 |

SCAN と CONNECTION_SCAN は `*_trigger` 書き込み時に**即座に**実行される（同一 tick 内で結果が観測可能）。

DISCONNECT はトリガー後、次の Component action phase で物理状態を変更する。

### 8-5. 操作メモリレイアウト

| オフセット | 名称 | R/W | 説明 |
|------------|------|-----|------|
| **共通領域** | | | |
| 0 | `run_flag` | R/W | 0 = stopped, 1 = running |
| **SCAN 領域** | | | |
| 1 | `scan_trigger` | W | 1=実行。即時実行・自動クリア |
| 2 | `scan_filter` | R/W | 対象フィルタ（8-6 節） |
| 3 | `scan_count` | R | 結果件数 |
| 4〜35 | `scan_results` | R | 結果配列（4 ワード × 最大 8 件） |
| **CONNECTION_SCAN 領域** | | | |
| 36 | `cscan_trigger` | W | 1=実行。即時実行・自動クリア |
| 37 | `cscan_filter` | R/W | 対象フィルタ（8-6 節） |
| 38 | `cscan_count` | R | 結果件数 |
| 39〜70 | `cscan_results` | R | 結果配列（4 ワード × 最大 8 件） |
| **DISCONNECT 領域** | | | |
| 71 | `disconnect_trigger` | W | 1=実行。次の Component action phase で処理 |
| 72 | `disconnect_target_id` | R/W | 切断対象のコンポーネント ID |

操作メモリサイズ: **73 ワード**

### 8-6. SCAN / CONNECTION_SCAN フィルタ

`scan_filter` / `cscan_filter` の値と対象:

| 値 | 対象 |
|----|------|
| 0 | 全種別 |
| 1 | Assembler のみ |
| 2 | Processor のみ |
| 3 | 材料（Ore, Crystal, Metal, Circuit） |
| 4 | エネルギー |

CONNECTION_SCAN では対象が自グループのメンバーに限定されるため、コンポーネント種別 (1, 2) のフィルタのみ意味を持つ。

### 8-7. SCAN の対象範囲

SCAN は「**近接範囲内にあり、かつ自身と同じグループに属していない**」オブジェクトを返す。

- 自身が単体の場合: 自身の `position` を基準に近接範囲内を走査
- 自身がグループに属している場合: グループの `position` を基準に近接範囲内を走査
- 結果から**同グループのメンバーは除外**される（CONNECTION_SCAN で取得する）
- 結果は距離の近い順にソート、最大 `SCAN_MAX_RESULTS` 件

### 8-8. CONNECTION_SCAN の対象範囲

CONNECTION_SCAN は「**自身と同じ GroupObject に属する他のメンバー**」を返す。

- 自身が単体（グループに属していない）場合: 結果は 0 件
- 自身がグループに属している場合: グループの `members` から自身を除いた全メンバー
- 距離は常に 0（全メンバーは同位置）
- 結果は ID 昇順にソート、最大 `SCAN_MAX_RESULTS` 件（これを超えるメンバー数の場合は先頭 8 件のみ返す）

### 8-9. SCAN / CONNECTION_SCAN 結果のレイアウト

各エントリ (4 ワード):

| オフセット (相対) | 名称 | 説明 |
|-------------------|------|------|
| +0 | `id` | 対象のローカル ID |
| +1 | `type` | 対象のオブジェクト種別 ID（4-6 節） |
| +2 | `distance` | 距離（整数） |
| +3 | `aux` | 補助情報（種別依存） |

補助情報 (`aux`) の内容:

- Assembler: `assemble_status` 値
- Processor: `run_flag` 値
- 材料: 種別 ID
- エネルギー: 格納量

### 8-10. DISCONNECT 動作

Assembler の 7-8 節と同じ。引数 `disconnect_target_id` のコンポーネントと自身の直接エッジを削除する。該当エッジが無ければ no-op。

### 8-11. 実行モデル

- 初期状態は **stopped**
- 他の Processor が `run_flag` に 1 を書き込むと **running** に遷移
- running 状態では毎 tick 最大 `INSTRUCTIONS_PER_TICK` 命令を実行する
- HALT に到達すると当該 tick の残り命令の実行をスキップする。PC は HALT の次のワードへ進み、次 tick ではそこから実行を継続する（PC は 0 にリセットされない）
- 命令上限に到達した場合、次 tick で中断点から再開する

### 8-12. エネルギーコスト

Processor の tick あたりエネルギーコストは **0**。

### 8-13. 複数 Processor の実行順

- 同一 tick ではオブジェクト ID 順で実行される
- 先に実行された Processor の書き込みは後続から即座に観測可能（ただし DISCONNECT の物理効果は Component action phase まで遅延）

---

## 9. I/O アドレスマッピング

Processor の IN/OUT 命令で読み書きするアドレス空間。

### 9-1. 自身の状態 (0x0000〜0x00FF)

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x0000 | `SELF_POS_X` | R | 自身の実効位置 X 座標（整数部） |
| 0x0001 | `SELF_POS_Y` | R | 自身の実効位置 Y 座標（整数部） |
| 0x0002 | `SELF_TICK` | R | 現在の tick（下位 16bit） |
| 0x0003 | `SELF_GROUP_ID` | R | 自身が属するグループの ID。単体なら 0 |

自身の実効位置: グループに属していればグループの `position`、単体なら自身の `position`（3-2 節）。

### 9-2. 自身の操作メモリ (0x0100〜0x01FF)

Processor 自身の操作メモリを I/O 空間経由で読み書きする。

`0x0100 + offset` の形式で 8-5 節の操作メモリに直接アクセスする。上限はレイアウトのサイズ (73 ワード)。

### 9-3. 外部コンポーネント操作メモリアクセス (0x1000〜0x1FFF)

ローカル ID を指定して、アクセス可能な（3-4 節）コンポーネントの操作メモリを読み書きする。

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x1000 | `OPMEM_TARGET_ID` | W | 操作対象のローカル ID |
| 0x1001 | `OPMEM_OFFSET` | W | 操作メモリ内のオフセット |
| 0x1002 | `OPMEM_VALUE` | R/W | 生の値を IN で読み取り / OUT で即座に書き込み |
| 0x1003 | `OPMEM_TARGET_TYPE` | R | 対象のコンポーネント種別（4-6 節） |
| 0x1004 | `OPMEM_AUTO_VALUE` | R/W | 0x1002 と同じく生の値を扱う。読み書き後 `OPMEM_OFFSET` が自動的に +1 |
| 0x1005 | `OPMEM_VALUE_LOCAL_ID` | R/W | ローカル ID 変換付きの値アクセス（9-5 節） |

プロトコル（1 ワード単位）:

1. `OPMEM_TARGET_ID` にローカル ID を書き込む
2. `OPMEM_OFFSET` にオフセットを書き込む
3. `OPMEM_VALUE` を IN で読むか OUT で書く

プロトコル（連続書き込み — オートインクリメント）:

1. `OPMEM_TARGET_ID` にローカル ID を書き込む
2. `OPMEM_OFFSET` に開始オフセットを書き込む
3. `OPMEM_AUTO_VALUE` に OUT で書く（→ 書き込み後 `OPMEM_OFFSET` が +1）
4. 3 を繰り返す

### 9-4. 外部 Processor メモリアクセス (0x2000〜0x2FFF)

v7 と同一。対象 Processor のアクセス可能性判定は v8 の拡張ルール（近接 OR 同グループ）を用いる。

| アドレス | 名称 | R/W | 説明 |
|----------|------|-----|------|
| 0x2000 | `PMEM_TARGET_ID` | W | 対象 Processor のローカル ID |
| 0x2001 | `PMEM_ADDR` | W | 対象メモリ上の、基準点からのオフセット（0〜1023） |
| 0x2002 | `PMEM_VALUE` | R/W | 読み取り / 書き込み値 |
| 0x2003 | `PMEM_AUTO_VALUE` | R/W | 読み取り / 書き込み後、`PMEM_ADDR` が自動的に +1 される |

### 9-5. ローカル ID 変換 I/O (`OPMEM_VALUE_LOCAL_ID`)

`0x1005 OPMEM_VALUE_LOCAL_ID` は、**書き手のローカル ID 空間と書き込まれる側のローカル ID 空間を橋渡しする**ための特殊スロットである。

#### 9-5-1. 書き込み (OUT)

書き込み値を書き手自身のローカル ID として扱い、次の変換を行う:

1. 書き手の `localIdTable[value]` を引き、対応する **内部オブジェクト ID** (objectId) を得る
2. 書き手のテーブルに該当エントリが無ければ**書き込みを無視**する
3. 書き込まれる側のコンポーネントが Processor の場合: 書き込まれる側の `localIdTable` に `objectId` を登録し（既登録ならそのローカル ID を再利用）、得られたローカル ID を書き込まれる側の opmem の指定オフセットに格納する
4. 書き込まれる側が Assembler の場合: `objectId` をそのまま opmem の指定オフセットに格納する（Assembler はローカル ID テーブルを持たず、opmem の ID スロットには内部オブジェクト ID をそのまま保存する）

#### 9-5-2. 読み取り (IN)

書き込まれる側の opmem の指定オフセットに格納された値を **読み手のローカル ID 空間に変換** して返す:

1. 書き込まれる側が Processor の場合: opmem スロットの値はその Processor の localId。まずその Processor の `localIdTable[slot_value]` を引いて objectId を得る
2. 書き込まれる側が Assembler の場合: opmem スロットの値がそのまま objectId
3. 得られた objectId を、読み手の `localIdTable` に登録し（既登録ならそのローカル ID を再利用）、得られたローカル ID を返り値とする
4. 変換経路のどこかで解決に失敗した場合は 0 を返す

#### 9-5-3. 生値アクセスとの関係

`OPMEM_VALUE_LOCAL_ID` 以外の経路（`OPMEM_VALUE`, `OPMEM_AUTO_VALUE`）で ID スロットを書き換えると、生の値がそのまま格納される。これは受け手のシステムでは解釈できない値になる可能性がある（プログラムの責任）。

#### 9-5-4. 自動インクリメント版

`OPMEM_VALUE_LOCAL_ID` の auto-increment 版は v8 では提供しない（必要に応じて将来追加）。

### 9-6. ローカル ID の管理

- ローカル ID は Processor ごとに独自の名前空間を持つ
- ローカル ID テーブルは tick をまたいで**永続**する
- SCAN、CONNECTION_SCAN、`OPMEM_VALUE_LOCAL_ID` の読み取りを通じて新しい objectId が登場した時、未登録であれば新しいローカル ID が割り当てられる
- 対象がアクセス不能になった場合（アクセス可能性判定 3-4 節を満たさなくなった）、そのローカル ID を指定した操作は 0 を返すか無視される。ただしテーブルのエントリ自体は残り、アクセス可能性が回復すれば再び有効になる
- テーブルは Processor が破壊されるか、プログラムが明示的に破棄しない限り永続する

### 9-7. I/O レジスタの永続性

以下の I/O レジスタは tick をまたいで値を保持する（明示的に上書きされるまで変化しない）:

- `OPMEM_TARGET_ID` (0x1000)
- `OPMEM_OFFSET` (0x1001)
- `PMEM_TARGET_ID` (0x2000)
- `PMEM_ADDR` (0x2001)

### 9-8. 複数 Processor のアクセス競合

- 複数 Processor が同一対象に書き込みは**許容**（実行順による後勝ち）
- 実行中の Processor への書き込みも**許容**
- DISCONNECT トリガーの競合: 複数 Processor が同一 tick で同一対象の `disconnect_trigger` に書き込んだ場合、最後の書き込みに対応する 1 件のみが Component action phase で処理される

---

## 10. レシピテーブル

v7 と同一。

### 10-1. レシピ一覧

| レシピ ID | 生成物 | 材料 |
|-----------|--------|------|
| 1 | Metal | Ore x 2 |
| 2 | Circuit | Crystal x 2 |
| 3 | Assembler | Metal x 2, Circuit x 1 |
| 4 | Processor | Circuit x 3 |

### 10-2. エネルギーコスト・組立時間

（調整）。`ASSEMBLY_ENERGY_n`、`ASSEMBLY_TIME_n` 定数で管理。

---

## 11. ゲームループ

```
v8 ゲームループ:

1. 全 running Processor のプログラム実行（オブジェクト ID 順）
   → SCAN, CONNECTION_SCAN, 操作メモリ書き込みは即時反映
   → DISCONNECT トリガーは記録のみ（物理効果は遅延）
2. Component action phase
   2-1. 全 Processor の DISCONNECT トリガーを処理（ID 順）
   2-2. 全 Assembler の DISCONNECT トリガーを処理（ID 順）
   2-3. 全 Assembler の ASSEMBLE 処理（ID 順、gathering/assembling 進行、trigger 反応、生成物 ejection、connection 成立）
3. ランダム移動（全 GroupObject + 全単体オブジェクト）
4. ワールド境界補正
5. tick++
```

### 11-1. ステップ 1: Processor 実行

各 running Processor について、オブジェクト ID 順に:

- PC が指すアドレスから命令を実行
- HALT または `INSTRUCTIONS_PER_TICK` に達するまで
- SCAN / CONNECTION_SCAN は `*_trigger` 書き込み時に即時実行（結果が即座に操作メモリに反映される）
- 操作メモリへの書き込み（I/O 空間経由）は即座に対象に反映される
- DISCONNECT トリガーの書き込みはスロットに記録されるのみ（実処理はステップ 2）

### 11-2. ステップ 2: Component action phase

Processor 実行フェーズで書き込まれた DISCONNECT トリガーと、既存の Assembler ASSEMBLE 状態を処理する。

2-1. 全 Processor の `disconnect_trigger` が 1 のものを ID 順に処理:
- 5-4 節の手順で直接エッジを削除・連結成分再計算
- `disconnect_trigger` をクリア

2-2. 全 Assembler の `disconnect_trigger` が 1 のものを ID 順に処理 (同上)

2-3. 全 Assembler をオブジェクト ID 順に ASSEMBLE 処理:

1. `assemble_trigger` が 1 であれば:
   - idle 状態: `recipe` が有効値 (1〜4) なら gathering を開始、`last_product_id` を 0 クリア
   - gathering/assembling 状態: 再トリガー処理（7-5 節）
2. gathering 中: 近接範囲内から材料・エネルギーを吸収（7-6 節）
3. 全材料 + エネルギーが充足した場合: assembling に遷移
4. assembling 中: `assemble_progress` を -1
5. `assemble_progress` が 0 になった場合: 7-7 節に従い生成物を放出・接続・`last_product_id` 更新、idle に戻る
6. `assemble_trigger` を 0 にクリア

### 11-3. ステップ 3: ランダム移動

- 全 GroupObject: グループ単位で 1 回ランダム移動
- 全単体のコンポーネント・材料・エネルギー: 個別にランダム移動
- グループのメンバー自体は動かない（`position = (0,0)` のまま）

---

## 12. 自己複製と変異

### 12-1. 自己複製の仕組み（参考シナリオ）

v8 の「接続」を利用した典型的な自己複製シナリオ:

初期状態: 親 Assembler と親 Processor が接続された 1 つの GroupObject。親 Processor は running 状態でプログラムを実行中。

1. 親 Processor は CONNECTION_SCAN で親 Assembler のローカル ID を取得する
2. 親 Processor が親 Assembler の操作メモリを設定し、ASSEMBLE（レシピ 4: Processor, `connection_target_id` = 親 Assembler 自身）をトリガー
3. 組立完了後、`last_product_id` から生成物 (child Processor) の ID をローカル ID 変換付きで読み取る
4. 親 Processor が親 Assembler に再度 ASSEMBLE（レシピ 3: Assembler, `connection_target_id` = child Processor）をトリガー
5. 組立完了後、`last_product_id` から child Assembler の ID を取得
6. 親 Processor が child Processor の内部メモリに自身のプログラムをコピー（PMEM 経由）
7. 親 Processor が child Processor の `run_flag` を 1 に設定して起動
8. 親 Processor が親 Assembler の `disconnect_target_id` に child Processor を設定し、DISCONNECT をトリガー
9. 次の Component action phase で連結成分が分裂し、{親 A, 親 P} と {child P, child A} の 2 グループに分離

### 12-2. 近接維持

近接を維持する仕組みは**設けない**。接続中は物理的に同じ位置（グループ位置）にいるため分離の心配はないが、分離後は個別にランダム移動し、偶然の近接のみに依存する。

### 12-3. 変異

- メモリコピーは**完全にノイズなしのコピー**
- システム的な変異メカニズムは存在しない
- 以下の「自然な」変異が発生しうる:
  - メモリコピー完了前に接続が切れ、対象へアクセス不能となりコピーが不完全
  - 稼働中 Processor へのメモリ書き込みによる予期せぬ動作
  - ドリフトアウトによるプログラム破壊

---

## 13. 定数一覧

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
| `ASSEMBLY_TIME_1〜4` | 各レシピの組立時間 | （調整） |
| `ASSEMBLY_ENERGY_1〜4` | 各レシピのエネルギーコスト | （調整） |

### Processor 定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `INSTRUCTIONS_PER_TICK` | tick あたり最大実行命令数 | 10000 |
| `PROCESSOR_MEMORY_SIZE` | Processor 内部メモリサイズ（ワード数） | 1024 |
| `SCAN_MAX_RESULTS` | SCAN / CONNECTION_SCAN 結果の最大件数 | 8 |

---

## 14. 型定義

```typescript
type Position = { readonly x: number; readonly y: number }

// --- グループ ---

type GroupObject = {
  readonly id: number
  readonly kind: 'group'
  readonly position: Position
  readonly orientation: number           // v8.0.0 では常に 0
  readonly memberIds: readonly number[]
  readonly edges: readonly (readonly [number, number])[]  // 無向辺
}

// --- オブジェクト種別 ---

type AssemblerObject = {
  readonly id: number
  readonly kind: 'assembler'
  readonly position: Position            // グループ所属時は (0, 0)
  readonly orientation: number           // v8.0.0 では常に 0
  readonly groupId: number | null        // 所属グループ ID or null
  readonly operationMemory: readonly number[]     // 8 ワード
  readonly phase: 'idle' | 'gathering' | 'assembling'
  readonly recipe: number
  readonly gatherProgress: Readonly<Record<string, number>>
  readonly gatheredEnergy: number
  readonly assembleTicksRemaining: number
}

type ProcessorObject = {
  readonly id: number
  readonly kind: 'processor'
  readonly position: Position            // グループ所属時は (0, 0)
  readonly orientation: number           // v8.0.0 では常に 0
  readonly groupId: number | null        // 所属グループ ID or null
  readonly operationMemory: readonly number[]     // 73 ワード
  readonly running: boolean
  readonly memory: readonly number[]     // 1024 ワード
  readonly registers: readonly number[]  // r0〜r7
  readonly pc: number
  readonly localIdTable: ReadonlyMap<number, number>  // localId → objectId (v8: numeric)
  readonly localIdCounter: number
  readonly ioRegisters: {
    readonly opMemTargetId: number
    readonly opMemOffset: number
    readonly pmemTargetId: number
    readonly pmemAddr: number
  }
}

type MaterialType = 'Ore' | 'Crystal' | 'Metal' | 'Circuit'

type MaterialObject = {
  readonly id: number
  readonly kind: 'material'
  readonly position: Position
  readonly orientation: number
  readonly materialType: MaterialType
  readonly amount: number
}

type EnergyObject = {
  readonly id: number
  readonly kind: 'energy'
  readonly position: Position
  readonly orientation: number
  readonly amount: number
}

type WorldObject = GroupObject | AssemblerObject | ProcessorObject | MaterialObject | EnergyObject

// --- 世界 ---

type World = {
  readonly objects: readonly WorldObject[]
  readonly tick: number
  readonly nextObjectId: number
  readonly width: number
  readonly height: number
}
```
