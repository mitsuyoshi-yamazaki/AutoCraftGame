# GUI アーキテクチャ — v3

## 技術スタック

- pixi.js v8（2D描画エンジン — Canvas/WebGL）
- TypeScript（既存コードと統一）
- Vite（バンドル・dev server）
- Storybook（@storybook/html-vite — 描画要素カタログ）

（v2と同一）

## ファイル構成

```
ui/
├── index.html        ... エントリHTML（Canvas + コントロール + パネル）
├── main.ts           ... UIエントリポイント（初期化、タイマー制御、イベントバインド）
├── renderer.ts       ... pixi.js描画ロジック（連続空間上のオブジェクト描画）
├── style.css         ... レイアウト・スタイル
└── stories/          ... Storybookストーリー
    ├── helpers.ts     ... Canvas生成ヘルパー
    ├── ResourceNode.stories.ts
    ├── EnergyNode.stories.ts
    ├── Remains.stories.ts
    ├── Character.stories.ts
    └── WorldOverview.stories.ts
.storybook/
├── main.ts           ... Storybook設定
└── preview.ts        ... Storybookプレビュー設定
```

v2からの変更:
- `GridOverview.stories.ts` → `WorldOverview.stories.ts`（グリッド概念の廃止に伴う名称変更）

## データフロー

```
[既存 src/simulation.ts]          [新規 ui/]
                                   main.ts
                                     │
                                     │ setInterval(tickInterval)
                                     ▼
  executeTick(world) ◄──────────── tick呼び出し
       │                             │
       ▼                             ▼
  TickResult { world, events } ──► state更新
                                     │
                                     ▼
                                   renderer.ts
                                     │
                                     ▼
                                   Canvas描画 + DOM更新
```

（v2と同一のデータフロー）

## 状態管理

UI側で保持する状態:

```typescript
type Selection =
  | { kind: 'character'; id: string }
  | { kind: 'resourceNode'; id: string }
  | { kind: 'energyNode'; id: string }
  | { kind: 'remains'; id: string }
  | null;

interface UIState {
  world: World;
  allEvents: SimulationEvent[];
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalBirths: number;
  totalDeaths: number;
  characterActions: Map<string, Action>;
}
```

v2からの変更:
- Selection型がID参照ベースに統一（v2はPositionベースだった部分があるが、v3では全オブジェクトがIDを持つため）

## 画面レイアウト

```
┌─────────────────────────────────────────────┐
│  [▶/⏸]  tick/s: [◀] 5 [▶]   Tick: 42      │  コントロールバー
├──────────────────────┬──────────────────────┤
│                      │  Stats               │
│                      │   Characters: 3      │
│                      │   Births: 5          │
│   Continuous Space   │   Deaths: 2          │
│   (Canvas)           │   Resources: 18      │
│                      │   Energy: 4500       │
│   ・ ← objects       │   Remains: 1         │
│                      ├──────────────────────┤
│                      │  Selected: char-001  │
│                      │   Pos: (5.3, 3.1)   │
│                      │   Mass: 40           │
│                      │   Dur: 185 / 300     │
│                      │   Energy: 3200       │
│                      │   Action: MOVE 45°   │
│                      │   Inventory: ...     │
├──────────────────────┴──────────────────────┤
│  Event Log                                  │
│  [tick 42] char-001 (Replicator) → char-002 │
│  [tick 38] char-003 (Explorer) died         │
└─────────────────────────────────────────────┘
```

v2からの変更:
- 「20×20 Grid (Canvas)」→「Continuous Space (Canvas)」
- SelectedパネルにVel（速度）とMass（質量）を追加
- Posの表示が小数点付き

## 座標系とカメラ

### ワールド座標 → スクリーン座標

v2ではセル単位の描画（cellSize × gridX）だったが、v3ではワールド座標系をズーム・パン付きでスクリーン座標にマッピングする。

```
screenX = worldX × zoom × baseScale + offsetX
screenY = worldY × zoom × baseScale + offsetY
```

- `baseScale`: ズーム1.0でワールド全体が画面に収まるスケール = `min(canvasWidth, canvasHeight) / max(world.width, world.height)`
- `zoom`: ユーザ操作によるズーム倍率（初期値 1.0）
- `offsetX/Y`: パン操作によるオフセット（初期値はワールド中央がCanvas中央に来る値）

### ズーム操作

- マウスホイールでズームイン・アウト
- ズーム中心はマウスカーソル位置（カーソル直下のワールド座標が固定されるようoffsetを調整）
- ズーム範囲: ワールド全体表示 〜 十分な拡大率まで

### パン操作

- マウスドラッグ（左ボタン押下+移動）でoffsetX/Yを変更
- オブジェクトクリック（選択）とドラッグ（パン）を区別する（一定距離以上動いた場合のみパンとする）

### LOD（Level of Detail）

ズームアウト時、各オブジェクトの画面上の描画サイズ（`radius × zoom × baseScale`）が閾値以下になった場合、詳細描画から簡略描画に切り替える。

- **簡略描画（LODモード）**:
  - ResourceNode: 単色の円（OreNode=金茶色、CrystalNode=水色）
  - EnergyNode: 単色の円（金色）
  - Remains: 単色の円（灰色）
  - Character: 黒円の中にdurability比率に応じたサイズの赤円。非アクティブは灰色
- **通常描画**: 既存のv2踏襲の詳細形状（角丸矩形、ダイヤモンド形、コンポーネントリング等）

### ヒットテスト

クリック位置のスクリーン座標をワールド座標に逆変換し、各オブジェクトとの距離を計算する。オブジェクトの半径内にクリック位置があれば選択対象とする。複数のオブジェクトが重なる場合は、最も手前（キャラクター優先）のものを選択する。

## オブジェクト描画仕様

### 形状

描画サイズはオブジェクト種別ごとの衝突半径に基づく。形状はv2の描画をサイズ変更して踏襲する。

| オブジェクト | 形状 | スクリーンサイズ基準 | 備考 |
|-------------|------|---------------------|------|
| Character | 円（v2踏襲） | CHARACTER_RADIUS × スケール | コンポーネントリング等のv2詳細描画を踏襲 |
| ResourceNode | 角丸矩形（v2踏襲） | RESOURCE_NODE_RADIUS × スケール | |
| EnergyNode | ダイヤモンド形（v2踏襲） | ENERGY_NODE_RADIUS × スケール | |
| Remains | 破断円弧（v2踏襲） | REMAINS_RADIUS × スケール | |

### 色

| 要素 | 色 | 備考 |
|------|-----|------|
| 背景 | `#1a2a1a` | 暗い緑（v2と同一） |
| OreNode | `#e8b84b` | 金茶色、remaining比率で透明度変化 |
| CrystalNode | `#67d4e2` | 水色、remaining比率で透明度変化 |
| EnergyNode | `#ffd700` | 金色、stored比率で透明度変化 |
| Remains | `#555555` | 灰色 |
| 壁（境界） | `#333333` | ワールド境界線 |

キャラクターの色はv2の実装を踏襲する（コンポーネントリング、エネルギーリング、核など）。

ズームアウト時はLODにより簡略描画に切り替わる（上記「LOD」セクション参照）。

キャラクターの速度・加速度ベクトルの描画は行わない。

## コマンド

```bash
npm run ui          # Vite dev server起動
npm run storybook   # Storybook起動（port 6006）
```
