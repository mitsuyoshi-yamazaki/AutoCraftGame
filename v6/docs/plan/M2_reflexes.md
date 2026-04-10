# M2: 反射 (Reflexes) 実装計画

## 目標

[ロードマップ M2](../../../v4/docs/plan/program_robustness_roadmap.md#マイルストーン2-個体の最低限の生存保証-案d-反射) の達成。

プログラムを介さない**生存反射行動**を VM/シミュレーション層に追加することで、プログラムが完全に破損した個体でも最低限の生存活動を継続できるようにする。

達成基準: **プログラムを完全にゼロクリアしても、エネルギーが続く限り生存し続けられる**。

## 設計方針

### 反射の性質

- 反射はプログラムの**補完**であり**置換**ではない
- プログラムが該当アクションを発行している tick では、反射は発火しない
- 反射のエネルギーコストは通常アクションと同一（割引なし）
- 反射は決定論的（同じ世界状態 → 同じ反射発火）
- 反射はゲームの法則 (game_spec) として一律に適用される（種ごとに on/off しない）

### 採用する反射

| 反射 | 発火条件 | 効果 |
|------|--------|------|
| **エネルギー反射 (auto-recharge)** | energy < REFLEX_ENERGY_THRESHOLD かつ interactRange 内に EnergyNode 存在 かつ 当tick に RECHARGE 予約なし | 最寄りの EnergyNode に対して RECHARGE を実行 |
| **耐久度反射 (auto-repair)** | durability < REFLEX_DURABILITY_THRESHOLD かつ inventory に Frame≥1 かつ 当tick に REPAIR 予約なし かつ Assembler 所持 | REPAIR を実行 |

両者とも「複製と探索（運動）は反射の対象外」という方針。これらは戦略的な意思決定が必要であり、反射で代行すると進化的な意味が失われる。

### 採用しない反射（明確に除外）

- **移動反射**: 「危機時に最寄りエネルギー源へ移動」のような反射は採用しない。移動戦略はプログラムの責務。
- **複製反射**: 同上。複製戦略は進化の中心テーマ。
- **収穫反射**: 同上。
- **強制 HALT**: 既に instructionsPerTick で代替されている。

### 反射のコストと制約

| 項目 | 仕様 |
|------|------|
| エネルギーコスト | 通常アクションと同額 (`params.energyCosts['RECHARGE']`, `'REPAIR'`) |
| 必要コンポーネント | 通常アクションと同じ (Charger, Assembler) |
| 失敗時の挙動 | 失敗した反射は ActionRecord に記録され、エネルギー消費なし |
| 同 tick 内の競合 | プログラムが既に同種アクションを予約している場合、反射は発火しない |

### 反射のタイミング

```
tick 内の処理順序:
  1. EnergyNode生産
  2. VM 実行 → IoResult.reservations
  3. ★ 反射注入: 各キャラについて、必要なら synthetic reservation を追加
  4. アクション実行 (executeReservations)
  5. 物理・代謝・死亡判定 ...
```

反射は **VM 実行直後 / アクション実行前** に注入する。これにより:
- プログラムの予約と反射の予約が同じ executeReservations で処理される（共通フロー）
- 失敗判定・エネルギーコスト計算が既存ロジックを再利用できる
- ActionRecord に統一的に記録される

## 実装詳細

### 新規ファイル: v5/src/reflexes.ts

```typescript
export interface ReflexEngine {
  /**
   * VM 実行後の予約リストに対して、必要な反射予約を追加する。
   * プログラムが既に同種アクションを予約している場合は注入しない。
   * @returns 元の予約 + 反射予約 のマージ済みリスト
   */
  injectReflexes(
    character: Character,
    world: World,
    reservations: readonly ActionReservation[],
    grid: SpatialGrid,
  ): {
    readonly reservations: readonly ActionReservation[];
    readonly reflexFired: boolean;
  };
}

export function createReflexEngine(params: GameParams): ReflexEngine;
```

実装ロジック:
1. `reservations` に既に `op === 'RECHARGE'` がなく、energy < threshold で、interactRange 内に EnergyNode が存在する場合: 最寄り EnergyNode を選び、合成 RechargeReservation を追加
2. `reservations` に既に `op === 'REPAIR'` がなく、durability < threshold で、inventory に Frame があり、Assembler コンポーネントを持つ場合: 合成 RepairReservation を追加
3. `reflexFired` フラグを返す（UI 表示用）

`grid` は近接 EnergyNode 検索に使用。SpatialGrid はすでに simulation.ts で構築されているので渡すだけ。

合成予約の `slotIndex` は 0 を使用（既存の Charger[0], Assembler[0] を流用）。

### 修正: v5/src/simulation.ts

```typescript
// 既存のVM実行ループ内
for (const character of currentWorld.characters) {
  if (!isActive(character)) continue;
  // ... VM 実行 ...

  let reservations = ioResult.reservations;

  // ★ NEW: 反射注入
  const reflexResult = reflexEngine.injectReflexes(character, currentWorld, reservations, grid);
  reservations = reflexResult.reservations;
  if (reflexResult.reflexFired) {
    reflexHits.add(character.id);
  }

  characterIoResults.push({
    characterId: character.id,
    reservations,  // 反射注入済み
    localIdTable: ioResult.updatedVmLocalIdTable,
    localIdCounter: ioResult.updatedVmLocalIdCounter,
  });
}
```

`reflexHits: Set<string>` を `instructionLimitHits` 等と並列に管理し、TickResult に追加する。

### 修正: v5/src/types.ts

```typescript
export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
  readonly actions: ReadonlyMap<string, readonly ActionRecord[]>;
  readonly instructionLimitHits: ReadonlySet<string>;
  readonly checkpointHits: ReadonlySet<string>;
  readonly reflexHits: ReadonlySet<string>;  // ★ NEW
}
```

### 修正: v5/src/params.ts

```typescript
export interface GameParams {
  // ... 既存 ...
  readonly reflexEnergyThreshold: number;     // この値未満で auto-recharge
  readonly reflexDurabilityThreshold: number; // この値未満で auto-repair
}

export const DEFAULT_GAME_PARAMS: GameParams = {
  // ... 既存 ...
  reflexEnergyThreshold: 200,    // 仮の初期値、チューニングで決定
  reflexDurabilityThreshold: 300,
};
```

### 修正: v5/src/engine.ts

`createEngine` で `createReflexEngine(params)` を生成し、`SimulationEngineDeps` に追加する。

### 修正: v5/ui/main.ts

UIState に `reflexHits: ReadonlySet<string>` を追加。SelectedContent に "Reflex" 表示行を追加（HIT/miss）。

### 仕様書更新: v5/docs/specs/game_spec.md

「反射」セクションを追加:
- どの反射が存在するか
- 発火条件
- ゲーム法則として一律適用される旨
- パラメータ (`reflexEnergyThreshold`, `reflexDurabilityThreshold`)

## テスト計画

### ユニットテスト (test/reflexes.test.ts, 新規)

1. **反射発火**: energy 低下 + 近接 EnergyNode + 予約なし → RechargeReservation が追加される
2. **反射不発火 (プログラム予約あり)**: 同条件でも programが既に RECHARGE 予約済みなら反射追加なし
3. **反射不発火 (条件不成立)**: energy 低下しているが近接 EnergyNode なし → 追加なし
4. **耐久度反射**: durability 低下 + Frame 在庫 + Assembler → RepairReservation 追加
5. **コンポーネント不在**: Charger なしで反射発火条件を満たしても、生成された予約は executeReservations で MISSING_COMPONENT として失敗

### 統合テスト (test/simulation.test.ts に追加)

1. **完全破損個体の生存**: メモリを全ゼロクリアした個体が、エネルギーノード近接時に自動充電して N tick 生存
2. **正常個体への影響なし**: 破損していない pioneer の振る舞いが変化しないことを確認 (回帰テスト)

### 破損注入テスト (CLI で確認)

```bash
# 全メモリ破損 (1500 word) で生存できるか
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 \
  --count 5 --output final --corrupt-at-tick 50 --corrupt-count 1500
```

期待: char-001 が tick 50 で完全破損しても、エネルギーノードに近ければ反射で充電し続け、即死しない。

## チューニング目標

| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| 完全破損後の平均生存時間 | 100 tick 以上 | 1500-word 破損注入後の char-001 死亡tick - 注入tick |
| 正常個体の挙動変化 | なし | 破損なし baseline での births/deaths が M1 と一致 |
| 反射発火率（健全個体） | < 5% | 健全 pioneer の reflexHits / total ticks |

健全個体での反射発火率が高い場合、`reflexEnergyThreshold` を下げる（反射が早すぎる）。低すぎる場合は上げる。

## 想定リスク

| リスク | 緩和策 |
|--------|--------|
| 反射が強力すぎてプログラムの意義が薄れる | 反射対象を recharge と repair のみに限定。移動・収穫・複製は対象外 |
| 健全個体でも反射が頻繁に発火する | チューニングで閾値を下げる。`reflexHits` が常に空に近くなることを目指す |
| 反射のエネルギーコストで個体が早死にする | 通常アクションと同コストなので、破損で動けない個体は座って充電するだけになる。これは仕様通り（生存延長） |
| 反射判定で simulation が遅くなる | 各 tick 各キャラに O(1) の追加判定のみ。無視できる |

## 実装ステップ（順序）

1. **types.ts**: TickResult に reflexHits を追加
2. **params.ts**: 閾値パラメータ追加
3. **reflexes.ts** (新規): ReflexEngine インターフェースと実装
4. **engine.ts**: createReflexEngine の wiring
5. **simulation.ts**: VM実行ループ内に reflex 注入を組み込み
6. **test/reflexes.test.ts** (新規): ユニットテスト
7. **test/simulation.test.ts**: 統合テスト追加
8. **ui/main.ts**: SelectedContent に reflex 表示
9. **docs/specs/game_spec.md**: 反射セクションを追加
10. **CLI 検証**: 破損注入で生存延長を確認、チューニング
11. **docs/tuning/reflexes_M2.md**: 結果を記録
12. **version.ts, package.json**: v5.1.0 へ更新

## 決定事項のサマリ（実装時の参照用）

| 項目 | 決定 |
|------|------|
| 採用反射 | auto-recharge, auto-repair の 2 種類のみ |
| 移動・収穫・複製反射 | **採用しない** |
| 反射のコスト | 通常アクションと同額 |
| 競合判定 | プログラムが同種アクションを予約していたら反射不発火 |
| 注入タイミング | VM実行直後 / アクション実行前 |
| 種ごと有効化 | なし (全種に一律) |
| 仕様の所属 | game_spec.md (世界の法則) |
| パラメータ | reflexEnergyThreshold, reflexDurabilityThreshold |

## 未決事項

なし。実装に進める。

## 実装後の評価指標

[checkpoint_M1.md](../tuning/checkpoint_M1.md) と同様に、`docs/tuning/reflexes_M2.md` を作成し以下を記録する:

- baseline (反射なし) vs 反射あり の生存統計
- 様々な破損レベル (1, 5, 50, 500, 1500 word) での char-001 生存時間
- 健全個体の反射発火率
- パラメータチューニングの過程
