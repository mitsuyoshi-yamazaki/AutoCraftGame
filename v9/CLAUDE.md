# v9 開発ルール

## v9 のゴール

ダイナミックな生態系を実現できるクラフトゲームの仕組みを作成すること。
詳細は [docs/plan/3_v9_goal.md](docs/plan/3_v9_goal.md)。

## 現在のフェーズ

- Step 1（クラフトツリー確定）: 完了・レビュー承認済み
- Step 2（シミュレータ仕様策定）: 完了。仕様は `docs/specs/`（00〜06）
- Step 3（シミュレータ実装）: 完了。`src/sim/` + `src/vm/`、CLI（`npm run sim`）
- Step 4（祖先種の構築と検証）: **完了（核心実験成功）**。`src/programs/ancestor.ts` が
  完全な自己複製と、プログラム自身が実装した複製時変異（LCG＋1ビットXOR）を実証
- Step 5（長期実験と評価）: **完了**。捕食（実験02）、変異系統（実験03）、
  自己拡張・自己修復（実験04）、生態系・競争・空間（実験05）。総括は `docs/CONCLUSION.md`
  （目標の3モード＋捕食を実証、必要要件の還元）。テスト83件

## プロジェクトの結論

進化手法をシステムが提供せず、物質保存・力学・チューリング完全なプログラム・コピーI/Oという
一貫した物理法則だけを与えれば、自己複製・変異・淘汰・捕食はすべてプレイヤーのプログラムとして
実現でき、祖先種はAIが構築可能である——これがv9で実証された。詳細は `docs/CONCLUSION.md`。

## コマンド

```bash
npm test                            # 全テスト（クラフトツリー静的検証＋シミュレータ＋各種）
npm run sim -- --ancestor --ticks 3000        # 祖先種の自己複製実験
npm run sim -- --ancestor-mutate --ticks 3000 # 変異あり祖先種
npm run sim -- --predation --ticks 3000       # 捕食実験
npm run sim -- --mobile --ticks 3000          # 移動複製種（探索採取・空間拡散）
npm run sim -- --competition --ticks 12000    # 空間競争（移動種 vs 定住種）
npm run sim -- --demo --ticks 300   # デモ実行（最小祖先・プログラムなし）
npm run sim -- --config <path.json> --ticks 1000 [--seed N] [--output summary|events]
npm run craft:report                # クラフトツリーの検証・コスト解析レポート
```

## 種プログラム（src/programs/）

- ancestor.ts … 自己複製（実験01）。helpers.ts … 共通ビルドヘルパ
- expander.ts … 自己拡張（実験04）。repairer.ts … 自己修復（実験04）
- predator.ts … 捕食（実験02）。ecology-config.ts … 複数コロニー競争・空間（実験05）
- mobile.ts … 移動複製種（実験06。探索採取・6部品の子・分散）。helpers.ts に forageOne/forageEnergy
- competition-config.ts … 移動種 vs 定住種の空間競争（実験07）
- 実験記録は docs/experiments/01〜07、総括は docs/CONCLUSION.md
- pmemは4096語（移動複製子のため1024から拡大。実験06）

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
