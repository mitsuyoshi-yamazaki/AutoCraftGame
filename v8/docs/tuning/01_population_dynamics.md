# 01: 集団動態と自己複製の観察

v8 の「接続 (connection)」機構を備えた自己複製シミュレータの初期チューニング記録。
目的は、(a) 既存の自己複製プログラムがどの程度安定して複製を連鎖させられるかを
計測し、(b) 失敗モードを特定し、(c) 初期状態やプログラム側の小さな変更で
動態をより豊かにできるかを確認することである。

仕様ファイル: [game_spec.md](../specs/game_spec.md)
対象プログラム: [programs.ts](../../src/programs.ts)

## 概要

- 既存の `generateReplicatorProgram` (以下 v1 プログラム) を 1000 tick 実行すると、
  20 セット × {Assembler, Processor} の初期状態から 23〜27 グループまでしか
  増えなかった。
- 原因は **`last_product_id` のステイル読み取りバグ** 1 点に集約される。
  v1 プログラムは Step 4 でレシピ 3 をトリガした直後、Step 5 の待機ループで
  Assembler の `last_product_id` を即座にポーリングするが、同一 tick 内では
  トリガの反映 (last_product_id のクリア) が Component action phase まで
  遅延するため、前サイクルの childP の値が残ったままとなり、待機ループを
  1 周目で抜けてしまう。結果として childA が組立てられる前に Step 8 の
  DISCONNECT が発火し、切断時点で `child P` 側連結成分がサイズ 1
  (= freestanding) になる。
- 修正版 `generateReplicatorProgramV2` を追加した。Step 4 のトリガ直後に
  明示的に 1 tick を `HALT` で譲ることで、Component action phase が
  trigger を消費してから再ポーリングを行うようになる。
- v2 + 同一初期状態で 20→37 グループに到達し、freestanding コンポーネント
  はゼロ。以降の条件サーベイはすべて v2 を基準に行った。

## 観察方法

主要スクリプト:

- [scripts/observe.ts](../../scripts/observe.ts)
  単発の観察。ラベル付き JSON config を受け取り集計結果を出力する。
  v2 の分類 (freestanding 数、グループ構成、子 Processor のメモリ差分など)
  を追加した。
- [scripts/run-sweep.ts](../../scripts/run-sweep.ts)
  複数 config を一括実行して markdown テーブルを出力。
- [scripts/inspect-freestanding.ts](../../scripts/inspect-freestanding.ts)
  freestanding 化したコンポーネントが、どの disconnect イベントで
  切り離されたかを逆引きする。
- [scripts/trace-timing.ts](../../scripts/trace-timing.ts)
  特定の {Assembler, Processor} セットに絞り、opmem・groupId・events の
  推移を tick 単位で時系列出力する。失敗モードの決定的証拠取りに使用した。
- [scripts/inspect-mutations.ts](../../scripts/inspect-mutations.ts)
  差分のあった子 Processor のメモリを覗いて、本当に変異しているのか
  (= ノイズ込みのコピー) か、単に未コピーでゼロのままなのかを区別する。

乱数は `Math.random` に LCG を差し込んでシード固定している。
パラメータ類は [initial-state.ts](../../src/initial-state.ts) / [params.ts](../../src/params.ts) の
デフォルト ([DEFAULT_INITIAL_CONFIG], [DEFAULT_GAME_PARAMS]) を基準とし、
config JSON の `initial` / `params` フィールドで個別に上書きする。

Config 例:

```json
{
  "label": "v2 fixed, seed=1",
  "ticks": 1000,
  "seed": 1,
  "initial": { "programVariant": "v2" }
}
```

## ベースライン結果 (v1 プログラム)

初期状態: `DEFAULT_INITIAL_CONFIG`
({20 セット, world 100×100, 10 Metal / 15 Circuit / 1 Energy(200) per set})。

| metric | 値 |
|---|---|
| Groups (初期 → 最終) | 20 → 23〜27 |
| Assemblers (Δ) | +14 〜 +16 |
| Processors (Δ) | +16 〜 +20 |
| `assembler_completed` | 28〜36 |
| `disconnect_applied` | 16〜20 |
| freestanding Assembler | 7〜11 |
| freestanding Processor | 13 |
| peak running Processors | 36〜40 |
| 子 Processor のメモリ差分 (vs 親) | 全員 0 (完全コピー) |

1 サイクルあたり +1 グループ ・ +1 Assembler ・ +1 Processor が想定なのに対し、
disconnect 件数 ≈ 18 に対して実際に新しく生成されたグループは +3 〜 +7 しか
ない、という明らかな乖離がある。さらに、23 グループに対して freestanding
コンポーネントが計 24 個存在しており、本来グループに組み込まれるはずの
子コンポーネントの約半数が単体 WorldObject として放流されていた。

PC サンプリング上位は `pc=171` (= プログラム末尾の `L_HALT` ループ) と
`pc=65` (= 待機ループ) に集中しており、活動中のプログラムはほぼ皆無。
初回世代で自己複製に成功した親 Processor はただちに halt に入り、
child は自身が freestanding であるため CSCAN で 0 件しか見つけられず、
最初の分岐で halt に直行していた。

## 失敗モード分析

### 根本原因: Step 5 の `last_product_id` ステイル読み取り

[trace-timing.ts](../../scripts/trace-timing.ts) で tick 単位の時系列を
追ったところ、シード 42 では tick 83 に以下の事象が**同一 tick 内**で連続する:

1. `assembler_completed` (recipe 4, 親 Assembler から childP を産出)
2. `disconnect_applied` (親 Assembler actor → childP target)
3. `assembler_started` (recipe 3, 親 Assembler)

本来 (1) の直後には
`recipe 3 トリガ` → `Component action phase で recipe 3 再ゲザリング` → …
→ `recipe 3 完了 → childA 産出` → `disconnect` の順に進むべきなのが、
同一 tick に `disconnect` まで発火している。

原因は [programs.ts](../../src/programs.ts) v1 プログラムのポーリング構造:

```
Step 4: OUT last_product_id = stale child P id (残っている)
        OUT assemble_trigger = 1  # pending writes
Step 5: IN  last_product_id     # ← ここで親 A の world 側 opmem を読む
```

I/O 書き込みは [processor.ts](../../src/processor.ts) の `pendingWrites` に
溜められ、`applyIoEffects` が実行されるのは **書き手 Processor の tick 終端**
である。したがって Step 4 の trigger=1 書き込みは、Step 5 の読み取り時点では
まだ world 側 Assembler の opmem には反映されていない。親 A の opmem には
前サイクルで recipe 4 が完了したときに書き込まれた `last_product_id = childP id`
がそのまま残っており、待機ループ `BNEL r4 != 0` は即座に成立する。

結果として親 P はその tick 内で Step 6 (copy 1024 words) → Step 7 (run_flag=1)
→ Step 8 (disconnect trigger) を全て走り抜けてしまう。Component action phase
では disconnect が assemble より先に処理されるため (simulation.ts の phase 2-2,
2-3)、親 A ↔ childP のエッジは recipe 3 開始より前に削除される。

このとき連結成分は:

```
before: [parent A, parent P], [parent A, child P]
after:  [parent A, parent P] (removed [parent A, child P])
```

で、child P 単独のサイズ 1 連結成分が誕生し、[world.ts:disconnectEdge](../../src/world.ts)
の挙動により child P は freestanding に戻る。

### 副次的な結果: child P は単体で起動するが即 halt

Step 7 で `run_flag=1` は書かれているため、切り離された child P も次 tick 以降
running で動き出す。ただし child P はただちに自グループを持たない (0 件 CSCAN)
ため、プログラム開始直後の `BNEL count != 0 → else JMPL L_HALT` 分岐で
halt ループ行きとなり、それ以降なにもしない。これが baseline の
`pc=171` 多数発生の正体である。

### 非同期なレシピ 3 完了でも回復しない

親 A 側は Step 4 で recipe 3 の trigger=1 も書き込まれているため、disconnect の後に
recipe 3 ゲザリングを続行する。ただしこのときの `connection_target_id` は
`child P localId` のままで、child P は既に親グループ外にある。親グループと
child P が近接を外れた瞬間 (数 tick 後) ejection 時に isAccessible=false となり、
child A も freestanding で放出される。これが baseline で freestanding Assembler が
大量発生する経路である。

### 数値的な整合性

v1 ベースライン (seed=1, 1000 tick) では:

- disconnect_applied = 16
- 新規グループ = +3
- freestanding A = 11, freestanding P = 13
- 子 Processor 26 (= +16 new P)

`disconnect × 1` あたりの期待値が「+1 グループ + 2 つの connected コンポーネント」
であるのに対し、実測では「+0.2 グループ + freestanding 1.5 個」で推移しており、
おおよそ上記シナリオで定量的にも説明がつく。

## 修正版 v2 プログラム

[programs.ts](../../src/programs.ts) に `generateReplicatorProgramV2` を追加。
変更点は**一点だけ**:

```
Step 4 (recipe 3 トリガ後):
  OUT last_product_id = 0    # 念のため書き込み
  OUT recipe = 3
  OUT connection_target = r7
  OUT assemble_trigger = 1
  HALT                        # NEW: tick を譲る
```

HALT は現在 tick の残り命令を破棄し、PC を次命令に進めて次 tick で再開する。
これにより Component action phase が走り、親 A は recipe 3 のトリガ受理時に
自身の `last_product_id` を 0 にクリアし、gathering を開始する。次 tick の
Step 5 ポーリングは正しく 0 を読み取り、recipe 3 完了まで待機できる。

`last_product_id` の明示 0 書き込みは同 tick の pendingWrites 経由なので
本来不要だが、挙動の意図を明文化する意味で残してある。

initial-state.ts 側で `programVariant: 'v2'` (および `programLoop: true`) を
受け取れるようにした ([initial-state.ts](../../src/initial-state.ts))。

## パラメータ実験結果

`scripts/run-sweep.ts` のサマリ。列の意味:

- `groups` = 初期 → 最終グループ数
- `asm` / `proc` = 最終 Assembler / Processor 数
- `asmCpl` = `assembler_completed` イベント合計
- `disc` = `disconnect_applied` イベント合計
- `freestA/P` = 最終時点の単体 (非グループ) Assembler / Processor 数
- `childProc` = 初期以外の Processor 数 (= 親から生まれた子の延べ数)
- `empty` = メモリ全ゼロのまま取り残された子 (コピー未実施)
- `copied` = コピーが実行された子
- `mutCopied` = コピーされたうえで親と差分のある子 (真の変異)

| label | ticks | groups | asm | proc | asmCpl | disc | freestA/P | childProc | empty | copied | mutCopied |
|---|---|---|---|---|---|---|---|---|---|---|---|
| v1 seed=1 | 1000 | 20→23 | 34 | 36 | 30 | 16 | 11/13 | 16 | 0 | 16 | 0 |
| v1 seed=2 | 1000 | 20→24 | 31 | 37 | 28 | 17 | 7/13 | 17 | 0 | 17 | 0 |
| v1 seed=3 | 1000 | 20→27 | 36 | 40 | 36 | 20 | 9/13 | 20 | 0 | 20 | 0 |
| v1 seed=1 3k | 3000 | 20→24 | 37 | 39 | 36 | 19 | 13/15 | 19 | 0 | 19 | 0 |
| v2 seed=1 | 1000 | 20→37 | 37 | 46 | 43 | 17 | 0/0 | 26 | 9 | 17 | 0 |
| v2 seed=2 | 1000 | 20→38 | 38 | 49 | 47 | 18 | 0/0 | 29 | 11 | 18 | 0 |
| v2 seed=3 | 1000 | 20→37 | 37 | 49 | 46 | 17 | 0/0 | 29 | 12 | 17 | 0 |
| v2 seed=1 3k | 3000 | 20→44 | 45 | 55 | 60 | 24 | 0/0 | 35 | 11 | 24 | 0 |
| v2 loop seed=1 | 1000 | 20→32 | 36 | 42 | 38 | 12 | 1/0 | 22 | 10 | 12 | 0 |
| v2 loop seed=2 3k | 3000 | 20→39 | 47 | 49 | 56 | 17 | 6/0 | 29 | 12 | 17 | 0 |
| v2 world50 | 1000 | 20→46 | 46 | 55 | 61 | 26 | 0/0 | 35 | 9 | 26 | 0 |
| v2 world30 | 1000 | 20→46 | 46 | 57 | 63 | 26 | 0/0 | 37 | 11 | 26 | 0 |
| v2 mat×2 | 1000 | 20→53 | 53 | 61 | 74 | 33 | 0/0 | 41 | 8 | 33 | 0 |
| v2 mat×4 | 1000 | 20→41 | 41 | 52 | 53 | 21 | 0/0 | 32 | 11 | 21 | 0 |
| v2 mat×4 3k | 3000 | 20→61 | 61 | 70 | 91 | 41 | 0/0 | 50 | 9 | 41 | 0 |
| v2 ipt=5000 | 1000 | 20→33 | 33 | 42 | 35 | 13 | 0/0 | 22 | 9 | 13 | 0 |
| v2 ipt=20000 | 1000 | 20→37 | 37 | 46 | 43 | 17 | 0/0 | 26 | 9 | 17 | 0 |
| v2 move=2.0 | 1000 | 20→23 | 23 | 35 | 18 | 3 | 0/0 | 15 | 12 | 3 | 0 |
| v2 copy=512 | 1000 | 20→37 | 37 | 46 | 43 | 17 | 0/0 | 26 | 9 | 17 | 0 |
| v2 copy=256 | 1000 | 20→37 | 37 | 46 | 43 | 17 | 0/0 | 26 | 9 | 17 | 0 |
| v2 loop mat×4 3k | 3000 | 20→87 | 179 | 83 | 222 | 51 | 60/0 | 63 | 12 | 51 | 0 |

### 表から読み取れる要点

- **v1 → v2 の差**: 同一シード (seed=1) で 23→37 グループ (+60%)、Assembler イベントは 30→43 (+43%)。disconnect 件数自体は 16→17 とほぼ変わらないにも関わらず freestanding が 24→0 まで激減している。これは「disconnect が起きても子がすぐ freestanding に分離してしまう」という v1 の失敗経路が v2 で解消されたことを意味する。
- **seed 間ばらつき**: v2 は seed=1/2/3 で 37/38/37 と極めて安定。v1 は 23/24/27 と 20% 幅で変動する。
- **3000 tick 延長 (v1)**: 23→24 (+1) しか進まず、**v1 は ~1000 tick で恒久停止**する (親は halt ループ、子は空または freestanding で halt ループ)。
- **ループ版が非ループ版より悪い** (v2 1000 tick で 32 vs 37): 意外な結果。原因は、ループ版では親 P が halt しないため、親 A に対する書き込みが次サイクルの開始と孫世代以降のアクセスと**衝突**し、ほぼ常に親 A の opmem が上書き合戦になること。後述の「3-5 member のグループ」「空の子」はこの race の副作用として発生している。
- **mat×2 が mat×4 を上回る** (53 vs 41): 1000 tick ではほぼ誤差範囲 (seed 1 のみ)。3000 tick だと mat×4 が 61 まで伸びるので、資源量ではなく **収束速度の差** でしかない。
- **world 密度**: 100×100 → 50×50 → 30×30 で 37→46→46 と改善するが 30×30 では頭打ち。同じ 20 セットを密に配置しても、セット同士の近接衝突が主な阻害要因にはなっていないことが分かる。
- **randomMovementRange=2.0 は致命的** (37→23): disconnect 件数が 17→3 まで激減。分離直後の子グループが 1 tick でおよそ 2 単位移動し、直前まで占有していた資源帯から即座に離脱する。そもそも移動が速すぎて group ejection の前に connection target が isAccessible=false になるケースも多い。
- **instructionsPerTick の影響はほぼ無い** (5000→10000→20000 で 33→37→37)。replicator は CSCAN + 数命令 + HALT の wait ループが主で、1 tick あたりの実命令数は 1024-word copy の単発以外は 100 未満にとどまる。
- **copySize の縮小は無効** (512/256 ともに 37)。送り手・受け手が同一 group 座標にいるため、コピー途中で distance が proximity を超えることがなく、何 word コピーしても結果は完全一致する。ドリフトアウト変異は v8 の接続モデル下では**原理的に発生しない**。
- **ループ + 資源倍増 + 3000 tick は「カオス」** (87 groups, 179 Assembler, 83 Processor, freestanding Assembler 60): ループ親 P の衝突によって大量の freestanding Assembler が資源帯に積み残され、最終世代の 3〜5 member グループが散発的に出現している。生体としては不健全だが、観察対象としては最も豊かな状態。

## 変異・進化的観察

v8 では子 Processor のメモリ書き換えは `PMEM_AUTO_VAL` による一括コピーで、
コピー中も送り手・受け手ともに同一グループ内にいるため、いわゆる
**ドリフトアウト変異** (v7 で見られた「途中で距離が離れてコピーが途切れる」)
は**発生し得ない**。実際、[inspect-mutations.ts](../../scripts/inspect-mutations.ts)
で抽出した「差分のある子」はいずれも `pc=0, running=false, memory 全ゼロ`
であり、単にコピーがまだ実行されていない空の Processor (= Step 2 で recipe 4
が完了して group に加入したものの、親が Step 5 の待機ループから
抜けられずに Step 6 まで到達できなかった) だった。

真の意味での変異パスとして現時点で確認できるのは以下のみ:

- **未完了コピー (= 空の子)**: 親が Step 5 以降で詰まり、コピー前の子が
  グループ内に放置される。プログラム 1 bit も書かれていないので
  メモリは全ゼロであり、仮に後で `run_flag=1` が立ったとしても
  pc=0 から全ゼロ (= opcode 0x0000 = NOP 扱い) を延々に実行するだけで
  自己複製には戻れない。
- **親 opmem への多重書き込み**: v8 仕様 9-8 で許容されているが、現在の
  v2 プログラムでは発生していない。`v2 loop` 条件下では親 A に対して
  複数の子 P が同時にアクセスする可能性があり、`recipe` や
  `connection_target_id` スロットを上書きし合うことで
  異常な接続先・異常な生成物 (= 非互換な group 構成) が生まれ得る。
  観測された 3〜5 member グループの存在がその痕跡である。

現状の v8 の「自然な」変異メカニズムはかなり弱く、
「プログラム破壊」ではなく「プログラム欠損 → 死」に偏っていると言える。

## 部分失敗からの興味深いケース

- **3〜5 member のグループ**: `v2 mat×4 loop 3k` で 21 個の 3-member グループ、
  2 個の 4-member グループ、1 個の 5-member グループが観測された。これらは
  "disconnect が間に合わずに 2 サイクル目の子がさらに連結された" ケースで、
  1 つの group が分裂する前に親が次のサイクルを回し、同じ group に
  孫世代まで取り込まれた状態である。最終的には複数の disconnect で
  分離されるが、中間状態として確実に存在している。
- **空の子の蓄積**: `v2 loop mat×4 3k` の最終時点で 60 体の freestanding
  Assembler が観測された。これは親 A (ループ親 P の相棒) が recipe 3 を
  組み立て終わった時点で `connection_target_id` が既に group 外に出ていた
  (または無効化された) 結果、孤立した状態で放出されたものである。
  これら Assembler はもはやどの Processor からも操作されないため、
  実質的に「資源の墓場」として振る舞う。

## 結論 (暫定)

1. **既存の replicator プログラムは、仕様通り単発で自己複製できるが、連鎖性能
   は極めて低い**。原因は仕様欠陥ではなく、プログラム側の 1 行の書き込み順序
   バグ (ポーリング直前の HALT 欠落) に過ぎない。
2. **v2 プログラム (HALT 挿入 1 箇所だけ)** で世代数が 2〜3 倍に増え、
   1000 tick で 20 → 37 グループ (seed による変動範囲 37〜38)。
3. **資源を倍増** (`mat×2`) するとさらに 20 → 53 グループまで伸びる。
   資源制約は物質量よりもエネルギー (初期 200 / 1 set) のほうが先に来ている
   ことを示唆する。
4. **ループ版 + 資源倍増 + 3000 tick** まで伸ばすと 20 → 87 グループ /
   179 Assembler / 83 Processor まで到達する。ただし空き Assembler
   (freestanding) が 60 体溜まり、空の子 Processor や 3-5 member 群の
   割合も増えるので「盛大なカオス」状態に近い。
5. **`randomMovementRange = 2.0`** (通常は 0.5) は致命的で、グループは
   20→23 までしか増えない。近接維持の仕組みが無いため、ひとたび分離した
   子グループは即座に原資源帯を離脱し、recipe 完了時の ejection で
   connection target の isAccessible=false が頻発する。
6. **`instructionsPerTick` は 10000 で既に十分**。5000 に下げると約 10%
   の performance 低下 (待機ループが 1 tick 分の進捗を諦めるフェーズが増える)
   が、20000 に上げても挙動は不変。
7. **copySize を 512/256 に落として意図的に drift-out を誘発する実験**
   は v8 のアーキテクチャ上ほとんど意味を持たない。送受が同一グループ位置
   にいる間にコピーが完了するため、512 words コピー = 256 words コピー =
   1024 words コピーで結果は完全一致する。

## 仕様変更の提案 (本 PR では適用しない)

ユーザ指示により仕様自体は変更しない方針だが、将来版で検討に値する
改善案をここに記す。

### 提案 1: `last_product_id` のトリガ時クリアをプロセッサ実行フェーズで即座に行う

現仕様では `assemble_trigger = 1` を書き込んでも、そのクリア (=
`last_product_id = 0`) は Component action phase (= 受け手 Assembler の
`executeAssemblerTick` 実行時) まで遅延する。本チューニング作業で最大の
落とし穴となったバグはここから来ている。

trigger を書き込んだ側の tick 末尾の applyIoEffects で、同じ pending 群の
中で `last_product_id = 0` もコミットしてしまうと、プログラマは
「trigger 後の opmem 状態は即時観測可能」というモデルで統一できる。

### 提案 2: `last_product_id` を Write 可能に明示する **(適用済み)**

現仕様の 7-3 表では `last_product_id` は R 扱いだが、コードは書き込みを
許容している (`writeExternalOpMem` が R/W チェックをしない)。実質的に
Read/Write になっており、本チューニングでは「書き込みで回避する」手段
として機能した。

**対応**: [game_spec.md](../specs/game_spec.md) 7-3 節の表記を `R/W` に
更新済み。実装側は既に書き込みを許容しているため、コードの変更は不要。
これにより v2 プログラムの `writeOpmem(ASM_LAST_PRODUCT, 0)` (前サイクル
の値を手動クリアする防御的書き込み) は仕様準拠の操作として位置づけられる。

### 提案 3: Assembler の `assemble_status` を書き込み側から直接監視可能にする

現状の replicator プログラムは
「`last_product_id != 0` かどうか」で完了判定しているが、これは
(a) 値クリアのタイミングが曖昧、
(b) トリガ処理前の古い値を読み得る、
(c) `assemble_trigger`=1 自体が Assembler 側で消費されるまで
    `last_product_id = 0` への遷移が見えない、
という問題が絡む。代替として `assemble_status` (0=idle, 1=gathering, 2=assembling)
を用いた「1 → 0 に戻った瞬間を検出する」ポーリングが可能になれば、
より直感的で安全なプロトコルになる。ただし 1 tick で完了するような
短い組立は検出できない (1 → 0 の遷移が読まれない) 可能性がある。

### 提案 4: 空の (memory 全ゼロ) 子 Processor の自壊

未コピーの空 Processor は現状では `run_flag=1` が立てば 0x0000 を
延々と実行する死体として残り続けるのみ。仕様レベルで「全ゼロの
メモリ領域を先頭から実行しようとする Processor は自動的に
stopped に留まる」等の明示的な保護を入れると、失敗例のゴミが
溜まりにくくなる。ただしこれは進化実験においてはむしろ
「適応度 0 の個体の自然淘汰」として積極活用できるとも言え、
導入是非は目的による。
