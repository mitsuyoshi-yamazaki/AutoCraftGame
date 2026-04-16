# 03: Hijacker with slow instructions-per-tick — 変異の発現

[02_hijacker_propagation.md](02_hijacker_propagation.md) では `instructionsPerTick =
10000` (デフォルト) で 1 回の PMEM コピーが 1 tick 内に完結したため、変異が
原理的に発生しなかった。本実験では **`instructionsPerTick` を小さくしてメモリ
コピー自体を複数 tick にまたがせる** ことで、コピー途中に target が proximity
から外れる・他 hijacker と race する・target 自身が実行を続けることによる破壊
といった事象が発生するかを観察する。

仕様ファイル: [game_spec.md](../specs/game_spec.md)
プログラム: [programs.ts](../../src/programs.ts) (`generateHijackerProgram`)
観察スクリプト: [scripts/observe-hijack.ts](../../scripts/observe-hijack.ts)
詳細インスペクタ: [scripts/inspect-mutations-v8.ts](../../scripts/inspect-mutations-v8.ts)

## ipt = 100 の見積り

hijacker の主要ループあたりの命令数:

- zero-region 走査: 1 word あたり 7〜11 命令 × 1024 word ≈ **7500 命令** (全 mem 走査)
- PMEM コピーループ: 1 word あたり 5 命令 × (clean hij 97 word / hij+v2_tail 184 word) ≈ **485 〜 920 命令**
- 初期 cooldown: HALT と分岐で 3 命令/tick × 100 tick → 300 命令 (ただし HALT 毎に tick 境界を跨ぐので実際の tick カウントは 100)

`ipt = 100` では、コピー時間のみに注目すると:

- clean hijacker (97 word コピー) → 485 / 100 ≈ **5 tick**
- hij + v2_tail (184 word コピー) → 920 / 100 ≈ **9 tick**

このスケールなら proximity range = 3.0 に対して randomMovementRange = 0.5/tick の
標準移動で、9 tick ≒ 最大 4.5 単位の移動が起きうるため、コピー途中で target が
drift-out する race が現実的頻度で起きる。

## 観察スクリプトの修正

[observe-hijack.ts](../../scripts/observe-hijack.ts) は hijack 事象を per-actor-per-target で
追跡するため `executeTick` を再実装している。初版ではランダム移動を
カルテジアン `(Math.random()*2-1)*r` で実装していたが、本家 `simulation.ts` の
`applyRandomMovement` は極座標 `angle = random()*2π, dist = random()*r` を使用しており、
`Math.random()` 呼び出し列が異なるため seed 再現性がズレていた。

本章の実験中に気づき、再実装を simulation.ts の挙動に**厳密一致**させる修正を
入れた。02 章の結果も同じシード再現性を持つ形で解釈できる (= 02 章の数値も
signal として正しい)。

## ベースライン結果 (ipt = 100)

5 v2 + 1 hij、world 50×50、mat×2、30000 tick。ipt のみ 10000→100 に変更。

| seed | hijLike | v2Like | pristine hij | pristine v2 | hybrid | junk | 0-mem | PMEM events | 不動点外 hij |
|------|--------:|-------:|-------------:|------------:|-------:|-----:|------:|-------------:|-------------:|
| 1    | 13      | 6      | **1**        | 6           | 0      | 0    | 1     | 192          | 1 (proc 292)     |
| 2    | 7       | 11     | **1**        | 11          | 0      | 0    | 3     | 150          | 0            |
| 3    | 17      | 7      | **1**        | 7           | 0      | 0    | 2     | 266          | 0            |

02 章の fast-ipt と比較:

| 指標                           | fast-ipt (02) | slow-ipt ipt=100 (本章) |
|--------------------------------|---------------|------------------------|
| 元 hijacker (pristine) の生存 | **0/3 seed** (即座に子孫に上書きされる) | **3/3 seed** (すべての seed で生存) |
| `diffsHij` の最大値            | 常に 83 (一意不動点) | 83 〜 147 (seed 1 で 147) |
| 真の変異 (`hij + v2_tail` 以外) | 0 件 | seed 1 で 1 件 |

**原 hijacker は slow-ipt では自動的に保護される**: 子孫が copy を完了する前に
元 hijacker は proximity から外れるか、自身も同時に相手を hijack することで
相手の copy を中断させる。その結果、元 hijacker の memory 書き換えは
ほぼ発生しない。

## Dense world での増幅

world 30×30、10 v2 + 1 hij、ipt=100、30000 tick ([slow-ipt-dense.json](configs/hijack/slow-ipt-dense.json)):

```
procs    = 51 (running 47)
hijLike  = 43
v2Like   = 4 (pristine v2 4)
pristine hij = 1 (元 hijacker)
all-zero = 4
PMEM events = 596
```

**真の変異個体 3 体を観測**:

| id  | class | PC  | diffsHij | diffsV2 | パターン概要 |
|-----|-------|-----|---------:|--------:|--------------|
| 549 | hijLike | 183 | 101 | 75 | hij[0..68] + v2[68..92] + hij[92..97] + v2_tail — **interleave** |
| 586 | hijLike | 183 | 127 | 49 | hij[0..50] + v2[50..184] — partial overwrite 小 |
| 597 | hijLike | 125 | 90  | 86 | hij[0..75] + v2[75..184] — partial overwrite 中 |

[inspect-mutations-v8.ts](../../scripts/inspect-mutations-v8.ts) の position-map:

```
Proc 549 (diffsHij=101 diffsV2=75):
[   0] HHHHHHHHHHH=HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
[  64] HHHH=HVVVVV=VVVVVVVVV=VVVVHHHHHHHVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVV
[ 128] VV.VVVV.VVVVVVVVVVVVVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV........

Proc 586 (diffsHij=127 diffsV2=49):
[   0] HHHHHHHHHHH=HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHVVVVVVVVVVVVVV
[  64] VVVV=VVVVVV=VVVVVVVVV=VVVVVVVVVVVVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVV
[ 128] VV.VVVV.VVVVVVVVVVVVVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV........

Proc 597 (diffsHij=90 diffsV2=86):
[   0] HHHHHHHHHHH=HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
[  64] HHHH=HHHHHH=HHHHHHHHH=HHHHVVVVVVVVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVV
[ 128] VV.VVVV.VVVVVVVVVVVVVVV.VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV........
```

(`H` = canonical hij と一致、`V` = canonical v2 と一致、`=` = たまたま両方と一致する word、
`.` = 両 canonical が 0 で mem も 0)

### 変異発生の機序

549 の `hij[0..68] + v2[68..92] + hij[92..97] + v2_tail` パターンは、**コピー
途中で target が proximity から外れる → pmemAddr は auto-increment だけは進む
→ target が戻ってきた時に残り range の writes が再開する** という機序で説明できる。

具体的に [processor.ts](../../src/processor.ts) の 0x2003 ハンドラ:

```ts
case 0x2003:
  writeExternalPMem(state, value);
  state.pmemAddr = (state.pmemAddr + 1) & 0x3FF;
  break;
```

`writeExternalPMem` は `resolveAccessibleTarget` が失敗 (= target が
accessible でない) した場合に silent drop する。しかし 0x2003 ハンドラ側の
`pmemAddr` インクリメントは**drop した場合も実行される**。このため:

1. hijacker が addr 0〜67 を書き込み成功 (tick 1〜3 内)
2. target が移動して proximity を外れる
3. hijacker が addr 68〜91 を書こうとするが silent drop (target 不可達)、
   ただし pmemAddr は 92 まで進む
4. target が proximity 範囲に戻る
5. hijacker が addr 92〜96 を書き込み成功 (copy 完了)

target の memory は [0..68] と [92..97] に hij_code、[68..92] と [97..184] に
元の v2 code が残る。

586 の `hij[0..50] + v2[50..184]` は、途中で target が proximity から外れ、
**戻って来る前に hijacker の copy loop が終了した** ケース。cleaner な
partial overwrite。

### 変異の伝播

549 は running 状態 (PC=183 → 次 tick には addr 0 の hijacker コードへ流入する)。
これが次回 SCAN→hijack を行う際は、**自身の `[0..184]` メモリをまるごと
コピー対象とする** (最大連続 0 領域 = [184..1024])。つまり 549 の子孫は
`hij[0..68] + v2[68..92] + hij[92..97] + v2_tail` という固有パターンを
継承することになる。

本実験の 30000 tick 内では 549 の子孫は特定できなかったが (dense 条件下でも
hij_like は既に 43 体居るため区別が難しい)、**変異パターンを伝播する能力は
原理的に備わっている**。

## ipt = 50 (さらに遅い)

[slower-ipt50.json](configs/hijack/slower-ipt50.json) — ipt=50 で copy が ~18 tick 程度かかる:

```
procs    = 15 (running 12)
hijLike  = 5
v2Like   = 6 (pristine 6)
pristine hij = 1 (元 hijacker)
all-zero = 0
PMEM events = 125
diffsHij 最大値 = 83 (変異個体なし)
```

意外にも ipt=50 では観察された真の変異個体はゼロだった。考えられる理由:

- hijacker の zero-region 走査にも時間がかかる (1024 word × 7〜11 命令 / 50 命令
  ≈ 150 tick/走査) ため、**hijack 自体が発動する機会が大幅に減る**
- 30000 tick では 5 hijLike にしか広がっておらず、そもそも race が起きる密度に
  達しない
- v2 の自己複製自体も同様に遅くなり、初期状態との差が詰まるまでに時間切れ

ipt=100 が「copy 時間 ∈ [5, 9] tick、かつ全体の動態は十分に進行する」という
バランスを引いており、ipt=50 はやや行き過ぎと判断される。

## tick-by-tick の動態 (seed=1 slow)

抜粋:

```
tick | proc(R) | asm | grp | v2px/hjpx | v2fp/hjfp | hyb | junk | zero
    0 |   6( 6) |   5 |   5 |   5/  1 |   5/  1 |   0 |    0 |    0
 1500 |  15(12) |  11 |  11 |  11/  1 |  11/  1 |   0 |    0 |    3
 6000 |  15(13) |  13 |  12 |  11/  1 |  11/  2 |   0 |    0 |    2
12000 |  17(15) |  15 |  14 |  10/  1 |  10/  5 |   0 |    0 |    2
22500 |  19(18) |  18 |  17 |   8/  1 |   8/  9 |   0 |    1 |    1   ← junk 1 (一時的)
30000 |  20(19) |  19 |  18 |   6/  1 |   6/ 13 |   0 |    0 |    1
```

- 自己複製の立ち上がり: t=0 → 1500 で pop 6→15 (速い)
- `pristine hij = 1` が 30000 tick 全期間維持される (元 hijacker の完全生存)
- `junk 1` が t=22500 で一時出現するが 30000 までに消える (恐らく全ゼロ近い個体が
  運良く再 hijack されて標準パターンに戻った)

## 想定イベントとの対応 (再掲と更新)

| 想定イベント | 02 章 (fast ipt) | 本章 (slow ipt=100) |
|------|--------|--------|
| 全 hijacker 子孫が自己複製機能を失う | 発生 | 発生 |
| 全 v2 が hijack される | dense で発生 | dense でも 4 v2 残存 |
| 資源が尽きて v2 自己複製停止 | 発生 | 発生 (dense 条件) |
| **hijacker と v2 両方の機能を持つ個体** | 未発生 | **発生** — proc 549/586/597/292 は `v2 コードをメモリ内に保持したまま hijacker 動作を試みる個体` |
| **両方に由来しない機能の個体** | 未発生 | **未発生** (diffsBoth = 0: novel word は 0 件) |
| hijack / v2 の効率化変異 | 未発生 | 未発生 (変異体はいずれも part-function であり性能改善ではない) |

## 結論

1. **`instructionsPerTick = 100`** (copy に 5〜9 tick) で **変異が発生する**。
   発生機序は主に「copy 途中で target が proximity から drift-out し、
   pmemAddr だけが進行して穴あきパターンになる」 partial-write。
2. dense world + 10 v2 条件で 30000 tick あたり **3 / 43 hijLike (7%)** に真の
   変異が確認された。変異パターンは `hij[0..X] + v2[X..184] + zeros` あるいは
   間欠的な `hij[A..B] + v2[B..C] + hij[C..D] + ...` の interleave 型。
3. 変異体のメモリは完全に **canonical hij か canonical v2 の文字の再配置** で
   構成されており、**novel な word は 1 つも発生していない** (VM が自メモリに
   SW しないため、mutation はコピー元データの "shift / mask" に限定される)。
4. 変異パターンは propagation で継承可能だが、30000 tick では子孫の識別は困難。
5. **副産物: 元 hijacker (pristine) が slow-ipt では 3/3 seed で全期間生存**。
   fast-ipt では即座に子孫に上書きされていたのと対照的。
6. ipt=50 はむしろ動態が遅すぎて変異観察に不向き。ipt=100 が変異発現と
   動態進行のバランス点として妥当。

## 残る問い / 次の検討

### novel word を生むには SW-class 実行が必要

02 章末で議論した通り、**真に "両 canonical にない新命令語を含む proc"** を
得るには、実行中の proc 自体がメモリを書き換える必要がある。現行 hijacker /
v2 はいずれも自メモリ書き込みを一切行わないため、**どれだけ slow ipt でも
novel word は発生しない** という上限は変わらない。

slow ipt で得られた変異は「既存 word の配置換え」にとどまる。新しい命令体系を
創発させるには:

- hijacker 自身に「自メモリに random 1 word を書き込む」仕掛けを入れる (programs 側)
- PMEM 書き込みで `value` を加工するオプションを仕様に入れる (spec 側)

のいずれかが必要。本章はここまで行わない。

### 変異体は自己複製しない (hijacker のまま)

549 のような interleaved 個体は、依然として SCAN → PMEM 経路を回すことは
できる (hij code [0..68] の SCAN 部分は無事)。しかし CSCAN → ASSEMBLE →
DISCONNECT の v2 自己複製経路を発火できる個体は観察されなかった。
**変異が "自己複製能力を獲得" にまでは至らない**。

v2 の自己複製経路の全 word が揃っているのは pristine v2 だけで、変異によって
この経路が復元される確率は極めて低い (必要な word が 184 個、ランダムな
shift でこれが全部正しく配置される確率は事実上 0)。

### 設定ファイル

- [configs/hijack/slow-ipt-baseline.json](configs/hijack/slow-ipt-baseline.json) — seed=1 5v2+1h ipt=100 30k
- [configs/hijack/slow-ipt-seed2.json](configs/hijack/slow-ipt-seed2.json)
- [configs/hijack/slow-ipt-seed3.json](configs/hijack/slow-ipt-seed3.json)
- [configs/hijack/slow-ipt-dense.json](configs/hijack/slow-ipt-dense.json) — 30×30 10v2+1h ipt=100 30k (変異最多)
- [configs/hijack/slower-ipt50.json](configs/hijack/slower-ipt50.json) — ipt=50 (動態停滞)
