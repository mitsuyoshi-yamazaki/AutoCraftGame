# ゲームシステム仕様 — v2（淘汰圧の導入）

本文書はv1の `docs/specs/game_spec.md` および `docs/specs/application_spec.md` に対する変更差分を定義する。
記載のない仕様はv1を踏襲する。

本文書はゲーム世界の**法則**（物理ルール）を定める。世界の初期状態（ノード配置、初期キャラクター等）は `initial_state.md` で定義する。

---

## 1. 数値の扱い

エネルギーを含む全ての数値は整数で扱う。計算結果が小数になる場合は、文脈に応じた丸め方向で整数にする。

- **消費量の算出**: 切り上げ（ceil）。消費が過小評価されることを防ぐ
- **獲得量の算出**: 切り捨て（floor）。獲得が過大評価されることを防ぐ
- **その他**: 切り捨て（floor）をデフォルトとする

このため、エネルギーの生産量・回収量・コスト等の定数は十分に大きな値を取る必要がある（例: 1ではなく100単位）。小さな値で設計すると丸め誤差の影響が大きくなる。

---

## 2. 資源モデル

### 2-1. ResourceNode

v1ではResourceNodeは `depleted: boolean` のみを持ち毎tick再生していた。v2ではこれを有限資源モデルに変更する。

```
ResourceNode = {
  position: Position,
  type: 'OreNode' | 'CrystalNode',
  remaining: number,     // 現在の資源量。0になるとノード消滅
}
```

- `remaining`: ノードが保持する資源の残量。HARVESTで1減少する
- `remaining` が0になったノードはマップから除去される（再生しない）
- v1の `depleted: boolean` は廃止する

### 2-2. 資源の総量保存

資源とエネルギーは独立したリソースである。資源の総量は常に一定に保存される。

**保存則**: 世界に存在する資源の総量は、最もprimitiveな資源（Ore, Crystal）に換算した合計が初期値と常に等しい。

資源は加工によって状態が変化するが、原料換算での総量は一定である。例えば初期状態が Ore x10 の系では:

- Ore x10 = Metal x5 = Metal x2 + Ore x6（全て Ore 10個分として等価）

**総量の算出対象**:

- 全ResourceNodeの `remaining`
- 全キャラクターのインベントリ・コンポーネントを原料換算した合計
- 全残骸のインベントリ・コンポーネントを原料換算した合計

ただしプロトタイプであるため、以下の点で厳密な検証は行わない:

- 加工ロス: PROCESS/CRAFT時に入力と出力の原料換算値が一致しなくてもよい（v1のレシピをそのまま使用する）

**確実に保存すべき点**:

- HARVESTで取得した資源はノードのremainingから減少する
- キャラクター死亡時、コンポーネントとインベントリはマップ上に残骸として残る
- 資源がエネルギーに変換されることはない（資源とエネルギーは独立）

### 2-3. 資源の再生なし

v1の `regenerateResources()`（毎tick全ノードの `depleted` をリセット）は廃止する。
資源ノードは一度枯渇（remaining = 0）したら消滅し、再生しない。

---

## 3. エネルギーモデル

エネルギーは資源とは独立したリソースである。資源は物質（保存される）、エネルギーは活動の燃料（散逸する）。

### 3-1. EnergyNode

エネルギーの源泉として、EnergyNodeを導入する。

```
EnergyNode = {
  position: Position,
  productionRate: number,   // tickあたりのエネルギー生産量（整数）
  stored: number,           // 現在の蓄積量（整数）
  maxStored: number,        // 蓄積量の上限（整数）
}
```

**エネルギー生産ルール**:

- 毎tickの開始時、各EnergyNodeは `productionRate` 分のエネルギーを生産する
- 生産されたエネルギーは `stored` に加算される
- `stored` が `maxStored` に達した場合、それ以上の生産は行われない（`stored = min(stored + productionRate, maxStored)`）
- そのtick内で回収されなかったエネルギーはノードに蓄積されたまま残る

### 3-2. エネルギーの回収（RECHARGE）

エネルギーの回収には専用のアクション **RECHARGE** と専用のコンポーネント **Charger** を使用する。資源採掘（HARVEST / Harvester）とは分離する。

```
RECHARGE:
  - 必要コンポーネント: Charger
  - 前提: 隣接タイルにEnergyNodeが存在し、stored > 0
  - 効果: EnergyNodeの stored から一定量を取得し、キャラクターの energy に加算する
  - 取得量: min(RECHARGE_AMOUNT, node.stored)
  - 失敗条件: 隣接タイルにEnergyNodeがない、またはstored = 0
```

隣接タイルに複数のEnergyNodeがある場合、N→S→E→W順で最初に見つかったものを対象とする。

### 3-2a. 新コンポーネント: Charger

エネルギー回収専用のコンポーネントを追加する。

```
ComponentType に 'Charger' を追加

CraftRecipe:
  Charger: Metal x1 + Circuit x2
```

### 3-3. キャラクターのエネルギー

キャラクターに `energy: number` フィールドを追加する。エネルギーは常に整数値。

```
Character = {
  ...v1のフィールド,
  energy: number,        // 現在のエネルギー量（整数）
}
```

### 3-4. エネルギー消費

全アクションはエネルギーを消費する。エネルギーが不足している場合、アクションは実行できない（失敗する）。

```
アクション別エネルギーコスト:
  NOOP:        0
  MOVE:        ENERGY_COST_MOVE
  HARVEST:     ENERGY_COST_HARVEST
  RECHARGE:    ENERGY_COST_RECHARGE
  PROCESS:     ENERGY_COST_PROCESS
  CRAFT:       ENERGY_COST_CRAFT
  ASSEMBLE:    ENERGY_COST_ASSEMBLE
  WRITE:       ENERGY_COST_WRITE
  ACTIVATE:    ENERGY_COST_ACTIVATE
  SENSE:       ENERGY_COST_SENSE
  REPAIR:      ENERGY_COST_REPAIR
  DISASSEMBLE: ENERGY_COST_DISASSEMBLE
```

- NOOPのコストは0とする（何もしなければ消費しない）
- 各コストの具体的な値は実装後に調整する。定数として定義し、CLIパラメータでオーバーライド可能とする
- アクションが成功した場合、そのアクションのエネルギーコスト全額を消費する
- エネルギーが不足（コスト未満）の場合、アクションは実行できず失敗する。この場合エネルギーは消費されない

> **設計方針**: 「全てのアクションにはコストが伴う」「追加のコストを払えばより大きな利益が得られるが、必要なコストはどんどん増加する」という大法則に従う。加工系アクション（PROCESS, CRAFT, ASSEMBLE）は単純な行動（MOVE, HARVEST）より高コストとする。

### 3-5. アクション失敗時のエネルギーペナルティ

エネルギーは十分にあるがアクションの前提条件を満たさずに失敗した場合（例: HARVESTしたが隣接にResourceNodeがない、MOVEしたが移動先が占有されている等）、そのアクションのエネルギーコストの一定割合を消費する。

```
失敗時の消費量 = ceil(アクションのエネルギーコスト × ACTION_FAILURE_COST_RATIO)
```

- `ACTION_FAILURE_COST_RATIO`: 失敗時のコスト割合。デフォルト値は `0.8`（80%）
- エネルギー不足による失敗（そもそも実行を試みなかった場合）にはペナルティは発生しない。ペナルティが発生するのは、エネルギーは足りたが前提条件が満たされず失敗した場合のみ

> **設計意図**: 無駄な行動（環境や他者の状態を考慮せずに行動する）にペナルティを課すことで、SENSEで状況を把握してから行動するProgramが有利になる。これは「他者や環境の状態によって自己の行動を最適化できることに対する利益」を淘汰圧として組み込むためである。

### 3-6. 基礎代謝

毎tick、全キャラクター（活性・不活性を問わず）の基礎代謝としてエネルギーが減少する。

基礎代謝量は固定値ではなく、キャラクターの構成と状態から算出される:

```
基礎代謝 = Σ(各コンポーネントの代謝コスト) + floor(インベントリ内アイテム総数 × INVENTORY_METABOLISM_PER_ITEM)
```

**コンポーネント種別ごとの代謝コスト**:

| コンポーネント | 代謝コスト                | 備考     |
| -------------- | ------------------------- | -------- |
| Frame          | `METABOLISM_FRAME`        | 構造維持 |
| Actuator       | `METABOLISM_ACTUATOR`     |          |
| Sensor         | `METABOLISM_SENSOR`       |          |
| Processor      | `METABOLISM_PROCESSOR`    |          |
| Harvester      | `METABOLISM_HARVESTER`    |          |
| Assembler      | `METABOLISM_ASSEMBLER`    |          |
| Disassembler   | `METABOLISM_DISASSEMBLER` |          |
| Charger        | `METABOLISM_CHARGER`      |          |
| MemoryCore     | `METABOLISM_MEMORYCORE`   |          |

- 同種コンポーネントを複数持つ場合、個数分加算される（Frame×2なら `METABOLISM_FRAME × 2`）
- インベントリの代謝コスト: アイテム総数（全種別の合計個数）× `INVENTORY_METABOLISM_PER_ITEM`。多くのアイテムを抱えるほど維持コストが上がる

> **設計意図**: 基礎代謝をコンポーネント構成に依存させることで、「多くの機能を持つ個体ほど維持コストが高い」というトレードオフを生む。全コンポーネントを搭載した万能型は高コスト、最小構成の特化型は低コスト。また、インベントリの維持コストにより「必要以上に資源を溜め込む」ことにもコストがかかる。

### 3-7. 初期エネルギーとエネルギーの授受

ASSEMBLEアクション実行時、親のエネルギーから一定量を子に移転する。

- ASSEMBLEの実行時、親のエネルギーから `ASSEMBLE_ENERGY_TRANSFER` を子に移転する
- 親のエネルギーが `ENERGY_COST_ASSEMBLE + ASSEMBLE_ENERGY_TRANSFER` 未満の場合、ASSEMBLEは失敗する（前提条件不足）
- 移転されたエネルギーが子の初期エネルギーとなる
- 不活性キャラクターにも基礎代謝が適用されるため、親は子が活性化されるまでの基礎代謝分を見越して十分なエネルギーを移転する必要がある

> **設計意図**: 子の初期エネルギーは親からの移転で賄う。固定値ではなくProgramで制御可能にすることも将来的には考えられるが、v2ではシンプルさを優先し定数とする。

### 3-8. エネルギーと死亡

エネルギーが0以下になっても即死はしない。

- エネルギー0以下: 全アクション（NOOP以外）が実行不能。基礎代謝は引き続き適用される（エネルギーは負の値になりうる）
- 死亡判定はv1同様、耐久度（durability）が0以下になった場合のみ

> **設計意図**: エネルギー枯渇 → 行動不能 → 耐久度だけが減衰 → いずれ死亡、という段階的な死を実現する。

### 3-9. エネルギーのエントロピー

エネルギーは資源と異なり保存されない。以下の経路で散逸する:

- 基礎代謝: 毎tick全キャラクターから消費される（世界から消滅）
- アクションコスト: アクション実行時に消費される（世界から消滅）
- アクション失敗ペナルティ: 前提条件不足の失敗時に消費される（世界から消滅）
- キャラクター死亡時: 残骸にエネルギーは保存されない（散逸する）

エネルギーの供給源はEnergyNodeの生産のみであり、消費は上記の経路で起こる。供給と消費のバランスが個体群の環境収容力を決定する。

> **備考**: エントロピーの明示的な実装は現時点では行わない。上記の散逸メカニズムが実質的にエントロピー増大の効果を持つ。

---

## 4. HARVEST / RECHARGE の仕様変更

v1ではHARVESTは同一タイルのResourceNodeからのみ資源を取得した。v2ではHARVESTの対象を隣接タイルに変更し、エネルギー回収は別アクション（RECHARGE）として分離する。

### 4-1. HARVEST（資源採掘）

```
HARVEST:
  - 必要コンポーネント: Harvester
  - 前提: 隣接タイル（上下左右）にResourceNodeが存在し、remaining > 0
  - 効果: ResourceNodeの remaining を1減少させ、対応する原料をインベントリに追加
  - 失敗条件: 隣接タイルにResourceNodeがない、またはremaining = 0
```

隣接タイルに複数のResourceNodeがある場合、N→S→E→W順で最初に見つかったものを対象とする。今のところProgramから方向を明示的に指定する機能は不要。

### 4-2. RECHARGE（エネルギー回収）

```
RECHARGE:
  - 必要コンポーネント: Charger
  - 前提: 隣接タイル（上下左右）にEnergyNodeが存在し、stored > 0
  - 効果: EnergyNodeの stored から min(RECHARGE_AMOUNT, node.stored) を取得し、キャラクターの energy に加算
  - 失敗条件: 隣接タイルにEnergyNodeがない、またはstored = 0
```

隣接タイルに複数のEnergyNodeがある場合、N→S→E→W順で最初に見つかったものを対象とする。

### 4-3. 1tick1回

HARVEST, RECHARGEはそれぞれ1tickで1回のみ実行可能（キャラクターは1tick1アクション）。

### 4-4. 同一tickの同一ノードへの複数アクセス

同一tickに複数のキャラクターが同一ノードに対してHARVEST/RECHARGEを実行した場合、実行順（キャラクターID順）で処理される。ResourceNodeの `remaining` が0になった時点、またはEnergyNodeの `stored` が0になった時点で、後続のアクションは失敗する（前提条件不足、ペナルティあり）。

---

## 5. 耐久度モデルの変更

### 5-1. 自然減衰の維持

v1の耐久度自然減衰（-1/tick）は維持する。これは構造的な経年劣化を表す。

### 5-2. 耐久度とエネルギーの役割分担

|         | 耐久度 (durability)               | エネルギー (energy)         |
| ------- | --------------------------------- | --------------------------- |
| 概念    | 構造的健全性（寿命）              | 活動資源（燃料）            |
| 源泉    | Frame (REPAIR: +FRAME_DURABILITY) | EnergyNode (RECHARGE)       |
| 減少    | -1/tick (自然減衰)                | 基礎代謝 + アクションコスト |
| 0以下で | 死亡                              | 行動不能（死亡はしない）    |

---

## 6. 死亡と残骸

### 6-1. 残骸の生成

v1ではキャラクター死亡時にそのデータが世界から完全に除去されていた。v2では残骸（Remains）を導入する。

```
Remains = {
  position: Position,
  components: ComponentType[],   // 死亡キャラクターが持っていたComponent
  inventory: Inventory,          // 死亡キャラクターが持っていたアイテム
}
```

キャラクターが死亡した場合:

1. キャラクターは `characters` リストから除去される
2. 同じ位置に残骸が生成される
3. 残骸には死亡時のcomponentsとinventoryがそのまま移される
4. 死亡時のエネルギーは残骸に保存されない（散逸する）

### 6-2. 残骸の性質

- 残骸はマップ上に永続する（自然消滅しない）
- 残骸は移動しない
- 残骸はタイルを占有する（残骸のあるタイルにキャラクターは移動できない）
- 残骸はSENSEの対象になる（新しいNearbyTargetType: `Remains`）

---

## 7. DISASSEMBLE アクション

### 7-1. 新コンポーネント: Disassembler

残骸を分解するための新しいコンポーネントを追加する。

```
ComponentType に 'Disassembler' を追加

CraftRecipe:
  Disassembler: Metal x2 + Circuit x1  （Assemblerと同一）
```

### 7-2. DISASSEMBLE アクション

```
DISASSEMBLE:
  - 必要コンポーネント: Disassembler
  - 対象: 隣接タイルの残骸 (Remains)
  - 効果: 残骸からアイテムを1つ取得する
  - 取得内容:
    - inventoryのアイテム: そのままインベントリに追加
    - components: 構成資源に分解されてインベントリに追加（後述）
  - 取得順: まずinventoryのアイテム（種別のアルファベット順）、次にcomponents（種別のアルファベット順）
  - 残骸のアイテムが全てなくなった場合、残骸はマップから除去される
```

- 1回のDISASSEMBLEで取得できるのは1アイテム（1tickで1個）
- 隣接タイルに複数の残骸がある場合、N→S→E→W順で最初に見つかったものを対象とする

### 7-3. コンポーネントの分解

DISASSEMBLEで残骸のcomponentを取得した場合、componentそのものではなく、そのCraftRecipeの入力素材（Layer 1加工素材）がインベントリに追加される。

```
例:
  残骸のcomponentsにFrameがある場合:
    DISASSEMBLE → Frameを取得 → CraftRecipeの入力素材(Metal x3)がインベントリに追加
  残骸のcomponentsにProcessorがある場合:
    DISASSEMBLE → Processorを取得 → CraftRecipeの入力素材(Circuit x3)がインベントリに追加
```

> **設計意図**: componentをそのまま取得できると、残骸からの部品取りが「新規製造より常に安い」ことになり、自分で加工する動機が薄れる。分解するとLayer 1素材に戻ることで、再利用にもCRAFTのコスト（エネルギー）がかかるようになる。

> **備考**: 分解でLayer 1素材（Metal, Circuit）が得られるが、保存則はprimitive資源（Ore, Crystal）換算での総量一定であり、Metal x1 = Ore x2 として換算される。DISASSEMBLE → CRAFT の経路で資源量は保存される（例: Frame分解 → Metal x3 → Frame再製造で Metal x3消費。原料換算では Ore x6 が移動しただけ）。

### 7-4. DISASSEMBLE と ATTACK の関係

requirement.md で「ATTACKはCharacterを対象としたDISASSEMBLEである」とされている。

ただし、次バージョンのスコープでは活性キャラクターへの攻撃は導入しない（キャラクター間相互作用は以降のバージョン）。v2のDISASSEMBLEは残骸のみを対象とする。

将来のATTACK実装時には、DISASSEMBLEの対象を活性キャラクターに拡張する形で実現する（対象の耐久度を減少させる、またはComponentを1つ奪う）。

---

## 8. タイル占有ルール

ゲーム世界に存在する位置プロパティを持つオブジェクトは、原則としてタイルを占有する。同一タイルに存在できるオブジェクトは1つまでとする。

### 8-1. 占有オブジェクト一覧

| オブジェクト              | タイル占有 |
| ------------------------- | ---------- |
| Character（活性・不活性） | する       |
| Remains（残骸）           | する       |
| ResourceNode              | する       |
| EnergyNode                | する       |

### 8-2. 占有の影響

- MOVEの移動先タイルが占有されている場合、MOVEは失敗する（前提条件不足、ペナルティあり）
- ASSEMBLEで子を配置する際、占有されているタイルは選択されない
- HARVEST/DISASSEMBLEは隣接タイルのノード/残骸を対象とする（対象のタイルに入る必要がない）

---

## 9. ゲームループの変更

v1のゲームループ（6ステップ）を以下のように変更する。

```
v2 ゲームループ:
1. EnergyNodeのエネルギー生産（全ノードで stored = min(stored + productionRate, maxStored)）
2. 全キャラクターがアクションを決定（v1と同じ）
3. アクションの順次実行（エネルギーチェック・消費追加）
   - エネルギー ≥ コスト: 実行を試みる
     - 成功: コスト全額を消費
     - 前提条件不足で失敗: ceil(コスト × ACTION_FAILURE_COST_RATIO) を消費
   - エネルギー < コスト: 実行せず失敗（エネルギー消費なし）
4. エネルギー基礎代謝の適用（全キャラクター、構成に基づく算出値）
5. 耐久度自然減衰（全キャラクター -1）
6. 死亡判定（耐久度 ≤ 0 → 残骸生成 + キャラクター除去）
7. 枯渇ResourceNode除去（remaining ≤ 0 のノードを除去）
8. tick ++
```

v1からの変更点:

- Step 1: 新規。EnergyNodeの生産処理
- Step 3: エネルギーチェック・消費・失敗ペナルティの処理を追加
- Step 4: 新規。構成依存の基礎代謝適用
- Step 6: 死亡時に残骸を生成する（v1ではキャラクターを単に除去していた）
- Step 7: 新規。枯渇したResourceNodeの除去
- v1のStep 5「資源再生」は廃止

---

## 10. 定数一覧

以下の定数はデフォルト値を持ち、CLIパラメータでオーバーライド可能とする。
エネルギー関連の定数は全て整数値とする。具体的な値は実装後に調整する。

### アクションコスト

| 定数名                    | 意味                           | デフォルト値 |
| ------------------------- | ------------------------------ | ------------ |
| `ENERGY_COST_MOVE`        | MOVE のエネルギーコスト        | (実装後調整) |
| `ENERGY_COST_HARVEST`     | HARVEST のエネルギーコスト     | (実装後調整) |
| `ENERGY_COST_RECHARGE`    | RECHARGE のエネルギーコスト    | (実装後調整) |
| `ENERGY_COST_PROCESS`     | PROCESS のエネルギーコスト     | (実装後調整) |
| `ENERGY_COST_CRAFT`       | CRAFT のエネルギーコスト       | (実装後調整) |
| `ENERGY_COST_ASSEMBLE`    | ASSEMBLE のエネルギーコスト    | (実装後調整) |
| `ENERGY_COST_WRITE`       | WRITE のエネルギーコスト       | (実装後調整) |
| `ENERGY_COST_ACTIVATE`    | ACTIVATE のエネルギーコスト    | (実装後調整) |
| `ENERGY_COST_SENSE`       | SENSE のエネルギーコスト       | (実装後調整) |
| `ENERGY_COST_REPAIR`      | REPAIR のエネルギーコスト      | (実装後調整) |
| `ENERGY_COST_DISASSEMBLE` | DISASSEMBLE のエネルギーコスト | (実装後調整) |

### 失敗ペナルティ

| 定数名                      | 意味                           | デフォルト値 |
| --------------------------- | ------------------------------ | ------------ |
| `ACTION_FAILURE_COST_RATIO` | 前提条件不足の失敗時コスト割合 | 0.8          |

### 基礎代謝

| 定数名                          | 意味                                    | デフォルト値 |
| ------------------------------- | --------------------------------------- | ------------ |
| `METABOLISM_FRAME`              | Frame 1個あたりの代謝コスト             | (実装後調整) |
| `METABOLISM_ACTUATOR`           | Actuator 1個あたりの代謝コスト          | (実装後調整) |
| `METABOLISM_SENSOR`             | Sensor 1個あたりの代謝コスト            | (実装後調整) |
| `METABOLISM_PROCESSOR`          | Processor 1個あたりの代謝コスト         | (実装後調整) |
| `METABOLISM_HARVESTER`          | Harvester 1個あたりの代謝コスト         | (実装後調整) |
| `METABOLISM_ASSEMBLER`          | Assembler 1個あたりの代謝コスト         | (実装後調整) |
| `METABOLISM_DISASSEMBLER`       | Disassembler 1個あたりの代謝コスト      | (実装後調整) |
| `METABOLISM_CHARGER`            | Charger 1個あたりの代謝コスト           | (実装後調整) |
| `METABOLISM_MEMORYCORE`         | MemoryCore 1個あたりの代謝コスト        | (実装後調整) |
| `INVENTORY_METABOLISM_PER_ITEM` | インベントリ1アイテムあたりの代謝コスト | (実装後調整) |

### エネルギー回収・移転

| 定数名                     | 意味                                 | デフォルト値 |
| -------------------------- | ------------------------------------ | ------------ |
| `RECHARGE_AMOUNT`          | RECHARGE 1回あたりの回収量           | (実装後調整) |
| `ASSEMBLE_ENERGY_TRANSFER` | ASSEMBLE時に子に移転するエネルギー量 | (実装後調整) |

### その他

| 定数名             | 意味                    | デフォルト値 |
| ------------------ | ----------------------- | ------------ |
| `FRAME_DURABILITY` | Frame 1個あたりの耐久度 | 200          |

> **調整指針**:
>
> - **最小自己複製サイクル**を基準にする: 1体のキャラクターが自己複製を1回完了するのに必要なtick数・エネルギー量を計算し、それが「ギリギリ達成可能だが余裕はない」レベルに設定する
> - EnergyNodeの生産レートは、マップ上の全ノードの総生産量が「全個体の基礎代謝+活動コスト」をやや上回る程度に設定する
> - 全定数を整数にするため、100〜1000程度のオーダーで設計する（例: ENERGY_COST_MOVE = 100, HARVEST_ENERGY_AMOUNT = 500 など）

---

## 11. キャラクター仕様への影響

本仕様変更に伴い、キャラクター仕様（`character_spec.md`）に以下の変更が必要:

1. **Character型に `energy` フィールド追加**（整数値）
2. **ComponentTypeに `Disassembler` 追加**（レシピ: Metal 2 + Circuit 1、Assemblerと同一）
3. **ComponentTypeに `Charger` 追加**（レシピ: Metal 1 + Circuit 2）
4. **HARVESTアクションの変更**: 対象を同一タイルから隣接タイルに変更。ResourceNodeのみ対象
5. **新Action: RECHARGE**（Chargerで隣接タイルのEnergyNodeからエネルギー回収）
6. **新Action: DISASSEMBLE**（Disassemblerで残骸から1アイテム取得。componentは構成素材に分解）
7. **全アクションにエネルギーコストを追加**（エネルギー不足時は実行不可、前提条件不足の失敗時は80%消費）
8. **ASSEMBLEの仕様変更**: 子に `ASSEMBLE_ENERGY_TRANSFER` 分のエネルギーを移転する
9. **MIN_COMPONENTSの見直し**: Disassembler, Chargerは最小構成に含めるか？

> **提案**: Disassemblerは含めない。選択的なComponentとする。Chargerはエネルギー回収に必須であり、最小構成に含めるべきである

---

## 12. Program仕様への影響

以下のConditionおよびActionを追加・変更する必要がある。

### Condition追加

- `nearby` の `type` に `Remains` を追加（残骸の検知）
- `nearby` の `type` に `EnergyNode` を追加（エネルギーノードの検知）
- `energy_below(threshold)`: エネルギーが閾値未満か判定（`durability_below` と対称）

### Action変更

- `HARVEST`: `{ op: 'HARVEST' }`（v1と同一形式。対象がResourceNodeのみ・隣接タイルに変更）

### Action追加

- `RECHARGE`: `{ op: 'RECHARGE' }`
- `DISASSEMBLE`: `{ op: 'DISASSEMBLE' }`
