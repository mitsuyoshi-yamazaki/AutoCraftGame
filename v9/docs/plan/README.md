# v9 設計計画

## v9 のゴール

ダイナミックな生態系を実現できるクラフトゲームの仕組みを作成すること。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| [0_requirement.md](0_requirement.md) | v8からの変更要件。六角形接続・新コンポーネント（Actuator, Sensor, Harvester, Disassembler, Storage）・資源とレシピの追加・衝突判定。変更範囲外の明示 |
| [1_design_discussion.md](1_design_discussion.md) | 設計インタビューの記録。確定事項（連続座標維持、辺インデックス0-5併用、円近似衝突+バネ反発）と未決定事項（物理モデル、辺スロット対称性、ASSEMBLE辺指定、コンポーネント役割分担、資源・レシピ等） |
| [2_goal_analysis.md](2_goal_analysis.md) | プロジェクト全体の目的と要件(R1-R9)の内部整合性検証、v1-v8の検証状況の棚卸し。致命的矛盾なし |
| [3_v9_goal.md](3_v9_goal.md) | v9のゴール定義。達成済み維持要素5件、新規達成要素2件（再生産<修理、捕食）、範囲外の明示、各要素の実現性評価 |
| [craft_tree/requirements.md](craft_tree/requirements.md) | クラフトツリー要件。物質と原子、エネルギーと熱、規模、コンポーネント8種、レシピ、安定性 |
| [craft_tree/policy.md](craft_tree/policy.md) | クラフトツリー作成方針。原子・物質・レシピ・資源・副産物・安定性の設計方針 |
| [craft_tree/spec_draft.md](craft_tree/spec_draft.md) | クラフトツリー仕様（レビュー待ち）。35物質・48レシピ。データ実体は `v9/src/craft/`、表は生成出力 |
| [craft_tree/design_notes.md](craft_tree/design_notes.md) | 初版ドラフトで発見された構造的欠陥3件（X無生成・線形安定性の退化・裸原子出力）と再設計の記録、レビュー観点 |
| [ideas/](ideas/) | 個別トピックのアイデア集 |
| [ideas/resource_production.md](ideas/resource_production.md) | 資源の産出方式。9方式の列挙と、総量・空間分布・時間挙動・発生条件の4軸による分類 |
| [ideas/natural_transformation.md](ideas/natural_transformation.md) | Assembler/Disassemblerによらない自然な物質変化。グリッドベース環境場+変換ルールテーブルによる実装方式 |
