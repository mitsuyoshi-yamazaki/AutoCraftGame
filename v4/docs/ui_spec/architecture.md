# GUI アーキテクチャ — v4

v3からの変更箇所のみ記載。記載のない項目はv3仕様（v3/docs/ui_spec/architecture.md）に従う。

## 技術スタック

v3と同じ（pixi.js v8, TypeScript, Vite）。

## ファイル構成

v3と同じ。

## データフロー

v3と同じ構造。ただし:

- executeTick の内部で VM実行 → アクション予約 → 一括実行 の流れに変わる
- TickResult に characterActions（Map<string, Action[]>）を含む（複数アクション対応）

## 状態管理

### UIState の変更

```typescript
interface UIState {
  world: World;
  running: boolean;
  ticksPerSecond: number;
  selection: Selection;
  totalBirths: number;
  totalDeaths: number;
  characterActions: ReadonlyMap<string, Action[]>;  // 変更: Action → Action[]
  sessionStartedAt: string;
  resumedAt: string | null;
  recentSavedEvents: SavedEvent[];
}
```

characterActions は各キャラクターが予約した全アクションのリスト（v3は1つのみ）。

### Selection

v3と同じ。

### 自動選択解除

v3と同じ。

## 画面レイアウト

v3と同じ。

## カメラ/座標系

v3と同じ。

## 描画仕様

v3と同じ。

## ヒットテスト

v3と同じ。
