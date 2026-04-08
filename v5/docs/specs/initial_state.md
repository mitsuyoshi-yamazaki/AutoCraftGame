# 初期状態仕様 — v4

本文書はゲーム世界の初期状態（ワールド生成時のオブジェクト配置）を定義する。
ゲームの法則は `game_spec.md` で定義される。

---

## 1. ワールド

- 矩形領域: `(0, 0)` - `(WORLD_WIDTH, WORLD_HEIGHT)`（浮動小数点数）
- 周囲は壁オブジェクトで囲われる（game_spec.md セクション2-6参照）

## 2. 配置の制約

**衝突しない配置**を制約とする。

ワールド生成時は以下の順でオブジェクトを配置し、既存オブジェクトとの衝突を避ける:

1. ResourceNode
2. EnergyNode
3. 初期キャラクター

配置候補の位置で既存オブジェクトと衝突する（距離が半径の和未満）場合、別の位置を選択する。

## 3. ResourceNode配置

- ノード数: 各タイプ `ORE_NODE_COUNT` 個、`CRYSTAL_NODE_COUNT` 個
- 各ノードの初期remaining: `NODE_DEFAULT_REMAINING`（整数値）
- 配置方式: ワールド範囲内の連続座標からランダム（seeded PRNG使用）
- 衝突しない位置が見つかるまでリトライ

## 4. EnergyNode配置

- ノード数: `ENERGY_NODE_COUNT`
- 各ノードのパラメータ:
  - `productionRate`: 整数値
  - `maxStored`: 整数値
  - `stored`: 初期値は `maxStored`
- 配置先はResourceNode配置後の衝突しない位置からランダムに選択

## 5. 初期キャラクター

### 配置

- 配置数: 種族ごとに指定（デフォルトはパラメータで設定）
- 配置位置: ワールド範囲内の衝突しない位置からランダムに選択
- キャラクターIDは `char-001` から順に割り当て

### プログラムの供給

プログラムはプログラム定義ファイル（JSON）から読み込む。

```json
{
  "name": "Replicator",
  "components": ["Frame", "Frame", "Frame", "Actuator", "Harvester", "Charger", "Assembler", "Processor", "Sensor", "MemoryCore", "MemoryCore"],
  "program": [4660, 22136, 43981, ...]
}
```

- `name`: 種族名（species）
- `components`: 初期コンポーネント構成
- `program`: 16bitワードの配列（VMメモリのアドレス0から配置される）

### キャラクターの初期状態

- active: true（初期キャラクターはロード時にactiveとして起動する）
- memory: programの内容がアドレス0から配置され、残りは0
- registers: 全て0
- pc: 0
- localIdTable: 空
- localIdCounter: 0
- 速度: { vx: 0, vy: 0 }
- コンポーネント: プログラム定義ファイルのcomponents
- インベントリ: 空
- エネルギー: パラメータで指定（整数値）
- 耐久値: Frame数 × FRAME_DURABILITY
- species: プログラム定義ファイルのname
- createdAt: 0

### コンポーネント構成

初期キャラクターのコンポーネント構成はプログラム定義ファイルで種族ごとに指定する。

最小構成の参考値:
- Frame × 3
- Actuator × 1
- Harvester × 1
- Charger × 1
- Assembler × 1
- Processor × 1
- Sensor × 1
- MemoryCore × 1

MemoryCoreは必須（VMメモリの提供に必要）。最低1個。
Mini-Cコンパイラで生成されたプログラムは1000ワード以上になることが多いため、MemoryCore × 2（2048ワード）を推奨する。

## 6. 壁オブジェクトの生成

ワールド境界に4つの壁オブジェクトを自動生成する:

- 上壁: y = 0 の水平線
- 下壁: y = WORLD_HEIGHT の水平線
- 左壁: x = 0 の垂直線
- 右壁: x = WORLD_WIDTH の垂直線

壁はパラメータでの変更対象ではない。

## 7. GroundGrid初期化

全セルが `{ ore: 0, crystal: 0 }` のGroundGridを生成する。
グリッドサイズ: `floor(WORLD_WIDTH) × floor(WORLD_HEIGHT)` セル。

## 8. 定数

| 定数名 | 意味 | デフォルト値 |
|--------|------|-------------|
| WORLD_WIDTH | ワールド幅 | 60 |
| WORLD_HEIGHT | ワールド高さ | 60 |
| ORE_NODE_COUNT | OreNode数 | 50 |
| CRYSTAL_NODE_COUNT | CrystalNode数 | 50 |
| ENERGY_NODE_COUNT | EnergyNode数 | 40 |
| NODE_DEFAULT_REMAINING | 各ノードの初期残量 | (パラメータ) |
