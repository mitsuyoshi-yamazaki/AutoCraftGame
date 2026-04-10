# Issue 004: ID指定SENSE導入後のパフォーマンス低下

## ステータス: 解決済み

## 症状

ID指定SENSE (`sense_id`) の導入と、それを利用するプログラム改修（スマートリチャージ・リソース探索）を行った後、GUIアプリケーションの実行速度が 20 tick/s → 3 tick/s に低下した。

## 発見された問題（3件）

### 問題A: コンパイラのearly returnバグ（主因）

**症状**: 全4種族が tick 1 から `instructionsPerTick` (100,000) の上限に到達し、HALTに到達できない無限ループに陥る。

**原因**: Mini-Cコンパイラの `emitReturn` が `JMP _func_epilogue` を生成していた。エピローグは関数末尾の `localVarCount` でスタックを解放するが、early return 地点ではローカル変数がまだ少ないため、`ADDI r7, r7, N` の N が過大になり、スタックポインタがずれてリターンアドレス（r6）が破損する。

```
例: do_harvest(int filter) 内で

  if (n > 0) { ... return; }  ← ここでは n のみがスタック上 (1変数)
  int energy = my_energy();    ← ここ以降で energy が追加 (2変数)
  int n2 = sense(...);         ← さらに n2 が追加 (3変数)

エピローグ: ADDI r7, r7, 3  ← 常に3変数分を解放
early return 地点: 実際には1変数しかない → 2変数分余分にスタックを巻き戻す
→ POP r6 が不正な位置から読み出す → r6 = 0 → JALR r0, r6 → PC=0
→ グローバル変数領域を命令として実行 → HALTに到達しない無限ループ
```

**修正**: `codegen.ts` の `emitReturn` を、`JMP _epilogue` ではなくインラインで `ADDI r7, r7, (stackDepth-1); POP r6; JALR r0, r6` を生成するように変更。return 地点での正確な `stackDepth` に基づき正しいスタック解放量を算出する。

### 問題B: Evolverのスタックオーバーフロー（副因）

**症状**: コンパイラ修正後もEvolver 1体が tick 130以降で `instructionsPerTick` 上限に到達し続ける。

**原因**: Evolver のプログラムサイズは 2048 ワード（MemoryCore×2 の上限ぴったり）で、スタック余裕がゼロ。`do_replicate` の深い呼び出しチェーン（main → do_replicate → mutate → clamp → next_rng）でスタックがプログラム領域を上書きし、命令列が破損する。

**修正**: Evolver を MemoryCore×3 に変更（メモリ空間 2048 → 3072ワード、スタック余裕 1024ワード）。`assemble_ext(1,0,3)`、材料計算関数、COPY_SIZE を対応して更新。

### 問題C: I/O内のオブジェクト検索がO(n)（性能劣化）

**症状**: 問題A/Bの修正後も、キャラクター数増加に伴い速度が期待より低い。

**原因**: `createIoHandler` 内で `world.characters.find()`, `world.resourceNodes.find()` 等の線形探索（O(n)）を使用。`sense_id` の導入で `findSenseByIdTarget` が追加され、キャラクターごと・毎tickで O(n) 検索が発生。さらに `createIoHandler` は各キャラクターごとに呼ばれるため、4つのMapをキャラクター数回構築していた。

**修正**: 
1. `buildWorldLookup()` でID→オブジェクトのMapを tick ごとに1回だけ構築し、全キャラクターで共有
2. `findSenseByIdTarget`, `findTargetObject`, `gatherSenseTargets` の `.find()` を `.get()` に置換

## 調査手法

### 1. instructionsPerTick 削減による切り分け

ユーザーが `instructionsPerTick` を 100,000 → 400 に減らしたところ速度が正常に戻った。これにより「プログラムがHALTに到達していない」ことが判明。

### 2. 命令数計測スクリプト

ミニVMを実装した計測スクリプトを作成し、種族ごとの実際の命令数を測定。正常時は ~200命令/tick でHALTに到達することを確認。

### 3. VM実行トレース

先頭500命令のPC遷移をトレースし、無限ループの場所を特定:
```
PC=37 (JALR r0, r6) → PC=0 → ... → PC=30 → PC=37 → PC=0 (ループ)
```
`do_wander` のリターン命令 `JALR r0, r6` で r6=0 に破損していることを発見。

### 4. アセンブリのスタック追跡

`do_harvest` のアセンブリ出力を手動で追跡し、entry時の `PUSH r6` → epilogueの `ADDI r7, r7, 3; POP r6` で、early return パスではスタック上のローカル変数数が3未満であることを確認。

### 5. `TickExecResult.hitLimit` の導入

`executeOneTick` の戻り値に `hitLimit: boolean` と `instructionsExecuted: number` を追加。シミュレーション層で `instructionLimitHits: Set<string>` を集計し、GUIの SelectedContent と Tick 表示に反映。これにより、どのキャラクターがいつ上限に到達しているかをリアルタイムに可視化できるようにした。

### 6. CLI計測スクリプトによるパフォーマンス定量評価

全4種族×5体の世界で2000 tick実行し、tick/s と LIMIT HIT 数を計測:
- 修正前: 9.9 tick/s, 2814 LIMIT HIT
- コンパイラ修正後: 71.6 tick/s, 168 LIMIT HIT（Evolver子個体のみ）
- Evolver MemoryCore×3化後: 88.3 tick/s, 178 LIMIT HIT（MemoryCore×2で生まれた子のみ）

## 得られた知見

1. **コンパイラのreturn文は関数内の変数スコープに依存する**: early return を使う関数に後から変数宣言を追加すると、エピローグのスタック解放量と不整合が生じる。プロトタイプ品質のコンパイラでも、return のコード生成は正確なスタック追跡が必須。

2. **プログラムサイズ ≈ メモリ上限は危険**: スタックはメモリ末尾から下方成長するため、プログラムサイズがメモリの大部分を占めると、深い関数呼び出しでスタックがプログラム領域を破壊する。安全マージンとして最低でもメモリの25%程度のスタック余裕が必要。

3. **命令上限到達の検知は開発初期から入れるべき**: `hitLimit` フラグがなければ、プログラム破損による無限ループを正常動作と区別できなかった。パフォーマンス問題の切り分けに不可欠。

4. **O(n) → Map化は全体を一括で行う**: 個々の関数を修正しても、Mapの構築コストが呼び出し回数分かかると効果が限定的。tick単位で共有Mapを構築する設計にすべき。

## 影響を受けたファイル

- `v4/src/vm/compiler/codegen.ts` — `emitReturn` 修正
- `v4/src/vm/vm.ts` — `TickExecResult` 型追加、`executeOneTick` 戻り値変更
- `v4/src/simulation.ts` — `instructionLimitHits` 集計、`buildWorldLookup` 共有
- `v4/src/io.ts` — `buildWorldLookup` 導入、`.find()` → `.get()` 置換
- `v4/src/types.ts` — `TickResult.instructionLimitHits` 追加
- `v4/ui/main.ts` — LIMIT HIT 表示
- `v4/programs/*.c` — Evolver MemoryCore×3化
- `v4/test/compiler.test.ts` — early return テスト3件追加
- `v4/test/vm.test.ts` — `TickExecResult` 対応
