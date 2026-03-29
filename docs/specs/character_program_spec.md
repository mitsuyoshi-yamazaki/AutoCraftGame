# キャラクターProgram仕様

キャラクターの振る舞いを定めるProgramの構造、Condition、Action、JSONフォーマットを定義する。

---

## 概要

- Programはルールのリストとして表現する
- Processorは毎ティック、ルールを上から評価し、最初にマッチしたルールのActionを実行する
- ProgramはMemoryCoreにJSON形式で格納され、コピーにより複製される

## データ構造

```
Program = Rule[]
Rule = { condition: Condition, action: Action }
```

## Condition

Sensorの出力（周囲情報）とinventoryの状態を参照する述語。

### 基本述語

| 述語 | 説明 |
|------|------|
| `inventory_has(item, count)` | 指定アイテムを指定数以上所持しているか |
| `nearby(type, radius)` | 指定半径内に指定種別の対象が存在するか |
| `durability_below(threshold)` | 耐久値が閾値未満か |
| `true` | 常にマッチ（デフォルト行動に使用） |

### 論理結合

| 演算子 | 説明 |
|--------|------|
| `and(conditions[])` | 全条件がマッチ |
| `or(conditions[])` | いずれかの条件がマッチ |
| `not(condition)` | 条件の否定 |

論理結合はネスト可能。

### nearby の type に指定可能な値

- `OreNode` — Ore鉱床
- `CrystalNode` — Crystal鉱床
- `Character` — 他のキャラクター
- `InactiveCharacter` — 非活性キャラクター

### nearby の返却情報

`nearby` が真の場合、最も近い対象の相対方向（N/S/E/W）がCondition評価コンテキストに格納される。
これにより `MOVE` のdirectionに `toward_nearest` を指定して目的地方向への移動が可能になる。

## Action

コンポーネントへの命令1つ。各Actionは1ティックを消費する。

| Action | 対象コンポーネント | 説明 |
|--------|------------------|------|
| `MOVE(direction)` | Actuator | 指定方向（N/S/E/W）へ1タイル移動。`toward_nearest` で直前のnearby結果の方向へ移動 |
| `HARVEST` | Harvester | 現在地の資源ノードから原料を1つ取得 |
| `PROCESS(recipe)` | Assembler | 原料を加工素材へ変換 |
| `CRAFT(component)` | Assembler | 加工素材からコンポーネントを製造 |
| `ASSEMBLE(component_list)` | Assembler | コンポーネント群を組み立てて非活性キャラクター体を生成し、任意の隣接タイルに配置 |
| `WRITE(target)` | Processor | 自身のMemoryCore内容を対象のMemoryCoreへコピー |
| `ACTIVATE(target)` | Processor | 非活性キャラクターを起動 |
| `SENSE` | Sensor | 周囲情報を取得（次ティックのCondition評価に使用） |
| `REPAIR` | Assembler | inventory内のFrameを消費してdurabilityを100回復 |
| `NOOP` | なし | 何もしない |

### Action失敗時の挙動

- 対象コンポーネントが搭載されていない場合: 操作失敗（ティック消費、副作用なし）
- 素材不足の場合: 操作失敗（素材は消費されない、ティック消費）
- 現在地に資源がない状態でのHARVEST: 操作失敗（ティック消費）

## JSONフォーマット

プレイヤーはProgramをJSON形式で記述する。MemoryCore内部でもこのJSON構造がそのまま保持される。

```json
{
  "rules": [
    {
      "condition": {
        "op": "and",
        "conditions": [
          { "op": "inventory_has", "item": "Ore", "count": 16 },
          { "op": "not", "condition": { "op": "inventory_has", "item": "Metal", "count": 8 } }
        ]
      },
      "action": { "op": "PROCESS", "recipe": "Metal" }
    },
    {
      "condition": { "op": "nearby", "type": "OreNode", "radius": 5 },
      "action": { "op": "MOVE", "direction": "toward_nearest" }
    },
    {
      "condition": { "op": "true" },
      "action": { "op": "HARVEST" }
    }
  ]
}
```

## WRITE命令の挙動

`WRITE` = JSONデータのディープコピー。
親のMemoryCore内のProgramが、娘のMemoryCoreにそのまま複製される。
これにより、Programの自己複製がクワインの原理で実現される。
