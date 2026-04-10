# 制御プリミティブによる自己複製の試行記録

## 仮説

制御プリミティブ（条件→アクション規則のリスト）だけで自己複製が可能かを検証する。
VM や Processor なしで、condition→action ルールの first-match 評価により
HARVEST → PROCESS → CRAFT → ASSEMBLE の一連のサイクルを回せるか。

## 構成

### プリミティブ評価器の仕様
- 毎 tick、ルールリストを先頭から評価
- 最初に条件が真となったルールのアクションを 1 つだけ予約（1 tick 1 アクション）
- `noop` アクションはスキップ（次のルールを評価）
- reflexes (M2) はプリミティブの後で発火（auto-recharge / auto-repair）

### 追加した条件型
- `can_assemble(templateIdx)` — テンプレートの全コンポーネントがインベントリにあるか
- `can_craft(componentIdx)` — クラフトレシピの全入力があるか
- `can_craft_missing(componentIdx)` — 上記 AND インベントリに当該コンポーネントがないか
- `can_process(recipeIdx)` — プロセスレシピの入力があるか

### テスト対象: PrimitiveReplicator
- コンポーネント: Frame, Actuator, Sensor, Harvester, Charger, Assembler
- 子に必要な原料: 9 Metal + 6 Circuit = 18 Ore + 12 Crystal
- ルール数: 13
- テンプレート: 自己参照（子に同じルールとテンプレートを転写）

### パラメータ
- frameDurability: 1200（長寿命化）
- assembleEnergyTransfer: 1000
- metabolism: 全コンポーネント 0〜1（Frame/Harvester/Sensor/Charger/Disassembler/MemoryCore=0）
- 世界: 30×30, OreNode/CrystalNode 各 40, EnergyNode 60

## 結果

### 試行1: 基本ルールセット
- harvest/process/craft を全て can_xxx で条件付け
- **問題**: `can_process` が Ore 2 個で即座に発火 → Metal を即座に消費 → Harvester を量産
- **結果**: Harvester ×10 を生産して全エネルギーを消費、他コンポーネント作成不能

### 試行2: can_craft_missing 条件の導入
- 既にインベントリにあるコンポーネントの重複クラフトを防止
- **改善**: Harvester は 1 つだけ作成されるようになった
- **問題**: Ore の近くに滞在し続け、Metal を延々と蓄積 → Crystal を一切収集しない

### 試行3: tick_mod による方向交互化
- `tick_mod(2, 0)` で偶数 tick は Ore、奇数 tick は Crystal へ移動
- **改善**: 複数種の資源に到達するようになった
- craft 結果: Harvester, Actuator, Assembler, Frame（4/6 コンポーネント）
- **問題**: Charger (M1+C2) と Sensor (C2) に必要な Circuit を集められない
  - OreNode の近くに滞在し続け、nearby(OreNode) → harvest が Crystal 収集より優先される

### 最終状態
- **L1（自律生存）**: 部分的に達成。反射による auto-recharge で生存するが、durability 減衰で最終的に死亡
- **L2 以上**: 未達成。self-replication に至る前にリソース収集の段階で停滞

## 発見された制約

### 1. AND 条件の欠如（最大のボトルネック）
単一条件のルールでは「Aかつ B」を表現できない。例：
- 「Metal ≥ 3 AND Circuit ≥ 0」→ Frame をクラフト（Metal だけで良い）✓
- 「Metal ≥ 1 AND Circuit ≥ 1」→ Actuator をクラフト ✗（Metal ≥ 1 だけでは Harvester と区別不能）

noop ガードによる擬似 AND を試みたが、noop はそのルール自身をスキップするだけで、
「次のルールをスキップする」機能はない。結果として AND ガードとして機能しない。

### 2. 1 tick 1 アクション制約
VM ベースのキャラクターは MOVE + HARVEST を同時に予約できるが、
プリミティブは 1 tick に 1 アクションのみ。資源収集に倍の時間がかかる。

### 3. 条件なし収穫の暴走
`nearby(ResourceNode) → harvest` は近くに資源があれば無条件で発火する。
「必要な資源のみ収穫する」ことができない（AND 条件の欠如と同根）。

### 4. 状態管理の欠如
VM にはレジスタやメモリで「現在のフェーズ」を記録できるが、
プリミティブには状態変数がない。tick_mod で簡易的な周期動作は可能だが、
「Ore 収集完了 → Crystal 収集フェーズへ遷移」のような状態遷移を表現できない。

## 次バージョンへの示唆

### 改善案A: AND 条件の追加
`and(condIdx1, condIdx2)` 型の複合条件を導入する。これにより：
- `and(inventory_has(Metal, 1), inventory_has(Circuit, 1))` → craft Actuator
- `and(nearby(OreNode), inventory_below(Ore, 18))` → harvest（必要時のみ）

実装コスト: 低（条件評価の再帰呼び出し）。進化への影響: 条件の引数が増える程度。

### 改善案B: 状態変数（レジスタ）の導入
1〜2 個の整数レジスタをキャラクターに持たせ、ルールで読み書きする。
- `register_equals(0, 1)` → 「フェーズ 1」の条件
- `set_register(0, 2)` → 「フェーズ 2 へ遷移」のアクション

### 改善案C: 複数アクション
1 tick に最大 2 アクション（例: MOVE + HARVEST）を予約可能にする。
最初に条件合致したルール 2 つを両方実行。

### 推奨
改善案A が最も投資対効果が高い。AND 条件だけで上記の問題の大部分が解消される。
B は A で不十分な場合の次のステップ。C は慎重に検討が必要（VM との差異を維持するため）。
