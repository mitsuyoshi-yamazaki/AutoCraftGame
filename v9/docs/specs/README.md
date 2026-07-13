# v9 仕様

v9のゴール: ダイナミックな生態系を実現できるクラフトゲームの仕組みを作成すること
（[../plan/3_v9_goal.md](../plan/3_v9_goal.md)）。

設計判断の経緯は [../plan/5_design_decisions.md](../plan/5_design_decisions.md)、
クラフトツリーの内容は [../plan/craft_tree/spec_draft.md](../plan/craft_tree/spec_draft.md)
（データ実体 `src/craft/`）を参照。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| [00_world_objects.md](00_world_objects.md) | ワールド、オブジェクトモデル、初期状態、決定論（PRNG）、ゲームループ |
| [01_physics.md](01_physics.md) | 力ベース物理、質量=原子数、バネ反発衝突、接続と辺、グループ |
| [02_components.md](02_components.md) | 8コンポーネントの役割とアクション、耐久度、残骸、逓増修理 |
| [03_program_io.md](03_program_io.md) | VM（v8互換）、I/Oアドレス空間、opmemレイアウト、種別コード、ローカルID |
| [04_craft_energy.md](04_craft_energy.md) | レシピ実行、原子保存則、エネルギー、資源ノード、自発変化、散布 |
| [05_parameters.md](05_parameters.md) | 全パラメータの暫定値 |
| [06_ancestor_scenario.md](06_ancestor_scenario.md) | 祖先種の複製シナリオ机上検証（仕様ゲート、判定PASS） |

## 実装との関係

- 実装は本仕様に従う。仕様に記載のない挙動は最もシンプルな解釈を採用する
- クラフトツリー（物質・レシピ・安定性）はコード上のデータ定義（`src/craft/`）が正であり、
  テストで機械検証される
- [05_parameters.md](05_parameters.md) の数値はすべて暫定であり、実装後の実測で調整する
