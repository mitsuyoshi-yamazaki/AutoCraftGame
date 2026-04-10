# GUI アーキテクチャ — v5

## 技術スタック

- pixi.js v8（2D描画エンジン — Canvas/WebGL）
- TypeScript（既存コードと統一）
- Vite（バンドル・dev server）

## ファイル構成

```
ui/
├── index.html        ... エントリHTML（Canvas + コントロール + パネル）
├── main.ts           ... UIエントリポイント（初期化、状態管理、タイマー制御、イベントバインド、DOM更新）
├── renderer.ts       ... pixi.js描画ロジック（連続空間上のオブジェクト描画、ヒットテスト、ズーム・パン）
└── style.css         ... レイアウト・スタイル
```

## データフロー

```
[既存 src/]               [UI ui/]
                           main.ts (UIState管理)
                             │
                             │ setInterval(tickInterval) or step()
                             ▼
  executeTick(world) ◄──── tick呼び出し
       │                     │
       ▼                     ▼
  TickResult               state更新
  { world, events,           │
    actions }                ▼
                           renderer.draw(world, selection)  ... Canvas描画
                           updateStats()                    ... DOM統計更新
                           updateSelected()                 ... DOM選択パネル更新
                           appendEvents(...)                ... DOMイベントログ追加
```

executeTick の内部では VM実行 → アクション予約 → 一括実行 の流れで処理される。
TickResult に characterActions（Map<string, Action[]>）を含む（複数アクション対応）。

## 状態管理

UI側で保持する状態:

```typescript
type Selection =
  | { kind: 'character'; id: string }
  | { kind: 'resourceNode'; id: string }
  | { kind: 'energyNode'; id: string }
  | { kind: 'remains'; id: string }
  | { kind: 'ground'; cellX: number; cellY: number }
  | null;

interface UIState {
  world: World;
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalBirths: number;
  totalDeaths: number;
  characterActions: ReadonlyMap<string, Action[]>;  // 複数アクション対応
  sessionStartedAt: string;
  resumedAt: string | null;
  recentSavedEvents: SavedEvent[];
}
```

### 状態更新の契機

| 契機 | 更新内容 |
|------|---------|
| tick（タイマー or ステップ） | world, totalBirths, totalDeaths, characterActions, recentSavedEvents |
| オブジェクト/地面クリック | selection |
| Play/Pause | running |
| Speed変更 | ticksPerSecond |
| Reset | 全状態（新規world） |
| Load | 全状態（復元world） |

### 選択の自動解除

tick更新後、以下の条件で選択を自動解除する:
- `selection.kind === 'character'` かつ対象IDが `world.characters` に存在しない
- `selection.kind === 'remains'` かつ対象IDが `world.remains` に存在しない

ResourceNode / EnergyNode / Ground は消滅しない前提で自動解除しない。

## 画面レイアウト

```
┌──────────────────────────────────────────────────────────┐
│ [Reset][Fit][Save][Load] [▶/⏸][Step] tick/s:[◀]5[▶]     │
│                                         Tick: 42  v4.x  │  ControlBar
├───────────────────────────────┬──────────────────────────┤
│                               │  Stats                   │
│                               │   Characters: 3          │
│                               │   Births: 5              │
│                               │   Deaths: 2              │
│   Continuous Space            │   Resources: 18          │
│   (Canvas — pixi.js)          │   Energy: 4500           │
│                               │   Remains: 1             │
│   ・ ← objects                │   Replicator: 5          │  StatsPanel
│                               │                          │
│                               ├──────────────────────────┤
│                               │  Selected: char-001      │
│                               │   Species: Replicator    │
│                               │   Pos: (5.3, 3.1)       │
│                               │   Mass: 40               │
│                               │   Dur: 185 / 300         │
│                               │   Energy: 3200           │
│                               │   Actions: MOVE, HARVEST │
│                               │   Components: ...        │  SelectedPanel
│                               │   Inventory: ...         │
│                               ├──────────────────────────┤
│                               │  VM State                │
│                               │   PC: 42                 │
│                               │   Registers: [0,1,...]   │
│                               │   Memory: 1024 words     │
│                               │   VM Active: true        │
│                               │   Actions: MOVE, HARVEST │
│                               │   Failed: CRAFT(MISSING_ │  VMPanel
│                               │           ITEMS)         │
├───────────────────────────────┴──────────────────────────┤
│  Event Log                                               │
│  [tick 42] char-001 spawned char-002 (Replicator)        │
│  [tick 38] char-003 (Explorer) died                      │  EventLog
│  [tick 38] *** Explorer is now EXTINCT ***               │
└──────────────────────────────────────────────────────────┘
```

## 座標系とカメラ

### ワールド座標 → スクリーン座標

```
screenX = worldX × baseScale × zoom + offsetX
screenY = worldY × baseScale × zoom + offsetY
```

- `baseScale`: ズーム1.0でワールド全体が画面に収まるスケール
- `zoom`: ユーザ操作によるズーム倍率（初期値 1.0）
- `offsetX/Y`: パン操作によるオフセット

### ズーム操作

- マウスホイールでズームイン・アウト
- ズーム中心はマウスカーソル位置（カーソル直下のワールド座標が固定されるようoffsetを調整）
- ズーム下限: ワールド全体が画面に収まるレベル
- ズーム上限: MAX_ZOOM（20倍）

### パン操作

- マウスドラッグ（左ボタン押下+移動）でoffsetX/Yを変更
- ドラッグ閾値（DRAG_THRESHOLD = 4px）以上の移動でパンと判定。閾値未満はクリック（選択）として処理
- オフセットはワールド境界内にクランプ

### LOD（Level of Detail）

ズームアウト時、各オブジェクトの画面上の描画サイズ（`radius × effectiveScale`）がLOD_THRESHOLD_PX（8px）以下になった場合、詳細描画から簡略描画に切り替える。

## オブジェクト描画仕様

### 形状

| オブジェクト | 通常描画 | LOD描画 | スクリーンサイズ基準 |
|-------------|---------|---------|---------------------|
| Character | 円（コンポーネントリング + エネルギーリング + 核） | 黒円 + 赤円（durability比率） | CHARACTER_RADIUS × scale |
| ResourceNode | 角丸矩形 | 小さな角丸矩形 | RESOURCE_NODE_RADIUS × scale |
| EnergyNode | ダイヤモンド形 | 小さなダイヤモンド形 | ENERGY_NODE_RADIUS × scale |
| Remains | 破断円弧 + 中央の充填円 | 小さな円 | REMAINS_RADIUS × scale |
| Wall | 矩形枠線 | — | ワールド全体 |

### 選択表示

| オブジェクト | 選択表示 |
|-------------|---------|
| Character | 黄色い円形リング（半径 = outerR + 2px）+ SENSE_RANGE円（灰色） |
| ResourceNode | 黄色い円形リング（半径 = objectR + 2px） |
| EnergyNode | 黄色い円形リング（半径 = objectR + 2px） |
| Remains | 黄色い円形リング（半径 = objectR + 2px） |
| Ground | 黄色い矩形枠（1×1セル範囲） |

### 色

| 要素 | 色 | 備考 |
|------|-----|------|
| 背景 | `#1a2a1a` | 暗い緑 |
| OreNode | `#8899aa` | 灰青色、remaining比率で透明度変化 |
| CrystalNode | `#99cc88` | 薄緑色、remaining比率で透明度変化 |
| EnergyNode | `#ffd700` | 金色、stored比率で透明度変化 |
| Remains | `#555555` | 灰色 |
| 壁（境界） | `#333333` | ワールド境界線 |
| 選択枠 | `#ffd700` | 金色 |

キャラクターの色はコンポーネント種別ごとに定義される（renderer.ts COMPONENT_COLORS参照）。

### ヒットテスト

クリック位置のスクリーン座標をワールド座標に逆変換し、各オブジェクトとの距離を計算する。判定順序（優先度順）:

1. Character（最寄り、半径 × 1.5 以内）
2. ResourceNode（半径 × 1.5 以内）
3. EnergyNode（半径 × 1.5 以内）
4. Remains（半径 × 1.5 以内）
5. Ground（ワールド範囲内 → 該当セルのGroundGridを選択）
6. null（ワールド範囲外）

## コマンド

```bash
npm run ui          # Vite dev server起動
```
