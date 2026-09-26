# AutoCraftGame

> **English readers:** start at [v9/README.md](v9/README.md). It lists each claim made about v9,
> where it is shown in the code and experiment records, and how to reproduce the runs.
> Most other documents here are in Japanese. License: [MIT](LICENSE); third-party color data is credited in [NOTICE](NOTICE).

自己複製可能な自律キャラクターによる人工生命シミュレータを目指すプロジェクト。

最終目標は、進化手法をゲームシステムとして提供せず、個々のキャラクター（人工生命）の自律的な活動の結果として進化が創発するシミュレータの実現。段階的にバージョンを重ね、各バージョンで特定の検証テーマに取り組む。

## リポジトリ構成

各バージョンは独立したnpmプロジェクトとして格納される。バージョン間のコード依存はない。

```
/
├── v1/ ... v9/        ... 各バージョン（独立したnpmプロジェクト）
├── docs/versions.md   ... 全バージョンの総括（目的・達成度・課題）
├── LICENSE            ... MIT
├── NOTICE             ... 第三者の配色データ（ColorBrewer・viridis 系）の帰属表示
├── docs/future_work*/ ... バージョン横断の検討資料（将来仕様の検討）
├── CLAUDE.md          ... ClaudeCode共通ルール
└── .claude/           ... ClaudeCode設定
```

### 各バージョンの概要

詳細な総括は [docs/versions.md](docs/versions.md) を参照。

| バージョン | テーマ | 状態 |
|-----------|--------|------|
| v1 | 自己複製の検証 | 実装・検証完了 |
| v2 | 淘汰圧の導入（資源有限化、エネルギーモデル、残骸・分解） | 実装・検証完了 |
| v3 | 連続空間物理と資源循環（v3_server: オンライン観覧） | 実装・検証完了 |
| v4 | VMベースプログラム（16bit・Mini-Cツールチェーン） | 実装・検証完了 |
| v5 | プログラム堅牢性（CHECKPOINT・リフレックス・アポトーシス） | 実装・検証完了 |
| v6 | プリミティブ制御層のみでの自己複製 | 実装・検証完了 |
| v7 | WorldObjectモデルとコンポーネント分離 | 実装・検証完了 |
| v8 | 接続・剛体グループとハイジャッカー | 実装・検証完了 |
| v9 | ダイナミックな生態系（クラフトツリー再設計、耐久度、捕食） | 実装・検証完了（目的を達成。[v9/README.md](v9/README.md)） |

### バージョンの追加方法

1. ルートに `vN/` ディレクトリを作成する
2. `vN/` 内に独立したnpmプロジェクト（package.json, tsconfig.json等）を構成する
3. 仕様は `vN/docs/specs/` に格納する
4. `vN/CLAUDE.md` にそのバージョン固有の開発ルール・コマンドを記載する
5. 本README.mdの一覧を更新する

## 共通設定

- ClaudeCode設定（`.claude/`）は全バージョンで共有される
- 共通の開発ルールはルートの `CLAUDE.md` に記載されている
- 各バージョン固有のルール・コマンドは `vN/CLAUDE.md` を参照

## 各バージョンの実行方法

各バージョンのディレクトリに移動してコマンドを実行する。詳細は各バージョンの `README.md`（v1〜v6・v9。v9 は英語）を参照。v7・v8 には README が無いため、`vN/docs/` と [docs/versions.md](docs/versions.md) を参照。

```bash
cd v1
npm install
npm test
```
