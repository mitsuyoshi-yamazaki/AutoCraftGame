# M1 (CHECKPOINT) チューニング結果

[ロードマップ](../../../v4/docs/plan/program_robustness_roadmap.md) のマイルストーン M1 として CHECKPOINT 命令を v5 に実装した。本文書はその効果検証と調整結果をまとめる。

## 実装内容

### VM変更

- 新オペコード `CHECKPOINT` (opcode 13) を追加
- 命令ワード全体のマジックパターン `0x36A5` を要求（オペコード13 + マジックオペランド `0x2A5`）
  - これによりランダムなメモリ内容が偶然 CHECKPOINT としてデコードされる確率を 1/64 → 1/65536 に低減
  - マジックパターンに合致しない opcode 13 は NOP として扱う
- VM 内部状態に `cp` (16bit) と `cpSet` (1bit) を追加
- tick 開始時、`cpSet` が true なら PC を `cp` で上書きする（方式A）
- CHECKPOINT 実行時、`cp = PC + 1`、`cpSet = true`、`PC += 1`

### Mini-C コンパイラ

- `checkpoint()` 組み込み関数を追加（CHECKPOINT 命令を発行）

### Pioneer プログラム

- `while (1) { checkpoint(); ... }` の構造に変更
- 各tickの実行は while ループの直下から開始する

### CLI / GUI 検証手段

- CLI: `--corrupt-at-tick`, `--corrupt-count`, `--corrupt-target`, `--corrupt-seed`, `--corrupt-periodic` オプション
- GUI: SelectedContent の「破損: Nワード」ボタン

## 破損注入テスト結果

設定: pioneer 5体、500 tick、seed=42

### Baseline (破損なし)

| 指標 | 値 |
|------|---|
| 最終キャラクター数 | 13 |
| 累計誕生数 | 12 |
| 累計死亡数 | 4 |

### 単発破損 (tick 50 で N ワード破損)

| 破損ワード数 | 最終キャラ数 | 誕生 | 死亡 | char-001 状態 |
|------|----|----|----|---|
| 1 | 13 | 12 | 4 | 正常複製、tick 400で寿命死 |
| 3 | 13 | 12 | 4 | 正常複製、tick 400で寿命死 |
| 5 | 10 | 9 | 4 | 複製できず、tick 243 死亡 |
| 20 | 10 | 9 | 4 | 複製できず、tick 243 死亡 |
| 50 | 10 | 9 | 4 | 複製できず、tick 247 死亡 |
| 100 | 10 | 9 | 4 | 複製できず |

### 周期的破損 (tick 100 起点、100 tick ごとに 5 ワード破損)

| 指標 | 値 |
|------|---|
| 最終キャラクター数 | 10 |
| 累計誕生数 | 9 |
| 累計死亡数 | 4 |

破損対象が char-001 → char-002 へ遷移（前の対象が死亡し、次の active 個体が選ばれる）。種は破損注入下でも繁殖を続けた。

## 達成事項

[ロードマップM1](../../../v4/docs/plan/program_robustness_roadmap.md) の **最低基準**:

> 破損が即座に自己複製機能の停止に繋がらないこと

この基準は明確に達成された:

1. **1〜3ワードの軽微な破損では完全な生命周期が維持される**: 破損された個体が正常に複製を行い、寿命まで生存する
2. **5ワード以上の重大な破損でも個体は約200tick生存する**: 即死せず、metabolism による緩やかな衰弱で死亡
3. **周期的破損下でも種として複製サイクルが回る**: 個体は短命でも、種としての複製は継続される

## 観察された副次的事象

### CHECKPOINT 1回限り実行

CHECKPOINT は while ループ先頭にあるが、cp = "CHECKPOINT直後のアドレス" のため、次tick以降は CHECKPOINT 自体をスキップして本体から実行する。結果として、SelectedContent の "Checkpoint" 表示は最初の tick のみ "HIT"、それ以降は "miss" になる。これは仕様通り。

### natural recovery vs checkpoint

pioneer プログラムには元々 `halt(); continue;` パターンによる「自然な復帰」が組み込まれていた:
- HALT 命令の次のアドレスには `continue` のための JMP が配置される
- 次tick: PC=halt+1 → JMP → ループ先頭

この自然な復帰により、CHECKPOINT を導入していない pioneer でも軽度の破損には耐えられる。CHECKPOINT の追加メリットは:
1. JMP 自体が破損した場合でも復帰可能
2. PC 迷走で大きく外れた位置でも cp により確実に復帰

unit test (`PCトラップ回復シナリオ`) ではこの「自然な復帰では救えない」状況を意図的に作って CHECKPOINT の効果を確認している。

### 偶発トリガー対策

初期実装では opcode 13 だけで CHECKPOINT 判定していたため、ランダムなメモリ内容がデコード時に偶然 CHECKPOINT として扱われ、`cp` が不正な位置に設定されるリスクがあった（1/64 確率）。マジックパターン `0x36A5` を要求することで 1/65536 に低減し、破損下でも `cp` が安定するようになった。

## 残された課題

- **5ワード以上の破損では複製不可**: 個体は生存するが、複製機能を取り戻せない。これは「checkpoint で PC を回復しても、複製ロジック自体の命令が破壊されている」ため。次のマイルストーン（M2: 反射、M4: 符号化冗長化）で対処が必要
- **A/B 比較の困難**: CHECKPOINT を含む/含まないバイナリは1ワードずれるため、同一アドレスへの破損が異なる命令を破壊する。厳密な A/B 比較には制御変数の調整が必要

## 検証用コマンド

```bash
# Baseline
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 --count 5 --output final

# 単発破損
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 --count 5 \
  --output final --corrupt-at-tick 50 --corrupt-count 5

# 周期的破損
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 --count 5 \
  --output final --corrupt-at-tick 100 --corrupt-count 5 --corrupt-periodic 100

# tick 毎の checkpoint hit / instruction limit hit を出力
npm run sim -- --program programs/pioneer_def.json --ticks 200 --seed 42 --count 5 \
  --output tick --corrupt-at-tick 50 --corrupt-count 20
```
