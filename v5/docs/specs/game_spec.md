# ゲームシステム仕様 — v5

本文書はゲーム世界の**法則**（物理ルール）を定める。
世界の初期状態は `initial_state.md` で定義する。
キャラクタープログラムのVMは `vm/vm_spec.md` で定義する。

---

## 1. 数値の扱い

- **物理量**（座標、速度、力、加速度、質量、半径）: **浮動小数点数**
- **ゲームロジック量**（エネルギー、耐久度、資源remaining、インベントリ数量）: **整数**

丸め規則: 消費は切り上げ(ceil)、獲得は切り捨て(floor)。ゲームロジック量にのみ適用。

---

## 2. 物理モデル

### 2-1. 座標系

ワールドは連続な2次元平面。

```
Position = { x: number, y: number }   // 浮動小数点数
```

原点 (0, 0) はワールドの左上角。x軸は右方向、y軸は下方向を正とする。
ワールドには有限の矩形範囲 `(0, 0)` - `(width, height)` があり、周囲は壁オブジェクトで囲われる（2-6節）。

### 2-2. 速度

**キャラクターのみ**が速度を持つ。ResourceNode, EnergyNode, Remains, 壁は位置が固定。

```
Velocity = { vx: number, vy: number }  // 浮動小数点数
```

初期値は `{ vx: 0, vy: 0 }`。

### 2-3. 力と加速度

```
加速度 = 力 / 質量
```

1tickの間に複数の力が作用する場合、全ての力のベクトル和を求めてから加速度を算出する。

### 2-4. 質量

キャラクターの質量は、保有する全ての物質を原料換算した合計値。

```
質量 = Σ(コンポーネントの原料換算) + Σ(インベントリの原料換算)
```

**エネルギーは質量に寄与しない。**

#### 原料換算表

原料（Layer 0）:

| アイテム | 原料換算 |
|---------|---------|
| Ore | 1 |
| Crystal | 1 |

加工素材（Layer 1）:

| アイテム | レシピ | 原料換算 |
|---------|--------|---------|
| Metal | Ore ×2 | 2 |
| Circuit | Crystal ×2 | 2 |

コンポーネント（Layer 2）:

| コンポーネント | レシピ | 原料換算 |
|---------------|--------|---------|
| Frame | Metal ×3 | 6 |
| Actuator | Metal ×1 + Circuit ×1 | 4 |
| Sensor | Circuit ×2 | 4 |
| Processor | Circuit ×3 | 6 |
| Harvester | Metal ×2 | 4 |
| Assembler | Metal ×2 + Circuit ×1 | 6 |
| Disassembler | Metal ×2 + Circuit ×1 | 6 |
| Charger | Metal ×1 + Circuit ×2 | 6 |
| MemoryCore | Circuit ×2 | 4 |

ASSEMBLEにはコンポーネントが必須であり、質量0のキャラクターは生成できない。ゼロ除算は発生しない。

### 2-5. 摩擦

全キャラクターに一様な摩擦力がかかる。

```
摩擦力 = -velocity × FRICTION_COEFFICIENT × 質量
```

速度に比例した粘性摩擦。毎tickの物理更新で他の力と合わせて適用される。

### 2-6. ワールド境界

ワールドの周囲は4つの壁線分（上壁、下壁、左壁、右壁）で囲われる。壁は無限の質量を持つ不動オブジェクト。衝突判定と同じ仕組みで反発力が作用する。

### 2-7. 衝突判定

全ゲームオブジェクト（Character, ResourceNode, EnergyNode, Remains, 壁）は衝突対象。各オブジェクトは種別ごとに固定の半径を持つ。

```
衝突判定: 2オブジェクト間のユークリッド距離 < 両者の半径の和 → 衝突
```

#### 衝突応答

```
重なり量 = (半径A + 半径B) - distance(A, B)
重なり量 > 0 のとき:
  反発力の方向 = A→B の単位ベクトル
  反発力の大きさ = 重なり量 × COLLISION_STIFFNESS
```

- 固定オブジェクト（ResourceNode, EnergyNode, Remains, 壁）: キャラクター側にのみ力が作用
- キャラクター同士: 双方に反対方向の反発力

#### オブジェクト半径

| オブジェクト種別 | 半径定数 |
|-----------------|---------|
| Character | `CHARACTER_RADIUS` |
| ResourceNode | `RESOURCE_NODE_RADIUS` |
| EnergyNode | `ENERGY_NODE_RADIUS` |
| Remains | `REMAINS_RADIUS` |

---

## 3. 距離判定

### 3-1. 距離関数

```
distance(a, b) = sqrt((a.x - b.x)² + (a.y - b.y)²)
```

### 3-2. アクション距離

全てのアクションの対象は、実行者との距離が `INTERACT_RANGE` 以下であることが前提条件。

| アクション | 前提条件 |
|-----------|---------|
| HARVEST | distance ≤ INTERACT_RANGE のResourceNode |
| RECHARGE | distance ≤ INTERACT_RANGE のEnergyNode |
| DISASSEMBLE | distance ≤ INTERACT_RANGE のRemains |
| WRITE | distance ≤ INTERACT_RANGE の対象キャラクター |
| ACTIVATE | distance ≤ INTERACT_RANGE の対象キャラクター |

### 3-3. 対象の選択順

距離内に同種の対象が複数存在する場合:
1. 距離が最も近いものを選択
2. 距離が同一の場合はID順

---

## 4. MOVEアクション

### 4-1. 概要

指定方向に一定の力を加えるアクション。実際の移動は物理シミュレーションにより決定される。

### 4-2. 方向指定

VMプログラムがActuatorスロットのdirectionフィールドに角度（0-359の整数）を書き込む。

```
0度: 右（+x方向）
90度: 下（+y方向）
180度: 左（-x方向）
270度: 上（-y方向）
```

### 4-3. 力の適用

```
力ベクトル = MOVE_FORCE × (cos(direction°), sin(direction°))
加速度 = 力ベクトル / 質量
```

軽いキャラクターは大きく加速し、重いキャラクターは小さく加速する。

### 4-4. エネルギーコスト

一定値 `ENERGY_COST_MOVE`。方向・質量によらず固定。

### 4-5. MOVEの失敗

エネルギーが十分であれば常に成功する。衝突による移動不能は物理的な結果であり、アクション失敗ではない。

---

## 5. その他のアクション

### 5-1. HARVEST

- 前提: Harvesterコンポーネント保持、distance ≤ INTERACT_RANGE のResourceNode
- 動作: 対象ノードから資源を採取しインベントリに追加
- 対象選択: ローカルID指定時はそのノード、未指定(0)時は3-3節に従い最近接を選択
- 枯渇したResourceNodeは即座に除去

### 5-2. RECHARGE

- 前提: Chargerコンポーネント保持、distance ≤ INTERACT_RANGE のEnergyNode
- 動作: 対象ノードからエネルギーを取得
- 対象選択: ローカルID指定時はそのノード、未指定(0)時は3-3節に従い最近接を選択

### 5-3. PROCESS

- 前提: Assemblerコンポーネント保持
- 動作: インベントリの原料を加工素材に変換
- レシピ:
  - Metal: Ore × 2 → Metal × 1
  - Circuit: Crystal × 2 → Circuit × 1

### 5-4. CRAFT

- 前提: Assemblerコンポーネント保持
- 動作: インベントリの加工素材をコンポーネントに変換

コンポーネントレシピ:

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

### 5-5. ASSEMBLE

- 前提: Assemblerコンポーネント保持、必要コンポーネントがインベントリにある
- 動作: 子キャラクターを生成する

#### コンポーネント構成の指定

AssemblerスロットのI/Oフィールドに各コンポーネント種別の個数を書き込む。

#### 子の配置

1. 親の速度ベクトルと逆方向にSPAWN_DISTANCE離れた位置を第一候補
2. 速度が0の場合、0度（右方向）を第一候補
3. 衝突する場合、90度ずつ回転して計4方向試行
4. 全方向で衝突 → ASSEMBLE失敗

#### 子の初期状態

- inactive（VMは未起動、PC=0、全レジスタ=0、全メモリ=0）
- 速度: {vx: 0, vy: 0}
- インベントリ: 空
- エネルギー: ASSEMBLE_ENERGY_TRANSFER
- 耐久値: Frame数 × FRAME_DURABILITY
- species: 親のspeciesを継承

#### 返り値

ASSEMBLEのcommand書き込み時に、子のローカルIDが結果領域に即時格納される。

### 5-6. WRITE

- 前提: Processorコンポーネント保持、対象が存在しINTERACT_RANGE内、対象がMemoryCoreを持つ
- 動作: 自身のメモリの指定範囲を、対象のメモリの指定位置にブロックコピー
- 引数: target_id（ローカルID）, src_addr, dst_addr, length
- エネルギーコスト: 基本コスト + ceil(length × WRITE_COST_PER_WORD)
- メモリラッピング: 自身・対象ともにアドレスはメモリサイズでラップする

### 5-7. ACTIVATE

- 前提: Processorコンポーネント保持、対象が存在しINTERACT_RANGE内、対象がinactive
- 動作: 対象のVMを起動（PC=0から実行開始）
- 対象: ローカルIDで指定

**制約**: WRITEとACTIVATEは同一Processorスロットを使用するため、同一tick内で両方を予約できない（後の予約が前の予約を上書きする）。子の生成フローは ASSEMBLE+WRITE → HALT → ACTIVATE の順で2tickにまたがる。

### 5-8. REPAIR

- 前提: Assemblerコンポーネント保持
- 動作: 耐久値を回復（Frame数 × FRAME_DURABILITY を上限）
- エネルギーコスト: 固定

### 5-9. DISASSEMBLE

- 前提: Disassemblerコンポーネント保持、distance ≤ INTERACT_RANGE のRemains
- 動作: 残骸からコンポーネント/素材を回収（流出あり）
- 対象: ローカルIDで指定

#### コンポーネント別流出テーブル

| コンポーネント | CRAFTレシピ | 流出 | グリッド変換 | キャラクター受取 |
|--------------|------------|------|-------------|----------------|
| Frame | Metal×3 | Metal×1 | ore += 2 | Metal×2 |
| Actuator | Metal×1, Circuit×1 | Metal×1 | ore += 2 | Circuit×1 |
| Sensor | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |
| Processor | Circuit×3 | Circuit×1 | crystal += 2 | Circuit×2 |
| Harvester | Metal×2 | Metal×1 | ore += 2 | Metal×1 |
| Assembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Disassembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Charger | Metal×1, Circuit×2 | Circuit×1 | crystal += 2 | Metal×1, Circuit×1 |
| MemoryCore | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |

流出先はRemains位置のGroundGridセル。生リソース（Ore, Crystal）と加工素材（Metal, Circuit）のDISASSEMBLEには流出なし。

### 5-10. SENSE

- 前提: Sensorコンポーネント保持
- 動作: **即時実行**（アクション予約ではない）。世界に影響を与えないため
- 結果: 近い順に最大4件の概要情報（type, angle, distance）
- フィルタ: 対象種別を絞り込み可能
- 検知範囲: SENSE_RANGE
- 自分自身は結果に含まれない
- 詳細は [vm/vm_spec.md](vm/vm_spec.md) セクション7-2（Sensorスロット）参照

---

## 6. 死亡と残骸

### 6-1. 残骸の生成

キャラクター死亡時（耐久値 ≤ 0）にその位置に残骸が生成される。残骸は固定オブジェクト。死亡キャラクターの速度は残骸に引き継がれない。残骸は生成時のtickを `createdAt` として記録する。

### 6-2. 残骸と衝突

残骸は半径を持つ固定オブジェクト。キャラクターとの衝突判定が行われ、キャラクター側にのみ反発力が作用する。

### 6-3. 地面グリッド（GroundGrid）

ワールドを 1×1 の内部グリッドに分割し、地面に染み込んだ物質量を追跡する。

```
GroundCell = { ore: number, crystal: number }
```

- グリッドサイズ: `floor(width) × floor(height)` セル
- 初期値: 全セル `{ ore: 0, crystal: 0 }`
- セル座標: `cellX = min(floor(x), gridWidth - 1)`, `cellY = min(floor(y), gridHeight - 1)`

### 6-4. 残骸の地面吸収

`REMAINS_ABSORPTION_TICKS` tick 経過した残骸は消滅し、全内容物がGroundGridに吸収される。

#### 物質変換ルール（全量ロスなし）

| 元のアイテム | グリッドへの変換 |
|---|---|
| Ore | ore += 1 |
| Crystal | crystal += 1 |
| Metal | ore += 2 |
| Circuit | crystal += 2 |
| コンポーネント | CRAFTレシピ逆算 → Metal/Circuit → Ore/Crystal |

inventory も components も同一ルールで変換。吸収先はRemains位置のグリッドセル。

### 6-5. リソースノード再生

グリッド全セルをラスタースキャン順（y=0,x=0 → y=max,x=max）で走査。各セルのムーア近傍（9セル）の ore/crystal 合計を独立に評価する。

- ore 合計 ≥ `NODE_REGENERATION_THRESHOLD` → OreNode 生成
- crystal 合計 ≥ `NODE_REGENERATION_THRESHOLD` → CrystalNode 生成
- 両方同時に生成可能

#### 生成されるノードの属性

- `remaining`: 9セルの該当リソース合計値
- `position`:
  - OreNode: `(cellX + 0.5 + 0.2, cellY + 0.5)`
  - CrystalNode: `(cellX + 0.5, cellY + 0.5 + 0.2)`

ノード生成後、9セルの該当リソースを0にクリア。境界セルは存在するセルのみで合計。既存オブジェクトとの重複は許容（衝突判定で押し出される）。走査順は固定のため処理は決定論的。

---

## 7. キャラクタープログラム

キャラクターの行動はVMにより決定される。VMの仕様は [vm/vm_spec.md](vm/vm_spec.md) を参照。

### 7-1. active / inactive

- **active**: VMが起動している状態。毎tickプログラムが実行される
- **inactive**: VMが未起動の状態。プログラムは実行されない
- ASSEMBLEで生成された子はinactive
- ACTIVATEでactiveに遷移
- activeからinactiveへの遷移は存在しない

### 7-2. species

キャラクター生成時に設定され、ASSEMBLEの際に親から子へ継承される。
初期キャラクターのspeciesはプログラム定義ファイルのname属性から決定される。

### 7-3. 反射 (reflexes)

プログラムを介さない**自動的な生存行動**。プログラムが破損して何も指示できない状態でも最低限の生存活動を継続できるようにするための、ゲーム法則として一律に適用される機構。

#### 反射の種類

| 反射 | 発火条件 | 効果 |
|------|--------|------|
| **auto-recharge** | `energy < reflexEnergyThreshold` かつ `interactRange` 内に `EnergyNode` が存在し、かつ当tickに `RECHARGE` 予約がない かつ `Charger` を所持している | 最寄りの `EnergyNode` に対して `RECHARGE` を実行 |
| **auto-repair** | `durability < reflexDurabilityThreshold` かつ `inventory` に `Frame` を持ち、かつ当tickに `REPAIR` 予約がない かつ `Assembler` を所持している | `REPAIR` を実行 |

#### 反射の挙動仕様

- **タイミング**: VM実行直後・アクション実行前に、反射条件を満たすキャラクターに対して合成 `ActionReservation` を追加する
- **競合**: プログラムが既に同種のアクションを予約している場合、反射は発火しない
- **コスト**: 反射により発行されるアクションのエネルギーコストは通常アクションと同額
- **失敗**: 反射で生成された予約も通常の予約と同じ失敗判定を受ける（範囲外、コンポーネント不在等で失敗しうる）
- **記録**: 反射が発火したキャラクターは `TickResult.reflexHits` に記録される
- **対象範囲**: 反射は `auto-recharge` と `auto-repair` の 2 種類のみ。移動・収穫・複製などの戦略的行動は反射の対象としない

#### パラメータ

| パラメータ | デフォルト | 意味 |
|----------|----------|------|
| `reflexEnergyThreshold` | 200 | この値未満で `auto-recharge` が発火する |
| `reflexDurabilityThreshold` | 300 | この値未満で `auto-repair` が発火する |

### 7-4. アポトーシス (apoptosis)

機能不全に陥ったキャラクターを**自発的に死亡させる**機構。リソースの無駄な消費を防ぎ、集団内のターンオーバーを促進する。

#### 検出条件

以下のいずれかが満たされた場合、キャラクターは機能不全と判定され、当tickの死亡判定で死亡する。

| 条件 | 意味 |
|------|------|
| **idle 連続 N tick** | `apoptosisIdleTickLimit` tick 連続でアクション予約がゼロ（反射含めて何も発行していない） |
| **instruction limit 連続 M tick** | `apoptosisInstrLimitTickLimit` tick 連続で `instructionsPerTick` 上限に到達（無限ループ） |

#### カウンタの更新ルール

各キャラクターは 2 つのカウンタを持つ:
- `idleTickCount`: アクション予約があれば 0 にリセット、なければ +1
- `instrLimitTickCount`: 命令上限到達で +1、HALT 達成で 0 にリセット

両カウンタは tick 間で保持される。

#### 死亡フロー

機能不全と判定されたキャラクターは以下の処理を受ける:
1. `durability` を 0 に設定
2. ステップ 9 (死亡判定) で通常死亡として処理される（残骸生成、`character_died` イベント発火）
3. `TickResult.apoptosisDeaths` に ID が記録される (通常死との識別用)

通常死とアポトーシス死は残骸生成等の挙動は同一。違いは `apoptosisDeaths` セットによる識別のみ。

#### 反射との関係

反射 (7-3) によって発行されるアクション予約も「アクション予約あり」としてカウントされる。したがって、反射でかろうじて生存している個体は idle カウンタが 0 にリセットされ、アポトーシスしない。

これは階層的な生存戦略を表現する:
- M1 (CHECKPOINT): PC 迷走からの回復
- M2 (反射): 完全破損下での最低限の自律機能
- M3 (アポトーシス): 反射すら効かない個体の除去

#### パラメータ

| パラメータ | デフォルト | 意味 |
|----------|----------|------|
| `apoptosisIdleTickLimit` | 500 | idle 連続tick数の閾値 |
| `apoptosisInstrLimitTickLimit` | 300 | instruction limit 連続tick数の閾値 |

### 7-5. 有性生殖 (sexual reproduction)

2 親のメモリを **block 交互** で混合して子のメモリを構築する機構。プログラムが `cross_write` 組み込み関数を呼ぶことで使用する。集団遺伝学的多様性の維持と劣性致死変異の遮蔽を可能にする。

#### CROSS_WRITE の動作

`cross_write(target, parent2, src_addr, dst_addr, length)` を呼び出すと、Processor スロットに `CROSS_WRITE` 予約が登録される。実行時:

1. 親A (caller) が Processor を所持していることを確認
2. 子 (`target` ローカルID) を解決し、`interactRange` 内かつ MemoryCore 所持を確認
3. 親B (`parent2` ローカルID) を解決し、`interactRange` 内であることを確認
4. `length` ワードを以下のルールでコピー:
   - 各 word の index `i` について、`block = floor(i / crossWriteBlockSize)`
   - `block` が偶数なら親Aの `(src_addr + i)` から、奇数なら親Bの `(src_addr + i)` から読み込む
   - 子の `(dst_addr + i)` に書き込み (アドレスは対象メモリサイズでラップ)

```
親A メモリ:  [aaaa aaaa aaaa aaaa ...]
親B メモリ:  [bbbb bbbb bbbb bbbb ...]
                ↓ (block_size=4)
子 メモリ:    [aaaa bbbb aaaa bbbb ...]
              ←4→  ←4→  ←4→  ←4→
```

#### 制約と挙動

- **距離**: 親A-子 と 親A-親B の両方が `interactRange` 内である必要がある
- **親B の同意**: 不要 (caller が能動的に取得)
- **親B の状態**: active / inactive どちらでも可
- **親B の種族**: 制限なし (異種族交配可。互換性はプログラム側の責任)
- **エネルギーコスト**: `energyCosts.CROSS_WRITE` (基本コスト) + `length × crossWriteCostPerWord`
- **失敗条件**: Processor 不在 (`MISSING_COMPONENT`)、親B/子の解決失敗 (`INVALID_TARGET`)、距離範囲外 (`OUT_OF_RANGE`)、子に MemoryCore 不在 (`INVALID_TARGET`)
- **既存 WRITE との関係**: `CROSS_WRITE` は新規アクションであり、既存の `write_memory` (1 親) は変更されない

#### パラメータ

| パラメータ | デフォルト | 意味 |
|----------|----------|------|
| `crossWriteBlockSize` | 64 | 交互ブロックの幅 (word) |
| `crossWriteCostPerWord` | 0 | ワードあたりのエネルギーコスト |
| `energyCosts.CROSS_WRITE` | 20 | 基本エネルギーコスト |

#### 進化的意義

- 1 親の致死的破損が他親により遮蔽される
- 異なる進化系統の遺伝子の組み合わせ
- 集団内の遺伝的多様性の維持
- 子のコンポーネント構成は親A の `assemble` 引数で決まる (混合されるのはメモリのみ)

---

## 8. ゲームループ

```
v5 ゲームループ:

1.  EnergyNodeのエネルギー生産
2.  全activeキャラクターのVM実行（最大 INSTRUCTIONS_PER_TICK 命令）
    → アクション予約が確定する（SENSEのみ即時実行）
2.5 反射の注入（7-3節）
    各キャラクターについて、反射条件を満たし、かつプログラムが
    対応するアクションを予約していない場合、合成 ActionReservation を追加
3.  予約されたアクションの一括実行
    - 実行順: キャラクターIDの昇順
    - 異なる種別: 同時実行可能
    - 同一コンポーネントスロットへの複数予約: 最後の予約のみ有効
    - MOVE: 力の蓄積（物理更新で適用）
    - HARVEST/RECHARGE: ローカルID指定時はその対象、未指定時は最近接対象に対して実行
    - DISASSEMBLE/WRITE/ACTIVATE: ローカルIDで指定した対象に対して実行
    - PROCESS/CRAFT/ASSEMBLE/REPAIR: 実行
    - エネルギーチェック、消費、失敗ペナルティ
4.  摩擦力の算出（全キャラクター）
5.  衝突判定と反発力の算出（全オブジェクトペア）
6.  物理更新（力の合成 → 加速度 → 速度更新 → 位置更新）
7.  エネルギー基礎代謝の適用（加齢代謝係数を含む）
8.  耐久度自然減衰（全キャラクター -1）
8.5 アポトーシス判定（7-4節）
    各キャラクターのカウンタを更新し、機能不全条件を満たすキャラの
    durability を 0 に設定（次ステップで死亡）
9.  死亡判定（耐久度 ≤ 0 → 残骸生成 + キャラクター除去）
10. 残骸の地面吸収（6-4節）
11. リソースノード再生（6-5節）
12. tick++
```

### 8-1. ステップ2: VM実行

各activeキャラクターについて:
- PCが指すアドレスから命令を実行
- HALTまたはINSTRUCTIONS_PER_TICKに達するまで
- アクション予約はI/Oスロットへの書き込みで行われる
- SENSEはcommand書き込み時に即時実行（予約ではない）

### 8-2. ステップ3: アクション実行

- 実行順: キャラクターIDの昇順
- 同一対象への複数WRITE: 実行順に書き込み、後勝ち
- ASSEMBLE失敗時: その子のローカルIDを使う後続アクションも失敗
- アクション未予約でもNOOPコストは発生しない

#### アクション実行結果

各アクションの実行結果は成否（boolean）と、失敗時の理由（ActionFailureReason）を記録する。

```typescript
type ActionFailureReason =
  | 'INSUFFICIENT_ENERGY'
  | 'MISSING_COMPONENT'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'OUT_OF_RANGE'
  | 'MISSING_ITEMS'
  | 'INVALID_RECIPE'
  | 'NO_SPAWN_POSITION'
  | 'TARGET_ALREADY_ACTIVE'
  | 'EMPTY_REMAINS';

interface ActionRecord {
  readonly op: ActionOp;
  readonly success: boolean;
  readonly reason?: ActionFailureReason;  // 失敗時のみ
}
```

失敗理由の判定は以下の優先順で行う:

1. **INSUFFICIENT_ENERGY** — エネルギー不足（基本コスト未満）
2. **MISSING_COMPONENT** — 必要コンポーネント未保持（Actuator, Harvester, Charger, Assembler, Processor, Disassembler, Sensor）
3. **INVALID_TARGET** — ローカルID解決失敗、無効なレシピID、無効なコンポーネントID
4. **TARGET_NOT_FOUND** — 対象オブジェクトが存在しない（距離内に対象なし含む）
5. **OUT_OF_RANGE** — 対象が存在するが INTERACT_RANGE 外
6. **MISSING_ITEMS** — レシピの材料不足、ASSEMBLE用コンポーネント不足
7. **INVALID_RECIPE** — レシピが見つからない
8. **NO_SPAWN_POSITION** — ASSEMBLE時に配置可能な位置がない
9. **TARGET_ALREADY_ACTIVE** — ACTIVATE対象が既にactive
10. **EMPTY_REMAINS** — DISASSEMBLE対象の残骸が空

### 8-3. エネルギーコスト

各アクションにはエネルギーコストが設定されている。エネルギー不足の場合、アクションは失敗し、コストの一定割合（失敗ペナルティ）を支払う。

WRITEのコスト: `基本コスト + ceil(length × WRITE_COST_PER_WORD)`

### 8-4. 物理更新の詳細（Step 4-6）

```
Step 4: 摩擦力
  friction_force = -velocity × FRICTION_COEFFICIENT × mass

Step 5: 衝突判定
  全オブジェクトペアについて:
    overlap = (radiusA + radiusB) - distance(A, B)
    if overlap > 0:
      direction = normalize(B.position - A.position)
      force = overlap × COLLISION_STIFFNESS × direction

Step 6: 物理更新
  total_force = move_force + friction_force + collision_forces
  acceleration = total_force / mass
  velocity += acceleration
  position += velocity
  // 速度クランプ（オプション）
  if |velocity| < VELOCITY_CLAMP_THRESHOLD:
    velocity = { vx: 0, vy: 0 }
```

### 8-5. 加齢代謝（Step 7）

```
age = currentTick - character.createdAt

age ≤ AGING_THRESHOLD_N の場合:
  coefficient = 1.0
age > AGING_THRESHOLD_N の場合:
  coefficient = 1 + ((age - AGING_THRESHOLD_N) / (AGING_THRESHOLD_M - AGING_THRESHOLD_N))²
```

適用:
```
加齢後コンポーネント代謝 = ceil(コンポーネント代謝合計 × coefficient)
インベントリ代謝 = アイテム数 × INVENTORY_METABOLISM_PER_ITEM
エネルギー蓄積代謝 = floor((max(0, energy - THRESHOLD))² / SCALE)
総代謝 = 加齢後コンポーネント代謝 + インベントリ代謝 + エネルギー蓄積代謝
```

加齢代謝係数はコンポーネント代謝にのみ適用。

---

## 9. 定数一覧

### 物理定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| MOVE_FORCE | MOVEで加える力の大きさ | (調整) |
| FRICTION_COEFFICIENT | 摩擦係数 | (調整) |
| COLLISION_STIFFNESS | 衝突反発力のバネ定数 | (調整) |
| INTERACT_RANGE | アクション実行可能距離 | (調整) |
| SPAWN_DISTANCE | ASSEMBLE時の子の配置距離 | (調整) |
| SENSE_RANGE | SENSEの探知半径 | 10 |
| VELOCITY_CLAMP_THRESHOLD | 速度0クランプ閾値 | (調整) |

### オブジェクト半径

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| CHARACTER_RADIUS | キャラクターの衝突半径 | (調整) |
| RESOURCE_NODE_RADIUS | ResourceNodeの衝突半径 | (調整) |
| ENERGY_NODE_RADIUS | EnergyNodeの衝突半径 | (調整) |
| REMAINS_RADIUS | Remainsの衝突半径 | (調整) |

### 物質循環定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| REMAINS_ABSORPTION_TICKS | 残骸吸収までのtick数 | 300 |
| NODE_REGENERATION_THRESHOLD | ノード再生閾値 | 80 |

### 加齢代謝定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| AGING_THRESHOLD_N | 加齢代謝猶予tick数 | 3000 |
| AGING_THRESHOLD_M | 代謝2倍になるtick数 | 6000 |

### VM関連定数

| 定数名 | 意味 | 暫定値 |
|--------|------|--------|
| INSTRUCTIONS_PER_TICK | tickあたり最大実行命令数 | 100000 |
| MEMORYCORE_WORDS | MemoryCore 1個あたりのメモリワード数 | 1024 |
| WRITE_COST_PER_WORD | WRITEの1ワードあたり追加コスト | 0 |

---

## 10. 型定義

```
Position = { x: number, y: number }
Velocity = { vx: number, vy: number }
GroundCell = { ore: number, crystal: number }

ComponentType =
  | 'Frame' | 'Actuator' | 'Harvester' | 'Charger'
  | 'Assembler' | 'Processor' | 'Sensor'
  | 'Disassembler' | 'MemoryCore'

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
  active: boolean
  memory: number[]         // VMメモリ（MemoryCore依存サイズ）
  registers: number[8]     // VMレジスタ r0-r7
  pc: number               // プログラムカウンタ
  localIdTable: Map<number, string>
  localIdCounter: number
}

Remains = {
  id: string
  position: Position
  components: ComponentType[]
  inventory: Inventory
  createdAt: number
}

World = {
  characters: Character[]
  resourceNodes: ResourceNode[]
  energyNodes: EnergyNode[]
  remains: Remains[]
  groundGrid: GroundCell[]
  tick: number
  nextId: number
}
```
