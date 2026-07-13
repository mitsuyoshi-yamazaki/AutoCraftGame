# v9 開発ルール

## v9 のゴール

ダイナミックな生態系を実現できるクラフトゲームの仕組みを作成すること。
詳細は [docs/plan/3_v9_goal.md](docs/plan/3_v9_goal.md)。

## 現在のフェーズ

- Step 1（クラフトツリー確定）: 完了・レビュー承認済み
- Step 2（シミュレータ仕様策定）: 完了。仕様は `docs/specs/`（00〜06）
- Step 3（シミュレータ実装）: 完了。`src/sim/`（ワールド・アクション・物理・ライフサイクル）、
  `src/vm/`（v8互換VM＋ProgramBuilder）、CLI（`npm run sim`）。テスト67件
- Step 4（祖先種の構築と検証）: 未着手。ProgramBuilderで祖先種プログラムを作成し、
  自己複製 → 意図的変異 → 長期実験へ進む

## コマンド

```bash
npm test                            # 全テスト（クラフトツリー静的検証＋シミュレータ）
npm run sim -- --demo --ticks 300   # デモ実行（最小祖先・プログラムなし）
npm run sim -- --config <path.json> --ticks 1000 [--seed N] [--output summary|events]
npm run craft:report                # クラフトツリーの検証・コスト解析レポート
npm run craft:report -- --markdown  # ドキュメント用生成テーブル（spec_draft.mdへ転記）
```

## 実装の構成

- `src/craft/` … クラフトツリーデータと静的検証（仕様の実体）
- `src/vm/` … v8互換の16bit VM、ProgramBuilder（プログラム組立DSL）
- `src/sim/` … ワールド・コンポーネント・アクション・Processor I/O・物理・ライフサイクル・tickループ
- `src/cli.ts` … ヘッドレス実行（config JSONはzodで検証）
- 重要な不変条件はテストが守る: 原子保存（sim-integration）、決定論（同一シード完全一致）、
  エネルギーポンプ禁止（craft-data）

## クラフトツリーの変更手順

1. `src/craft/substances.ts` / `recipes.ts` / `stability.ts` を変更する
2. `npm test` で静的検証（原子保存・到達可能性・デッドエンド・原子循環・供給源）を通す
3. `npm run craft:report -- --markdown` の出力を
   `docs/plan/craft_tree/spec_draft.md` の生成セクション（マーカー間）へ貼り直す
   （test/docs-sync.test.ts が一致を検証する）
4. エネルギー放出（負値）レシピを追加する場合は、関係する物質循環の
   合計エネルギーが正であることのテストを test/craft-data.test.ts に追加する

## 設計上の不変条件

- 原子は7種（S, B, A, I, T, C, X）。種類ごとに世界総量が保存される
- レシピの出力は定義済み物質のみ（裸の原子を出力しない）
- X原子は自然産出する ContaminatedMass によってのみ世界に入る
- 物質が閉じるどのレシピ循環も合計エネルギーは正（エネルギーポンプ禁止）
- 安定性 = 原子係数の線形和 + 階層ペナルティ。自発変化は分解系レシピの再利用で表現する

## バージョニング

実装変更時は `src/version.ts` のルールに従い GAME_VERSION と package.json の version を更新する。
