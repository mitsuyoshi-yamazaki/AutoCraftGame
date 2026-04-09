# M3: アポトーシス (Apoptosis) 実装計画

## 目標

[ロードマップ M3](../../../v4/docs/plan/program_robustness_roadmap.md#マイルストーン3-集団レベルの淘汰-案f-アポトーシス) の達成。

機能不全に陥ったキャラクターを **自発的に死亡させる** 機構を導入する。これにより:
- 機能不全個体がリソースを無駄に消費し続けない（残骸として再利用される）
- 集団内のターンオーバーが加速し、健全な個体への選択圧が強まる
- M2 (反射) で延命された「最低限生存個体」が永続的に居座らないようにする

達成基準: **健全個体は影響を受けず、機能不全個体は機能不全と判定後 N tick以内に死亡する**。

## 設計方針

### 「機能不全」の定義

候補:
1. **K tick 連続でアクション予約ゼロ**: 最も直接的な指標
2. **K tick 連続で instructionsPerTick 上限到達**: 無限ループの検出
3. **K tick 連続で何の進捗もない**: 抽象的すぎる、定義困難

採用: **(1) と (2) の両方**。どちらかが満たされれば機能不全。

理由:
- (1) は「壊れて何もしない」ケースを捕捉
- (2) は「壊れて無駄に走る」ケースを捕捉
- M1 (CHECKPOINT) があっても、checkpoint の内側で無限ループする破損は (2) で検出される
- M2 (反射) で動く個体は (1) の判定対象から外れる（反射もアクション予約として記録されるため）

**重要**: 反射は ActionRecord に記録される。M2 と M3 の組み合わせは、「反射でも生存できない個体」のみが M3 で死ぬという形で自然に補完する。

### 検出パラメータ

| パラメータ | 意味 | 仮初期値 |
|----------|------|----------|
| `apoptosisIdleTickLimit` | アクション予約ゼロの連続tick数閾値 | 100 |
| `apoptosisInstrLimitTickLimit` | 命令上限到達の連続tick数閾値 | 30 |

`apoptosisInstrLimitTickLimit` の方が短い理由: 無限ループしている個体はリソースを大量消費するため、早期に除去すべき。

両者とも閾値到達で**即座に死亡**（猶予期間なし）。

### カウンタの増減ルール

| イベント | idle カウンタ | instr_limit カウンタ |
|---------|-------------|-------------------|
| アクション予約あり (反射含む) | リセット (0) | 変化なし |
| アクション予約なし | +1 | 変化なし |
| 命令上限到達 | 変化なし | +1 |
| 命令上限到達せず HALT | 変化なし | リセット (0) |

両カウンタは独立。それぞれの閾値到達で機能不全と判定する。

### 死亡フロー

機能不全と判定された個体は、`durability = 0` を設定して既存の死亡判定 (Step 9) に委ねる。

利点:
- 既存の死亡フロー（残骸生成、イベント発火）をそのまま利用できる
- 新しい死亡パスを増やさない
- SimulationEvent に種別を追加する必要もない

ただし、UI/CLI でアポトーシス死を識別できるよう、TickResult に `apoptosisDeaths: ReadonlySet<string>` を追加する。これは「今tickでアポトーシスにより死亡した」キャラクターIDの集合。

## 実装詳細

### 修正: v5/src/types.ts

```typescript
export interface Character {
  // ... 既存 ...
  readonly idleTickCount: number;        // ★ NEW: 連続無アクションtick数
  readonly instrLimitTickCount: number;  // ★ NEW: 連続命令上限到達tick数
}

export interface TickResult {
  // ... 既存 ...
  readonly apoptosisDeaths: ReadonlySet<string>;  // ★ NEW
}
```

### 修正: v5/src/character.ts

`createCharacterFn` と `createInactiveCharacterFn` で両カウンタを 0 で初期化する。

新しいヘルパー関数:
```typescript
export function updateApoptosisCounters(
  character: Character,
  hadAction: boolean,
  hitInstrLimit: boolean,
): Character {
  return {
    ...character,
    idleTickCount: hadAction ? 0 : character.idleTickCount + 1,
    instrLimitTickCount: hitInstrLimit ? character.instrLimitTickCount + 1 : 0,
  };
}

export function shouldApoptose(character: Character, params: GameParams): boolean {
  return character.idleTickCount >= params.apoptosisIdleTickLimit
      || character.instrLimitTickCount >= params.apoptosisInstrLimitTickLimit;
}
```

### 修正: v5/src/simulation.ts

```
tick 内の処理順序 (M3 反映):
  1. EnergyNode生産
  2. VM 実行
  3. 反射注入 (M2)
  4. アクション実行
  5. 物理計算
  6-8. 代謝・耐久度減衰
  ★ 8.5: アポトーシスカウンタ更新 + 判定
  9. 死亡判定 -> 残骸 (durability 0 になった個体は全てここで死亡)
  10. 残骸吸収
  11. ノード再生
  12. tick++
```

実装:
```typescript
// Step 8.5: Apoptosis counters and judgment
const apoptosisDeaths: Set<string> = new Set();
currentWorld = {
  ...currentWorld,
  characters: currentWorld.characters.map((c) => {
    const records = allActions.get(c.id) ?? [];
    const hadAction = records.length > 0;
    const hitInstrLimit = instructionLimitHits.has(c.id);
    const updated = updateApoptosisCounters(c, hadAction, hitInstrLimit);
    if (shouldApoptose(updated, params)) {
      apoptosisDeaths.add(updated.id);
      return { ...updated, durability: 0 };  // 既存の死亡判定に委ねる
    }
    return updated;
  }),
};

// Step 9 (既存): durability ≤ 0 で死亡
```

### 修正: v5/src/params.ts

```typescript
export interface GameParams {
  // ... 既存 ...
  readonly apoptosisIdleTickLimit: number;
  readonly apoptosisInstrLimitTickLimit: number;
}

export const DEFAULT_GAME_PARAMS: GameParams = {
  // ... 既存 ...
  apoptosisIdleTickLimit: 100,
  apoptosisInstrLimitTickLimit: 30,
};
```

### 修正: v5/ui/main.ts

UIState に `apoptosisDeaths: ReadonlySet<string>` を追加。EventLog でアポトーシス死を区別表示:

```
[tick N] charId died (apoptosis: idle=120 / instr_limit=0)
```

通常の死亡 (durability decay, starvation) と区別する。SelectedContent には「Idle: N ticks / Instr limit: M ticks」を常時表示してデバッグできるようにする。

### 仕様書更新: v5/docs/specs/game_spec.md

「アポトーシス」セクションを追加:
- 検出条件と閾値
- 死亡時の挙動 (残骸生成は通常死と同じ)
- パラメータ

## テスト計画

### ユニットテスト (test/character.test.ts に追加)

1. **idle カウンタ**: アクションなし tick で +1、ありで 0 リセット
2. **instr_limit カウンタ**: 命令上限到達で +1、HALT 達成で 0 リセット
3. **shouldApoptose**: 各閾値到達時 true、未満で false

### 統合テスト (test/simulation.test.ts に追加)

1. **idle apoptosis**: 何もしないプログラム → 100 tick 後に死亡、apoptosisDeaths に含まれる
2. **instruction limit apoptosis**: 無限ループプログラム → 30 tick 後に死亡
3. **healthy survives**: 通常 pioneer は両カウンタが常に閾値未満
4. **reflex saves**: M2 と組み合わせ → 充電反射が発火する個体は idle カウンタが 0 に保たれ、アポトーシスしない

### 破損注入テスト (CLI)

```bash
# 重度破損 + アポトーシス → 個体は短命だが種は生存
npm run sim -- --program programs/pioneer_def.json --ticks 1000 --seed 42 \
  --count 10 --output final --corrupt-at-tick 100 --corrupt-count 1500 --corrupt-periodic 200
```

期待: 周期的に破損された個体は数十〜100tick 後にアポトーシスし、種としてのターンオーバーが機能する。

## チューニング目標

| 指標 | 目標値 |
|------|--------|
| 健全個体のアポトーシス率 | 0%（健全個体は決してアポトーシスしない） |
| 完全破損個体のアポトーシス到達 | 100 tick 以内 |
| 集団の平均寿命 (健全個体) | M1/M2 と同じ程度 |
| 集団の平均寿命 (破損注入下) | apoptosis なしより短くなる（リソース回転加速） |

`apoptosisIdleTickLimit` と `apoptosisInstrLimitTickLimit` のチューニング:
- 健全個体が誤検出されるなら閾値を上げる
- 破損個体が長く居座るなら閾値を下げる

## 想定リスク

| リスク | 緩和策 |
|--------|--------|
| 健全個体の誤検出 (アクションを発行しない正常な静止状態がある) | 充電/repair も含めて全アクションを「アクションあり」とカウントする。実質的に「何も予約しない tick が 100 連続」は破損個体だけ |
| 反射 (M2) が idle カウンタを常にリセット → アポトーシスしない | これは仕様通り。反射で生存できる個体は「最低限機能している」とみなす。M3 はそれ以上に酷い個体を捕捉 |
| 検出は正しいが死亡が早すぎて集団が崩壊 | 閾値を上げる |
| プログラムが意図的にアポトーシスを利用 (suicide pattern) | 利用可能。これは進化の自由度の一部 |

## 実装ステップ（順序）

1. **types.ts**: Character に 2 カウンタ、TickResult に apoptosisDeaths を追加
2. **character.ts**: 初期化、updateApoptosisCounters、shouldApoptose
3. **params.ts**: パラメータ追加
4. **simulation.ts**: Step 8.5 の追加
5. **test/character.test.ts**: ユニットテスト追加
6. **test/simulation.test.ts**: 統合テスト追加
7. **ui/main.ts**: 表示更新
8. **docs/specs/game_spec.md**: アポトーシスセクション追加
9. **CLI 検証**: 破損注入でアポトーシスが発火することを確認、チューニング
10. **docs/tuning/apoptosis_M3.md**: 結果記録
11. **version.ts, package.json**: マイナー更新

## 決定事項のサマリ

| 項目 | 決定 |
|------|------|
| 検出条件 | (idle連続100tick) OR (instruction limit連続30tick) |
| 死亡フロー | durability=0 を設定し、既存の死亡判定に委ねる |
| 残骸生成 | 通常死と同じ |
| イベント | character_died（apoptosisDeaths セットで識別） |
| カウンタの保持 | Character 型に追加 (tick間で保持) |
| 反射との組み合わせ | 反射が発火していれば idle カウンタはリセット (アポトーシスしない) |

## 未決事項

なし。実装に進める。

## M2 との組み合わせの意義

M2 + M3 を組み合わせると、以下の階層が成立する:

```
プログラムが正常 → 通常の生命周期 (M1 で破損からの回復、進化的に多様化)
プログラムが軽度破損 → M1 で回復、ほぼ通常生命
プログラムが重度破損だが反射で動ける → M2 で生存延長、複製はできない
プログラムが完全機能不全 → M3 でアポトーシス、リソース回収
```

これは生物の階層的な生存戦略 (CHECKPOINT=エラー回復, 反射=自律神経, アポトーシス=計画的細胞死) に対応する。
