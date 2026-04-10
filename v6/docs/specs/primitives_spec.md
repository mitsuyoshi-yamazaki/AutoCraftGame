# 制御プリミティブ仕様 — v6

本文書は Processor / VM を使わずにキャラクターの行動を制御する**制御プリミティブ層**の仕様を定める。

---

## 1. 概要

制御プリミティブは、キャラクターに組み込まれた**条件→アクション規則の配列**（ルールリスト）である。VM のようなプログラムカウンタや汎用メモリは持たず、毎 tick ルールリストを先頭から評価し、**最初に条件が真となったルールのアクションを予約する**。

既存の reflexes (M2) が「ハードコードされた 2 つの条件→アクション規則」であるのに対し、制御プリミティブは**ユーザーが定義可能な N 個の規則**を持つ。

### 設計原則

- **VM と並存する**: Processor を持つキャラクターは VM で制御される。Processor を持たないキャラクターはプリミティブで制御される。両方持つ場合は VM が優先される（VM が HALT に達した後、プリミティブは評価されない）。
- **部分破壊に耐性がある**: ルールの一部が破損しても、残りのルールは動作し続ける。
- **設定値は整数**: 全ての閾値・パラメータは 16bit 符号なし整数で表現される（VM メモリと同じ値域）。

---

## 2. ルール構造

```
Rule = {
  condition: Condition,
  action: Action,
}
```

キャラクターは `rules: Rule[]` を保持する。毎 tick、先頭から順に condition を評価し、最初に真となったルールの action をアクション予約として発行する。全ルールが偽なら何も予約しない（NOOP）。

**1 tick に発行されるアクションは最大 1 つ**。これは VM ベースのキャラクターが複数アクション（MOVE + HARVEST 等）を同時予約できることに対する明確な制約であり、プリミティブの限界を表す。

---

## 3. Condition

条件は以下の種類がある。各条件は引数として整数パラメータを持つ。

| 条件型 | 引数 | 真となる条件 |
|--------|------|-------------|
| `always` | なし | 常に真 |
| `energy_below` | `threshold: number` | `character.energy < threshold` |
| `energy_above` | `threshold: number` | `character.energy >= threshold` |
| `durability_below` | `threshold: number` | `character.durability < threshold` |
| `inventory_has` | `item: ItemType, count: number` | インベントリに item が count 個以上 |
| `inventory_below` | `item: ItemType, count: number` | インベントリの item が count 個未満 |
| `nearby` | `targetType: NearbyTargetType, range: number` | 指定種別の対象が range 以内に存在 |
| `not_nearby` | `targetType: NearbyTargetType, range: number` | 指定種別の対象が range 以内に存在しない |
| `tick_mod` | `divisor: number, remainder: number` | `world.tick % divisor === remainder` |

### 複合条件

条件の組合せが必要な場合は複数ルールの順序で表現する。例えば「energy < 200 かつ EnergyNode が近くにある」は、以下のように表現する：

```
Rule 1: { condition: energy_above(200), action: <他の行動> }
Rule 2: { condition: nearby(EnergyNode, 1.5), action: RECHARGE }
```

Rule 1 が energy >= 200 なら先にマッチするので Rule 2 に到達しない。energy < 200 のときだけ Rule 2 が評価される。

この方式は AND 条件を暗黙的に表現する（先行ルールが「否定条件でスキップ」する役割を担う）。

---

## 4. Action

アクションは以下の種類がある。

| アクション型 | 引数 | 効果 |
|-------------|------|------|
| `move_toward` | `targetType: NearbyTargetType` | 最近接の対象へ向かって MOVE |
| `move_away` | `targetType: NearbyTargetType` | 最近接の対象から離れる方向に MOVE |
| `move_random` | なし | tick に基づく擬似ランダム方向に MOVE |
| `harvest` | なし | 最近接の ResourceNode に HARVEST |
| `recharge` | なし | 最近接の EnergyNode に RECHARGE |
| `process` | `recipe: number` | PROCESS（0=Metal, 1=Circuit） |
| `craft` | `componentType: number` | CRAFT（コンポーネント種別番号） |
| `assemble` | `templateIndex: number` | ASSEMBLE（構成テンプレート参照、5節） |
| `repair` | なし | REPAIR |
| `disassemble` | なし | 最近接の Remains に DISASSEMBLE |
| `noop` | なし | 何もしない（明示的スキップ） |

### move_toward / move_away の角度計算

`move_toward`: Sensor コンポーネントを保持している場合のみ有効。senseRange 内の最近接対象への角度を算出し、MOVE 予約を発行する。対象が見つからない場合は `move_random` にフォールバックする。

`move_random`: `(tick * 137 + character.id のハッシュ) % 360` で方向を決定する。乱数ではないが、個体ごとに異なる方向を向く。

---

## 5. ASSEMBLE とプリミティブの転写

### 5-1. 構成テンプレート

キャラクターは `assemblyTemplates: AssemblyTemplate[]` を保持する。各テンプレートは子キャラクターの構成を定義する。

```
AssemblyTemplate = {
  components: ComponentType[],    // 子のコンポーネント構成
  rules: Rule[],                  // 子に転写するルールリスト
  assemblyTemplates: AssemblyTemplate[],  // 子に転写するテンプレート
}
```

`assemble` アクションの `templateIndex` でテンプレートを選択する。

### 5-2. 転写の動作

ASSEMBLE 成功時：
1. テンプレートの `components` に基づき子を生成（既存の ASSEMBLE と同じ）
2. 子の `rules` にテンプレートの `rules` をコピー
3. 子の `assemblyTemplates` にテンプレートの `assemblyTemplates` をコピー
4. 子は **active** 状態で生成される（VM は inactive だが、プリミティブ評価は即座に開始）

### 5-3. 自己複製テンプレート

親が自分自身と同じ構成の子を作るには、テンプレートに以下を設定する：
- `components`: 親と同じコンポーネントリスト
- `rules`: 親と同じルールリスト
- `assemblyTemplates`: テンプレート自身を再帰的に含む

この再帰構造により、子も同じテンプレートを持ち、孫の生成が可能になる。

### 5-4. 変異

テンプレート内の数値パラメータ（閾値、レシピ番号、コンポーネント種別番号等）は VM メモリと同様に破損の対象となる。これにより自然な変異が発生する。

変異の仕組み：
- `corruption.ts` の既存メカニズムを拡張し、プリミティブのパラメータにもビット反転を適用可能にする
- ただし v6 初期実装では、ASSEMBLE 時に一定確率でパラメータを微小変更する方式を採用する

---

## 6. プリミティブキャラクターの生存サイクル

### active 状態の扱い

プリミティブキャラクター（Processor を持たないキャラクター）は以下の扱いとする：

- ASSEMBLE で生成された直後は inactive（既存仕様と同じ）
- **ACTIVATE 不要**: Processor を持たないキャラクターは、生成の次の tick から自動的に primitive 評価が開始される。`vm.active` は false のままだが、`rules` が空でなければプリミティブ評価の対象となる。
- これにより、WRITE + ACTIVATE の 2 tick が不要になり、プリミティブのみで完結する生殖サイクルが可能になる。

### reflex との関係

プリミティブで発行されたアクション予約に対しても、reflex (M2) は通常通り動作する：
- プリミティブが RECHARGE を予約済みなら auto-recharge は発火しない
- プリミティブが何も予約しなければ reflex が発火する

### apoptosis との関係

プリミティブで予約されたアクションも「アクション予約あり」としてカウントされる。instrLimitTickCount は Processor を持たないキャラクターでは常に 0 のままである。

---

## 7. エンコーディング

ルールとテンプレートは整数配列としてシリアライズされる（VM メモリと同じ 16bit 符号なし整数の配列）。これにより破損・変異の対象とできる。

### ルールのエンコーディング

```
[conditionType, ...conditionArgs, actionType, ...actionArgs]
```

各ルールは固定長（8 ワード）でエンコードする。未使用フィールドは 0 パディング。

| ワード | 内容 |
|--------|------|
| 0 | conditionType |
| 1 | conditionArg0 |
| 2 | conditionArg1 |
| 3 | (reserved) |
| 4 | actionType |
| 5 | actionArg0 |
| 6 | actionArg1 |
| 7 | (reserved) |

### テンプレートのエンコーディング

```
[componentCount, ...componentTypes, ruleCount, ...rules(encoded), templateCount, ...templates(encoded)]
```

---

## 8. 定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| `RULE_WORD_SIZE` | 1 ルールあたりのワード数 | 8 |
| `MAX_RULES` | キャラクターあたりの最大ルール数 | 16 |
| `PRIMITIVE_MUTATION_RATE` | ASSEMBLE 時の変異確率（1 ワードあたり） | 0.02 |
| `PRIMITIVE_MUTATION_RANGE` | 変異時のパラメータ変動幅 | 3 |

---

## 9. ゲームループへの統合

既存のゲームループ（simulation.ts）のステップ 2 を以下のように拡張する：

```
Step 2: キャラクター制御実行
  for each character:
    if character has Processor and vm.active:
      → VM 実行（既存）
    else if character has non-empty rules:
      → プリミティブ評価（新規）
    else:
      → 何もしない（reflex のみ）
```

プリミティブ評価の結果はアクション予約（`ActionReservation`）として、VM 実行の結果と同じ形式で出力される。以降のステップ（アクション実行、物理、代謝等）は変更不要。
