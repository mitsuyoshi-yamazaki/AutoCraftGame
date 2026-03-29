# AutoCraftGame

自己複製可能な自律キャラクターが構築できるかを検証するプロトタイプ。

## セットアップ

```bash
npm install
```

## コマンド

### テスト実行

```bash
npm test
```

### シミュレーション実行

```bash
npm run sim -- [options]
```

#### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--ticks N` | 実行ティック数 | 100 |
| `--program <path>` | 初期キャラクターのProgramファイル（JSON） | なし（指定必須） |
| `--map-size WxH` | マップサイズ（幅x高さ） | 20x20 |
| `--output <mode>` | 出力モード: `tick` / `final` / `events` | final |

#### 出力モード

- **tick** — 毎ティックの状態をJSON（1行1ティック）で出力
- **final** — 最終状態とイベント一覧をJSONで出力
- **events** — イベント（誕生・死亡）のみをJSONで出力

### 実行例

```bash
# 自己複製の観測（200ティック、イベントのみ表示）
npm run sim -- --ticks 200 --program programs/self-replicator.json --output events

# 毎ティックの状態を確認
npm run sim -- --ticks 50 --program programs/self-replicator.json --output tick

# マップサイズを変更して実行
npm run sim -- --ticks 300 --program programs/self-replicator.json --map-size 30x30

# 最終状態を確認（デフォルト）
npm run sim -- --ticks 200 --program programs/self-replicator.json
```

## Program の書き方

キャラクターの行動は `programs/` ディレクトリにJSON形式で記述する。
ルールは上から順に評価され、最初にマッチしたルールのActionが実行される。

### Condition（条件）

| 述語 | 説明 |
|------|------|
| `{ "op": "true" }` | 常にマッチ |
| `{ "op": "inventory_has", "item": "Ore", "count": 5 }` | 指定アイテムを指定数以上所持 |
| `{ "op": "nearby", "type": "OreNode", "radius": 3 }` | 指定半径内に対象が存在 |
| `{ "op": "durability_below", "threshold": 20 }` | 耐久値が閾値未満 |
| `{ "op": "and", "conditions": [...] }` | 全条件がマッチ |
| `{ "op": "or", "conditions": [...] }` | いずれかがマッチ |
| `{ "op": "not", "condition": {...} }` | 条件の否定 |

`nearby` の `type` に指定可能な値: `OreNode`, `CrystalNode`, `Character`, `InactiveCharacter`

### Action（行動）

| Action | 説明 |
|--------|------|
| `{ "op": "MOVE", "direction": "N" }` | 移動（N/S/E/W または `toward_nearest`） |
| `{ "op": "HARVEST" }` | 現在地の資源を採取 |
| `{ "op": "PROCESS", "recipe": "Metal" }` | 原料を加工素材に変換（Metal / Circuit） |
| `{ "op": "CRAFT", "component": "Frame" }` | 加工素材からコンポーネントを製造 |
| `{ "op": "ASSEMBLE", "components": [...] }` | コンポーネントを組み立てて新キャラクター生成 |
| `{ "op": "WRITE", "target": "nearest_inactive" }` | 自身のProgramを対象にコピー |
| `{ "op": "ACTIVATE", "target": "nearest_inactive" }` | 非活性キャラクターを起動 |
| `{ "op": "SENSE" }` | 周囲情報を取得 |
| `{ "op": "REPAIR" }` | Frameを消費して耐久値を100回復 |
| `{ "op": "NOOP" }` | 何もしない |

### レシピ一覧

**加工（PROCESS）**: Ore x2 → Metal, Crystal x2 → Circuit

**製造（CRAFT）**:

| コンポーネント | 素材 |
|--------------|------|
| Frame | Metal x3 |
| Actuator | Metal x1 + Circuit x1 |
| Sensor | Circuit x2 |
| Processor | Circuit x3 |
| Harvester | Metal x2 |
| Assembler | Metal x2 + Circuit x1 |
| MemoryCore | Circuit x2 |

**最小構成キャラクター**: Frame + Actuator + Sensor + Processor + Harvester + Assembler + MemoryCore
（必要素材: Ore x16, Crystal x18）

## GUI（2Dビジュアライザ）

シミュレーションをブラウザ上の2Dグリッドでリアルタイム表示する。

### 起動

```bash
npm run ui
```

表示されたURL（`http://localhost:5173`）をブラウザで開く。

### 画面構成

| 領域 | 内容 |
|------|------|
| コントロールバー | 再生/一時停止ボタン、速度調整、現在tick表示 |
| グリッド（Canvas） | 20×20マップ。資源ノードとキャラクターを色分け表示 |
| サイドパネル | 統計情報（生存数・誕生数・死亡数）、選択キャラクターの詳細 |
| イベントログ | 誕生・死亡イベントをリアルタイム表示 |

### 操作方法

| 操作 | 説明 |
|------|------|
| ▶ / ⏸ ボタン | シミュレーションの再生・一時停止 |
| スペースキー | 再生・一時停止のトグル |
| ◀ / ▶（速度） | tick/s を 1〜60 の範囲で調整 |
| グリッドクリック | キャラクターを選択し、サイドパネルに詳細表示 |

### 表示凡例

| 色 | 意味 |
|-----|------|
| 茶色 | OreNode（鉱石ノード） |
| 紫色 | CrystalNode（結晶ノード） |
| 半透明 | 枯渇中のノード（次tickで再生） |
| 青 ◆ | アクティブキャラクター |
| 灰 ◆ | 非アクティブキャラクター（プログラム未書込） |
| 金枠 | 選択中のキャラクター |

## プロジェクト構造

```
src/
├── types.ts          ... 型定義
├── recipes.ts        ... 素材階層・レシピ
├── world.ts          ... マップ・資源ノード
├── character.ts      ... キャラクター・コンポーネント
├── program.ts        ... Condition評価・Action実行
├── replication.ts    ... 自己複製関連
├── simulation.ts     ... ゲームループ
└── cli.ts            ... CLIエントリポイント
test/                 ... テスト（36件）
programs/
└── self-replicator.json  ... 自己複製Program
ui/
├── index.html        ... GUIエントリHTML
├── main.ts           ... UIコントローラー（タイマー制御・DOM更新）
├── renderer.ts       ... Canvas描画（グリッド・キャラクター）
└── style.css         ... スタイル
docs/specs/           ... 仕様書
docs/ui_spec/         ... GUI仕様書
results/              ... シミュレーション結果
```
