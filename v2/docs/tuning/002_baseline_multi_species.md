# 002: ベースライン — 複数種族シミュレーション

## 実施日: 2026-04-01

## 目的

現在のパラメータ・プログラム・初期状態での複数種族の共存状況を把握する。

## 条件

| 項目 | 値 |
|------|-----|
| マップ | 20x20 |
| OreNode | 12 (remaining: 50) |
| CrystalNode | 12 (remaining: 50) |
| EnergyNode | 8 (prodRate: 100, maxStored: 2000) |
| 初期エネルギー | 5000 |
| 種族 | Replicator×2, Scavenger×2, Explorer×2, Survivor×2 (計8体) |
| tick数 | 10000 |
| シード | 42, 123, 7 |

### パラメータ

- FRAME_DURABILITY: 200
- RECHARGE_AMOUNT: 200
- ENERGY_COST_REPAIR: 100
- REPAIR_AMOUNT: 200
- ENERGY_METABOLISM_THRESHOLD: 3000
- ENERGY_METABOLISM_SCALE: 9,000,000

## 結果

### Seed 42

| tick | chars | Explorer | Replicator | Scavenger | Survivor | resNodes |
|------|-------|----------|------------|-----------|----------|----------|
| 0 | 8 | 2 | 2 | 2 | 2 | 24 |
| 500 | 9 | 0 | 2 | 6 | 1 | 18 |
| 1000 | 12 | 0 | 1 | 10 | 0 | 18 |
| 2000 | 9 | 0 | 1 | 8 | 0 | 18 |
| 5000 | 13 | 0 | 0 | 13 | 0 | 18 |
| 10000 | 10 | 0 | 0 | 10 | 0 | 18 |

- Explorer: tick 199で絶滅
- Survivor: tick 599で絶滅
- Replicator: tick 4599で絶滅
- **Scavenger単独で10000tickまで生存**

### Seed 123

| tick | chars | Explorer | Replicator | Scavenger | Survivor | resNodes |
|------|-------|----------|------------|-----------|----------|----------|
| 0 | 8 | 2 | 2 | 2 | 2 | 24 |
| 500 | 8 | 0 | 2 | 5 | 1 | 16 |
| 2000 | 11 | 0 | 1 | 10 | 0 | 13 |
| 5000 | 3 | 0 | 1 | 2 | 0 | 12 |
| 10000 | 3 | 0 | 1 | 2 | 0 | 12 |

- Explorer: tick 199で絶滅
- Survivor: tick 1599で絶滅
- **Replicator(1体) + Scavenger(2体) が安定共存**（低人口で膠着）

### Seed 7

| tick | chars | Explorer | Replicator | Scavenger | Survivor | resNodes |
|------|-------|----------|------------|-----------|----------|----------|
| 0 | 8 | 2 | 2 | 2 | 2 | 24 |
| 500 | 9 | 0 | 2 | 6 | 1 | 18 |
| 2000 | 8 | 0 | 2 | 5 | 1 | 18 |
| 5000 | 10 | 0 | 2 | 7 | 1 | 17 |
| 10000 | 10 | 0 | 2 | 7 | 1 | 17 |

- Explorer: tick 199で絶滅
- **Replicator(2) + Scavenger(5-7) + Survivor(1) が安定共存**（ベストケース）

## 分析

### 致命的な問題

1. **Explorerは全シードでtick 199に絶滅**
   - FRAME_DURABILITY=200（1 Frame）なので最大寿命が200tick
   - 修理ルールが無い設計のため、寿命＝200tick固定
   - 自己複製に必要な工程数（HARVEST×40回 + PROCESS×21回 + CRAFT×8回 + ASSEMBLE + WRITE + ACTIVATE + 移動 + 充電 = 100tick以上）に対して寿命が短すぎる
   - **200tickで1体も子を産めずに全滅する**

2. **Survivorは早期に絶滅しやすい**
   - エネルギー閾値4500が高すぎ、RECHARGEに時間を費やし、資源採掘が進まない
   - 修理閾値150も高い（最大200のうち150以下で修理 → 頻繁にREPAIRで100エネルギー消費）
   - Scavengerに対して生存優位性がない

### 構造的な問題

3. **Scavengerの自己持続ループ**
   - Scavengerは死体→分解→コンポーネント回収→再組立の閉ループで、資源ノードを消費せずに持続可能
   - エネルギーノードからのエネルギーのみで自立するため、他種族が絶滅しても影響がない
   - 結果として「最終的にScavengerだけが残る」パターンが多い

4. **エネルギーがボトルネック**
   - 8 EnergyNode × 100/tick = 800 energy/tick の総生産量
   - 各キャラクターの基礎代謝: ~16 energy/tick（コンポーネント8個）
   - 理論上最大~50体維持可能だが、ノードへのアクセス競争により実効10体程度が上限
   - 資源ノードは10000tickでもほとんど消費されていない（24→17-18）

5. **Replicator/Explorer/Survivorは同一ニッチ**
   - 3種とも鉱石採掘→加工→組立の同じ生態的ニッチを占める
   - 差異はパラメータ（閾値）のみで、構造的な棲み分けがない

## 改善方針

### Explorer改善
- 修理ルールの追加（低閾値: durability < 30）により、最低限の延命を可能にする
- または2つ目のFrameを追加（初期durability 400）して寿命を延ばす

### Survivor改善
- エネルギー閾値を下げる（4500→3000-3500）
- 修理閾値を下げる（150→80）
- 差別化として2 Frame構成（高耐久・長寿命）にする

### 種間関係の構築
- 現状の4種は独立しすぎている。共生関係を生むには、種の設計で差別化が必要
- Scavengerの自己持続ループが強すぎるため、他種との相互依存を作る必要がある

### パラメータ調整
- FRAME_DURABILITY増加: 全種の寿命延長で行動余裕を確保
- RECHARGE_AMOUNT増加: エネルギー回復効率の改善
