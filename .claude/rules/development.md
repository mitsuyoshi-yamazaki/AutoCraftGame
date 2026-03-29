# 開発ルール

## 実装の進め方

1. 仕様ファイル（`docs/specs/`）を読み込み、実装対象を把握する
2. 型定義（`types.ts`）から着手する — 全モジュールの共通基盤
3. 依存関係の少ないモジュールから順に実装する:
   - `types.ts` → `recipes.ts` → `world.ts` → `character.ts` → `program.ts` → `replication.ts` → `simulation.ts` → `cli.ts`
4. 各モジュール実装後、対応するテストを作成して通過を確認する
5. 全モジュール完了後、`programs/self-replicator.json` を作成し、シミュレーション実行で検証する

## コーディングスタイル

- オブジェクトをmutateしない。常にspread/destructuringで新しいオブジェクトを生成する
- 関数は50行未満、ネストは4レベル未満
- console.logをコミットしない（cli.tsの出力を除く）
- ハードコードした値を使わない（定数として定義する）

## テスト方針

- 各モジュールに対応するテストファイルを作成する
- `replication.test.ts` に検証事項3件を直接テストケースとして記述する
- プロトタイプのためエッジケースのテストは不要。正常系のみ

## GUI開発ルール

- ゲームロジック（`src/`）を変更しない。GUI（`ui/`）はimportして利用するだけ
- GUI仕様は `docs/ui_spec/` を参照する
- `ui/renderer.ts` の描画関数はセル単位でexportし、Rendererクラスとstoriesの両方から利用する
- 新しい描画要素を追加した場合は対応するStoryも追加する
- デザイン変更の提案時は `ui/stories/proposals/` に複数案をStoryとして実装し、Storybookで視覚比較する。採用後も提案Storyは削除せず履歴として残す
- Vite設定（`vite.config.ts`, root: ui）とVitest設定（`vitest.config.ts`）は分離されている。混同しないこと

## 仕様との関係

- 実装は `docs/specs/` の仕様に従う
- 仕様に記載のない挙動は最もシンプルな解釈を採用する
- 仕様と実装に矛盾がある場合は仕様を正とする
- 仕様の不備を見つけた場合は修正せず、コメントで記録して実装を続行する
