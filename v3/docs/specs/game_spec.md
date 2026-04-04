# ゲームシステム仕様 — v3（連続空間物理モデル）

本文書はv2の `docs/specs/game_spec.md` に対する変更差分を定義する。
記載のない仕様はv2を踏襲する。

本文書はゲーム世界の**法則**（物理ルール）を定める。世界の初期状態は `initial_state.md` で定義する。

---

## 1. 数値の扱い

v2では「全ての数値は整数」としていたが、v3ではこれを以下のように区分する。

- **物理量**（座標、速度、力、加速度、質量、半径）: **浮動小数点数**
- **ゲームロジック量**（エネルギー、耐久度、資源remaining、インベントリ数量）: **整数**（v2と同一）

ゲームロジック量が整数であるのは、資源やエネルギーの計算に浮動小数点誤差を入れないためである。物理量は連続的な値を扱う性質上、浮動小数点数を使用する。

v2の丸め規則（消費:ceil, 獲得:floor）はゲームロジック量にのみ適用される。

---

## 2. 物理モデル（新規）

v3では、ゲーム世界に物理シミュレーションを導入する。

### 2-1. 座標系

ワールドは連続な2次元平面である。

```
Position = { x: number, y: number }   // 浮動小数点数
```

原点 (0, 0) はワールドの左上角とする。x軸は右方向、y軸は下方向を正とする。

ワールドには有限の矩形範囲 `(0, 0)` - `(width, height)` があり、周囲は壁オブジェクトで囲われる（2-6節を参照）。

### 2-2. 速度

**キャラクターのみ**が速度を持つ。ResourceNode, EnergyNode, Remains, 壁は位置が固定であり、速度を持たない。

```
Velocity = { vx: number, vy: number }  // 浮動小数点数
```

Character型に `velocity: Velocity` フィールドを追加する。初期値は `{ vx: 0, vy: 0 }`。

### 2-3. 力と加速度

キャラクターに力を加えると、質量に応じた加速度が発生する。

```
加速度 = 力 / 質量
```

力は各tickの物理更新ステップで適用される。1tickの間に複数の力が作用する場合（MOVEによる推力 + 摩擦 + 衝突反発力）、全ての力のベクトル和を求めてから加速度を算出する。

### 2-4. 質量

キャラクターの質量は、そのキャラクターが保有する全ての物質を**原料（Ore, Crystal）の個数**に換算した合計値で決まる。

```
質量 = Σ(コンポーネントの原料換算) + Σ(インベントリの原料換算)
```

**エネルギーは質量に寄与しない**（質量0）。

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
| Register | Circuit ×1 | 2 |

#### 最小構成キャラクターの質量例

MIN_COMPONENTS（Frame, Actuator, Sensor, Processor, Harvester, Assembler, Charger, MemoryCore）のみ、インベントリ空の場合:

```
Frame(6) + Actuator(4) + Sensor(4) + Processor(6) + Harvester(4)
+ Assembler(6) + Charger(6) + MemoryCore(4) = 40
```

インベントリに素材を持つほど質量が増加し、加速しにくくなる。

> **設計意図**: 質量が構成と所持品に依存することで、「軽量で素早いが脆い個体」と「重装備で遅いが堅牢な個体」のトレードオフが物理的に生じる。v2のExplorer（1 Frame, 軽量）とSurvivor（2 Frame, 重装備）の戦略差が、移動速度の差としても表現される。

> **備考**: ASSEMBLEにはコンポーネントリストが必須であり、コンポーネント0のキャラクターは仕様上生成できない。したがって質量が0になるケースは発生せず、ゼロ除算の考慮は不要である。

### 2-5. 摩擦

全キャラクターに一様な摩擦力がかかる。摩擦力は速度と逆方向に作用し、無限加速を防ぐ。

```
摩擦力 = -velocity × FRICTION_COEFFICIENT × 質量
```

これは速度に比例した抵抗力（粘性摩擦）である。毎tickの物理更新で他の力と合わせて適用される。

`FRICTION_COEFFICIENT` が大きいほど速やかに減速する。

> **備考: 摩擦に関する設計上の懸念**
>
> 摩擦係数の値は慎重な調整が必要である。以下の懸念が存在する:
>
> 1. **摩擦が強すぎる場合**: キャラクターがほとんど移動できなくなる。MOVEで力を加えても即座に減速し、1tickあたりの移動距離が極めて小さくなる。結果として、資源ノードやエネルギーノードに到達するまでに多数のtickとエネルギーを消費し、自己複製が現実的でなくなる可能性がある
>
> 2. **摩擦が弱すぎる場合**: キャラクターが容易に高速化し、アクション実行に必要な「対象との距離 ≤ INTERACT_RANGE」の条件を満たしにくくなる。ノード付近を通り過ぎてしまい、HARVEST/RECHARGE等が困難になる。また、衝突が頻繁かつ高エネルギーで発生し、制御が難しくなる
>
> 3. **停止の難しさ**: 摩擦のみでは完全な停止（速度0）に漸近的に近づくが到達しない。HARVEST/RECHARGE等の距離判定を満たすために、キャラクターが対象の近くで「振動」する可能性がある。これを防ぐには、速度が極めて小さい場合に0にクランプする閾値（`VELOCITY_CLAMP_THRESHOLD`）の導入が有効かもしれない
>
> 4. **質量との相互作用**: 重いキャラクター（多コンポーネント・多インベントリ）は加速しにくいが、摩擦力も質量に比例するため減速も同程度になる。ただし、MOVEの力が一定（質量非依存）であるため、重いキャラクターは軽いキャラクターより最高速度が低くなる。このバランスが自己複製サイクルに与える影響を検証する必要がある
>
> 初期値は実装後にシミュレーションを実行して調整する。

### 2-6. ワールド境界

ワールドの周囲は不動の壁オブジェクトで囲われる。

壁は矩形の辺を構成する4つの線分（上壁、下壁、左壁、右壁）として表現する。壁に接近したキャラクターには、通常の衝突判定と同じ仕組みで反発力が作用する。

壁は無限の質量を持つ不動オブジェクトとして扱い、衝突によって壁が動くことはない。

### 2-7. 衝突判定

全てのゲームオブジェクト（Character, ResourceNode, EnergyNode, Remains, 壁）は衝突対象である。各オブジェクトは種別ごとに固定の半径を持つ。

```
衝突判定: 2つのオブジェクト間のユークリッド距離が、両者の半径の和より小さい場合、衝突している
```

#### 衝突応答

衝突が検出された場合、重なりの大きさに応じた反発力が発生する。

```
重なり量 = (半径A + 半径B) - distance(A, B)
重なり量 > 0 のとき:
  反発力の方向 = A→B の単位ベクトル（Bから見るとB→Aの方向）
  反発力の大きさ = 重なり量 × COLLISION_STIFFNESS
```

`COLLISION_STIFFNESS` はバネ定数に相当する。大きいほど硬い衝突（重なりが小さく解決が速い）、小さいほど柔らかい衝突（一時的に重なりが残るが計算が安定）。

反発力は物理更新の力の合成に含められる。

- **固定オブジェクト**（ResourceNode, EnergyNode, Remains, 壁）: 反発力を受けても動かない。力はキャラクター側にのみ作用する
- **キャラクター同士**: 双方に反対方向の反発力が作用する

> **備考**: この方式では、1tickの間に完全に重なりが解消されない場合がある（特にCOLLISION_STIFFNESSが低い場合）。計算量を優先し、厳密な非貫通は保証しない。

#### オブジェクト半径

| オブジェクト種別 | 半径定数 |
|-----------------|---------|
| Character | `CHARACTER_RADIUS` |
| ResourceNode | `RESOURCE_NODE_RADIUS` |
| EnergyNode | `ENERGY_NODE_RADIUS` |
| Remains | `REMAINS_RADIUS` |

各半径の具体的な値は実装後に調整する。

---

## 3. 距離判定の変更

v2では「隣接タイル」を基準としていた各種判定を、v3では**ユークリッド距離**による距離閾値に変更する。

### 3-1. 距離関数

```
distance(a, b) = sqrt((a.x - b.x)² + (a.y - b.y)²)
```

v2のチェビシェフ距離は廃止する。

### 3-2. アクション距離

アクションの対象は、実行者と対象オブジェクトの中心間ユークリッド距離が `INTERACT_RANGE` 以下であることを前提条件とする。

| アクション | v2の前提 | v3の前提 |
|-----------|---------|---------|
| HARVEST | 隣接タイルのResourceNode | distance ≤ INTERACT_RANGE のResourceNode |
| RECHARGE | 隣接タイルのEnergyNode | distance ≤ INTERACT_RANGE のEnergyNode |
| DISASSEMBLE | 隣接タイルのRemains | distance ≤ INTERACT_RANGE のRemains |
| WRITE | 隣接タイルのInactiveCharacter | distance ≤ INTERACT_RANGE のInactiveCharacter |
| ACTIVATE | 隣接タイルのInactiveCharacter | distance ≤ INTERACT_RANGE のInactiveCharacter |

### 3-3. 対象の選択順

距離内に同種の対象が複数存在する場合:

1. 距離が最も近いものを選択する
2. 距離が同一の場合は、**ID順**（ResourceNode/EnergyNodeは位置の辞書順、Remainsは生成順、Characterはキャラクター ID順）で最初のものを選択する

v2の「N→S→E→W→NE→NW→SE→SW 順」は廃止する。

### 3-4. nearby条件

Program の `nearby` 条件は、ユークリッド距離で判定する。

```
nearby(type, radius): 指定typeのオブジェクトが distance ≤ radius に1つ以上存在する
```

---

## 4. MOVE アクションの変更

### 4-1. 概要

v2のMOVEは「指定方向に1タイル移動（瞬間移動）」であったが、v3では「**指定方向に一定の力を加える**」アクションに変更する。実際の移動は物理シミュレーション（セクション2）により決定される。

### 4-2. 方向指定

方向は**360度**（0.0 ～ 360.0、浮動小数点数）で指定する。

```
0度: 右（+x方向）
90度: 下（+y方向）
180度: 左（-x方向）
270度: 上（-y方向）
```

v2の `Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'` は廃止する。

```
Action:
  MOVE:
    direction: number (0.0 - 360.0) | { register: number }
```

`direction` が数値リテラルの場合、そのまま角度として使用する。`{ register: N }` の場合、レジスタindex Nの値を角度として使用する（セクション7-5参照）。レジスタ値がnullの場合、MOVEは失敗する。

> **設計意図**: v2および初期v3で使用していた `toward_nearest` キーワード（対象探索＋角度算出＋移動を一体化した構文）は廃止された。レジスタ機能（セクション7-5）により、`angle_to_nearest` fn でレジスタに角度を書き込み、MOVEでレジスタを参照するパターンで同じ動作を実現できる。分解することで、算出した角度をtick間で保持する（最後に見えた方向に移動し続ける）等の高度な行動が可能になった。

### 4-3. 力の適用

MOVEが成功すると、キャラクターに一定の力 `MOVE_FORCE` が指定方向に加わる。

```
力ベクトル = MOVE_FORCE × (cos(direction°), sin(direction°))
```

加速度は質量に依存する:

```
加速度 = 力ベクトル / 質量
```

そのため、同じ力を受けても:
- 軽いキャラクター（少ないコンポーネント、空インベントリ）→ 大きな加速
- 重いキャラクター（多いコンポーネント、大きなインベントリ）→ 小さな加速

### 4-4. エネルギーコスト

MOVEのエネルギーコストは一定値 `ENERGY_COST_MOVE`（v2と同一）。力の大きさも一定であり、方向や質量によらず固定コストである。

### 4-5. スライド移動の廃止

v2のスライド移動（目標タイルが塞がっている場合に代替方向を試みる仕組み）は廃止する。連続空間では衝突判定による反発力が物理的にこれを代替する。

### 4-6. MOVEの失敗

v3のMOVEは、エネルギーが十分であれば常に成功する（力を加えること自体は常に可能）。v2で存在した「移動先が塞がっているため失敗」というケースは発生しない。

ただし、力を加えた結果として衝突により移動できない場合はありうる。これはアクションの失敗ではなく、物理的な結果である。

---

## 5. その他のアクション変更

### 5-1. HARVEST / RECHARGE / DISASSEMBLE

前提条件の「隣接タイル」を「distance ≤ INTERACT_RANGE」に変更する。それ以外の仕様（必要コンポーネント、効果、失敗条件）はv2と同一。

対象の選択順は 3-3節 に従う。

### 5-2. ASSEMBLE

子キャラクターの配置方法を変更する。

```
v2: 隣接8方向の空きタイルを探索し、最初に見つかった位置に配置
v3: 親の位置から SPAWN_DISTANCE だけ離れた位置に配置
```

配置方向の決定:

1. 親の速度ベクトルと逆方向を第一候補とする（進行方向の背面）
2. 速度が0（静止中）の場合、ランダムではなく固定方向（0度 = 右方向）を第一候補とする
3. 第一候補の位置が他のオブジェクトと衝突する場合、90度ずつ回転して試行する（計4方向）
4. 全方向で衝突する場合、ASSEMBLEは失敗する（前提条件不足、ペナルティあり）

子キャラクターの初期速度は `{ vx: 0, vy: 0 }` とする。

### 5-3. WRITE / ACTIVATE

前提条件の「隣接タイル」を「distance ≤ INTERACT_RANGE」に変更する。それ以外はv2と同一。

### 5-4. REPAIR

変更なし（v2と同一）。

### 5-5. PROCESS / CRAFT

変更なし（v2と同一）。

### 5-6. SENSE

SENSEの返り値を変更する。

```
v2: SenseData = { nearestByType: Record<NearbyTargetType, { position: Position, direction: Direction }> }
v3: SenseData = { nearestByType: Record<NearbyTargetType, { relativePosition: { x: number, y: number } }> }
```

`relativePosition` は自身の位置を原点とした対象の相対座標である。

```
relativePosition.x = target.x - self.x
relativePosition.y = target.y - self.y
```

**探知範囲**: SENSEは自身を中心とした半径 `SENSE_RANGE` 以内のオブジェクトのみを返す。範囲外のオブジェクトはSENSEの結果に含まれない。

**キャラクターのProgram内には絶対座標を使用しない**。SENSEが返す相対座標から距離と方向を算出してアクションを決定する。

> **設計意図**: 絶対座標をProgramに渡すと、特定の座標をハードコードした非適応的な戦略が可能になる。相対座標のみとすることで、Programは位置に依存しない汎用的な行動規則を記述する必要がある。探知範囲の制限により、全知的な行動が防がれ、局所的な情報に基づく判断が必要になる。

---

## 6. 死亡と残骸

### 6-1. 残骸の生成

v2と同一。キャラクター死亡時にその位置に残骸が生成される。

残骸は固定オブジェクト（速度なし）として生成される。死亡キャラクターの速度は残骸に引き継がれない。

### 6-2. 残骸と衝突

残骸は半径を持つ固定オブジェクトであり、キャラクターとの衝突判定が行われる。衝突時はキャラクター側にのみ反発力が作用する（残骸は動かない）。

---

## 7. Program仕様への影響

### 7-1. Direction型の廃止

v2の `Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'` は廃止する。

### 7-2. MOVEアクション

```
v2: { op: 'MOVE', direction: Direction | 'toward_nearest' }
v3: { op: 'MOVE', direction: number | { register: number } }
```

`direction` が数値の場合、0.0 ～ 360.0 の角度（度数法）を指定する。`{ register: N }` の場合、レジスタindex Nの値を角度として使用する。レジスタ値がnullの場合、MOVEは失敗する（失敗ペナルティを支払う）。

v2および初期v3の `toward_nearest`, `wander` キーワードは廃止。レジスタのfn（セクション7-5）で代替する。

### 7-3. Condition

`nearby(type, radius)` の距離判定がユークリッド距離に変更される。形式自体は変更なし。Sensorコンポーネントは不要。

以下のレジスタ条件を追加する:

| 条件 | 意味 |
|------|------|
| `{ op: 'register_equals', index: N, value: V }` | レジスタNの値がVと等しい。V はnumber \| null |
| `{ op: 'register_less_than', index: N, value: V }` | レジスタNの値がV未満（Vはnumber）。レジスタがnullの場合false |
| `{ op: 'register_greater_than', index: N, value: V }` | レジスタNの値がVより大きい（Vはnumber）。レジスタがnullの場合false |

### 7-4. SenseData

セクション5-6を参照。

### 7-5. レジスタ

キャラクターはレジスタ（数値またはnullを格納する記憶領域）を持つことができる。レジスタはtick間で値が持続し、Programの条件判定やアクション引数に使用できる。

#### コンポーネント要件

Registerコンポーネント1つにつき4つのレジスタ（4index分）が使用可能になる。

| Registerコンポーネント数 | 使用可能なindex |
|------------------------|---------------|
| 0 | なし |
| 1 | 0 - 3 |
| 2 | 0 - 7 |
| N | 0 - (4N - 1) |

Registerコンポーネントは任意であり、MIN_COMPONENTSには含まれない。

#### 初期値

キャラクター生成時（ASSEMBLE直後）、全レジスタの値はnullである。WRITEによるプログラム複製時にレジスタ値はコピーされない。

#### レジスタの読み取り

存在しないindex（Registerコンポーネントが不足）の読み取りはnullを返す。

レジスタ値がnullの場合、nullを許容しないアクション引数（MOVEのdirectionなど）に渡すとアクションは失敗する（失敗ペナルティを支払う）。

#### レジスタの書き込み（set_registers）

Ruleに `set_registers` フィールドを追加する。ルール発火時の副作用としてレジスタに書き込む。エネルギーコストはかからない。コンポーネント要件もない（ただし対象indexのRegisterコンポーネントがない場合、書き込みは無視される）。

```
Rule = {
  condition: Condition,
  set_registers?: SetRegister[],  // 任意
  action: Action,
}

SetRegister = {
  index: number,
  value: number | null | FnValue,
}
```

`set_registers` はアクション実行前に順次処理される。同一ルール内のアクションからは書き込み後の値が参照できる。

#### fn（算出値）

`set_registers` の `value` にfnオブジェクトを指定すると、実行時に値が算出される。

| fn | 形式 | 戻り値 | 要件 |
|----|------|--------|------|
| `angle_to_nearest` | `{ fn: 'angle_to_nearest', type: NearbyTargetType }` | SENSE_RANGE内の最寄り対象への角度（度数法）。対象不在ならnull | Sensorコンポーネント必須。Sensor未保持時はnullを返す |
| `angle_away_from_nearest` | `{ fn: 'angle_away_from_nearest', type: NearbyTargetType }` | SENSE_RANGE内の最寄り対象から離れる角度（`(angle_to_nearest + 180) % 360`）。対象不在ならnull | Sensorコンポーネント必須。Sensor未保持時はnullを返す |
| `wander_angle` | `{ fn: 'wander_angle' }` | `energy % 360`。キャラクターの内部状態に基づく擬似ランダム方向 | なし（常に数値を返す） |

fnがnullを返した場合、nullがレジスタに書き込まれる（前の値は上書きされる）。プログラムで「前の値を保持」したい場合は、条件でガードしてnull書き込みを避ける:

```json
{
  "condition": { "op": "nearby", "type": "OreNode", "radius": 10 },
  "set_registers": [{ "index": 0, "value": { "fn": "angle_to_nearest", "type": "OreNode" } }],
  "action": { "op": "MOVE", "direction": { "register": 0 } }
}
```

#### toward_nearest の代替パターン

旧 `toward_nearest` は以下のパターンで代替する:

```json
// 旧: { "op": "MOVE", "direction": "toward_nearest", "target": "OreNode" }
// 新:
{
  "set_registers": [{ "index": 0, "value": { "fn": "angle_to_nearest", "type": "OreNode" } }],
  "action": { "op": "MOVE", "direction": { "register": 0 } }
}
```

#### wander の代替パターン

旧 `wander` は以下のパターンで代替する:

```json
// 旧: { "op": "MOVE", "direction": "wander" }
// 新:
{
  "set_registers": [{ "index": 0, "value": { "fn": "wander_angle" } }],
  "action": { "op": "MOVE", "direction": { "register": 0 } }
}
```

---

## 8. ゲームループの変更

v2の8ステップを以下の10ステップに変更する。

```
v3 ゲームループ:

1. EnergyNodeのエネルギー生産
2. 全キャラクターがアクションを決定（Programの評価 + set_registersの適用）
3. アクションの順次実行
   - MOVE: 力の蓄積（物理更新で適用される）
   - HARVEST/RECHARGE/DISASSEMBLE/WRITE/ACTIVATE: 距離判定で実行
   - PROCESS/CRAFT/ASSEMBLE/REPAIR: v2と同一
   - エネルギーチェック・消費・失敗ペナルティはv2と同一
4. 摩擦力の算出（全キャラクター）
5. 衝突判定と反発力の算出（全オブジェクトペア）
6. 物理更新（力の合成 → 加速度 → 速度更新 → 位置更新）
7. エネルギー基礎代謝の適用
8. 耐久度自然減衰（全キャラクター -1）
9. 死亡判定（耐久度 ≤ 0 → 残骸生成 + キャラクター除去）
10. tick++
```

### 8-1. v2からの変更点

- Step 2: **アクション決定はワールド更新より先に行う**。前tickの結果が確定した状態でProgramが評価される。ルール発火時にset_registersがあれば、アクション実行前にレジスタへ書き込む
- Step 3: MOVEは即座に位置を変更せず、力をキャラクターに蓄積する
- Step 4-6: **新規**。物理シミュレーションステップ
- Step 7: v2のStep 4に相当。位置番号が変更
- v2のStep 7「枯渇ResourceNode除去」は、v3ではStep 3のHARVEST実行時に即座に除去する（タイル概念がないため、depleted nodeを位置に残す意味がない）

### 8-2. 物理更新の詳細（Step 4-6）

```
Step 4: 摩擦力の算出
  各キャラクターについて:
    friction_force = -velocity × FRICTION_COEFFICIENT × mass

Step 5: 衝突判定と反発力の算出
  全オブジェクトペアについて:
    overlap = (radiusA + radiusB) - distance(A, B)
    if overlap > 0:
      direction = normalize(B.position - A.position)
      force = overlap × COLLISION_STIFFNESS × direction
      // Aにはforce方向、Bには-force方向の力を適用
      // 固定オブジェクトの場合、移動オブジェクト側にのみ力を適用

Step 6: 物理更新
  各キャラクターについて:
    total_force = move_force + friction_force + collision_forces
    acceleration = total_force / mass
    velocity += acceleration
    position += velocity
    // 速度クランプ（オプション）
    if |velocity| < VELOCITY_CLAMP_THRESHOLD:
      velocity = { vx: 0, vy: 0 }
```

> **備考**: Step 5の衝突判定は全ペアの探索が必要であり、オブジェクト数Nに対してO(N²)の計算量がかかる。オブジェクト数が多い場合（数百以上）はグリッドベースの空間分割による最適化を検討する。ただし、v2のチューニング結果（人口10-20体程度）から、当面は素朴な全ペア探索で問題ないと想定する。

---

## 9. 定数一覧

v2の定数に加えて、以下の物理関連定数を追加する。

### 物理定数（新規）

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `MOVE_FORCE` | MOVEアクションで加える力の大きさ | (実装後調整) |
| `FRICTION_COEFFICIENT` | 摩擦係数（速度比例抵抗） | (実装後調整) |
| `COLLISION_STIFFNESS` | 衝突反発力のバネ定数 | (実装後調整) |
| `INTERACT_RANGE` | アクション実行可能な距離 | (実装後調整) |
| `SPAWN_DISTANCE` | ASSEMBLE時の子の配置距離 | (実装後調整) |
| `SENSE_RANGE` | SENSEの探知半径 | 10 |
| `VELOCITY_CLAMP_THRESHOLD` | この速度以下を0にクランプする閾値 | (実装後調整) |

### オブジェクト半径（新規）

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `CHARACTER_RADIUS` | キャラクターの衝突半径 | (実装後調整) |
| `RESOURCE_NODE_RADIUS` | ResourceNodeの衝突半径 | (実装後調整) |
| `ENERGY_NODE_RADIUS` | EnergyNodeの衝突半径 | (実装後調整) |
| `REMAINS_RADIUS` | Remainsの衝突半径 | (実装後調整) |

### 廃止される定数

| 定数名 | 理由 |
|--------|------|
| `'toward_nearest'` | レジスタfn `angle_to_nearest` で代替 |
| `'wander'` | レジスタfn `wander_angle` で代替 |

### v2から意味が変更される定数

| 定数名 | v2の意味 | v3の意味 |
|--------|---------|---------|
| `ENERGY_COST_MOVE` | 1タイル移動のコスト | 力を1回加えるコスト |
| `FRAME_DURABILITY` | v2と同一（変更なし） | - |

---

## 10. 型定義の変更

### 追加・変更されるフィールド

```
Velocity = { vx: number, vy: number }

Character = {
  ...v2のフィールド,
  velocity: Velocity,     // 新規: 速度ベクトル
  registers: (number | null)[],  // 新規: レジスタ（初期値は全てnull）
  // position: Position は型はv2と同一だが、値は浮動小数点数
}

SenseData = {
  nearestByType: Partial<Record<NearbyTargetType, {
    relativePosition: { x: number, y: number },  // 変更: 相対座標
  }>>,
}
```

### 廃止される型

```
Direction = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'  // 廃止
```

MOVEアクションの `direction` フィールドは `number | { register: number }` に変更。
`'toward_nearest'`, `'wander'` キーワードは廃止（レジスタfnで代替）。

---

## 11. v2仕様セクションとの対応

| v2セクション | v3での扱い |
|-------------|-----------|
| 1. 数値の扱い | 本仕様セクション1で更新 |
| 2. 資源モデル | 変更なし（v2踏襲） |
| 3. エネルギーモデル | 変更なし（v2踏襲） |
| 4. HARVEST / RECHARGE | 距離判定に変更（セクション3, 5） |
| 5. 耐久度モデル | 変更なし（v2踏襲） |
| 6. 死亡と残骸 | セクション6で補足 |
| 7. DISASSEMBLE | 距離判定に変更（セクション3, 5） |
| 8. 隣接とタイル占有ルール | **全面廃止** → 物理モデル（セクション2）で置換 |
| 9. ゲームループ | セクション8で更新 |
| 10. 定数一覧 | セクション9で追加 |
| 11. キャラクター仕様への影響 | セクション10で更新 |
| 12. Program仕様への影響 | セクション7で更新 |
