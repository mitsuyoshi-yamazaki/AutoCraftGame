# クラフトツリー仕様（作成途中）

本文書は対話を通じて作成途中のクラフトツリーの仕様をまとめたものである。
コンポーネント生成レシピおよび全体バランス調整は未着手。

## 1. 原子（7種）

| 記号 | 名称 | 用途 | 特徴 |
|------|------|------|------|
| S | Structure（構造） | 安定・骨格形成 | 多いほど安定・重い。全物質のベース |
| B | Bond（結合） | 他物質との結合性 | 反応性を上げる。クラフトの中核 |
| A | Active（活性） | 反応駆動 | 不安定・高エネルギー。分解・合成促進 |
| I | Information（情報） | 構造パターン保持 | 少量で意味を持つ。Processor/Memory必須 |
| T | Transfer（伝達） | 信号・エネルギー伝達 | 流動性が高い。Actuator/Sensor系 |
| C | Catalytic（触媒） | 反応変化を促進 | 消費されにくい。効率改善・分岐生成 |
| X | Waste/Noise（不純物） | 副作用・ノイズ | 安定だが低機能。廃棄物・再処理対象 |

### 資源特性

- S: 基盤資源（最も豊富）
- B: 中程度
- A: やや少なめ（制御資源）
- T: 限定的
- I: 希少（ボトルネック）
- C: 希少
- X: 副産物として生成

## 2. 安定性モデル

### 安定性スコア（スカラー値）

```
安定性 = k1*S + k2*B - k3*A - k4*T - k5*I + k6*X
```

- S（構造）→ 安定化
- B（結合）→ やや安定化
- A（活性）→ 不安定化
- T（伝達）→ 不安定化
- I（情報）→ 不安定化（精密構造のため）
- X（不純物）→ 安定化（だが低機能）

### 自発変化ルール

- より安定な物質へ遷移する
- 温度が高いほど遷移確率上昇
- A（活性原子）が多いほど遷移確率上昇
- 安定性の差分が一定以上でのみ変化（実装簡略版）

## 3. 階層1: 基本物質（15種）

### 構造系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 1 | BaseSolid | S2 | 最も基本的な安定物質 |
| 2 | DenseMatrix | S3 | 高安定・低反応性 |
| 3 | BindingShard | S1 B1 | 基本的な接続素材 |
| 4 | FlexibleChain | S1 B2 | 結合性が高いがやや不安定 |

### 活性系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 5 | ReactiveFragment | S1 A1 | 最も基本的な活性物質 |
| 6 | VolatileCore | A2 | 非常に不安定・分解しやすい |
| 7 | ChargedBinder | B1 A1 | 結合しながら反応を起こす |

### 伝達系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 8 | SignalFluid | T2 | 流動性・伝達性 |
| 9 | ConductiveGel | S1 T1 | 構造＋伝達 |

### 情報系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 10 | InfoSeed | I1 | 最小の情報単位（非常に不安定） |
| 11 | EncodedFragment | S1 I1 | 安定化された情報 |
| 12 | PatternChain | B1 I1 | 結合可能な情報構造 |

### 触媒系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 13 | CatalystGrain | C1 | 単純触媒 |
| 14 | ActiveCatalyst | C1 A1 | 反応促進能力が高い |

### 不純物系

| # | 名称 | 構成 | 特徴 |
|---|------|------|------|
| 15 | Residue | X1 | 低機能・安定・蓄積しやすい |

## 4. 階層2〜3: 中間物質（12種）

### 構造強化系

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M1 | ReinforcedMatrix | S3 B1 | 高安定構造基盤 |
| M2 | ElasticFramework | S2 B2 | 可変構造 |

### 活性統合系

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M3 | ReactiveCluster | S1 A2 | 高反応性塊 |
| M4 | StabilizedReactor | S2 A1 B1 | 制御された反応媒体 |

### 伝達・運動系

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M5 | SignalMatrix | S2 T2 | 伝達ネットワーク |
| M6 | ActiveConductor | S1 T1 A1 | エネルギー＋信号伝達 |

### 情報集約系

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M7 | DataLattice | S2 I2 | 安定な情報保存 |
| M8 | LogicFilament | B1 I2 | 演算的構造 |
| M9 | EncodedMatrix | S2 B1 I1 | 構造＋情報の統合 |

### 触媒高度化

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M10 | CatalystMatrix | S1 C1 B1 | 安定触媒基盤 |
| M11 | HyperCatalyst | C1 A2 | 強力だが不安定 |

### 廃棄物混入系

| # | 名称 | 構成 | 用途 |
|---|------|------|------|
| M12 | ContaminatedMass | S2 X1 | 劣化素材（再処理対象） |

## 5. レシピ

すべてのレシピは原子収支が一致する（原子保存）。

### 基本合成レシピ（構造系）

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R1 | BaseSolid + BindingShard | DenseMatrix + (B1余剰) | S2 + S1B1 → S3 + B1 |
| R2 | BindingShard + BindingShard | FlexibleChain + (S1余剰) | S1B1 + S1B1 → S1B2 + S1 |
| R3 | BaseSolid + FlexibleChain | DenseMatrix + BindingShard | S2 + S1B2 → S3 + S1B1 |

### 活性系生成

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R4 | BaseSolid + VolatileCore | ReactiveFragment x2 | S2 + A2 → 2x(S1A1) |
| R5 | ReactiveFragment + BindingShard | ChargedBinder + BaseSolid | S1A1 + S1B1 → B1A1 + S2 |
| R6 | ChargedBinder + ReactiveFragment | VolatileCore + BindingShard | B1A1 + S1A1 → A2 + S1B1 |

A循環: R4 → R5 → R6 → R4

### 伝達系生成

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R7 | ReactiveFragment + SignalFluid | ConductiveGel + VolatileCore | S1A1 + T2 → S1T1 + A2 |
| R8 | ConductiveGel + VolatileCore | SignalFluid + ReactiveFragment | S1T1 + A2 → T2 + S1A1 |

T循環: R7 ⇄ R8

### 情報系生成

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R9 | InfoSeed + BaseSolid | EncodedFragment + (S1余剰) | I1 + S2 → S1I1 + S1 |
| R10 | EncodedFragment + BindingShard | PatternChain + BaseSolid | S1I1 + S1B1 → B1I1 + S2 |
| R11 | PatternChain + BaseSolid | EncodedFragment + BindingShard | B1I1 + S2 → S1I1 + S1B1 |

I循環: R9 → R10 ⇄ R11

### 触媒系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R12 | CatalystGrain + ReactiveFragment | ActiveCatalyst + (S1余剰) | C1 + S1A1 → C1A1 + S1 |
| R13 | ActiveCatalyst | CatalystGrain + VolatileCore | C1A1 → C1 + A2 |

C循環: R12 ⇄ R13

**注: R13の原子収支に不整合あり（A1 → A2）。要修正。**

### 不純物生成（副作用）

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R14 | FlexibleChain + ReactiveFragment | BindingShard + Residue + ... | S1B2 + S1A1 → S1B1 + X1 + ... |
| R15 | ChargedBinder + SignalFluid | ConductiveGel + Residue + ... | B1A1 + T2 → S1T1 + X1 + ... |

**注: R14, R15ともに原子収支が不明瞭（元の記述でも不整合が示唆されている）。要修正。**

### 不純物処理

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R16 | Residue + ReactiveFragment | BaseSolid + ... | X1 + S1A1 → S2 + ... |
| R17 | Residue + VolatileCore | ReactiveFragment + ... | X1 + A2 → S1A1 + ... |

**注: R16, R17ともに原子収支が不整合（Xの行き先、Sの出所が不明）。要修正。**

### 再配置系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R18 | FlexibleChain + BaseSolid | BindingShard x2 | S1B2 + S2 → 2x(S1B1) |

**注: R18の原子収支不整合（S1B2 + S2 = S3B2、2x(S1B1) = S2B2）。要修正。**

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R19 | DenseMatrix + ReactiveFragment | BaseSolid + BindingShard | S3 + S1A1 → S2 + S1B1 |

**注: R19の原子収支不整合（A1が消失、B1が出現）。要修正。**

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R20 | EncodedFragment + ReactiveFragment | PatternChain + Residue + ... | S1I1 + S1A1 → B1I1 + X1 + ... |

**注: R20の原子収支不整合（S2A1 → B1X1、SとAが消失、BとXが出現）。要修正。**

### 中間物質生成レシピ

#### 構造系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R21 | DenseMatrix + BindingShard | ReinforcedMatrix + (S1余剰) | S3 + S1B1 → S3B1 + S1 |
| R22 | FlexibleChain + BaseSolid | ElasticFramework + (S1余剰) | S1B2 + S2 → S2B2 + S1 |

#### 活性系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R23 | ReactiveFragment + VolatileCore | ReactiveCluster + (A1余剰) | S1A1 + A2 → S1A2 + A1 |
| R24 | ReactiveCluster + BindingShard | StabilizedReactor + (A1余剰) | S1A2 + S1B1 → S2A1B1 + A1 |

#### 伝達系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R25 | ConductiveGel + SignalFluid | SignalMatrix + (T1余剰) | S1T1 + T2 → S2T2 + T1 |

**注: R25の原子収支不整合（S1が入力にしかない）。要修正。**

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R26 | ReactiveFragment + ConductiveGel | ActiveConductor + (S1余剰) | S1A1 + S1T1 → S1T1A1 + S1 |

#### 情報系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R27 | EncodedFragment + InfoSeed | DataLattice | S1I1 + I1 → S2I2 |

**注: R27の原子収支不整合（S1 → S2、Sが1増加）。要修正。**

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R28 | PatternChain + InfoSeed | LogicFilament | B1I1 + I1 → B1I2 |
| R29 | EncodedFragment + BindingShard | EncodedMatrix | S1I1 + S1B1 → S2B1I1 |

#### 触媒系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R30 | CatalystGrain + BindingShard | CatalystMatrix | C1 + S1B1 → S1C1B1 |
| R31 | ActiveCatalyst + VolatileCore | HyperCatalyst + (A1余剰) | C1A1 + A2 → C1A2 + A1 |

#### 廃棄物系

| ID | 入力 | 出力 | 原子収支 |
|----|------|------|----------|
| R32 | BaseSolid + Residue | ContaminatedMass | S2 + X1 → S2X1 |
| R33 | ContaminatedMass + ReactiveFragment | BaseSolid + ... | S2X1 + S1A1 → S2 + ... |

**注: R33の原子収支不整合（S1, A1, X1の行き先が不明）。要修正。**

## 6. 全原子の循環経路

| 原子 | 循環経路 |
|------|----------|
| S | BaseSolid ⇄ DenseMatrix |
| B | BindingShard ⇄ FlexibleChain |
| A | VolatileCore ⇄ ReactiveFragment |
| T | SignalFluid ⇄ ConductiveGel |
| I | InfoSeed ⇄ EncodedFragment ⇄ PatternChain |
| C | CatalystGrain ⇄ ActiveCatalyst |
| X | Residue ⇄ BaseSolid / ReactiveFragment |

## 7. コンポーネントへの接続（想定）

中間物質からコンポーネントへの接続は以下が想定されている（レシピは未定義）:

| コンポーネント | 主要原子構成の傾向 | 前段となる中間物質（想定） |
|----------------|-------------------|--------------------------|
| Assembler | B + C + A 多め | StabilizedReactor + CatalystMatrix |
| Processor | I 多め + S | DataLattice + LogicFilament |
| MemoryCore | I 多量 + S 高 | DataLattice系 |
| Actuator | T + A | ActiveConductor系 |
| Sensor | T + I | SignalMatrix + ActiveConductor |
| Storage | S 極大 | ReinforcedMatrix系 |
| Disassembler | （未検討） | （未検討） |

## 8. 未着手事項

- コンポーネント生成レシピの定義
- 全レシピの原子収支の厳密な検証と修正（本文書中に注記した不整合箇所）
- 全体バランス調整（X生成量、I供給量）
- 安定性スコアの係数（k1〜k6）の決定
- エネルギーコストの各レシピへの割り当て
