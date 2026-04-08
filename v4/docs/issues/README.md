# Issues

開発中に発見された問題とその解決状況。

## 一覧

| # | タイトル | ステータス | 概要 |
|---|---------|-----------|------|
| [001](001_harvest_unreachable.md) | キャラクターがHARVEST距離に到達しない | 解決済み | RECIPE/CRAFT IDの不一致、移動オーバーシュート、エネルギー経済破綻の複合問題 |
| [002](002_instructions_per_tick.md) | INSTRUCTIONS_PER_TICKが大きすぎる | 未解決 | Mini-Cコンパイラのコード生成効率が低く、1tickに数千〜数万命令が必要。改善方針は記載済みだが未実施 |
| [003](003_gui_not_implemented.md) | GUIアプリケーション未実装 | 解決済み | v3のGUIをv4に移植。実装完了 |
| [004](004_performance_degradation_sense_id.md) | ID指定SENSE導入後のパフォーマンス低下 | 解決済み | コンパイラのearly returnバグ、Evolverスタックオーバーフロー、O(n)検索の3問題を特定・修正 |
| [005](005_program_robustness.md) | プログラム破損に対するロバスト性 | 未解決 | PC迷走の回復不能、制御フローの脆弱性、破損状態の永続性。tick毎リセット案は制約が強く不採用。対策未決定 |
