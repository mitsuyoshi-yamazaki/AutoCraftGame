# 初期状態の刷新: 3 種族 (AsexEvolver, SexEvolver, Patroller)

## 目的

GUI アプリケーションの初期状態に含まれる種を、以下の条件を満たす新種に入れ替える:

1. **有性生殖し、進化する種** (mutation 可能)
2. **無性生殖し、進化する種** (mutation 可能)
3. **行動が異なる variant**

各種は、最初から「ランダムな不活性処理」（通常実行されないが、実行されたら意味のある動作を行う代替コード経路）を持つ。そのため MemoryCore を増やす。

## 設計

### 共通設計

3 種族とも以下の構造:

- **コンポーネント**: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, **MemoryCore×4** (4096 words)
- **進化メカニズム**: replication 直前に親が自分のグローバル変数を一時的に変異させ、`write_memory` (または `cross_write`) で子に渡し、その後復元する
- **不活性コード**: `behavior_mode` グローバル変数 (デフォルト 0) により、3 つの代替動作 (mode 1/2/3) が選択可能。通常実行では mode 0 のみだが、変異により別 mode が活性化することがある
- **CHECKPOINT 対応**: `while(1) { checkpoint(); ... halt(); continue; }` 構造で M1 の PC 復帰機構を活用

### 種族別

**AsexEvolver** (asexual evolver):
- 通常モード: Ore→Crystal→Process→Craft→Assemble→Activate
- 不活性モード: aggressive_recharge / erratic_wander / scavenge (remains 探索)
- 複製: `write_memory` (1 親)

**SexEvolver** (sexual evolver):
- 通常モード: 同上
- 不活性モード: aggressive_recharge / seek_mate / share_resources
- 複製: 隣接 active char を `find_mate` で探し、見つかれば `cross_write` (2 親)、見つからなければ `write_memory` フォールバック

**Patroller** (behavioral variant):
- 通常モード: **Crystal→Ore** (順序逆転) + 広めの wander_step (150°)
- 高めの recharge 閾値 (400/1200)
- 不活性モード: long_patrol / spin_in_place / chain_craft

### 変異対象パラメータ

各種で以下のグローバル変数が変異対象:

| パラメータ | 変異幅 | 範囲 |
|----------|--------|------|
| `wander_step` | ±15 | 30-180 (Patroller: 60-200) |
| `ore_target` | ±1 | 20-32 |
| `crystal_target` | ±1 | 28-40 |
| `behavior_mode` | 1/32 確率で 0-3 にランダム | 0-3 |
| `rng_state` | 連続更新 | 0-32767 (LCG) |

mutation seed: グローバル `rng_state` (LCG: `state * 1103515245 + 12345 & 32767`)

## 開発中に発見したバグ

### Bug 1: コンパイラの emitAddImm 重大バグ (修正済)

**症状**: replication 後にスタックポインタ r7 が異常な値になり、グローバル変数領域に書き込みが起こる。プログラムが完全に壊れて何もできなくなる。

**原因**: `src/vm/compiler/codegen.ts` の `emitAddImm` 関数が、`dest === src` の場合に元の値を破壊していた:

```typescript
// バグのあった旧コード
emit(ctx, `    LI ${dest}, ${imm & 0xFFFF}`);   // ← dest = imm (overwrite!)
emit(ctx, `    ADD ${dest}, ${src}, ${dest}`);  // ← src は既に上書きされている
```

`emitReturn` 等が `r7 += locals_count` を発行する際にこのバグを踏み、`LI r7, 8; ADD r7, r7, r7;` が `r7 = 16` になっていた。

**影響**: 8 個以上の local variable を持つ関数の return 後にスタックポインタが破壊される。Pioneer (5 local vars 以下) では発症しなかったが、新種の `do_replicate` が 8 local vars を持つため発覚。

**修正**: scratch register (r3 or r4) を経由するように変更:

```typescript
const scratch = (dest === 'r3' || src === 'r3') ? 'r4' : 'r3';
emit(ctx, `    LI ${scratch}, ${imm & 0xFFFF}`);
emit(ctx, `    ADD ${dest}, ${src}, ${scratch}`);
```

全 411 テスト通過を確認。

### Bug 2: MemoryCore 数による stack wrap (回避)

**症状**: MemoryCore = 3 個 (memory size = 3072) のとき、stack pointer の wrap が program area に着地する。

**原因**: 65536 / 3072 ≠ 整数。`65535 % 3072 = 1023` がプログラム領域の中央。push を繰り返すと code を上書きする。

**回避**: MemoryCore = 4 個 (memory size = 4096) に設定。65536 / 4096 = 16 (整数)、`65535 % 4096 = 4095` で安全。

これは「memory_size が 65536 の整数除数 (1, 2, 4, 8, 16, 32, 64 MemoryCore) でないと stack 安全性が崩れる」という既知の制約に該当する。3, 5, 6, 7 MemoryCore は危険。

## チューニング探索

### baseline (default 120×80 world, 5体×3種族)

```
2000 ticks: chars=36, asex=17, sex=15, pat=4, births=188, deaths=167
```

3 種族とも生存。Patroller がやや少ない。

### パラメータスイープ結果 (2000 tick)

| 構成 | world | nodes | chars | asex/sex/pat | births | deaths |
|------|-------|-------|-------|------|--------|--------|
| 5×3 baseline | 120×80 | 100/100/100 | 36 | 17/15/4 | 188 | 167 |
| 10×3 | 120×80 | 100/100/100 | 42 | 9/4/29 | 230 | 218 |
| 5×3 small | 80×60 | 100/100/100 | 50 | 12/16/22 | 241 | 206 |
| 10×3 small | 80×60 | 100/100/100 | 50 | 18/16/16 | 275 | 255 |
| **10×3 small dense** | **80×60** | **150/150/150** | **72** | **31/17/24** | **352** | **310** |

**最良: 10×3 個体, 80×60 world, ore/crystal/energy ノード各 150**

### 長期実行結果 (10000 tick, 最良パラメータ)

```
tick    chars   asex    sex     pat     births  deaths
1       30      10      10      10      0       0
250     56      18      19      19      26      0
500     103     30      34      39      82      9
750     153     53      56      44      165     42       ← peak diversity
1000    138     56      43      39      232     124
1500    72      28      22      22      302     260
2000    72      31      17      24      352     310
3000    51      20      12      19      409     388
4000    39      16      12      11      446     437      ← all 3 species
5000    34      13      12      9       463     459
6000    17      10      3       4       474     487      ← decline
7000    4       3       0       1       476     502      ← sex extinct
8000    2       2       0       0       476     504      ← only asex
8600    0       0       0       0       476     506      ← all extinct
```

### 観察された動態

1. **初期成長期 (t=1-750)**: 個体数が 30 → 153 まで指数増加。3 種族すべてが繁殖
2. **平衡期 (t=750-2000)**: 個体数 70-100 で安定。種族間バランス維持
3. **緩やかな衰退期 (t=2000-5000)**: 個体数 30-50 で安定だがやや減少傾向。3 種族とも維持
4. **崩壊期 (t=5000-8600)**: 種族構成が偏り始め、有性生殖種が先に絶滅、最後に無性生殖種が絶滅

### 結果評価

**達成事項**:
- 3 種族すべてが 5000+ tick 共存
- 有性生殖種・無性生殖種・variant 全てが繁殖を続けた
- 約 480 回の繁殖イベント、500 回の死亡イベント
- 個体数のピーク 153 (元の 30 から 5 倍)

**未達成事項**:
- 完全な 10000 tick 共存は実現せず (8600 tick で全絶滅)
- 個体数が 5000 tick 以降に下降傾向
- 平衡状態の長期維持が困難

**評価**: 「複数種が複数個体で複製を行い続ける」は **5000-6000 tick 程度まで達成**、その後緩やかに絶滅。完全な持続は得られなかったが、初期目標 (10000 tick) に対して 60% 程度の到達。

## 各種族の特徴的な振る舞い (観察)

### AsexEvolver
- 安定して繁殖する。最後まで生き残った種
- mutation により子の wander_step / ore_target が drift する
- 不活性 mode は稀にしか活性化しない (1/32 確率)

### SexEvolver
- 同種が近接していないと cross_write が使えず、write_memory フォールバックに頼る
- 種族個体数が少なくなると find_mate 失敗率が増え、急速に絶滅
- 衰退期に最初に絶滅した

### Patroller
- 異なる harvest 順序 (Crystal→Ore) と広い wander_step
- 個体密度が高いとき良好に繁殖
- AsexEvolver より早く絶滅

## 試行錯誤の過程

### 最初の試み (失敗)

- MemoryCore = 3 個 + recharge_low=250, recharge_high=700 → 全種族即絶滅 (10 → 0 in 2000 tick)
- 原因: stack wrap によるプログラム破損 + recharge buffer 不足

### 第二の試み (改善)

- MemoryCore = 3 個 + recharge_high=1100 + smart move_target → 0 → 8 births
- まだ stack overflow が発生

### 第三の試み (修正)

- MemoryCore = 4 個 (stack 安全) + emitAddImm 修正 → 8 → 146 births (asex 単独, 2000 ticks)

### 最終構成

- 10 体 × 3 種族 (= 30 個体) を 80×60 world に配置
- ore/crystal/energy ノード 各 150 個 (高密度)
- 生存・繁殖を ~5000 tick 維持

## 検証用コマンド

```bash
# 最良パラメータで 10000 tick 実行
npx tsx scripts/longrun-3sp.ts

# 短い検証
npm run sim -- \
  --program programs/asex_evolver_def.json \
  --program programs/sex_evolver_def.json \
  --program programs/patroller_def.json \
  --ticks 2000 --seed 42 --count 10 --output final \
  --world-size 80x60
```

## まとめ

### 成果

1. 3 種族 (AsexEvolver, SexEvolver, Patroller) を新規実装
2. それぞれが mutation 機構と不活性コード経路を持つ
3. 4 MemoryCore で 4096 word の memory 空間を確保
4. 最良パラメータで 5000+ tick の共存を達成
5. 副産物として **コンパイラの重大バグ (emitAddImm)** を発見・修正

### 限界

- 10000 tick の完全共存は未達成
- 個体数の長期平衡が確立できなかった
- mutation の効果による適応進化は観察できなかった (世代数が少なすぎ)

### 改善の方向性 (今後の課題)

1. **より大きな初期個体数**: 30 → 60 など、絶滅の確率を下げる
2. **resource 再生率の調整**: 現在の `nodeRegenerationThreshold=50` を調整
3. **mutation 率の調整**: 現在の `1/32` 確率を低めにし deleterious mutation を減らす
4. **inactive code paths を生存に有利な方向に**: 現在は基本的に "弱体化" モード。逆方向 (より良い戦略) の path を含める
5. **複数の seed で再現性確認**: seed=42 だけでなく多 seed テスト

## 関連文書

- [M1 (CHECKPOINT)](checkpoint_M1.md) — 各キャラクターが採用している PC 復帰機構
- [M2 (反射)](reflexes_M2.md) — auto-recharge / auto-repair による生存補助
- [M3 (アポトーシス)](apoptosis_M3.md) — 機能不全個体の除去
- [M5 (有性生殖)](sexual_reproduction_M5.md) — SexEvolver が利用する cross_write 機構
