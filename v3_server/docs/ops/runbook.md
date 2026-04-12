# v3-server 運用手順書

## 1. 初回セットアップ

### 1.1 EC2インスタンスの作成

AWSコンソールまたはCLIでインスタンスを作成する。

```bash
# AMI: Amazon Linux 2023
# インスタンスタイプ: t3.small（推奨）
# ストレージ: gp3 20GB以上
# キーペア: 既存または新規作成
```

### 1.2 セキュリティグループの設定

以下のインバウンドルールを設定する。

| ポート | プロトコル | ソース | 用途 |
|--------|-----------|--------|------|
| 22 | TCP | 0.0.0.0/0 | SSH |
| 3000 | TCP | 0.0.0.0/0 | HTTP + WebSocket |

Admin API（ポート3001）は localhost のみで待ち受けるため、セキュリティグループでの開放は不要。

### 1.3 SSHログイン

```bash
ssh -i ~/.ssh/your-key.pem ec2-user@<パブリックIP>
```

### 1.4 Node.js 20 のインストール

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node -v  # v20.x.x であることを確認
```

### 1.5 リポジトリのクローンとビルド

```bash
sudo mkdir -p /opt/v3_server
sudo chown ec2-user:ec2-user /opt/v3_server
git clone <リポジトリURL> /opt/v3_server
cd /opt/v3_server
npm install
cd client && npm install && cd ..
npm run build
```

### 1.6 データディレクトリの作成

```bash
mkdir -p /opt/v3_server/data/worlds
```

### 1.7 systemd サービスの登録

```bash
sudo cp /opt/v3_server/deploy/v3-server.service /etc/systemd/system/v3-server.service
```

Node.jsの実際のパスを確認し、サービスファイルの `ExecStart` を合わせる。

```bash
which node
# 出力例: /home/ec2-user/.nvm/versions/node/v20.18.0/bin/node
# パスが異なる場合はサービスファイルを編集する
sudo vi /etc/systemd/system/v3-server.service
```

サービスを有効化して起動する。

```bash
sudo systemctl daemon-reload
sudo systemctl enable v3-server
sudo systemctl start v3-server
```

### 1.8 起動確認

```bash
# サービスの状態を確認
sudo systemctl status v3-server

# APIが応答することを確認
curl http://localhost:3000/api/worlds
```

正常であれば JSON レスポンスが返る。

### 1.9 最初のワールドの作成

```bash
cd /opt/v3_server
npx tsx server/src/cli.ts world create --name "world-01"
```

---

## 2. バージョンアップデプロイ

### 2.1 SSHログイン

```bash
ssh -i ~/.ssh/your-key.pem ec2-user@<パブリックIP>
```

### 2.2 サービスの停止

`systemctl stop` は SIGTERM を送信し、全ワールドのデータを保存してからプロセスが終了する。

```bash
sudo systemctl stop v3-server
```

停止を確認する。

```bash
sudo systemctl status v3-server
# Active: inactive (dead) であること
```

### 2.3 コードの更新とビルド

```bash
cd /opt/v3_server
git pull origin main
npm install
cd client && npm install && cd ..
npm run build
```

### 2.4 サービスの起動

```bash
sudo systemctl start v3-server
```

### 2.5 起動確認

```bash
# サービスの状態を確認
sudo systemctl status v3-server

# 全ワールドが復帰しているか確認
curl http://localhost:3000/api/worlds
```

レスポンスに含まれるワールド一覧が停止前と一致していることを確認する。

---

## 3. サービス停止・メンテナンス

### 3.1 グレースフルシャットダウン

通常のサービス停止。SIGTERM により全ワールドが自動保存される。

```bash
sudo systemctl stop v3-server
```

`TimeoutStopSec=30` が設定されているため、30秒以内に終了しない場合は SIGKILL が送られる。

### 3.2 停止前の手動保存

安全のため、停止前に全ワールドを手動保存することを推奨する。

```bash
cd /opt/v3_server
npx tsx server/src/cli.ts world save --all
```

保存完了を確認してからサービスを停止する。

```bash
sudo systemctl stop v3-server
```

### 3.3 緊急停止

プロセスが応答しない場合の手順。

```bash
# まずグレースフルシャットダウンを試みる
sudo systemctl stop v3-server

# 30秒待っても停止しない場合は強制終了
sudo systemctl kill -s SIGKILL v3-server
```

強制終了した場合、最後の自動保存以降のデータが失われる可能性がある。

### 3.4 ログの確認

```bash
# リアルタイムでログを確認
sudo journalctl -u v3-server -f

# 直近100行のログを確認
sudo journalctl -u v3-server -n 100

# 特定の時間帯のログを確認
sudo journalctl -u v3-server --since "2026-04-11 10:00:00" --until "2026-04-11 12:00:00"

# エラーのみ表示
sudo journalctl -u v3-server -p err
```

### 3.5 再起動後のデータ整合性確認

```bash
# サービスを起動
sudo systemctl start v3-server

# ワールド一覧を取得
curl http://localhost:3000/api/worlds

# 各ワールドのステータスを確認
curl http://localhost:3000/api/worlds/<world-id>
```

データディレクトリの中身を直接確認する場合:

```bash
ls -la /opt/v3_server/data/worlds/
```

各ワールドの `.json` ファイルが存在し、ファイルサイズが 0 でないことを確認する。
