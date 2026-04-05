# リソースノード再生システム

## 日付: 2026-04-04

## 背景と目的

現在のv3では、リソースノードは初期配置後に枯渇すると永久に失われる。これにより:

1. 長期シミュレーションで資源が枯渇し、生態系が崩壊する
2. スカベンジャー（Disassembler持ち）がエネルギーと残骸のみで永久に自己複製でき、物質が循環しない

本計画では「残骸が地面に染み込み、蓄積した物質がリソースノードとして再生する」メカニズムを導入し、物質の循環と保存を実現する。

## 設計原則

- **物質保存則**: ゲーム世界の Ore/Crystal 総量は不変。ある場所で減れば別の場所で増える
- **決定論**: 全処理は走査順固定のラスタースキャンで決定論的に実行する
- **既存仕様準拠**: 既存のアクション仕様を拡張するが、互換性を壊さない

---

## 1. 新データ構造: GroundGrid

世界を 1×1 の内部グリッドに分割し、地面に染み込んだ物質量を追跡する。

### 型定義

```typescript
interface GroundCell {
  readonly ore: number;
  readonly crystal: number;
}

// World に追加
interface World {
  // ... 既存フィールド ...
  readonly groundGrid: readonly GroundCell[];  // flat array, index = y * width + x
}
```

- グリッドサイズ: `floor(width) × floor(height)` セル（デフォルト 60×60 = 3,600 セル）
- 各セルの初期値: `{ ore: 0, crystal: 0 }`
- セル座標の算出: `cellX = floor(position.x)`, `cellY = floor(position.y)`
  - 境界クランプ: `min(cellX, gridWidth - 1)`, `min(cellY, gridHeight - 1)`

## 2. 残骸の経年劣化と地面吸収

### Remains への `createdAt` 追加

```typescript
interface Remains {
  // ... 既存フィールド ...
  readonly createdAt: number;  // 生成時の tick
}
```

### 吸収処理

`REMAINS_ABSORPTION_TICKS`（デフォルト 300）tick 経過した残骸は消滅し、全内容物がグリッドに吸収される。

#### 物質変換ルール（全量ロスなし）

| 元のアイテム | グリッドへの変換 |
|---|---|
| Ore | ore += 1 |
| Crystal | crystal += 1 |
| Metal | ore += 2（PROCESS逆算: Ore×2 → Metal） |
| Circuit | crystal += 2（PROCESS逆算: Crystal×2 → Circuit） |
| コンポーネント | CRAFTレシピ逆算 → Metal/Circuit → さらに上記でOre/Crystalへ |

例: Frame → Metal×3 → ore += 6
例: Actuator → Metal×1 + Circuit×1 → ore += 2, crystal += 2

inventory のアイテムも components も同一のルールで変換する。

### tick 内の処理位置

Step 9（死亡チェック・残骸生成）の後、新ステップとして実行する。

## 3. DISASSEMBLE 時の物質流出

スカベンジャーの永久自己複製を抑制するため、コンポーネントの DISASSEMBLE 時に一定量の物質が地面に流出する。

### 流出ルール

- **生リソース（Ore, Crystal）のDISASSEMBLE**: 流出なし
- **加工素材（Metal, Circuit）のDISASSEMBLE**: 流出なし
- **コンポーネントのDISASSEMBLE**: 以下のテーブルに定義された量が流出

### コンポーネント別流出テーブル

| Component | CRAFTレシピ | 流出（加工素材） | → グリッド変換 | キャラクターが受け取る量 |
|---|---|---|---|---|
| Frame | Metal×3 | Metal×1 | ore += 2 | Metal×2 |
| Actuator | Metal×1, Circuit×1 | Metal×1 | ore += 2 | Circuit×1 |
| Sensor | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |
| Processor | Circuit×3 | Circuit×1 | crystal += 2 | Circuit×2 |
| Harvester | Metal×2 | Metal×1 | ore += 2 | Metal×1 |
| Assembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Disassembler | Metal×2, Circuit×1 | Metal×1 | ore += 2 | Metal×1, Circuit×1 |
| Charger | Metal×1, Circuit×2 | Circuit×1 | crystal += 2 | Metal×1, Circuit×1 |
| MemoryCore | Circuit×2 | Circuit×1 | crystal += 2 | Circuit×1 |
| Register | Circuit×1 | なし | — | Circuit×1 |

流出先のグリッド座標は **残骸の位置** に対応するセル。

### 適用範囲

以下の両方のパスで同じ流出ルールを適用する:
1. `remains.inventory` からコンポーネントを取り出す場合
2. `remains.components` からコンポーネントを取り出す場合

## 4. リソースノード再生

### 判定ルール

グリッド全セルをラスタースキャン順（y=0,x=0 → y=0,x=1 → ... → y=59,x=59）で走査し、各セルについてムーア近傍（自セル + 8近傍 = 最大9セル）の ore/crystal 合計を独立に評価する。

- ore 合計 ≥ `NODE_REGENERATION_THRESHOLD`（デフォルト 80）→ OreNode を生成
- crystal 合計 ≥ `NODE_REGENERATION_THRESHOLD` → CrystalNode を生成
- ore と crystal が同時に閾値を超えた場合、**両方のノードを生成**する

### 生成されるノードの属性

- `remaining`: 9セルの該当リソース合計値（閾値以上の任意の値）
- `position`: セル中心にオフセットを加えた座標
  - OreNode: `(cellX + 0.5 + 0.2, cellY + 0.5)` — x方向に +0.2
  - CrystalNode: `(cellX + 0.5, cellY + 0.5 + 0.2)` — y方向に +0.2
- `id`: `nextObjectId` で発番
- ノード生成後、9セルの該当リソース（ore または crystal）を 0 にクリア

### 境界セルの扱い

ワールド端のセル（例: x=0）はムーア近傍の一部が存在しない。存在するセルのみで合計を計算する。端セルは近傍が少ない分、再生に必要な1セルあたりの蓄積量が多くなる（自然な挙動）。

### 既存オブジェクトとの重複

再生位置に既存のリソースノードや他のオブジェクトが存在しても、**衝突チェックせず生成する**。

- リソースノードは不動オブジェクトであり、衝突反発で他のキャラクターが押し出される
- HARVEST は最近接ノードを選択するため、重複ノードは順次採掘される

### tick 内の処理位置

残骸吸収ステップの直後に実行する。同一 tick 内で吸収された物質が即座に再生判定の対象となる。

## 5. tick 処理順序（変更後）

```
Step  1: EnergyNode 生産
Step  2: 空間グリッド構築
Step  3: プログラム評価・アクション決定
Step  4: アクション実行（DISASSEMBLE 流出含む）
Step  5: 摩擦力
Step  6: 衝突力
Step  7: 物理積分
Step  8: 基礎代謝・耐久度減衰
Step  9: 死亡チェック・残骸生成
Step 10: 残骸の地面吸収（NEW）
Step 11: リソースノード再生（NEW）
Step 12: tick インクリメント
```

## 6. 新規パラメータ

| パラメータ | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `remainsAbsorptionTicks` | number | 300 | 残骸が地面に吸収されるまでの経過tick数 |
| `nodeRegenerationThreshold` | number | 80 | ムーア近傍9セルの合計がこの値以上でノード再生 |
| `disassembleSpillage` | Record<ComponentType, Record<string, number>> | （下記） | コンポーネントDISASSEMBLE時の流出量（加工素材単位） |

### disassembleSpillage デフォルト値

```typescript
{
  Frame:        { Metal: 1 },
  Actuator:     { Metal: 1 },
  Sensor:       { Circuit: 1 },
  Processor:    { Circuit: 1 },
  Harvester:    { Metal: 1 },
  Assembler:    { Metal: 1 },
  Disassembler: { Metal: 1 },
  Charger:      { Circuit: 1 },
  MemoryCore:   { Circuit: 1 },
  Register:     {},
}
```

## 7. 物質保存の検証

全経路で Ore/Crystal 総量が保存されることを確認する。

| 経路 | 入力 | 出力 | 保存 |
|---|---|---|---|
| HARVEST | ResourceNode.remaining -= 1 | character.inventory += Ore/Crystal × 1 | ✓ |
| PROCESS | inventory: Ore×2 消費 | inventory: Metal×1（= Ore×2相当） | ✓ |
| CRAFT | inventory: Metal/Circuit 消費 | inventory: Component（= 原料合計相当） | ✓ |
| ASSEMBLE | parent inventory → child components | 物質移転のみ | ✓ |
| 死亡 | character消滅 | Remains生成（同一内容） | ✓ |
| DISASSEMBLE (raw) | remains inventory -= 1 | character inventory += 1 | ✓ |
| DISASSEMBLE (component) | remains component 消滅 | character += (recipe - spillage), ground += spillage→原料 | ✓ |
| 残骸吸収 | remains 消滅 | ground grid += 全内容物→原料 | ✓ |
| ノード再生 | ground grid cells → 0 | ResourceNode.remaining = 合計値 | ✓ |

## 8. 実装手順

### Phase 1: 型定義とパラメータ

1. `types.ts` — `GroundCell` 型追加、`Remains` に `createdAt` 追加、`World` に `groundGrid` 追加
2. `params.ts` — `remainsAbsorptionTicks`, `nodeRegenerationThreshold`, `disassembleSpillage` 追加

### Phase 2: 基盤関数

3. `ground.ts`（新規）— GroundGrid 操作関数群
   - `createGroundGrid(width, height)`: 空グリッドを生成
   - `addToGround(grid, gridWidth, x, y, ore, crystal)`: セルに物質を加算
   - `clearMooreNeighborhood(grid, gridWidth, gridHeight, cx, cy, resource)`: 9セルのore/crystalを0にクリア
   - `getMooreSum(grid, gridWidth, gridHeight, cx, cy)`: 9セルの合計を返す
   - `positionToCell(pos, gridWidth, gridHeight)`: Position → (cellX, cellY)
   - `absorb(grid, gridWidth, gridHeight, remains, processRecipes, craftRecipes)`: 残骸の全内容物をグリッドに変換・加算
4. `world.ts` — `createWorld` で空の groundGrid を初期化、`createRemains` に `createdAt` 引数追加

### Phase 3: DISASSEMBLE 流出

5. `actions.ts` — `executeDisassemble` にコンポーネント流出ロジックを追加
   - コンポーネント取り出し時に `disassembleSpillage` を参照
   - キャラクターが受け取る量 = recipe.inputs - spillage
   - 流出分を groundGrid に加算（加工素材→原料変換してから）

### Phase 4: シミュレーションの新ステップ

6. `simulation.ts` — Step 10（残骸吸収）と Step 11（ノード再生）を追加
   - Step 10: `currentWorld.tick - remains.createdAt >= remainsAbsorptionTicks` の残骸を吸収
   - Step 11: ラスタースキャンで閾値判定、ノード生成、グリッドクリア

### Phase 5: テスト

7. 既存テストの修正 — `createRemains` 呼び出しに `createdAt` 追加、World に `groundGrid` 追加
8. `ground.test.ts` — GroundGrid 操作関数のテスト
9. `actions.test.ts` — DISASSEMBLE 流出のテスト
10. `simulation.test.ts` — 残骸吸収・ノード再生の統合テスト
11. 物質保存テスト — N tick 実行後の総物質量が初期値と一致することを検証

### Phase 6: UI・CLI対応

12. `ui/main.ts` — Remains生成時の `createdAt` 追加
13. `cli.ts` — 同上
14. `scripts/tuning-run.ts` — 同上
15. セーブ/ロード — World の groundGrid のシリアライズ/デシリアライズ対応（save_load機能が実装済みの場合）
