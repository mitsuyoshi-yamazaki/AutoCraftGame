# M5 (有性生殖) チューニング結果

[ロードマップ](../../../v4/docs/plan/program_robustness_roadmap.md) のマイルストーン M5 として、2 親メモリの混合 (CROSS_WRITE) を v5 に実装した。

## 実装内容

### 型・パラメータ

- `ActionOp` に `'CROSS_WRITE'` を追加
- `CrossWriteReservation` インターフェースを `io.ts` に追加 (`parent2LocalId` を含む)
- `params.ts` に `crossWriteBlockSize=64`, `crossWriteCostPerWord=0`, `energyCosts.CROSS_WRITE=20` を追加

### I/O プロトコル

- 新 I/O アドレス `PRC0_PARENT2 = 0x5006`
- Processor コマンド `cmd=3` を CROSS_WRITE に割り当て
- `handleProcessorCommand` に case 3 を追加

### Action Engine

- `executeCrossWrite` 関数を実装:
  1. 親A (caller) が Processor を所持しているか確認
  2. 子 (target) の解決 + 距離・MemoryCore チェック
  3. 親B (parent2) の解決 + 距離チェック
  4. block_size 単位で交互コピー (block index が偶数なら親A、奇数なら親B)

### Compiler

- 新組み込み関数 `cross_write(target_id, parent2_id, src_addr, dst_addr, length)` を追加 (5 引数)
- I/O 経由で 5 ワードを書き込み、cmd=3 を発行

### 新プログラム

- `programs/sexual_pioneer.c`: pioneer ベースで、phase 5 で `find_mate()` を試行
  - mate を見つけた場合: `cross_write` で有性生殖
  - mate が見つからない場合: `write_memory` でフォールバック (無性生殖)

## テスト結果

### ユニットテスト (test/cross_write.test.ts)

4 テスト全通過:
- builtin コンパイル (CROSS_WRITE 命令が出力される)
- block 交互ミキシング (block_size=4, length=16 で 4 ブロック検証)
- 親B 範囲外 → `OUT_OF_RANGE` で失敗
- caller に Processor 不在 → `MISSING_COMPONENT` で失敗

### 全体テスト

411 テスト全通過 (M3 後の 407 + cross_write 4)。

## 動作確認

### sexual_pioneer のシミュレーション結果 (500 tick, seed=42, 5体)

| | 最終キャラ | 誕生 | 死亡 |
|---|---|---|---|
| pioneer (M1+M2+M3) | 13 | 12 | 4 |
| sexual_pioneer | 3 | 3 | 5 |

sexual_pioneer は明らかに繁殖率が低い。

### 原因分析

1. **mate-finding の地理的困難**: `find_mate()` は `interactRange=1.5` 内に他個体がいる必要がある。広い世界 (120×80) では個体がほぼ常に互いに離れている
2. **chimera children の機能不全**: 親A と親B のメモリを 64 word ブロックで混ぜると、関数境界・グローバル変数領域が破壊される。子の `main()` ループが正常動作しない可能性が高い
3. **fallback の頻度**: ほとんどの phase 5 実行で mate が見つからず、`write_memory` フォールバックが選ばれる。この場合は無性生殖と変わらない

### 観察された現象

```
[tick 122] char-004 spawned char-006
[tick 131] char-005 spawned char-007
[tick 136] char-002 spawned char-008
[tick 339] char-006 died
[tick 348] char-001 died
```

第一世代は無事複製するが、第二世代 (char-006, 007, 008) は死亡し、孫世代は誕生しない。これは:
- 生まれた子のメモリが mate のメモリとミックスされ、機能不全になっている可能性
- または、子の周囲に同種の他個体が稀でフォールバック前提となっており、何かしらの実行差異がある

### M5 の意義 (実装は完了)

M5 の本質的な目的は「**致死変異の集団レベルでの遮蔽**」。これを観察するには:

1. 同一プログラムの個体が密集した状況での実験が必要
2. 異プログラムが交配した際のキメラ動作の観察
3. 「破損した個体」と「健全な個体」の交配で、健全な部分が継承されるかの確認

これらは sexual_pioneer の単純な配置では観察しにくい。今後の実験設計で詳細評価する必要がある。

## 達成事項

[ロードマップ M5](../plan/M5_sexual_reproduction.md) の機能要件:

- ✅ 2 親メモリの block 交互ミキシング (ユニットテストで確認)
- ✅ Processor cmd=3 として既存フローに統合
- ✅ 新組み込み関数 `cross_write` の追加
- ✅ 親B の距離・存在確認、失敗パスの実装
- ✅ 既存の `write_memory` (1 親) は変更なし、後方互換性維持
- ✅ 新種族 `sexual_pioneer` のサンプル実装

「集団遺伝学的多様性の維持」という長期目標は実装単独では確認できず、後続の長期シミュレーションに委ねる。

## 残された課題

1. **chimera children の動作検証**: ブロック境界が関数境界と一致しないと子のプログラムが壊れる。今後は「同族 vs 異族」「block_size の調整」などで挙動を観察する
2. **mate の発見メカニズム**: `find_mate` が遠距離の個体を見つけられないため、有性生殖の発火率が低い。今後の改善案:
   - 個体密度を上げる初期配置
   - 探索行動と組み合わせる
   - mate 候補が SENSE_RANGE 内なら移動して接近する
3. **block_size のチューニング**: 64 word が適切か未検証。32, 128 などで実験予定
4. **エネルギーコストの調整**: 現状 `CROSS_WRITE=20`, `crossWriteCostPerWord=0`。チューニングで変えるかは要検証

## 検証用コマンド

```bash
# baseline pioneer
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 --count 5 --output final

# sexual_pioneer
npm run sim -- --program programs/sexual_pioneer_def.json --ticks 500 --seed 42 --count 5 --output final

# 両種族併存
npm run sim -- --program programs/pioneer_def.json --program programs/sexual_pioneer_def.json \
  --ticks 1000 --seed 42 --count 5 --output final

# ユニットテスト
npm test -- test/cross_write.test.ts
```

## まとめ

M5 (CROSS_WRITE / 有性生殖) の実装は完了。
- VM/IO/Action Engine/Compiler レベルの統合は完全に機能
- ユニットテストで block 交互ミキシングと失敗パスを検証
- sexual_pioneer サンプルプログラムが動作 (繁殖率は低いが、機能は確認)

「集団遺伝学的動態の観察」は今後の長期実験課題として残る。実装そのものは Lord 的な追加であり、既存の pioneer 等への影響なし。
