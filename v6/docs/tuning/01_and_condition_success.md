# AND条件追加による自己複製の達成

## 仮説

AND/OR/NOT 複合条件を制御プリミティブに追加することで、
前回の試行で発見されたボトルネック（AND条件の欠如）を解消し、
自己複製を達成できるか検証する。

## 変更内容

### 追加した条件型
- `and(sub1, sub2, ...)` — 全サブ条件が真のとき真
- `or(sub1, sub2, ...)` — いずれかのサブ条件が真のとき真
- `not(sub)` — サブ条件が偽のとき真

### ルール設計のブレークスルー

AND 条件により以下が表現可能になった:
- `and(nearby(OreNode), inventory_below(Ore, 18))` → 必要時のみ収穫
- `and(energy_below(500), nearby(EnergyNode))` → 近くにある時だけ充電
- `and(can_assemble, energy_above(1200))` → エネルギー十分時のみ複製
- `and(energy_above(300), inventory_has(Ore, 6), can_process(0))` → エネルギー消費の制御
- `and(can_assemble, energy_below(1500))` → 複製前にエネルギー貯蓄

### エネルギー管理の優先度設計

```
Priority 0: 複製可能 AND エネルギー不足 → 充電/エネルギー探索
Priority 0: エネルギー危険域 → 充電/エネルギー探索
Priority 1: can_assemble AND energy_above(1200) → ASSEMBLE
Priority 2: can_craft_missing → CRAFT
Priority 3: AND(energy_above(300), batch条件) → PROCESS
Priority 4: AND(nearby, need) → HARVEST
Priority 5: 不足資源方向へ → MOVE
```

## パラメータ

- frameDurability: 1200（長寿命化）
- assembleEnergyTransfer: 1000
- metabolism: 全コンポーネント 0〜1
- 世界: 60×60, OreNode/CrystalNode 各 80, EnergyNode 120

## 結果

### 単体テスト（1個体、500 tick）
- tick 22: Harvester クラフト
- tick 37: Frame クラフト
- tick 66: Assembler クラフト
- tick 70: Actuator クラフト
- tick 77: Sensor クラフト
- tick 103: Charger クラフト（6/6 完了）
- tick 94: **最初の ASSEMBLE 成功**
- 500 tick で計 5 回の ASSEMBLE

### 集団テスト（10 PrimitiveReplicator + 5 PrimitiveGatherer、2000 tick）
- tick 100: 18 個体（+3）
- tick 500: 102 個体（+87）
- tick 800: 190 個体
- tick 1100: 201 個体（ピーク）
- tick 2000: 134 個体（安定）
- 総出産: 453, 総死亡: 334
- PrimitiveGatherer は tick 600 前後に全滅（生殖不能のため淘汰）

### 達成レベル
- **L4（安定複製）達成**: 初期 10 個体 → 数世代にわたり個体数が増加
- **L5（種維持）達成**: 2000 tick で集団として存続（134 個体）

## 発見

### 成功要因
1. AND 条件により「必要時のみ行動」が表現可能になった
2. エネルギー管理の優先度制御が critical（複製前に十分なエネルギーを確保）
3. 不要資源の収穫を停止する AND(nearby, inventory_below) パターン
4. `can_craft_missing` による重複クラフト防止

### 残存する制限
1. **1 tick 1 アクション**: VM ベースの MOVE+HARVEST 同時実行に比べ非効率
2. **変異の表現**: 現在の変異はルールパラメータの数値のみ。ルールの追加/削除/順序変更は未実装
3. **状態変数なし**: tick_mod で擬似周期は可能だが、明示的なフェーズ管理はできない
