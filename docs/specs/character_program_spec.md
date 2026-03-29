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

### nearby の距離計算

距離はマンハッタン距離（`|dx| + |dy|`）で計算する。

- `radius: 0` は「現在地と同じタイルに存在するか」を意味する。資源ノード上にいるかの判定に利用可能。
- `radius: 100` 等の大きな値でマップ全体を探索可能。

### nearby の返却情報と評価コンテキスト

`nearby` が真の場合、最も近い対象の相対方向（N/S/E/W）がCondition評価コンテキストに格納される。
これにより `MOVE` のdirectionに `toward_nearest` を指定して目的地方向への移動が可能になる。

評価コンテキストはルール単位でリセットされる。1つのルール内の `condition` に含まれる `nearby` が真になった場合、
そのマッチした `type` が記録され、同ルールの `action` で `toward_nearest` が使用されたときにその `type` の
最近傍へ向かう方向が返される。

方向の決定ルール:
- 水平距離と垂直距離を比較し、大きい方の軸を優先する
- 水平距離と垂直距離が等しい場合はE/Wを優先する（水平軸優先）

## Action

コンポーネントへの命令1つ。各Actionは1ティックを消費する。

| Action | 対象コンポーネント | 説明 |
|--------|------------------|------|
| `MOVE(direction)` | Actuator | 指定方向（N/S/E/W）へ1タイル移動。`toward_nearest` で直前のnearby結果の方向へ移動 |
| `HARVEST` | Harvester | 現在地の資源ノードから原料を1つ取得 |
| `PROCESS(recipe)` | Assembler | 原料を加工素材へ変換 |
| `CRAFT(component)` | Assembler | 加工素材からコンポーネントを製造 |
| `ASSEMBLE(component_list)` | Assembler | コンポーネント群を組み立てて非活性キャラクター体を生成し、任意の隣接タイルに配置 |
| `WRITE(target)` | Processor | 自身のMemoryCore内容を対象のMemoryCoreへコピー。targetは対象キャラクターIDまたは `nearest_inactive` |
| `ACTIVATE(target)` | Processor | 非活性キャラクターを起動。targetは対象キャラクターIDまたは `nearest_inactive` |
| `SENSE` | Sensor | 周囲情報を取得（次ティックのCondition評価に使用） |
| `REPAIR` | Assembler | inventory内のFrameを消費してdurabilityを100回復 |
| `NOOP` | なし | 何もしない |

### target の指定

`WRITE` と `ACTIVATE` の `target` には以下を指定できる:

- **キャラクターID**（例: `"char-002"`）— 特定のキャラクターを直接指定
- **`"nearest_inactive"`** — 隣接タイル（マンハッタン距離1以内）にいる最も近い非活性キャラクターを自動解決

隣接する非活性キャラクターが見つからない場合、操作失敗となる。

### Action失敗時の挙動

- 対象コンポーネントが搭載されていない場合: 操作失敗（ティック消費、副作用なし）
- 素材不足の場合: 操作失敗（素材は消費されない、ティック消費）
- 現在地に資源がない状態でのHARVEST: 操作失敗（ティック消費）
- WRITE/ACTIVATEで対象が見つからない場合: 操作失敗（ティック消費）
- ASSEMBLEで隣接タイルが空いていない場合: 操作失敗（ティック消費）

## JSONフォーマット

プレイヤーはProgramをJSON形式で記述する。MemoryCore内部でもこのJSON構造がそのまま保持される。

各ルールにはオプションで `comment` フィールドを記述できる。`comment` はドキュメント用であり、
Program評価時には無視される（読み込み時に除去される）。

```json
{
  "rules": [
    {
      "comment": "Ore が十分あれば Metal に加工",
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

`WRITE` = JSONデータのディープコピー（`JSON.parse(JSON.stringify(...))`相当）。
親のMemoryCore内のProgramが、娘のMemoryCoreにそのまま複製される。
これにより、Programの自己複製がクワインの原理で実現される。

コピーは参照共有ではなく独立したデータとなる。親がProgramを変更しても娘のProgramは影響を受けない。

## WRITE と ACTIVATE の関係

WRITEはProgramデータをコピーする。コピー完了時点で対象のMemoryCoreにProgramが格納されるため、
対象は活性状態（Program保有）となる。ACTIVATEは概念的な「起動」操作であり、WRITEが完了した
キャラクターに対しては冪等（副作用なし）に成功する。

実装上、キャラクターの活性/非活性は `program` フィールドの有無で判定される:
- `program: null` → 非活性（WRITEの対象になる）
- `program: Program` → 活性（毎ティックProgramが実行される）
