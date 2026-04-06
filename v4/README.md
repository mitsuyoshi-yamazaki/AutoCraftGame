# auto-craft-game v4

キャラクターのプログラムを変化可能にし、進化が創発するシミュレータ。

## 目的

v3までの「ルールベースの固定プログラム」を廃止し、16bit VMによる汎用プログラムに置き換える。
キャラクターは自身のプログラム（メモリ上の命令列）を読み書きでき、子にコピーする際に変異を導入できる。

## 含まれるアプリケーション

| アプリケーション | 説明 | 実行方法 |
|----------------|------|---------|
| ゲーム本体 (CLI) | VMベースのシミュレーションを実行 | `npm run sim` |
| Mini-Cコンパイラ | C言語サブセット → アセンブリ変換 | `npm run compile` |
| VMアセンブラ | アセンブリ → バイナリ変換 | `npm run assemble` |
| GUIアプリケーション | ブラウザベースの可視化 | `npm run ui` (未実装) |

## セットアップ

```bash
cd v4
npm install
```

## 使用方法

### プログラムのビルド（Mini-C → バイナリ）

```bash
# 1. Mini-Cソースをアセンブリにコンパイル
npm run compile -- programs/replicator.c
# → programs/replicator.asm が生成される

# 2. アセンブリをバイナリにアセンブル
npm run assemble -- programs/replicator.asm
# → programs/replicator.bin と programs/replicator.json が生成される
```

### プログラム定義ファイルの作成

ゲーム実行にはプログラム定義ファイル（JSON）が必要:

```json
{
  "name": "Replicator",
  "components": ["Frame", "Frame", "Frame", "Actuator", "Harvester",
                  "Charger", "Assembler", "Processor", "Sensor", "MemoryCore"],
  "program": [33792, 645, 0, ...],
  "count": 3
}
```

- `name`: 種族名（species）
- `components`: 初期コンポーネント構成
- `program`: アセンブル済みの16bitワード列（.jsonファイルの内容）
- `count`: 初期配置数

### シミュレーション実行

```bash
# 基本実行（100tick、最終結果表示）
npm run sim -- --program programs/replicator_def.json

# オプション
npm run sim -- --program programs/replicator_def.json \
  --ticks 500 \          # 実行tick数（デフォルト: 100）
  --seed 42 \            # 乱数シード（デフォルト: 42）
  --count 3 \            # 種族あたりの初期個体数（デフォルト: 3）
  --output tick \         # 出力形式: tick（毎tick）/ final（最終のみ）/ events（イベント）
  --world-size 60x60      # ワールドサイズ（デフォルト: 60x60）

# 複数種族
npm run sim -- --program programs/species_a.json --program programs/species_b.json
```

### テスト

```bash
npm test
```

## アーキテクチャ

### ディレクトリ構成

```
v4/
├── src/
│   ├── cli.ts              # CLIエントリポイント
│   ├── types.ts            # 型定義
│   ├── params.ts           # ゲームパラメータ
│   ├── engine.ts           # エンジンファクトリ（全モジュールの結合）
│   ├── simulation.ts       # ゲームループ（12ステップ）
│   ├── actions.ts          # アクション実行エンジン
│   ├── io.ts               # VM I/O空間ハンドラ
│   ├── character.ts        # キャラクター生成・操作
│   ├── world.ts            # ワールド生成・操作
│   ├── physics.ts          # 物理エンジン（摩擦・衝突・積分）
│   ├── ground.ts           # GroundGrid・残骸吸収・ノード再生
│   ├── recipes.ts          # レシピ・質量計算
│   ├── spatial-grid.ts     # 空間インデックス
│   ├── version.ts          # バージョン
│   ├── vm/
│   │   ├── vm.ts           # VM実行エンジン（命令デコード・実行）
│   │   ├── opcodes.ts      # オペコード定数（VM・アセンブラ共有）
│   │   ├── assembler.ts    # アセンブラ本体
│   │   ├── compiler.ts     # Mini-Cコンパイラ エントリ
│   │   └── compiler/
│   │       ├── lexer.ts    # 字句解析
│   │       ├── parser.ts   # 構文解析
│   │       ├── ast.ts      # AST型定義
│   │       ├── codegen.ts  # コード生成
│   │       ├── preprocessor.ts # #define展開
│   │       └── builtins.ts # ゲームAPI定義
│   └── tools/
│       ├── compile.ts      # Mini-Cコンパイラ CLI
│       └── assemble.ts     # アセンブラ CLI
├── test/                   # テスト
├── programs/               # キャラクタープログラム（.c / .asm / .json）
├── docs/
│   ├── specs/              # 仕様書
│   │   ├── game_spec.md
│   │   ├── initial_state.md
│   │   └── vm/
│   │       ├── vm_spec.md
│   │       ├── assembler_spec.md
│   │       └── c_compiler_spec.md
│   ├── ui_spec/            # GUI仕様書
│   ├── plan/               # 設計検討資料
│   └── issues/             # 既知の課題
└── ui/                     # GUIアプリケーション（未実装）
```

### ゲームループ（1tick）

1. EnergyNodeエネルギー生産
2. 全activeキャラクターのVM実行 → アクション予約
3. 予約アクション一括実行（キャラクターID昇順）
4. 摩擦力算出
5. 衝突判定・反発力算出
6. 物理更新（力→加速度→速度→位置）
7. 基礎代謝（加齢係数あり）
8. 耐久値減衰
9. 死亡判定 → 残骸生成
10. 残骸吸収
11. ノード再生
12. tick++

### VM

- 16bitノイマン型アーキテクチャ
- 8レジスタ（r0=ゼロ、r1-r6=汎用、r7=スタックポインタ慣例）
- メモリ: MemoryCoreコンポーネント × 1024ワード
- I/O空間: メモリとは分離、IN/OUT命令でアクセス
- プログラムカウンタはtick間で保持（HALTで中断、次tick続行）

### 仕様書

詳細は `docs/specs/` を参照:
- `game_spec.md` — ゲームシステム仕様
- `vm/vm_spec.md` — VM仕様（命令セット、I/O、メモリモデル）
- `vm/assembler_spec.md` — アセンブラ仕様
- `vm/c_compiler_spec.md` — Mini-C言語・コンパイラ仕様
