# auto-craft-game v3 — 連続空間物理モデル

## 概要

自己複製可能な自律キャラクター（人工生命）のシミュレータ。
v2（離散グリッド空間）を連続空間・物理シミュレーションに拡張したバージョン。

キャラクターは連続座標上で力を受けて加速・移動し、摩擦で減速し、他のオブジェクトや壁と衝突する。
v2のゲームロジック（資源モデル、エネルギーモデル、レシピ、代謝、自己複製サイクル）はそのまま維持される。

### v2からの主要変更

- **座標系**: 整数グリッド → 浮動小数点連続空間
- **移動**: 1tick1セルの瞬間移動 → 力の適用による慣性移動
- **空間制約**: タイル占有 → 円の衝突判定と反発力
- **距離判定**: チェビシェフ距離 → ユークリッド距離
- **方向指定**: 8方向 → 360度 or toward_nearest
- **質量**: コンポーネント+インベントリの原料換算合計が加速度に影響
- **ゲームループ**: 8ステップ → 10ステップ（物理シミュレーション追加）

## セットアップ

```bash
cd v3
npm install
```

## コマンド

全コマンドは `v3/` ディレクトリで実行する。

### テスト

```bash
npm test
```

### CLIシミュレーション

```bash
npm run sim -- --program programs/self-replicator.json --ticks 1000 --seed 42
```

CLIオプション:

| オプション | デフォルト | 説明 |
|-----------|----------|------|
| `--program <path>` | (必須) | プログラムJSONファイル |
| `--ticks N` | 100 | 実行tick数 |
| `--seed N` | 42 | 乱数シード |
| `--output <mode>` | final | 出力モード: `tick` / `final` / `events` |
| `--initial-energy N` | 5000 | 初期キャラクターのエネルギー |
| `--world-size WxH` | 40x40 | ワールドサイズ |
| `--energy-nodes N` | 24 | EnergyNodeの数 |
| `--node-remaining N` | 80 | ResourceNodeの初期残量 |

### GUIアプリケーション

```bash
npm run ui
```

ブラウザで表示されるVite dev serverが起動する。

**操作方法:**

- **▶ / ⏸**: シミュレーションの開始/一時停止（スペースキーでも可）
- **◀ / ▶**: tick/s の増減（1〜60）
- **Reset**: ランダムシードでワールドを再生成
- **クリック**: マップ上のオブジェクトを選択し、詳細パネルに情報表示
- **マウスホイール**: ズームイン/アウト（カーソル位置中心）
- **ドラッグ**: マップのパン（スクロール）

## プロジェクト構造

```
v3/
├── README.md               ... 本ファイル
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vite.config.ts
│
├── src/                    ... ゲームロジック（DOM非依存）
│   ├── types.ts            ... 型定義（Position, Velocity, Force等）
│   ├── constants.ts        ... 全定数（v2定数 + 物理定数）
│   ├── recipes.ts          ... 素材階層、レシピ、質量計算
│   ├── world.ts            ... ワールド生成、距離計算、衝突判定、ノード操作
│   ├── character.ts        ... キャラクター生成、代謝、状態更新
│   ├── physics.ts          ... 物理シミュレーション（摩擦、衝突反発力、積分）
│   ├── program.ts          ... Program評価（Euclidean距離、360度方向、toward_nearest）
│   ├── actions.ts          ... 各Actionの実行（MOVE=力蓄積、距離ベース判定）
│   ├── simulation.ts       ... ゲームループ（10ステップ）
│   └── cli.ts              ... CLIエントリポイント
│
├── ui/                     ... ブラウザGUI（pixi.js描画）
│   ├── index.html          ... エントリHTML
│   ├── main.ts             ... UIコントローラー（タイマー制御、DOM更新）
│   ├── renderer.ts         ... pixi.js描画（連続空間、座標変換、ヒットテスト）
│   └── style.css           ... スタイル
│
├── test/                   ... テスト（51件）
│   ├── recipes.test.ts
│   ├── physics.test.ts
│   ├── world.test.ts
│   ├── program.test.ts
│   ├── actions.test.ts
│   └── simulation.test.ts
│
├── programs/               ... キャラクタープログラム（JSON）
│   ├── self-replicator.json
│   ├── scavenger.json
│   └── opportunist.json
│
└── docs/
    ├── specs/              ... ゲーム仕様書
    │   ├── README.md
    │   ├── game_spec.md
    │   └── initial_state.md
    └── ui_spec/            ... GUI仕様書
        ├── requirements.md
        ├── architecture.md
        └── game_objects.md
```

## 仕様

| ファイル | 内容 |
|---------|------|
| `docs/specs/README.md` | バージョン概要・スコープ |
| `docs/specs/game_spec.md` | ゲームシステム仕様（物理モデル、アクション、ゲームループ） |
| `docs/specs/initial_state.md` | 初期状態仕様（ノード配置、壁生成） |
| `docs/ui_spec/requirements.md` | GUI機能要件 |
| `docs/ui_spec/architecture.md` | GUIアーキテクチャ・描画仕様 |
| `docs/ui_spec/game_objects.md` | GUI描画対象オブジェクト一覧 |

## アーキテクチャ

- `src/` はDOM非依存のゲームロジック。`ui/` が `@/` エイリアス経由でimportして利用する
- 物理シミュレーションは `src/physics.ts` に集約。ForceMapに力を蓄積し、1回の積分ステップで速度・位置を更新する（Semi-implicit Euler）
- GUIは pixi.js v8 で描画。ワールド座標⇔スクリーン座標の変換を `renderer.ts` 内で処理する
- Vite設定（`vite.config.ts`, root: ui）とVitest設定（`vitest.config.ts`, root: プロジェクトルート）は分離
