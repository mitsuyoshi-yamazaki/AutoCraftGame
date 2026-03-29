# GUI描画対象オブジェクト一覧

ゲームシステム上、マップ座標（Position）を持ち、GUIのグリッド上に描画しうるオブジェクト種別を列挙する。

---

## 1. ResourceNode（資源ノード）

マップ上に固定配置された採取可能な資源源。キャラクターがHARVESTアクションで原料を取得する対象。

- **type** — ノード種別
  - `OreNode`（鉱石ノード）: 左半分に配置、Oreを産出
  - `CrystalNode`（結晶ノード）: 右半分に配置、Crystalを産出
- **depleted** — 枯渇状態（boolean）
  - `false`: 採取可能（通常表示）
  - `true`: そのtick中にHARVESTされた（半透明表示、次tickで再生）
- **position** — マップ上の座標 `{x, y}`

## 2. Character（アクティブキャラクター）

`program` が非nullの活性キャラクター。毎tick、Programに従って自律行動する。

- **id** — 一意な識別子（例: `char-001`）
- **position** — マップ上の座標 `{x, y}`
- **durability** — 現在の耐久値（毎tick -1、0以下で死亡）
- **components** — 搭載コンポーネント一覧（Body構成）
  - Frame, Actuator, Sensor, Processor, Harvester, Assembler, MemoryCore の任意組み合わせ
  - コンポーネント数・種類はキャラクターごとに異なりうる
- **inventory** — 所持アイテム（アイテム名 → 個数）
  - 原料（Ore, Crystal）、加工素材（Metal, Circuit）、コンポーネント類
- **最大耐久値** — Frame数 × 100（componentsから導出）
- **現在のAction** — そのtickで実行中のアクション（MOVE, HARVEST, CRAFT, ASSEMBLE 等）

## 3. InactiveCharacter（非アクティブキャラクター）

`program` がnullの非活性キャラクター。ASSEMBLEで生成された直後の状態で、WRITE + ACTIVATEされるまで行動しない。

- **id** — 一意な識別子
- **position** — マップ上の座標（生成した親の隣接タイル）
- **durability** — 初期耐久値（Frame数 × 100）
- **components** — 搭載コンポーネント一覧（親のASSEMBLE指示で決定）
- **inventory** — 空（生成直後は常に空）

> アクティブ / 非アクティブの区別は `program` フィールドのnull判定による。型としては同一の `Character` だが、描画上は明確に区別する（色・形状等）。

---

## 補足: 位置を持たない概念（描画対象外）

以下はゲームシステム上の重要な概念だが、それ自体はマップ座標を持たないため、グリッド上への直接描画の対象ではない。サイドパネルやオーバーレイ等での情報表示に用いる。

- **Inventory内アイテム** — Ore, Crystal, Metal, Circuit, Frame, Actuator 等。キャラクターの所持品として表示
- **Program** — キャラクターの行動ルール群。選択キャラクターの詳細パネルで表示
- **SimulationEvent** — character_spawned / character_died。イベントログとして時系列表示
- **World統計** — 現在tick、生存キャラクター数、累計誕生・死亡数。統計パネルで表示
