# 仕様の不足分 — 概要

## 最終目標

進化手法をゲームシステムとして提供せず、キャラクター（人工生命）の自律的な活動の結果として進化が創発するシミュレータを実現する。

## ダーウィン進化の3要件

進化が起こるためには以下の3つが必要であり、現在の仕様はいずれも不十分である。

| 要件 | 意味 | 現在の仕様の状態 |
|------|------|-----------------|
| **変異 (Variation)** | 親と異なる子が生まれる | Programの自己書き換え手段がない。`evolveProgram()`は外部テスト用 |
| **選択 (Selection)** | 適応度の高い個体が生き残る | 資源が毎tick再生し枯渇しない。行動にコストがない。淘汰圧が存在しない |
| **遺伝 (Heredity)** | 親の形質が子に伝わる | WRITEによる完全コピーは実装済み。ただし変異と組み合わせる仕組みがない |

## 不足分の一覧

| # | 文書 | 内容 |
|---|------|------|
| 1 | [program_representation.md](./01_program_representation.md) | Program表現と変異メカニズム |
| 2 | [selection_pressure.md](./02_selection_pressure.md) | 淘汰圧（資源枯渇・代謝コスト・環境圧） |
| 3 | [character_interaction.md](./03_character_interaction.md) | キャラクター間相互作用 |
| 4 | [environment.md](./04_environment.md) | 環境の多様性と動的変化 |
| 5 | [open_endedness.md](./05_open_endedness.md) | 開放性（進化の袋小路を避ける） |
