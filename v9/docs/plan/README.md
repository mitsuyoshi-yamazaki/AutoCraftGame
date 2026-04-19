# v9 設計計画

v8の接続仕様を拡張し、六角形コンポーネント・複数コンポーネント種別・衝突判定を導入するバージョン。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| [0_requirement.md](0_requirement.md) | v8からの変更要件。六角形接続・新コンポーネント（Actuator, Sensor, Harvester, Disassembler, Storage）・資源とレシピの追加・衝突判定。変更範囲外の明示 |
| [1_design_discussion.md](1_design_discussion.md) | 設計インタビューの記録。確定事項（連続座標維持、辺インデックス0-5併用、円近似衝突+バネ反発）と未決定事項（物理モデル、辺スロット対称性、ASSEMBLE辺指定、コンポーネント役割分担、資源・レシピ等） |
