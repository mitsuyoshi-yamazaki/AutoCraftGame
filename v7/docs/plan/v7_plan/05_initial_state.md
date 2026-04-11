# v7 初期状態の設計

本文書は v7.0.0 の初期状態（ゲーム開始時の世界の構成）を定義する。
具体的な数量・配置パラメータは実装後の調整で決定する。

---

## 1. 初期コンポーネントセット

`01_goal.md` の想定振る舞いに基づき、以下の 4 種のコンポーネントを 1 セットとする。

| 名称 | 種別 | 初期状態 | 説明 |
|------|------|---------|------|
| **a** | Assembler | recipe=3 (Assembler), gathering | Assembler を生産する Assembler。トリガー済みで材料回収中 |
| **b** | Assembler | recipe=4 (Processor), gathering | Processor を生産する Assembler。トリガー済みで材料回収中 |
| **c** | Processor | running | a が生成した空 Assembler にレシピ設定 + 空 Processor にメモリコピー・起動を行う |
| **d** | Processor | running | b が生成した空 Assembler にレシピ設定 + 空 Processor にメモリコピー・起動を行う |

### a, b の初期状態

- `recipe` に有効なレシピ ID が設定済み
- `action_trigger` に 1 が書き込み済み → 初期状態で **gathering** フェーズにある
- 周囲に必要な材料・エネルギーが配置されていれば、ゲーム開始直後から材料回収が始まる

### c, d の初期状態

- `run_flag` = 1（**running**）
- メモリにプログラムが書き込み済み
- ゲーム開始直後から毎 tick プログラムを実行する

### c, d のプログラム概要

c と d は異なるレシピ ID を Assembler に書き込むが、基本構造は同一:

```
loop:
  SCAN(filter=Assembler)            // 近接 Assembler を探す
  for each result:
    if assembler.recipe == 0:       // レシピ未設定の空 Assembler
      write recipe = <自分の担当レシピ>
      write action_trigger = 1      // ASSEMBLE トリガー
  SCAN(filter=Processor)            // 近接 Processor を探す
  for each result:
    if processor.run_flag == 0:     // 停止中の空 Processor
      copy self memory → target     // 自身のプログラムをコピー
      write run_flag = 1            // 起動
  HALT                              // 次 tick で loop に戻る
```

c は `<自分の担当レシピ>` = 3 (Assembler)、d は 4 (Processor)。

---

## 2. セット数

初期状態に含める a〜d のセット数: **10〜50 セット**（調整パラメータ）

各セット内の a〜d は互いに近接して配置される。セット間は十分な距離を置く。

---

## 3. 初期資源・エネルギー

ゲーム開始時に世界に配置する資源・エネルギーオブジェクト。

### 中間生成物

a, b が最初の ASSEMBLE を完了するために必要な中間生成物:

- a (Assembler 生産): Metal × 2, Circuit × 1 → 各セットに最低 1 組
- b (Processor 生産): Circuit × 3 → 各セットに最低 1 組
- 合計: 各セットに Metal × 2, Circuit × 4（最低限）

実際には複数世代の生産を持続するために、これの数倍〜数十倍を配置する。

### エネルギー

- 各セットの近接範囲内に十分なエネルギーオブジェクトを配置
- Assembler の ASSEMBLE エネルギーコスト × 予想生産回数 分

### 原材料（任意）

- 中間生成物の原料（Ore, Crystal）を配置して、Assembler が中間生成物を自己生産するチェーンも検証可能にする
- v7.0.0 の最初の検証では中間生成物を直接配置する方が確実

---

## 4. 配置レイアウト

各セットの配置例（1 セット内）:

```
    [Metal] [Circuit] [Energy]
  [a: Assembler(recipe=3)]  [c: Processor(running)]
  [b: Assembler(recipe=4)]  [d: Processor(running)]
    [Metal] [Circuit] [Energy]
    [Circuit] [Circuit] [Energy]
```

- セット内の全オブジェクトは互いに近接距離内に配置
- セット間の距離は近接距離の数倍以上（他セットとの干渉を防ぐ）

---

## 5. 調整方針

実装完了後、以下の指標を計測しながらパラメータを調整する:

1. **1 世代目の成功率**: a, b が最初のコンポーネントを生成し、c, d がそれを設定・起動できるか
2. **世代の持続**: 2 世代目、3 世代目... のコンポーネントが生成されるか
3. **資源消費速度**: 初期資源がどの程度の世代数で枯渇するか
4. **拡散の影響**: ランダム移動によりセット内のコンポーネントが散らばる速度と、自己複製サイクルの完了速度のバランス
