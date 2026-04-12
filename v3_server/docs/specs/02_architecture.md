# アーキテクチャ

## システム構成図

```
┌─────────────────────────────────────────────────────┐
│  AWS EC2                                            │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  v3_server (Node.js プロセス)                  │  │
│  │                                               │  │
│  │  ┌─────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Simulation  │  │ HTTP Server (Express等)  │ │  │
│  │  │ Manager     │  │                         │ │  │
│  │  │             │  │  REST API               │ │  │
│  │  │ World 1 ──┐ │  │  GET /worlds            │ │  │
│  │  │ World 2 ──┤ │  │  GET /worlds/:id        │ │  │
│  │  │ World N ──┘ │  │  GET /worlds/:id/state  │ │  │
│  │  │             │  │                         │ │  │
│  │  │ Tick Loop   │  │  WebSocket Server       │ │  │
│  │  │ (setInterval│  │  /ws/worlds/:id         │ │  │
│  │  │  per world) │  │                         │ │  │
│  │  └──────┬──────┘  └────────────┬────────────┘ │  │
│  │         │ tick event           │              │  │
│  │         └──────────────────────┘              │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ Persistence Layer                       │  │  │
│  │  │ - チェックポイント (定期保存)             │  │  │
│  │  │ - シャットダウン時保存                    │  │  │
│  │  │ - ファイルシステム (JSON)                 │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  静的ファイル配信 (Webクライアント)             │  │
│  │  または Nginx / S3 + CloudFront               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │
         │ HTTP / WebSocket
         ▼
┌─────────────────────┐
│  ブラウザ            │
│  React + pixi.js    │
│  (読み取り専用)      │
└─────────────────────┘
```

## サーバーアプリケーション構成

### プロセスモデル

単一Node.jsプロセスで稼働する。複数ワールドはメインスレッド内で順次tickを実行する。

理由:
- 同時接続5人以下、ワールド数も少数の想定
- Worker Threadsは状態共有のオーバーヘッドが大きい
- シンプルさを優先する

10 ticks/sec × N ワールドで、1 tickあたりの処理時間が十分短ければ
メインスレッドでHTTPリクエスト処理とtick実行を両立できる。

### モジュール構成

```
v3_server/
├── package.json
├── tsconfig.json
├── docs/specs/              ... 仕様書
│
├── server/                  ... バックエンドサーバー
│   ├── src/
│   │   ├── main.ts          ... エントリポイント（サーバー起動）
│   │   ├── simulation/      ... シミュレーションエンジン
│   │   │   ├── engine.ts    ... v3エンジン（mutable最適化版）
│   │   │   ├── types.ts     ... ゲーム型定義
│   │   │   ├── world.ts     ... ワールド生成・操作
│   │   │   ├── physics.ts   ... 物理演算
│   │   │   ├── actions.ts   ... アクション実行
│   │   │   ├── ...          ... その他v3モジュール
│   │   │   └── index.ts     ... シミュレーション公開API
│   │   │
│   │   ├── world-manager.ts ... 複数ワールドの管理
│   │   ├── tick-scheduler.ts... tick実行スケジューリング
│   │   ├── persistence.ts   ... 状態永続化
│   │   ├── api/             ... REST APIルーティング
│   │   │   ├── router.ts
│   │   │   └── handlers.ts
│   │   ├── ws/              ... WebSocket処理
│   │   │   └── handler.ts
│   │   └── cli.ts           ... CLIコマンド（ワールド作成等）
│   │
│   └── test/                ... サーバーテスト
│
├── client/                  ... Webクライアント
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx          ... ルートコンポーネント
│   │   ├── components/      ... Reactコンポーネント
│   │   │   ├── WorldSelector.tsx
│   │   │   ├── GameCanvas.tsx
│   │   │   ├── StatsPanel.tsx
│   │   │   ├── DetailPanel.tsx
│   │   │   └── EventLog.tsx
│   │   ├── renderer/        ... pixi.js描画
│   │   │   └── WorldRenderer.ts
│   │   ├── api/             ... サーバー通信
│   │   │   ├── rest.ts
│   │   │   └── websocket.ts
│   │   └── types.ts         ... クライアント側型定義
│   │
│   └── public/
│       └── index.html
│
└── shared/                  ... サーバー・クライアント共有型定義
    └── types.ts             ... API型、ワールド状態の転送型
```

### v3コードの利用方針

v3の `src/` をそのまま利用するのではなく、`server/src/simulation/` にコピーして改修する。

改修内容:
1. **immutableパターンのmutable化**: 配列のmap→直接変更、スプレッド→直接代入
2. **updateCharacter()のO(C²)排除**: インデックスベースの直接アクセスに変更
3. **groundGridの全体コピー排除**: セル単位の直接変更に変更
4. **UI依存の除去**: ブラウザ固有コードの排除

ゲームロジック（ルール、レシピ、定数）は変更しない。

## リアルタイム通信設計

### 方式: WebSocket

選択理由:
- 双方向通信（将来の操作機能拡張に備える）
- SSEより広くサポートされている
- 低レイテンシ

### データ配信戦略

1. **接続時**: クライアントがワールドに接続した時点の全状態スナップショットを送信
2. **以後毎tick**: 差分データ（変化したオブジェクトのみ）を送信

差分配信の理由:
- 全状態は130-150KB/tick。10 ticks/sec × 5人 = 6.5-7.5MB/sec は過剰
- 差分であれば通常数KB-数十KB/tick程度に収まる

### 差分データの構成

tick完了時に前回状態と比較し、以下を送信:

```
TickDelta {
  tick: number
  updatedCharacters: Character[]    // 位置・状態が変化したキャラクター
  removedCharacterIds: string[]     // 死亡したキャラクター
  newCharacters: Character[]        // 新規誕生
  updatedResourceNodes: ...         // 残量が変化したノード
  removedResourceNodeIds: ...
  newResourceNodes: ...
  updatedEnergyNodes: ...
  events: Event[]                   // 誕生・死亡イベント
  stats: WorldStats                 // 統計サマリ（毎tick送信、小さいため）
}
```

## 永続化設計

### 保存先: ファイルシステム (JSON)

理由:
- v3既存のsave/load形式と互換性を保てる
- DB不要でインフラがシンプル
- ワールド数が少数のためファイルで十分

### 保存タイミング

1. **定期チェックポイント**: 設定可能な間隔（デフォルト12時間）
2. **サーバーシャットダウン時**: SIGTERMハンドラで全ワールドを保存
3. **CLIからの手動保存**: コマンドで任意タイミングに保存可能

### 保存ディレクトリ構成

```
data/
├── worlds/
│   ├── world-001/
│   │   ├── state.json       ... 最新の状態
│   │   ├── config.json      ... ワールド設定（GameParams等）
│   │   └── checkpoints/     ... チェックポイント履歴
│   │       ├── 20260411_120000.json
│   │       └── 20260411_000000.json
│   └── world-002/
│       └── ...
└── server-config.json       ... サーバー全体設定
```

## CLI設計

サーバープロセスとは別に、管理用CLIコマンドを提供する。
サーバープロセスへの指示はHTTP管理API（localhost限定）経由で行う。

```bash
# ワールド作成
v3-admin world create --name "world-001" --params params.json

# ワールド一覧
v3-admin world list

# ワールド停止（tickを止める。サーバーは動き続ける）
v3-admin world stop world-001

# ワールド再開
v3-admin world start world-001

# 手動保存
v3-admin world save world-001

# ワールド削除
v3-admin world delete world-001

# サーバー停止（全ワールド保存後にシャットダウン）
v3-admin server shutdown
```

管理APIはlocalhost:PORT/admin/* で公開し、EC2外部からはアクセスできない。
