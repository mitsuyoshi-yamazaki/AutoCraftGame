# 開発着手プロンプト

以下のプロンプトをClaudeCodeに入力して、プロトタイプの実装を開始する。

---

## プロンプト

```
このリポジトリは、自律キャラクターの自己複製が可能なクラフトゲームのプロトタイプである。

CLAUDE.md を読み、仕様（docs/specs/）と開発ルール（.claude/rules/）を把握せよ。
その後、以下の手順でプロトタイプを実装せよ。

### 実装手順

1. プロジェクト初期化
   - package.json, tsconfig.json, vitest.config.ts を作成
   - 必要な依存パッケージをインストール（typescript, vitest, tsx）

2. 型定義の実装（src/types.ts）
   - 仕様ファイルから全エンティティの型を定義
   - Item, Component, Character, World, Program 等

3. コアモジュールの実装（依存順）
   - src/recipes.ts — 素材階層・レシピ（game_spec.md に基づく）
   - src/world.ts — マップ・資源ノード（application_spec.md に基づく）
   - src/character.ts — キャラクター生成・コンポーネント操作（character_spec.md に基づく）
   - src/program.ts — Condition評価・Action実行（character_program_spec.md に基づく）
   - src/replication.ts — WRITE/ACTIVATE/ASSEMBLEの自己複製関連（self_replication_spec.md に基づく）
   - src/simulation.ts — ゲームループ（application_spec.md のゲームループに基づく）

4. テストの作成と実行
   - 各モジュールのテストを作成
   - 特に replication.test.ts で以下の3件を検証:
     a. Programの組立指示でBody構成を自由に決定できるか
     b. MemoryCoreのデータコピーでProgramが正しく伝達されるか
     c. Program内の組立指示の変更で進化（異なる構成の娘）が実現できるか

5. CLIとサンプルProgram
   - src/cli.ts — シミュレーション実行・JSON出力
   - programs/self-replicator.json — 最小構成での自己複製Program
   - 実際にシミュレーションを実行し、自己複製が成功することを確認

各ステップ完了後、`npm test` を実行してテストの通過を確認すること。
最終的に、シミュレーション実行で自己複製が観測できれば完了とする。
```

---

## 使い方

1. このディレクトリの内容を別リポジトリとしてコピーする
2. そのリポジトリでClaudeCodeを起動する
3. 上記プロンプトを入力する
4. ClaudeCodeが自律的に実装を進める

## 再生成時

仕様を更新した場合:
1. `docs/specs/` の該当ファイルを更新する
2. 変更内容に応じてプロンプトを調整する（通常は不要）
3. 実装ファイルを削除し、再度プロンプトを実行する
