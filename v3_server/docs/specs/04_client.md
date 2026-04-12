# クライアント仕様

## 技術スタック

- React (DOM構造)
- pixi.js (Canvas描画)
- TypeScript
- Vite (ビルド)

## 画面構成

```
┌─ ヘッダーバー ──────────────────────────────────────────────────────┐
│ v3_server   [World: ▼ World-001 ]   Tick: 142,500   10 ticks/sec  │
├─ メインエリア ──────────────────────────┬─ サイドパネル ─────────────┤
│                                        │                           │
│  Canvas (pixi.js)                      │ ┌─ 統計 ───────────────┐  │
│                                        │ │ Characters: 35       │  │
│  ワールド描画                           │ │ Births: 420          │  │
│  + リソースノード                       │ │ Deaths: 385          │  │
│  + エネルギーノード                     │ │ Resources: 95        │  │
│  + キャラクター                         │ │ Energy: 65           │  │
│  + 残骸                                │ │ Remains: 12          │  │
│                                        │ │ Species:             │  │
│  Zoom: マウスホイール                   │ │   Replicator: 20     │  │
│  Pan: ドラッグ                         │ │   Scavenger: 15      │  │
│                                        │ └──────────────────────┘  │
│                                        │                           │
│                                        │ ┌─ 選択オブジェクト ───┐  │
│                                        │ │ Character char-001   │  │
│                                        │ │ Species: Replicator  │  │
│                                        │ │ Pos: (12.3, 8.4)    │  │
│                                        │ │ Dur: 248/300         │  │
│                                        │ │ Energy: 3150        │  │
│                                        │ │ Action: MOVE         │  │
│                                        │ │ Components: [...]    │  │
│                                        │ │ Inventory: {Ore: 3}  │  │
│                                        │ └──────────────────────┘  │
├─ イベントログ ──────────────────────────┴───────────────────────────┤
│ [142501] char-042 (Scavenger) died                                 │
│ [142501] *** Scavenger is now EXTINCT ***                          │
│ [142498] char-001 spawned char-043 (Replicator)                    │
└────────────────────────────────────────────────────────────────────┘
```

## コンポーネント構成

### App

ルートコンポーネント。以下を管理する:
- 現在選択中のワールドID
- WebSocket接続の確立・切断
- ワールド状態（WebSocketから受信した最新状態）

### WorldSelector

ヘッダーバー内のワールド選択ドロップダウン。
- REST API (`GET /api/worlds`) からワールド一覧を取得
- ワールド選択時にAppへ通知

### GameCanvas

pixi.jsのCanvasを保持するコンポーネント。
- pixi.js Applicationの初期化・破棄のライフサイクル管理
- WorldRendererにワールド状態を渡して描画
- マウスイベント（Zoom/Pan/クリック選択）をハンドル
- 選択状態はReact stateで管理し、DetailPanelと共有

### WorldRenderer

pixi.jsによる描画ロジック（非Reactクラス）。v3のrenderer.tsを参考に実装。

描画対象:
- 背景（ワールド境界）
- 壁（ワールド外周の矩形枠）
- リソースノード（OreNode: 茶色系、CrystalNode: 青色系の矩形）
- エネルギーノード（黄色系のダイヤモンド形）
- 残骸（灰色の弧）
- キャラクター（コンポーネント種別に応じた色のリング）
- 選択オブジェクトのハイライト（黄色リング）

LOD (Level of Detail):
- ズームアウト時（baseScale < 閾値）は簡略描画（ドット表示）

座標変換:
- ワールド座標 → スクリーン座標: `screen = world * baseScale * zoom + offset`
- スクリーン座標 → ワールド座標: 逆変換（クリック選択に使用）

### StatsPanel

統計情報をDOMで表示。WebSocketのtickメッセージに含まれるstatsを表示する。

表示項目:
- キャラクター数
- 累計出生数 / 死亡数
- リソースノード数
- エネルギーノード数
- 残骸数
- 種族別キャラクター数

### DetailPanel

選択オブジェクトの詳細をDOMで表示。

キャラクター選択時:
- ID, 種族名
- 位置, 速度
- 耐久値 (現在/最大)
- エネルギー
- 現在のアクション
- コンポーネント一覧
- インベントリ
- 年齢 (tick数)

リソースノード選択時:
- ID, 種類 (Ore/Crystal)
- 位置
- 残量

エネルギーノード選択時:
- ID
- 位置
- 生産率, 蓄電量/最大

残骸選択時:
- ID
- 位置
- コンポーネント一覧
- インベントリ
- 経過tick数

### EventLog

イベントログをDOMで表示。新しいイベントが上に追加される。

イベント種別:
- キャラクター誕生（緑色）
- キャラクター死亡（赤色）
- 種族絶滅（オレンジ太字）

表示上限: 最新100件程度。古いイベントは自動的に破棄。

## クライアント側の状態管理

### ワールド状態

WebSocketから受信したスナップショット + 差分の適用で保持する。

```typescript
type ClientWorldState = {
  tick: number
  width: number
  height: number
  characters: Map<string, Character>
  resourceNodes: Map<string, ResourceNode>
  energyNodes: Map<string, EnergyNode>
  remains: Map<string, Remains>
  groundGrid: GroundCell[]
  stats: WorldStats
}
```

- 配列ではなくMapで保持する（ID引きの高速化、差分適用の効率化）
- スナップショット受信時にMapへ変換
- 差分受信時はMap上で直接更新

### 閲覧状態（ユーザーごと）

```typescript
type ViewState = {
  zoom: number
  offset: { x: number, y: number }
  selectedObjectId: string | null
  selectedObjectType: 'character' | 'resourceNode' | 'energyNode' | 'remains' | null
}
```

完全にクライアントローカル。サーバーには送信しない。

## ユーザー操作

### Zoom

- マウスホイールで拡大/縮小
- ズーム中心はマウスカーソル位置
- 倍率制限あり（0.1x〜20x）

### Pan

- マウスドラッグで移動
- ドラッグ判定閾値: 4px（クリックと区別）

### オブジェクト選択

- キャンバスクリックで最も近いオブジェクトを選択
- 優先順位: キャラクター > ノード > 残骸
- 同じオブジェクトを再クリックで選択解除
- 選択中のオブジェクトが死亡/消滅した場合は自動的に選択解除

### ワールド切り替え

- ヘッダーのドロップダウンから別ワールドを選択
- 切り替え時: 既存WebSocket切断 → 新ワールドへ接続 → スナップショット受信 → 描画
