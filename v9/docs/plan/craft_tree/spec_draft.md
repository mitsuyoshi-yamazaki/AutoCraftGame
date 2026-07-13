# クラフトツリー仕様（レビュー待ちドラフト）

本文書はv9クラフトツリーの仕様である。

**データの実体は `v9/src/craft/`（substances.ts, recipes.ts, stability.ts）にあり、
原子保存・到達可能性・デッドエンド・原子循環・供給源・エネルギー循環は `npm test` で機械検証される。**
本文書の物質・レシピ・コスト表は `npm run craft:report -- --markdown` の生成出力であり、
データとの一致は `test/docs-sync.test.ts` が保証する（表を手動編集してはならない）。

初版ドラフト（対話ベースで作成、git履歴参照）で発見された構造的欠陥と再設計の経緯は
[design_notes.md](design_notes.md) を参照。

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

### 資源特性（自然産出）

自然産出する物質は7種のみ。他の全物質はクラフト経由でのみ入手できる。

| 物質 | 原子 | 存在量 |
|------|------|--------|
| BaseSolid | S | 豊富 |
| ContaminatedMass | S+X | 豊富（低品位。Xが世界に入る唯一の経路） |
| BindingShard | S+B | 中程度 |
| VolatileCore | A | 限定的 |
| SignalFluid | T | 限定的 |
| InfoSeed | I | 希少（高度コンポーネントのボトルネック） |
| CatalystGrain | C | 希少 |

## 2. 設計原則

1. **原子保存**: すべてのレシピで入力と出力の原子収支が種類別に一致する
2. **実在物質のみ**: レシピの出力は必ず定義済み物質（裸の原子を「余剰」として出力しない）
3. **触媒表現**: 触媒は入力と出力の両方に同一物質・同数で現れる（R1c, R27c）
4. **循環保証**: 全原子種が長さ2以上の変換循環を持つ（デッドエンドなし）
5. **経路の多様性**: 同じ生産物を異なるコスト構造で得られる（清浄版/触媒版/dirty版）
6. **分解は格下げ**: コンポーネントの分解出力は最下層物質のみ（中間工程は返らない）
7. **エネルギー**: 正=消費、負=放出。物質が閉じるどの循環も合計エネルギーは正（ポンプ禁止）

## 3. X原子（不純物）の設計

原子保存の下では「Xを含まない入力からResidueを生成する」レシピは定義できない。
そのためXは以下の設計とする:

- **供給**: 自然産出する低品位資源 ContaminatedMass（S2X1）としてのみ世界に入る
- **分離**: 精製 R33（高コスト）で清浄な BaseSolid と Residue に分離される
- **固定**: R32（安価）で Residue を構造に固定し ContaminatedMass に戻せる
- **dirty経路**: ContaminatedMass を素材に直接使うレシピ（RD1, RD2）は安価だが Residue を排出する
- **淘汰圧**: Xは消滅しないため、dirty経路を使うほど Residue が蓄積し、
  保管（Storage占有）・投棄（環境汚染）・再固定（コスト）のいずれかを強いる

## 4. 安定性モデル

### 安定性スコア

```
安定性 = Σ(原子係数 × 個数) + 階層ペナルティ
原子係数: S=+10, B=+4, A=-12, T=-6, I=-8, C=0, X=+8
階層ペナルティ: 最下層=0, 中間=-5, コンポーネント=-15
```

初版の「原子構成の線形和」のみのモデルは、原子保存の下では合計値が全レシピで不変になり、
「より安定な物質へ自発変化する」方向が定義できない（機械的証明: test/stability.test.ts）。
階層ペナルティは「複雑に組織された構造ほど壊れやすい」ことを表し、この退化を解消する。

### 自発変化

独立した変換ルールテーブルは持たず、レシピテーブルを再利用する:

- **分解系レシピ（分解型・コンポーネント分解）のうち、合計安定性が閾値（+10）以上増加するもの**だけが、実行者なしで自発的に発生しうる
- 現データではコンポーネント分解（RX1〜RX8, Δ安定性=+15）のみが該当する
  - 放置されたコンポーネントはやがて最下層物質に崩壊し、資源が循環に戻る
- 合成方向（コンポーネント生成）は必ず合計安定性を下げる＝エネルギー投入によってのみ進む
- 発生速度・温度依存・触媒隣接の効果はシミュレータ仕様（Step 2）で定義する

## 5. 物質・レシピ・コスト（生成データ）

<!-- generated:craft-tables:start このセクションは `npm run craft:report -- --markdown` の出力。手動編集しないこと -->
## 物質一覧

### 最下層物質（15種）

| 物質 | コード | 構成 | 安定性 | 自然産出 | 説明 |
|------|:---:|------|--------|----------|------|
| BaseSolid | 1 | S2 | 20 | 産出（豊富） | 最も基本的な安定物質 |
| DenseMatrix | 2 | S3 | 30 | - | 高安定・低反応性 |
| BindingShard | 3 | S1B1 | 14 | 産出（中程度） | 基本的な接続素材 |
| FlexibleChain | 4 | S1B2 | 18 | - | 結合性が高いがやや不安定 |
| ReactiveFragment | 5 | S1A1 | -2 | - | 最も基本的な活性物質 |
| VolatileCore | 6 | A2 | -24 | 産出（限定的） | 非常に不安定・分解しやすい。分解時にエネルギーを放出する |
| ChargedBinder | 7 | B1A1 | -8 | - | 結合しながら反応を起こす |
| SignalFluid | 8 | T2 | -12 | 産出（限定的） | 流動性・伝達性 |
| ConductiveGel | 9 | S1T1 | 4 | - | 構造＋伝達 |
| InfoSeed | 10 | I1 | -8 | 産出（希少） | 最小の情報単位（非常に不安定） |
| EncodedFragment | 11 | S1I1 | 2 | - | 安定化された情報 |
| PatternChain | 12 | B1I1 | -4 | - | 結合可能な情報構造 |
| CatalystGrain | 13 | C1 | 0 | 産出（希少） | 単純触媒 |
| ActiveCatalyst | 14 | A1C1 | -12 | - | 反応促進能力が高い |
| Residue | 15 | X1 | 8 | - | 低機能・安定・蓄積しやすい。消滅させることはできず、ContaminatedMassとの間で固定/分離を繰り返す |

### 中間物質（12種）

| 物質 | コード | 構成 | 安定性 | 自然産出 | 説明 |
|------|:---:|------|--------|----------|------|
| ReinforcedMatrix | 16 | S3B1 | 29 | - | 高安定構造基盤 |
| ElasticFramework | 17 | S2B2 | 23 | - | 可変構造 |
| ReactiveCluster | 18 | S1A2 | -19 | - | 高反応性塊 |
| StabilizedReactor | 19 | S2B1A1 | 7 | - | 制御された反応媒体 |
| SignalMatrix | 20 | S2T2 | 3 | - | 伝達ネットワーク |
| ActiveConductor | 21 | S1A1T1 | -13 | - | エネルギー＋信号伝達 |
| DataLattice | 22 | S2I2 | -1 | - | 安定な情報保存 |
| LogicFilament | 23 | B1I2 | -17 | - | 演算的構造 |
| EncodedMatrix | 24 | S2B1I1 | 11 | - | 構造＋情報の統合 |
| CatalystMatrix | 25 | S1B1C1 | 9 | - | 安定触媒基盤 |
| HyperCatalyst | 26 | A2C1 | -29 | - | 強力だが不安定 |
| ContaminatedMass | 27 | S2X1 | 23 | 産出（豊富） | 不純物を含む低品位素材。自然産出し、X原子が世界に入る唯一の経路。精製すると BaseSolid と Residue に分離できる |

### コンポーネント（8種）

| 物質 | コード | 構成 | 安定性 | 自然産出 | 説明 |
|------|:---:|------|--------|----------|------|
| Assembler | 28 | S3B2A1C1 | 11 | - | 物質の合成（レシピ実行）を行う |
| Disassembler | 29 | S2B1A3C1 | -27 | - | 死骸や他コンポーネントの分解を行う。Assemblerより活性原子が多い |
| Processor | 30 | S2B1I4 | -23 | - | プログラムを実行する。最も情報原子を要求する |
| MemoryCore | 31 | S4B1I3 | 5 | - | 追加のプログラム/データ格納領域 |
| Actuator | 32 | S3B2A1T1 | 5 | - | 移動の推進力を発生する |
| Sensor | 33 | S2B1I1T2 | -11 | - | 周囲のオブジェクトを探知する |
| Harvester | 34 | S3B1A1T1 | 1 | - | 周囲の資源・エネルギーを回収する |
| Storage | 35 | S6B1 | 49 | - | 資源とエネルギーを格納する。構造原子のみで構成される |

## レシピ一覧

全レシピの原子収支・到達可能性・循環は `npm test` で機械検証される。
エネルギーコスト（E）は暫定値（正=消費、負=放出）。
コード列はプログラムI/Oで使用する数値ID（データ定義順の連番。docs/specs/03_program_io.md）。

### 合成型（22件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| R1 | 1 | BaseSolid + BindingShard×2 | DenseMatrix + FlexibleChain | 15 | 構造の高密度化。副産物として柔軟鎖が生じる |
| R1c | 2 | BaseSolid + BindingShard×2 + CatalystGrain | DenseMatrix + FlexibleChain + CatalystGrain | 8 | R1の触媒版。触媒は消費されない |
| R2 | 3 | BindingShard×4 | FlexibleChain×2 + BaseSolid | 10 | 接続素材から柔軟鎖を合成する |
| R6 | 6 | ChargedBinder + ReactiveFragment | VolatileCore + BindingShard | 15 | 活性を濃縮し活性コアを再生する（A循環の閉路） |
| R7 | 7 | BaseSolid + SignalFluid | ConductiveGel×2 | 10 | 伝達流体を構造に定着させる |
| R9 | 9 | InfoSeed×2 + BaseSolid | EncodedFragment×2 | 20 | 情報を構造へ焼き付けて安定化する |
| R12 | 12 | CatalystGrain×2 + ReactiveFragment×2 | ActiveCatalyst×2 + BaseSolid | 20 | 触媒に活性を付与する |
| R32 | 17 | BaseSolid + Residue | ContaminatedMass | 5 | 不純物を構造に固定する（安価な廃棄物処理） |
| RD1 | 19 | ContaminatedMass + BindingShard×2 | DenseMatrix + FlexibleChain + Residue | 10 | R1のdirty版。低品位素材を直接使うため安価だが不純物が残る |
| RD2 | 20 | InfoSeed×2 + ContaminatedMass | EncodedFragment×2 + Residue | 12 | R9のdirty版。安価だが不純物が残る |
| R21 | 21 | DenseMatrix×2 + BindingShard×2 | ReinforcedMatrix×2 + BaseSolid | 25 | 高安定構造基盤の合成 |
| R22 | 22 | FlexibleChain×2 + BaseSolid | ElasticFramework + BindingShard×2 | 20 | 可変構造の合成 |
| R23 | 23 | ReactiveFragment×2 + VolatileCore | ReactiveCluster×2 | 20 | 高反応性塊の合成 |
| R24 | 24 | ReactiveCluster×2 + BindingShard×2 | StabilizedReactor×2 + VolatileCore | 30 | 反応を制御構造に収める。余剰活性が活性コアとして回収される |
| R25 | 25 | ConductiveGel×2 | SignalMatrix | 20 | 伝達ネットワークの合成 |
| R26 | 26 | ReactiveFragment×2 + ConductiveGel×2 | ActiveConductor×2 + BaseSolid | 25 | 活性伝達体の合成 |
| R27 | 27 | EncodedFragment×2 | DataLattice | 30 | 安定情報格子の合成 |
| R27c | 28 | EncodedFragment×2 + ActiveCatalyst | DataLattice + ActiveCatalyst | 15 | R27の触媒版。触媒は消費されない |
| R28 | 29 | PatternChain + InfoSeed | LogicFilament | 30 | 演算構造の合成 |
| R29 | 30 | EncodedFragment + BindingShard | EncodedMatrix | 25 | 構造と情報の統合 |
| R30 | 31 | CatalystGrain + BindingShard | CatalystMatrix | 25 | 安定触媒基盤の合成 |
| R31 | 32 | ActiveCatalyst×2 + VolatileCore | HyperCatalyst×2 | 30 | 強力だが不安定な触媒の合成 |

### 分解型（5件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| R4 | 4 | BaseSolid + VolatileCore | ReactiveFragment×2 | -10 | 活性コアで構造を割り、エネルギーを放出する（バッテリー用途） |
| R8 | 8 | ConductiveGel×2 | BaseSolid + SignalFluid | 5 | ゲルから伝達流体を回収する（T循環の閉路） |
| R13 | 13 | ActiveCatalyst×2 | CatalystGrain×2 + VolatileCore | -5 | 活性触媒の失活。少量のエネルギーを放出する（C循環の閉路） |
| R19 | 15 | DenseMatrix×2 + VolatileCore | ReactiveFragment×2 + BaseSolid×2 | 5 | 高密度構造を活性で砕く（S循環の閉路） |
| R20 | 16 | EncodedFragment×2 | InfoSeed×2 + BaseSolid | 25 | 情報構造から希少な情報原子を回収する（I循環の閉路） |

### 再配置型（4件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| R5 | 5 | ReactiveFragment + BindingShard | ChargedBinder + BaseSolid | 5 | 活性を結合素材へ移す |
| R10 | 10 | EncodedFragment + BindingShard | PatternChain + BaseSolid | 10 | 情報を結合可能な形へ再配置する |
| R11 | 11 | PatternChain + BaseSolid | EncodedFragment + BindingShard | 10 | R10の逆変換 |
| R18 | 14 | FlexibleChain×2 + BaseSolid | BindingShard×4 | 10 | 柔軟鎖を接続素材へ戻す（B循環の閉路） |

### 精製型（1件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| R33 | 18 | ContaminatedMass | BaseSolid + Residue | 30 | 低品位素材の精製。清浄な構造材と不純物に分離する（高コスト） |

### コンポーネント生成（8件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| RC1 | 33 | DataLattice + LogicFilament | Processor | 150 | 情報格子と演算構造からProcessorを組み上げる |
| RC2 | 34 | DataLattice + EncodedMatrix | MemoryCore | 120 | 情報格子と統合構造からMemoryCoreを組み上げる |
| RC3 | 35 | StabilizedReactor + CatalystMatrix | Assembler | 120 | 制御反応媒体と触媒基盤からAssemblerを組み上げる |
| RC4 | 36 | StabilizedReactor + HyperCatalyst | Disassembler | 120 | 制御反応媒体と強触媒からDisassemblerを組み上げる |
| RC5 | 37 | ElasticFramework + ActiveConductor | Actuator | 100 | 可変構造と活性伝達体からActuatorを組み上げる |
| RC6 | 38 | SignalMatrix + PatternChain | Sensor | 100 | 伝達ネットワークとパターン構造からSensorを組み上げる |
| RC7 | 39 | StabilizedReactor + ConductiveGel | Harvester | 100 | 制御反応媒体と伝達ゲルからHarvesterを組み上げる |
| RC8 | 40 | ReinforcedMatrix + DenseMatrix | Storage | 80 | 強化構造からStorageを組み上げる |

### コンポーネント分解（8件）

| ID | コード | 入力 | 出力 | E | 概要 |
|----|:---:|------|------|---|------|
| RX1 | 41 | Processor | EncodedFragment×2 + PatternChain + InfoSeed | 15 | Processorの分解。希少な情報系素材が回収できる |
| RX2 | 42 | MemoryCore | EncodedFragment×2 + PatternChain + BaseSolid | 15 | MemoryCoreの分解 |
| RX3 | 43 | Assembler | CatalystGrain + ChargedBinder + BindingShard + BaseSolid | 15 | Assemblerの分解。触媒が回収できる |
| RX4 | 44 | Disassembler | CatalystGrain + ChargedBinder + VolatileCore + BaseSolid | 15 | Disassemblerの分解 |
| RX5 | 45 | Actuator | ConductiveGel + ReactiveFragment + FlexibleChain | 15 | Actuatorの分解 |
| RX6 | 46 | Sensor | SignalFluid + PatternChain + BaseSolid | 15 | Sensorの分解 |
| RX7 | 47 | Harvester | ConductiveGel + ReactiveFragment + BindingShard | 15 | Harvesterの分解 |
| RX8 | 48 | Storage | DenseMatrix + BaseSolid + BindingShard | 15 | Storageの分解 |

## 生産コスト解析

### 生産コスト（自然資源からの正準経路・貪欲展開による上界）

| 対象 | エネルギー | 工程数 | 自然資源消費 |
|------|-----------|--------|--------------|
| Assembler | 185 | 5 | BindingShard×3, VolatileCore×2, BaseSolid×1, CatalystGrain×1 |
| Disassembler | 200 | 7 | VolatileCore×3, BaseSolid×2, BindingShard×2, CatalystGrain×2 |
| Processor | 260 | 6 | InfoSeed×5, BaseSolid×2, BindingShard×1 |
| MemoryCore | 215 | 5 | InfoSeed×4, BaseSolid×2, BindingShard×1 |
| Actuator | 175 | 7 | BaseSolid×5, BindingShard×4, VolatileCore×1, SignalFluid×1 |
| Sensor | 160 | 5 | BaseSolid×2, InfoSeed×2, SignalFluid×1, BindingShard×1 |
| Harvester | 150 | 5 | BaseSolid×2, VolatileCore×2, BindingShard×2, SignalFluid×1 |
| Storage | 150 | 5 | BindingShard×8, BaseSolid×2 |
| **一式（8種×1）** | 1405 | 39 | BindingShard×14, BaseSolid×10, InfoSeed×9, VolatileCore×6, CatalystGrain×3, SignalFluid×3 |

<!-- generated:craft-tables:end -->

## 6. 規模の現状と拡張方針

現状は 35物質・48レシピ・3階層の「閉じた小系」である（policy.md の方針どおり、
小系で循環とコンポーネント生成を成立させてから拡張する）。
requirements.md の目標規模（50〜100物質）へは、シミュレーション実験でボトルネックを
確認しながら中間物質と経路を追加して到達する。

## 7. 未決事項

- エネルギーコストの本調整（現値は相対関係のみ設計した暫定値。シミュレータ実装後に実測で調整）
- 安定性係数・閾値の調整（同上）
- 自発変化の速度スケール・温度依存・触媒隣接効果（シミュレータ仕様で定義）
- 中間物質の自然分解レシピ（現状は分解型レシピが最下層とコンポーネントに集中）
- dirty/触媒経路の拡充（現状はパターン確立のための各2件）
- 修理メカニズムとそのコスト設計（耐久度導入時。再生産コスト1405Eを下回らないこと）
