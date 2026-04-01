# GUI アーキテクチャ

## 技術スタック

- HTML5 Canvas（2D描画）
- TypeScript（既存コードと統一）
- Vite（バンドル・dev server）
- 追加ライブラリなし

## ファイル構成

```
ui/
├── index.html        ... エントリHTML（Canvas + コントロール + パネル）
├── main.ts           ... UIエントリポイント（初期化、タイマー制御、イベントバインド）
├── renderer.ts       ... Canvas描画ロジック（グリッド、資源、キャラクター）
└── style.css         ... レイアウト・スタイル
```

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

## 状態管理

UI側で保持する状態:

```typescript
interface UIState {
  world: World;                      // 現在のワールド状態
  allEvents: SimulationEvent[];      // 累計イベント
  running: boolean;                  // 実行中フラグ
  ticksPerSecond: number;            // 速度設定
  selectedCharacterId: string | null; // 選択中キャラクター
  stats: {
    totalBirths: number;
    totalDeaths: number;
  };
}
```

## 画面レイアウト

```
┌─────────────────────────────────────────────┐
│  [▶/⏸]  tick/s: [◀] 5 [▶]   Tick: 42      │  コントロールバー
├──────────────────────┬──────────────────────┤
│                      │  Stats               │
│                      │   Characters: 3      │
│   20×20 Grid         │   Births: 5          │
│   (Canvas)           │   Deaths: 2          │
│                      ├──────────────────────┤
│                      │  Selected: char-001  │
│                      │   Pos: (5, 3)        │
│                      │   Dur: 85 / 100      │
│                      │   Action: HARVEST    │
│                      │   Inventory: ...     │
├──────────────────────┴──────────────────────┤
│  Event Log                                  │
│  [tick 42] char-001 spawned char-002        │
│  [tick 38] char-003 died                    │
└─────────────────────────────────────────────┘
```

## セル描画仕様

| 要素 | 色 | 備考 |
|------|-----|------|
| 空セル | `#1a2a1a` | 暗い緑 |
| OreNode | `#8B4513` | 茶色 |
| OreNode（枯渇） | `#8B4513` 50%透明 | |
| CrystalNode | `#6A0DAD` | 紫 |
| CrystalNode（枯渇） | `#6A0DAD` 50%透明 | |
| アクティブキャラクター | `#2196F3` | 青 |
| 非アクティブキャラクター | `#9E9E9E` | 灰 |
| グリッド線 | `#333333` | |

## コマンド

```bash
npm run ui    # Vite dev server起動
```
