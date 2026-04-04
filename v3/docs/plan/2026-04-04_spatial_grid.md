# 空間グリッドによる近傍探索の高速化

## 日付: 2026-04-04

## 背景

オブジェクト数の増加に伴い、衝突判定・近傍探索がO(n²)やO(n×m)で悪化する。
全てのボトルネックに共通する原因は「近くにあるオブジェクトだけが関係するのに、全オブジェクトを走査している」点。

## ボトルネック一覧

| 処理 | ファイル | 計算量 | 頻度/tick |
|------|----------|--------|-----------|
| キャラクター同士の衝突 | physics.ts:72-83 | O(n²) | 1回 |
| キャラクター×固定オブジェクト衝突 | physics.ts:86-98 | O(n×m) | 1回 |
| findTargets (SENSE_RANGE内) | program.ts:152-180 | O(m)×呼出回数 | キャラ数×6+α |
| isNearby 条件評価 | program.ts:76-84 | O(m) | ルール評価ごと |
| findNearest系 (INTERACT_RANGE内) | world.ts:73-134 | O(m) | アクション実行ごと |
| collidesWithAny | world.ts:53-68 | O(全オブジェクト) | ASSEMBLE時 |

## 方針: 空間グリッド (Spatial Hash Grid)

ワールドを固定サイズのセルに分割し、各セルにオブジェクト参照を格納する。
近傍探索時は対象セル+隣接セルのみを走査する。

### Quadtreeでなくグリッドを選ぶ理由

- 実装が単純（2D配列）
- オブジェクトサイズがほぼ均一
- ワールドサイズが固定
- 挿入・削除がO(1)

### セルサイズ: SENSE_RANGE (10.0)

- SENSE_RANGEが最大の探索範囲
- 衝突判定やINTERACT_RANGEの探索もこのグリッドで十分絞り込める
- 60×60ワールドでは6×6=36セルとなり、管理コストが小さい

## 設計

### SpatialGrid モジュール (`src/spatial-grid.ts`)

```typescript
interface GridEntry {
  id: string;
  position: Position;
  kind: 'character' | 'resourceNode' | 'energyNode' | 'remains';
}

interface SpatialGrid {
  cellSize: number;
  cols: number;
  rows: number;
  cells: GridEntry[][];  // 1D配列 (row * cols + col)
}
```

主要関数:
- `buildGrid(world: World, cellSize: number): SpatialGrid` — World全オブジェクトからグリッドを構築
- `queryRange(grid: SpatialGrid, center: Position, range: number): GridEntry[]` — center周囲rangeの範囲にあるエントリを返す（距離フィルタは呼び出し元が行う）

### 構築タイミング

`executeTick` の冒頭（Step 1の後）で1回構築し、Step 2〜5で共有する。
Step 6（物理積分）以降はグリッドを使用しないため、再構築不要。

### 各モジュールへの適用

1. **simulation.ts**: グリッドを構築し、evaluateProgram / executeAction / computeCollisionForces に渡す
2. **physics.ts**: `computeCollisionForces` がグリッドを受け取り、近傍セルのみ走査
3. **program.ts**: `findTargets` / `isNearby` / `findNearestAngle` がグリッドを受け取る
4. **actions.ts**: `executeAction` がグリッドを受け取り、findNearest系・executeSense に中継
5. **world.ts**: `findNearest系` / `collidesWithAny` がグリッドを受け取る

### インターフェース変更

グリッドはtick内の一時データであるため、World型には追加しない。
各関数の引数として受け渡す。

## 実装手順

1. `src/spatial-grid.ts` を新規作成（buildGrid, queryRange）
2. `physics.ts` の衝突判定をグリッド利用に変更
3. `program.ts` の findTargets / isNearby をグリッド利用に変更
4. `world.ts` の findNearest系 / collidesWithAny をグリッド利用に変更
5. `simulation.ts` でグリッド構築・受け渡しを追加
6. `actions.ts` にグリッドを受け渡し
7. テストを修正・追加
