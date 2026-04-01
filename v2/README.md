# AutoCraftGame v2 — 淘汰圧の導入

v1（自己複製の検証）に淘汰圧を導入したバージョン。資源の有限化、エネルギーモデル、行動コスト、残骸・分解を実装する。

## セットアップ

```bash
cd v2
npm install
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm test` | 全テスト実行（60件） |
| `npm run sim -- [options]` | CLIシミュレーション実行 |
| `npm run ui` | GUI起動（ブラウザで `http://localhost:5173`） |
| `npm run storybook` | Storybook起動（ブラウザで `http://localhost:6006`） |

## CLIシミュレーション

```bash
npm run sim -- --program programs/self-replicator.json --ticks 200 --output events
```

### オプション

| オプション | デフォルト | 説明 |
|-----------|----------|------|
| `--program <path>` | (必須) | 初期キャラクターのProgramファイル（JSON） |
| `--ticks N` | 100 | 実行tick数 |
| `--map-size WxH` | 20x20 | マップサイズ |
| `--output <mode>` | final | 出力モード: `tick` / `final` / `events` |
| `--initial-energy N` | 5000 | 初期キャラクターのエネルギー |
| `--energy-nodes N` | 8 | EnergyNodeの数 |
| `--node-remaining N` | 50 | 各ResourceNodeの初期remaining |
| `--seed N` | 42 | 乱数シード |

### 出力モード

- **tick** — 毎tickの状態をJSON（1行1tick）で出力
- **final** — 最終状態とイベント一覧をJSONで出力
- **events** — イベント（誕生・死亡）のみをJSONで出力

### 実行例

```bash
# イベントのみ表示
npm run sim -- --ticks 500 --program programs/self-replicator.json --output events

# 毎tickの状態を確認
npm run sim -- --ticks 50 --program programs/self-replicator.json --output tick

# パラメータを変えて実行
npm run sim -- --ticks 300 --program programs/self-replicator.json --initial-energy 10000 --energy-nodes 12 --seed 123
```

## GUI

```bash
npm run ui
```

ブラウザで `http://localhost:5173` を開く。

### 操作

| 操作 | 説明 |
|------|------|
| ▶ / ⏸ ボタン | 再生・一時停止 |
| スペースキー | 再生・一時停止のトグル |
| ◀ / ▶（速度） | tick/s を 1〜60 の範囲で調整 |
| Reset ボタン | ランダムシードで初期化 |
| グリッドクリック | キャラクターを選択し詳細表示 |

### 表示要素

| 要素 | 色・形状 | 説明 |
|------|---------|------|
| OreNode | 茶色の角丸四角 | 残量に応じて濃淡変化 |
| CrystalNode | 水色の角丸四角 | 残量に応じて濃淡変化 |
| EnergyNode | 金色のダイヤモンド | 蓄積量に応じて明暗変化 |
| Remains | 灰色の壊れた円弧 | 内容量に応じて濃淡変化 |
| Character（アクティブ） | 青系の円（コンポーネントリング） | エネルギーリング（金色）付き |
| Character（非アクティブ） | 灰色・半透明 | |

## Storybook

```bash
npm run storybook
```

ブラウザで `http://localhost:6006` を開く。

### ストーリー一覧

| グループ | 内容 |
|---------|------|
| Map/ResourceNode | OreNode / CrystalNode の残量バリエーション、空セル |
| Map/EnergyNode | 蓄積量バリエーション（満タン〜空） |
| Map/Remains | 内容量バリエーション（フルボディ〜ほぼ空） |
| Map/Character | アクティブ/非アクティブ、耐久値・エネルギー段階、コンポーネント構成、インベントリ |
| Map/GridOverview | 全要素を配置した一覧（凡例付き） |

## プロジェクト構造

```
src/                   ... ゲームロジック（純粋関数、DOM非依存）
ui/                    ... ブラウザGUI（pixi.js描画）
test/                  ... テスト（60件）
programs/              ... キャラクターProgramのJSON
.storybook/            ... Storybook設定
docs/specs/            ... ゲーム仕様書
docs/ui_spec/          ... GUI仕様書
docs/plan/             ... 実装計画
docs/tuning/           ... パラメータ調整記録
```
