# API仕様

## REST API

ベースURL: `http://<host>:<port>/api`

### ワールド一覧

```
GET /api/worlds
```

レスポンス:
```json
{
  "worlds": [
    {
      "id": "world-001",
      "name": "World 001",
      "status": "running",
      "tick": 142500,
      "characterCount": 35,
      "createdAt": "2026-04-11T00:00:00Z"
    }
  ]
}
```

### ワールド詳細

```
GET /api/worlds/:worldId
```

レスポンス:
```json
{
  "id": "world-001",
  "name": "World 001",
  "status": "running",
  "tick": 142500,
  "width": 60,
  "height": 60,
  "ticksPerSecond": 10,
  "params": { ... },
  "stats": {
    "characterCount": 35,
    "totalBirths": 420,
    "totalDeaths": 385,
    "resourceNodeCount": 95,
    "energyNodeCount": 65,
    "remainsCount": 12,
    "speciesCounts": { "Replicator": 20, "Scavenger": 15 }
  }
}
```

### ワールド全状態スナップショット

```
GET /api/worlds/:worldId/state
```

WebSocket接続前の初期状態取得、またはデバッグ用。
v3のWorld型をJSON化したものを返す。

レスポンス:
```json
{
  "tick": 142500,
  "width": 60,
  "height": 60,
  "characters": [ ... ],
  "resourceNodes": [ ... ],
  "energyNodes": [ ... ],
  "remains": [ ... ],
  "groundGrid": [ ... ]
}
```

サイズが大きいため（130-150KB）、通常のクライアントフローではWebSocket接続時の
初期スナップショットを使う。このエンドポイントはフォールバック・デバッグ用。

### オブジェクト詳細

```
GET /api/worlds/:worldId/characters/:characterId
GET /api/worlds/:worldId/resource-nodes/:nodeId
GET /api/worlds/:worldId/energy-nodes/:nodeId
GET /api/worlds/:worldId/remains/:remainsId
```

個別オブジェクトの詳細情報を返す。
クライアントのオブジェクト選択時、WebSocketで受信済みの情報で不足する場合に使用する。

---

## 管理API（localhost限定）

ベースURL: `http://localhost:<admin-port>/admin`

CLIツール (`v3-admin`) がこのAPIを呼び出す。外部公開しない。

### ワールド作成

```
POST /admin/worlds
Content-Type: application/json

{
  "name": "world-001",
  "params": { ... },
  "seed": 12345
}
```

### ワールド停止/再開

```
POST /admin/worlds/:worldId/stop
POST /admin/worlds/:worldId/start
```

### ワールド保存

```
POST /admin/worlds/:worldId/save
```

### ワールド削除

```
DELETE /admin/worlds/:worldId
```

### サーバーシャットダウン

```
POST /admin/shutdown
```

全ワールドを保存した後、プロセスを終了する。

---

## WebSocket API

### 接続

```
ws://<host>:<port>/ws/worlds/:worldId
```

クライアントが特定のワールドに接続する。

### サーバー→クライアント メッセージ

#### 初期スナップショット

接続直後に1回送信。クライアントはこれをもとにワールド全体を描画する。

```json
{
  "type": "snapshot",
  "data": {
    "tick": 142500,
    "width": 60,
    "height": 60,
    "characters": [ ... ],
    "resourceNodes": [ ... ],
    "energyNodes": [ ... ],
    "remains": [ ... ],
    "groundGrid": [ ... ],
    "stats": { ... }
  }
}
```

#### Tick差分

毎tick送信。クライアントはローカル状態にこの差分を適用する。

```json
{
  "type": "tick",
  "data": {
    "tick": 142501,
    "characters": {
      "updated": [
        {
          "id": "char-001",
          "position": { "x": 12.5, "y": 8.3 },
          "velocity": { "vx": 0.5, "vy": -0.2 },
          "durability": 248,
          "energy": 3150,
          "inventory": { "Ore": 3, "Metal": 1 },
          "action": "MOVE"
        }
      ],
      "added": [],
      "removed": ["char-042"]
    },
    "resourceNodes": {
      "updated": [
        { "id": "res-015", "remaining": 42 }
      ],
      "added": [],
      "removed": []
    },
    "energyNodes": {
      "updated": [
        { "id": "eng-003", "stored": 890 }
      ],
      "added": [],
      "removed": []
    },
    "remains": {
      "added": [
        {
          "id": "rem-010",
          "position": { "x": 30.1, "y": 22.4 },
          "components": ["Frame", "Actuator", "Sensor"],
          "inventory": { "Ore": 2 },
          "createdAt": 142500
        }
      ],
      "removed": ["rem-005"]
    },
    "events": [
      { "type": "character_died", "characterId": "char-042", "species": "Scavenger", "tick": 142501 },
      { "type": "species_extinct", "species": "Scavenger", "tick": 142501 }
    ],
    "stats": {
      "characterCount": 34,
      "totalBirths": 420,
      "totalDeaths": 386,
      "resourceNodeCount": 95,
      "energyNodeCount": 65,
      "remainsCount": 12,
      "speciesCounts": { "Replicator": 20, "Scavenger": 0 }
    }
  }
}
```

#### 差分データの設計方針

- **characters.updated**: 位置・状態が前tickから変化したキャラクターのみ。
  全フィールドではなく、変化したフィールドのみを含む（部分更新）。
  ただしposition/velocityは毎tick変化するため、事実上ほぼ全キャラクターが含まれる。
- **stats**: サイズが小さいため毎tick全送信する。
- **groundGrid**: 変化頻度が低いため、変化したセルのみを送信する。
  ```json
  "groundGrid": {
    "updated": [
      { "x": 15, "y": 22, "ore": 5, "crystal": 0 }
    ]
  }
  ```

#### ワールド停止通知

```json
{
  "type": "world_stopped",
  "data": {
    "reason": "admin_command"
  }
}
```

### クライアント→サーバー メッセージ

初期バージョンでは、クライアントからサーバーへのメッセージは送信しない。
WebSocket接続の確立自体がワールドの購読を意味する。

将来バージョンで操作機能を追加する際にメッセージ型を定義する。
