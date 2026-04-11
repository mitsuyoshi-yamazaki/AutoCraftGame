# 制御プリミティブによる自己複製の仕組み

本文書は、制御プリミティブのみで構成された自己複製キャラクター（PrimitiveReplicator）の動作メカニズムを具体例を交えて説明する。

---

## 1. キャラクターの構成

### 1-1. 身体（コンポーネント）

PrimitiveReplicator は以下の 6 種のコンポーネントを持つ。

```
Frame      — 耐久値の基盤。これがないと即死する
Actuator   — 移動に必要
Sensor     — 周囲の探索に必要（move_toward の対象発見に使用）
Harvester  — 資源ノードからの採取に必要
Charger    — エネルギーノードからの充電に必要
Assembler  — 加工（PROCESS）、組立（CRAFT）、複製（ASSEMBLE）に必要
```

Processor は持たない。VM は使用せず、全ての行動は以下の制御プリミティブによって決定される。

### 1-2. 頭脳（制御プリミティブ）

キャラクターは **ルールリスト**（`primitiveRules`）を持つ。毎 tick、先頭から順に条件を評価し、**最初に条件が真となったルールのアクションを 1 つだけ実行する**。

PrimitiveReplicator のルールリスト（21 ルール）:

```
 #  条件                                              アクション
─── ─────────────────────────────────────────────────  ──────────────────
 0  can_assemble AND energy < 1500 AND nearby(Energy)  → RECHARGE
 1  can_assemble AND energy < 1500                     → move_toward(Energy)
 2  energy < 300 AND nearby(EnergyNode)                → RECHARGE
 3  energy < 300                                       → move_toward(Energy)
 4  can_assemble AND energy ≥ 1200                     → ASSEMBLE
 5  can_craft_missing(Frame)                           → CRAFT Frame
 6  can_craft_missing(Harvester)                       → CRAFT Harvester
 7  can_craft_missing(Assembler)                       → CRAFT Assembler
 8  can_craft_missing(Actuator)                        → CRAFT Actuator
 9  can_craft_missing(Charger)                         → CRAFT Charger
10  can_craft_missing(Sensor)                          → CRAFT Sensor
11  energy ≥ 300 AND Ore ≥ 6 AND can_process(Metal)   → PROCESS Metal
12  energy ≥ 300 AND Crystal ≥ 6 AND can_process(Circ) → PROCESS Circuit
13  energy < 500 AND nearby(EnergyNode)                → RECHARGE
14  nearby(Ore) AND Ore < 18 AND Metal < 9             → HARVEST
15  nearby(Crystal) AND Crystal < 12 AND Circuit < 6   → HARVEST
16  Metal < 3 AND Ore < 6                              → move_toward(Ore)
17  Circuit < 3 AND Crystal < 6                        → move_toward(Crystal)
18  Ore < 18                                           → move_toward(Ore)
19  Crystal < 12                                       → move_toward(Crystal)
20  always                                             → move_toward(Ore)
```

### 1-3. 設計図（テンプレート）

キャラクターは **AssemblyTemplate** を 1 つ持つ。テンプレートは子キャラクターの構成を定義する:

```
AssemblyTemplate = {
  components: [Frame, Actuator, Sensor, Harvester, Charger, Assembler],
  rules: <親と同じ 21 ルール>,
  templates: [<このテンプレート自身>]   ← 自己参照
}
```

この自己参照構造により、子も孫も同じテンプレートを保持し、無限世代の自己複製が可能になる。

---

## 2. 自己複製サイクルの具体例

以下は seed=42 のシミュレーションにおける char-001 の実際の行動ログから抜粋した、1 回の複製サイクルの流れ。

### フェーズ 1: 資源採集（tick 1〜60）

キャラクターは世界に配置された直後、エネルギー 1000、耐久値 1200 で活動を開始する。

```
tick  1  energy:1000  action: MOVE(toward OreNode)     inv: (空)
         → ルール#18「Ore < 18」が合致。最寄の OreNode へ移動
tick  2  energy: 989  action: HARVEST                   inv: Ore:1
         → ルール#14「nearby(OreNode) AND Ore<18 AND Metal<9」が合致
tick  5  energy: 956  action: HARVEST                   inv: Ore:4
tick  8  energy: 923  action: HARVEST                   inv: Ore:7
 ...
tick 20  energy: 792  action: HARVEST                   inv: Ore:16
tick 21  energy: 781  action: MOVE(toward OreNode)      inv: Ore:16
tick 22  energy: 770  action: HARVEST                   inv: Ore:17
tick 23  energy: 759  action: HARVEST                   inv: Ore:18
```

OreNode の近くを移動しながら Ore を 18 個集める。途中で reflexes (M2) による auto-recharge が発動し、エネルギーを補充する。

### フェーズ 2: 加工（tick 24〜30）

```
tick 24  energy: 738  action: PROCESS(Metal)            inv: Ore:16, Metal:1
         → ルール#11「energy≥300 AND Ore≥6 AND can_process(Metal)」が合致
tick 25  energy: 717  action: PROCESS(Metal)            inv: Ore:14, Metal:2
tick 26  energy: 696  action: CRAFT(Harvester)          inv: Ore:14, Harvester:1
         → ルール#6「can_craft_missing(Harvester)」が合致。Metal×2 を消費
tick 27  energy: 685  action: PROCESS(Metal)            inv: Ore:12, Harvester:1, Metal:1
 ...
tick 32  energy: 634  action: PROCESS(Metal)            inv: Ore:8, Harvester:1, Metal:3
tick 33  energy: 613  action: CRAFT(Frame)              inv: Ore:8, Harvester:1, Frame:1
         → ルール#5「can_craft_missing(Frame)」が合致。Metal×3 を消費
```

Ore ≥ 6 の条件で加工が始まる。Metal が貯まるとクラフトルール（#5〜#10）が合致し、コンポーネントが作られる。`can_craft_missing` は「まだインベントリに無いコンポーネント」のみをクラフトするため、Harvester が 2 個作られることはない。

### フェーズ 3: Crystal 採集と混合クラフト（tick 34〜80）

Frame と Harvester を作成後、残りのコンポーネント（Assembler, Actuator, Charger, Sensor）は Circuit を必要とする。

```
tick 40  energy: 580  action: MOVE(toward CrystalNode)  inv: ..., Metal:2
         → ルール#17「Circuit<3 AND Crystal<6」が合致。Crystal を求めて移動
tick 45  energy: 530  action: HARVEST                   inv: ..., Crystal:3
tick 50  energy: 480  action: HARVEST                   inv: ..., Crystal:6
tick 51  energy: 459  action: PROCESS(Circuit)          inv: ..., Crystal:4, Circuit:1
         → ルール#12 が合致
 ...
tick 66  energy: 559  action: CRAFT(Assembler)          inv: ..., Assembler:1
         → Metal×2 + Circuit×1 を消費
tick 70  energy: 495  action: CRAFT(Actuator)           inv: ..., Actuator:1
         → Metal×1 + Circuit×1 を消費
tick 77  energy: 388  action: CRAFT(Sensor)             inv: ..., Sensor:1
         → Circuit×2 を消費
```

Ore と Crystal を交互に集め、加工し、クラフトしていく。この段階でルール#16〜#19 が Metal/Circuit/Ore/Crystal の残量に応じて OreNode と CrystalNode の間を行き来させる。

### フェーズ 4: 最後のコンポーネント（tick 80〜103）

```
tick 95  energy: 400  action: PROCESS(Circuit)          inv: ..., Circuit:2
tick 96  energy: 379  action: HARVEST(Crystal)          inv: ..., Crystal:5
tick 103 energy: 417  action: CRAFT(Charger)            inv: Frame:1, Actuator:1, Sensor:1,
                                                              Harvester:1, Charger:1, Assembler:1
```

全 6 コンポーネントがインベントリに揃った。

### フェーズ 5: 充電と複製（tick 104〜）

全コンポーネントが揃うと `can_assemble` が真になるが、ASSEMBLE にはエネルギーが大量に必要（基本コスト 50 + 子への転送エネルギー 1000 = 約 1050）。

```
tick 104 energy: 417  action: MOVE(toward EnergyNode)
         → ルール#1「can_assemble AND energy<1500」が合致。充電のために移動
tick 108 energy: 812  action: RECHARGE
         → ルール#0「can_assemble AND energy<1500 AND nearby(Energy)」が合致
tick 110 energy:1206  action: RECHARGE
tick 112 energy:1600  action: ASSEMBLE ★
         → ルール#4「can_assemble AND energy≥1200」が合致！
```

---

## 3. ASSEMBLE（複製）の実行

ASSEMBLE が成功すると、以下の処理が順に行われる。

### 3-1. インベントリからコンポーネント消費

親のインベントリから子の構成に必要な 6 コンポーネントが取り除かれる。

```
親のインベントリ:
  Before: { Frame:1, Actuator:1, Sensor:1, Harvester:1, Charger:1, Assembler:1, Ore:4, ... }
  After:  { Ore:4, ... }   ← 6 コンポーネントが消費された
```

### 3-2. 子の配置

親の速度ベクトルの逆方向に `SPAWN_DISTANCE`（1.2）離れた位置に子が配置される。衝突する場合は 90° 回転して最大 4 方向を試行する。

### 3-3. テンプレートからの転写

ASSEMBLE 予約に含まれる `primitiveTemplate` から子の頭脳が構築される:

```
子キャラクター = {
  components: [Frame, Actuator, Sensor, Harvester, Charger, Assembler],
  primitiveRules: mutate(テンプレート.rules),     ← 親と同じ 21 ルール（変異あり）
  assemblyTemplates: mutate(テンプレート.templates), ← 自己参照テンプレート（変異あり）
  energy: 1000,        ← assembleEnergyTransfer
  durability: 1200,    ← Frame × frameDurability
  vm: { active: false, memory: [] }  ← VM なし
}
```

### 3-4. 変異

転写時に、ルールのパラメータに確率的な変異が加わる:

- **変異率**: 1 ルールあたり約 2%（`MUTATION_RATE = 0.02`）
- **変異幅**: 元の値 ± 3（`MUTATION_RANGE = 3`）
- **対象**: 条件の arg0 またはアクションの arg0

例: 親のルール `energy_below(300)` が子では `energy_below(302)` になる、など。
変異はルールのパラメータ（数値）のみで、ルールの型（条件型・アクション型）や順序は変化しない。

テンプレート内のルールにも同じ変異が適用されるため、孫世代ではさらに異なるパラメータを持つ。

### 3-5. 子の起動

Processor を持たないキャラクターは、生成直後から `primitiveRules` が評価される（VM の ACTIVATE が不要）。子は次の tick から親と同じルールに従って行動を開始し、自身も資源を集めて複製サイクルに入る。

---

## 4. 自己複製の全体像

```
                    ┌──── 採集 ────┐
                    ↓              │
 [誕生] → 探索 → 収穫(Ore/Crystal) → 加工(Metal/Circuit)
                    │              ↑
                    └──────────────┘
                           │
                           ↓  全コンポーネント完成
                    ┌──── 充電 ────┐
                    ↓              │
                エネルギー蓄積 ──→ ASSEMBLE ★
                                   │
                           ┌───────┴───────┐
                           ↓               ↓
                     親（空インベントリ）  子（同構成・同ルール）
                     → 次の採集サイクルへ  → 自身の採集サイクルへ
```

1 回の複製サイクルに約 100 tick かかる。この間に:
- 約 18 回の HARVEST（Ore）
- 約 12 回の HARVEST（Crystal）
- 約 15 回の PROCESS
- 6 回の CRAFT
- 数回の RECHARGE
- 1 回の ASSEMBLE
- 残りは MOVE

が実行される。1 tick に 1 アクションしか実行できないため、VM ベースのキャラクター（MOVE + HARVEST を同時実行可能）と比較して約 2 倍の時間がかかる。

---

## 5. 集団動態

初期 10 個体のシミュレーション（2000 tick）:

```
tick     個体数   出来事
   0       10    初期配置
 100       18    最初の世代が複製を開始
 200       30    指数的増加フェーズ
 500      102    資源が潤沢なうちは急速に増加
 800      190    資源が減少し始め、増加が鈍化
1100      201    ピーク。資源ノードの再生速度と消費が均衡
1400      159    加齢代謝の増加により老齢個体が死亡、緩やかに減少
2000      134    準安定状態

総出産: 453, 総死亡: 334
```

PrimitiveGatherer（複製不能種）は tick 600 前後で全滅。複製能力を持たない種は、耐久値の自然減衰により世代交代ができず淘汰される。

---

## 6. なぜ AND 条件が不可欠だったか

AND 条件がない場合、以下の問題で自己複製に到達できなかった:

| 問題 | AND なし | AND あり |
|------|---------|---------|
| 不要資源の収穫 | nearby(OreNode) だけで発火。Ore を無限に貯め続ける | nearby(Ore) AND Ore<18 AND Metal<9 で必要時のみ発火 |
| 即時加工による材料消費 | can_process だけで発火。Ore 2個で即 Metal に変換 → 全て Harvester に消費 | energy≥300 AND Ore≥6 AND can_process で節度ある加工 |
| エネルギー枯渇 | recharge が nearby だけで発火、または energy_below だけで発火 | energy<500 AND nearby(Energy) で効率的充電 |
| 複製前のエネルギー確保 | can_assemble だけで発火 → エネルギー不足で失敗を繰り返す | can_assemble AND energy≥1200 で確実に成功 |
