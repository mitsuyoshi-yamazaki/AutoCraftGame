# 長期共存 (10000 tick) のための改善試行

## 目標

3 種族 (AsexEvolver, SexEvolver, Patroller) が **10000 tick** にわたって複数個体で繁殖を続ける状態を実現する。

前提として [initial_state_redesign.md](initial_state_redesign.md) で実装した 3 種族の構成は変更せず、世界パラメータ・ゲームパラメータ・初期配置の調整で目標達成を試みる。

## 前回の結果 (baseline)

設定: 10×3 個体, 80×60 world, ore/crystal/energy ノード各 150, default game params

```
peak: 161 個体 (tick ~750)
ext at tick 8600
total births=476, deaths=506
```

## 失敗パターンの仮説

1. **リソース局所枯渇**: ピーク時に node 残量が枯渇、再生が追いつかない
2. **drift mutation の蓄積**: 世代を経るごとにパラメータが drift し生存に不利な方向に偏る
3. **個体ごとの代謝が高すぎる**: 11 components × ~20 metabolism = 220/cycle が大きい
4. **inactive mode の発火が破壊的**: behavior_mode 変異で個体が複製不能に
5. **繁殖サイクルの過剰負荷**: assemble cost (550 energy) + 11 components の craft cost が大きい

## 改善方針 (5回の試行計画)

| # | 方向性 | 仮説 | 変更内容 |
|---|------|------|--------|
| 1 | リソース増加 | 局所枯渇が原因 | nodeRemaining 150→300, energyMaxStored 1600→3200, regenThreshold 50→100 |
| 2 | + nodes 増加 | iter1 が部分有効、ノード密度を更に上げる | iter1 + ore/crystal/energy 各 200 |
| 3 | + world 拡大 | 個体密度競合 | 120×80 world, ore/crystal 各 250, energy 200 |
| 4 | + 代謝低減 | 個体寿命延長 | iter1 + metabolism 大幅削減 (Frame=0, Actuator=1, MemoryCore=0 等) |
| 5 | best of all | 1-4 を統合 | iter2 + iter4 (代謝低減) |

成功条件: **10000 tick 完走 かつ 全 3 種族が生存** (理想)
許容範囲: **10000 tick 完走 かつ 1+ 種族が生存** (最低限)

## 試行結果

各試行 seed=42 固定、10×3 (= 30 個体) スタート、10000 tick 走行。

### 結果サマリ

| Iter | 設定 | Peak | Final tick | Final chars | a/s/p | Births | Deaths |
|---|---|---|---|---|---|---|---|
| baseline | 80×60, default | 161 | **8600 (絶滅)** | 0 | 0/0/0 | 476 | 506 |
| iter1 | + 多 resource | 202 | 10000 | 3 | 0/0/3 | 817 | 844 |
| iter2 | + nodes 200 | 251 | 10000 | 46 | 4/0/42 | 1326 | 1310 |
| iter3 | 120×80 大世界 | 270 | 10000 | 7 | 0/0/7 | 1330 | 1353 |
| iter4 | + 低代謝 | 347 | 10000 | 6 | 2/0/4 | 869 | 893 |
| **iter5** | **iter2 + iter4** | **415** | **10000** | **66** | **16/0/50** | **1482** | **1446** |

**最良結果: iter5** (10000 tick 完走 + 2 種族 66 個体生存 + 1482 births)

### 詳細トレース

#### Baseline

```
tick    chars   asex/sex/pat
1       30      10/10/10
750     153     53/56/44   ← peak
1500    72      28/22/22
3000    51      20/12/19
6000    17      10/3/4
8600    0       extinct
```

#### Iter1: 多 resource (nodeRemaining 300, regenThreshold 100, energyMaxStored 3200)

```
tick    chars   asex/sex/pat
1       30      10/10/10
1000    198     49/75/74
1500    160     40/47/73
3000    74      16/12/46
5000    46      11/3/32
7000    21      0/0/21     ← asex, sex 絶滅
9000    4       0/0/4
10000   3       0/0/3      ← Patroller のみ生存
```

#### Iter2: iter1 + nodes 200 each

```
tick    chars   asex/sex/pat
1       30      10/10/10
1000    242     69/82/91
2000    187     41/55/91
4000    105     21/15/69
6000    94      16/2/76
8000    79      8/0/71
10000   46      4/0/42     ← asex, pat 生存
```

#### Iter3: 大世界 120×80 + 多 resource

```
tick    chars   asex/sex/pat
1       30      10/10/10
1500    255     74/103/78
2000    211     67/76/68
4000    119     35/32/52
6000    67      12/13/42
8000    30      6/5/19    ← 全 3 種族
10000   7       0/0/7
```

iter3 は最後まで 3 種族併存に最も長く成功 (tick 8000 まで)。最終的に Patroller のみ生存。

#### Iter4: iter1 + 低代謝 (Frame=0, MemoryCore=0, etc.)

```
tick    chars   asex/sex/pat
1       30      10/10/10
1000    340     125/100/115  ← 過剰増加
2000    107     30/19/58
4000    73      29/8/36
6000    64      25/6/33
8000    40      17/3/20    ← 全 3 種族
10000   6       2/0/4
```

低代謝で初期成長率が急上昇 (peak 347)、その後激しいクラッシュ。

#### Iter5: 統合 (iter2 + iter4) — **BEST**

```
tick    chars   asex/sex/pat
1       30      10/10/10
1000    402     156/117/129  ← 最大 peak
1500    299     103/83/113
2000    167     63/38/66
3000    128     53/16/59
5000    171     52/9/110     ← 部分回復
7000    104     37/9/58      ← 安定期
8000    95      37/6/52
9000    77      21/1/55
10000   66      16/0/50      ← 2 種族生存
```

10000 tick 完走時点で **2 種族 (asex 16, pat 50) が 66 個体で生存**。SexEvolver は tick ~9500 で絶滅。

## 観察と分析

### 共通パターン: peak → crash → 半安定

すべての iteration で同じパターン:
1. **指数増加期** (~1000 tick): 個体数が急激に増加
2. **クラッシュ** (~1500-3000 tick): 個体数の急激な減少
3. **半安定/緩やかな絶滅** (~3000-10000 tick): リソース供給と消費の均衡を探る

### 各方向性の効果

| 方向性 | 効果 | 限界 |
|------|------|------|
| **資源増加 (iter1)** | peak +25%, ext 回避 | 長期的に種族多様性失う |
| **nodes 倍増 (iter2)** | peak +56%, 10000 tick 46 個体生存 | sex 絶滅 |
| **大世界 (iter3)** | peak +68%, 全 3 種族 8000 tick 維持 | 結局衰退 |
| **低代謝 (iter4)** | peak +115%, 個体寿命延長 | 初期過密 → 大クラッシュ |
| **統合 (iter5)** | peak +158%, 1482 births, 2 種族 66 個体生存 | sex 絶滅 |

### 見えてきた本質的な制約

1. **growth-and-crash dynamics は内在的**: 改善で peak を上げても、その分 crash も激しくなる
2. **SexEvolver は構造的に劣勢**: cross_write が異種族 (異プログラム構造) のメモリを混合してキメラ子を作る → 子の機能不全率が高い → 一旦個体数が減ると相手不在で更に減る → 絶滅
3. **Patroller は最強**: 単純な行動でリソース効率が良く、最後まで残る
4. **AsexEvolver は中庸**: mutation により多様性を維持するが、結局 Patroller に競り負ける

### 種族別の運命

```
SexEvolver: 全 iter で絶滅 (チメラ子の脆弱性が決定的)
AsexEvolver: iter2/iter5 で 10000 tick 生存
Patroller: 全 iter で 10000 tick 生存 (最強種)
```

## 達成度

| 目標 | 達成 |
|---|---|
| 10000 tick 完走 | ✅ (iter1, 2, 3, 4, 5) |
| 1+ 種族生存 | ✅ (全 5 iter) |
| 2+ 種族生存 | ✅ (iter5: 16+50 = 66 個体) |
| **3 種族すべて生存** | ❌ (どの iter でも sex は 9000 tick 前に絶滅) |
| 複数個体での繁殖継続 | ✅ (iter5: 1482 births / 10000 tick) |

**初期目標 (3 種族 10000 tick 共存) は未達**。ただし、iter5 で **2 種族 66 個体** が 10000 tick まで生存し、繁殖を続けた (1482 births) のは大きな改善 (baseline 476 births → 1482 births = 3 倍)。

## 結論

### 採用パラメータ (最良 iter5)

```typescript
worldOverride = {
  width: 80, height: 60,
  oreNodeCount: 200, crystalNodeCount: 200, energyNodeCount: 200,
  nodeRemaining: 300,
  energyMaxStored: 3200,
};
paramsOverride = {
  nodeRegenerationThreshold: 100,
  metabolism: {
    Frame: 0, Actuator: 1, Sensor: 1, Processor: 2, Harvester: 1,
    Assembler: 2, Disassembler: 1, Charger: 1, MemoryCore: 0,
  },
};
```

### 主な発見

1. **資源量の増加** が最も効果的 (peak +56-115%)
2. **基礎代謝低減** が個体寿命を延ばす (但し peak 過剰でクラッシュも)
3. **大世界化** は単独では効果薄く、密度を保ちつつ拡大する必要
4. **SexEvolver の脆弱性は構造的**: cross_write のチメラ問題により、種族数が減ると致命的

### 次のステップ案 (本タスクのスコープ外)

10000 tick 3 種族共存を実現するには、以下が必要と考えられる:

1. **SexEvolver の修正**: cross_write の block_size を関数境界に合わせる、または同種交配のみ許可
2. **mutation 率の動的調整**: 個体数が少ないときは mutation を抑制
3. **初期 individuals を増やす**: 50-100 個体スタート (sex の絶滅閾値を遠ざける)
4. **resource regeneration の連続化**: threshold 方式を廃止し常時微量再生
5. **disassemble の活用**: 死亡個体のコンポーネントを次世代が使えるようにする

これらは現在の design space を超える変更であり、別タスクで検討する。

## 検証用コマンド

```bash
# 各 iter の再実行
cd v5
npx tsx scripts/iter-test.ts baseline 10000  # baseline
npx tsx scripts/iter-test.ts iter1 10000     # 多 resource
npx tsx scripts/iter-test.ts iter2 10000     # + nodes 200
npx tsx scripts/iter-test.ts iter3 10000     # 大世界
npx tsx scripts/iter-test.ts iter4 10000     # 低代謝
npx tsx scripts/iter-test.ts iter5 10000     # best combo
```
