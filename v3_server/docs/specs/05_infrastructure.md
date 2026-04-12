# インフラ・デプロイ仕様

## 実行環境

- AWS EC2 インスタンス
- Node.js ランタイムで直接実行（Dockerなし）
- 推奨インスタンス: t3.small〜t3.medium（ワールド数に応じて調整）

## ポート構成

| ポート | 用途 | 公開範囲 |
|--------|------|----------|
| 3000 | HTTP (REST API + WebSocket + 静的ファイル) | 外部公開 |
| 3001 | 管理API | localhost限定 |

単一Node.jsプロセスがポート3000でHTTPサーバーとWebSocketサーバーを兼ねる。
クライアントの静的ファイル（ビルド済みReactアプリ）も同じサーバーから配信する。

管理APIはポート3001で別途リッスンし、localhostからのみアクセス可能。

## EC2セキュリティグループ

| プロトコル | ポート | ソース | 用途 |
|------------|--------|--------|------|
| TCP | 22 | 管理者IP | SSH |
| TCP | 3000 | 0.0.0.0/0 | Web |
| TCP | 3001 | 127.0.0.1 | 管理API（ローカルのみ） |

## デプロイ手順

### 初回セットアップ

```bash
# EC2インスタンスにSSH接続
ssh ec2-user@<instance-ip>

# Node.js インストール (nvm経由)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# アプリケーション配置
git clone <repo-url> /opt/v3_server
cd /opt/v3_server
npm install
npm run build          # サーバー + クライアント両方ビルド

# データディレクトリ作成
mkdir -p /opt/v3_server/data/worlds

# systemdサービス登録
sudo cp deploy/v3-server.service /etc/systemd/system/
sudo systemctl enable v3-server
sudo systemctl start v3-server
```

### 更新デプロイ

```bash
cd /opt/v3_server
git pull
npm install
npm run build

# サーバー再起動（シャットダウン時に全ワールド自動保存）
sudo systemctl restart v3-server
```

## プロセス管理

### systemdサービス定義

```ini
[Unit]
Description=v3_server - Artificial Life Simulation Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/v3_server
ExecStart=/home/ec2-user/.nvm/versions/node/v20/bin/node server/dist/main.js
Restart=on-failure
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=30

Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ADMIN_PORT=3001
Environment=DATA_DIR=/opt/v3_server/data

[Install]
WantedBy=multi-user.target
```

- `KillSignal=SIGTERM`: サーバーがSIGTERMを受けて全ワールド保存後に終了
- `TimeoutStopSec=30`: 保存完了を待つ猶予（30秒）
- `Restart=on-failure`: 異常終了時のみ自動再起動

### ログ

```bash
# サーバーログ確認
journalctl -u v3-server -f

# エラーログのみ
journalctl -u v3-server -p err
```

## CLIツールの利用

EC2上でSSH接続後、CLIツールを使ってワールドを管理する。

```bash
# パスを通す（.bashrcに追加）
export PATH="/opt/v3_server/node_modules/.bin:$PATH"

# または npx経由
cd /opt/v3_server
npx v3-admin world create --name "world-001" --seed 42
npx v3-admin world list
npx v3-admin world save world-001
```

## ドメイン・HTTPS

初期バージョンではHTTP (ポート3000) で直接アクセスする。
HTTPS対応が必要な場合は、以下のいずれかで対応:
- EC2前段にALB (Application Load Balancer) を配置
- Let's Encrypt + nginx をリバースプロキシとして配置

初期スコープ外とする。

## 監視

初期バージョンでは最小限:
- systemdによるプロセス死活監視・自動再起動
- サーバーログ (stdout/stderr → journald)

CloudWatch等の本格的な監視は必要に応じて追加。
