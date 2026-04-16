# 02: Hijacker introduction — propagation と変異の観察

v8 の自己複製群へ「他 Processor を上書きする」hijacker を 1 体だけ混入し、
- 集団動態への影響
- hijacker 系統の最終的な広がり
- システムの変異挙動

を観察する。

仕様ファイル: [game_spec.md](../specs/game_spec.md)
プログラム: [programs.ts](../../src/programs.ts) (`generateHijackerProgram`)
初期状態: [initial-state.ts](../../src/initial-state.ts) (`hijackerCount`, `hijackerOptions`)
観察スクリプト: [scripts/observe-hijack.ts](../../scripts/observe-hijack.ts)
インスペクタ: [scripts/inspect-hij-mem.ts](../../scripts/inspect-hij-mem.ts)

## 設計

### Hijacker プログラム ([generateHijackerProgram](../../src/programs.ts))

スタンドアロンの Processor。**Assembler は持たず、自身は自己複製しない**。
動作:

```
0. Initial cooldown: HALT × initialCooldown ticks (デフォルト 100)
1. main loop:
   a. SCAN filter=2 (Processor only) を即時実行
   b. count = 0 → HALT 1 tick → goto a
   c. closest target localId を取得 (r3)
   d. 自身のメモリ [0..1024) で「最も大きい連続 0 領域」を線形走査して特定
      → [best_start, best_start+best_len) を skip 範囲とする
   e. 自身のメモリのうち skip 範囲を除く部分を、target 側のアドレス 0 から
      連続書き込み (PMEM_AUTO_VAL)
   f. Post-hijack cooldown: HALT × postHijackCooldown ticks (デフォルト 50)
   g. goto a
```

設計上の特徴:
- target の `run_flag` を 0 にしない/PC をリセットしない → コピーは「動いている
  Processor の memory を上書きする」
- 「最も大きい連続 0 領域」は hijack 直前に毎回再計算される (自身が変異で
  書き換わった場合、変異が次世代に伝播する経路を残すため)
- 1 SCAN ヒット = 1 hijack (closest 1 体のみ)
- 同グループ内 (CONNECTION_SCAN) は対象外 — 外部 SCAN のみ
- hijacker 系統判定はタグなし。`generateReplicatorProgramV2` (= 変異不可) からの
  乖離 = 「hijacker 由来 もしくは 変異」 として識別する
- プログラム長: 97 word (v2 = 184 word に対し短い)

### 初期状態

- world: 50 × 50
- numSets (v2 ペア): 5
- 資源: metal 20 / circuit 30 / energy 400 (per set)
- hijackerCount: 1 (スタンドアロン Processor を world 内ランダム位置に追加、`run_flag = 1`)

### 観察スクリプト ([observe-hijack.ts](../../scripts/observe-hijack.ts))

- 各 tick 内で **Processor 個別の tick 実行直前にメモリを snapshot**、直後に diff を
  取って `(actor → target)` の hijack 帰属を記録 (`simulation.executeTick` を
  当該機能付きで再実装)
- 以下を分類:
  - `pristineV2` / `pristineHij` — canonical 完全一致
  - `v2Like` — `LI r2, 0x0124 (CSCAN_TRIGGER)` と `LI r2, 0x0125 (CSCAN_FILTER)` の
    両 LI immediate がメモリ内に存在する
  - `hijLike` — `LI r2, 0x0101 (SCAN_TRIGGER)` と `LI r2, 0x0102 (SCAN_FILTER)` の
    両 LI immediate が存在する
  - `hybrid` — 両 fingerprint が同時に存在
  - `junk` / `all-zero`
- diffs vs canonical: hijLike なら canonical hijacker と、v2Like なら canonical v2 と
  ワード単位で比較

## ベースライン結果

5 v2 + 1 hij、10000 tick、3 シード ([baseline-seed1.json](configs/hijack/baseline-seed1.json) 等):

| label                 | seed | proc(R) | hijLike | v2Like | pristineV2 | pristineHij | all-zero | hijackEv | uniqueActors |
|-----------------------|------|---------|---------|--------|-----------:|------------:|---------:|---------:|-------------:|
| baseline              | 1    | 22 (18) | 9       | 9      | 9          | 0           | 4        | 22       | 14           |
| baseline              | 2    | 19 (17) | 8       | 9      | 9          | 0           | 2        | 19       | 13           |
| baseline              | 3    | 17 (16) | 13      | 3      | 3          | 0           | 1        | 21       | 13           |

事象数 (seed=1): assembler_completed = 28、disconnect_applied = 12。
v2 ペア 5 体は単独で複製を続け、ベースラインの v2 5 セット 10000 tick
([01_population_dynamics.md](01_population_dynamics.md) の `v2 mat×4` に類似する条件) での
グループ +N と概ね釣り合う。

## 派生条件

| label                  | ticks | proc(R) | hijLike | v2Like | hijackEv | 備考 |
|------------------------|-------|---------|---------|--------|---------:|------|
| 5+1 cooldown 50/20     | 10k   | 22 (18) | 9       | 9      | 22       | seed=1 で baseline と完全一致 |
| 5+1 cooldown 200/100   | 10k   | 22 (18) | 9       | 9      | 22       | 同上 |
| 5+1 dense world 30×30  | 10k   | 18 (16) | 16      | 0      | 24       | takeover 完了 (v2 全滅) |
| 10+1 (mat 倍)          | 10k   | 42 (38) | 32      | 6      | 55       | hij 比率増加 |
| 10+1 dense 30×30       | 10k   | 41 (38) | 38      | 0      | 59       | 完全 takeover |
| 10+1 30k tick          | 30k   | 43 (38) | 38      | 0      | 61       | t≈13500 で完全 takeover |
| 5+3 (3 hij 同時投入)   | 10k   | 13 (8)  | 8       | 0      | 11       | 集団崩壊、自己複製 5 件のみ |

### 表から読み取れる要点

#### Cooldown 値はほぼ無関係

`postHijackCooldown` を 20/50/100 と振っても、結果のすべてのカウントが同一になる
(seed=1 で完全一致)。

ボトルネックは **cooldown 中の HALT 時間ではなく「target が proximity に入るまでの
待ち時間」** である。world 50×50 に 5 ペアが分散配置された状態では、SCAN 結果が
0 件のまま数百〜数千 tick 待つことが多く、cooldown 中の数十 tick HALT は
誤差にしかならない。

#### Density と initial pop が支配的

- world を 50→30 に絞ると hijLike 比率が 9/22→16/18 (≒41%→89%) に跳ねる
- 5 v2 → 10 v2 にすると hijack 件数がほぼ倍になる (22→55)
- 30k tick / 10 v2 で **t≈13500 に完全 takeover** (38/38 hijLike, v2 0)
- それ以降 t=30000 まで pop も hij 数も完全に変化なし → **明確な fixed point**

#### 多 hijacker は集団崩壊

5 v2 + **3 hij** の構成では、hijacker 同士が短時間で v2 群を hij 化してしまうため
v2 の自己複製が立ち上がる前に「assembler を駆動できる proc がほぼ消える」。
最終 pop = 13、self-replication 件数 = 5 のみ、disconnect = 0。資源を残したまま
無生産化する。1 hijacker のほうが「hij 系統が広がるまで v2 が複製を継続して
キャンバスを大きくしてくれる」ので、結果的に hijLike 数は多くなる。

## 変異の観察

**結果**: 観測した全条件で「真の変異」(canonical hijacker または canonical v2 から
構造的に意味ある乖離をした個体) は **0 件**。

[scripts/inspect-hij-mem.ts](../../scripts/inspect-hij-mem.ts) で hijLike 個体の生メモリを
確認すると、すべてのケースで以下のいずれかの 2 パターンしか観測されない:

1. **clean hijacker** — `memory[0..97] = canonical hij_code`, `memory[97..1024] = 0`
   - 主に **元 hijacker 自身**、または「clean な hij が直接 v2 を hijack してから
     一度も再 hijack されていない世代」
2. **hij + v2_tail** — `memory[0..97] = canonical hij_code`,
   `memory[97..184] = v2 の中盤コード`, `memory[184..1024] = 0`
   - 「v2 が hijack された結果、v2 の[97..184] の残骸が末尾に残っている」状態
   - hij_code 部分は完全に canonical と一致 (diff = 0)、
     v2_tail 部分の 87 word のうち 83 word が非 0 (= canonical hij との diff = 83)

ベースライン seed=1 の 9 hijLike procs はすべて **diffsHij = 83 (中央値・最大値・
最小値ともに 83)**、30k tick / 10 v2 / 38 hijLike も全員 diffsHij = 83 で同一。

### なぜ変異が発生しないか

実装と仕様を順に追うと、原理的に変異が発生し得るパスが極めて狭いことが分かる:

1. **書き込みは tick 内 atomic**
   `executeProcessorTick` の最後で `applyIoEffects` が pending writes をまとめて
   反映する。1 tick = 10000 命令 で hijacker の 184 word PMEM 書き込みは余裕で
   完了するため、書き込み途中で停止することがない。

2. **同一 tick 内で複数 hijacker が同一 target を上書きしても、結果は最後の
   writer の値になる**
   `processors.sort((a, b) => a.id - b.id)` で順次実行され、各 proc の `applyIoEffects`
   が中間で都度コミットされる。同じアドレスに 2 度書かれた場合は単に「後勝ち」
   となり、両者の混合体は生まれない。

3. **target が hijack されてもその tick で実行中のコードは変化しない**
   target の tick は hijacker の tick の **後** に走るため、target は新しいメモリで
   実行を開始する。つまり「コピー途中の中途半端な状態を target 自身が見る」
   ことはない。

4. **hijacker / v2 ともに自己メモリへの SW 命令を含まない**
   PMEM/OPMEM 書き込み (= I/O) しか行わないため、コードが I/O 経由で
   target に書かれることはあっても、自分自身のメモリは絶対に書き換わらない。
   PC が `memory[97..184]` (v2_tail) に流入して v2 命令を実行しても、その v2
   命令もすべて I/O 系 (LI / OUT / LW / IN / 分岐) なので自メモリは無傷。

5. **propagation pattern が固定不動点になる**
   - clean hij が v2 を hijack → target = hij + v2_tail
   - hij + v2_tail が任意 proc を hijack → target = hij + v2_tail (同一)
   - hij + v2_tail が clean hij を hijack → target = hij + v2_tail (元の clean は失われる)
   一度 v2_tail 付きが現れると、以降は何度上書きしても hij + v2_tail に
   収束する。canonical は 2 種類しか存在しない。

仕様上で許容されている書き込み競合 (9-8 節) は実際には起きるが、**同一アドレスへの
重複書き込み** にとどまるため変異を生まない。仕様上の "hijack を安全に実施しない"
要件は満たしているが、結果として現れる「不安全さ」は

- 動いている target の PC が新コードのどこに着地するかが不定
- target が hijack 後 v2_tail を経由して hij_code 先頭に至るまでに任意の命令を
  実行する

という時間軸の不確定性に閉じ込められており、**メモリ内容そのものの不確定性
(= 真の遺伝子変異)** は発生しない。

## 完全 takeover 後の挙動

10v2+1hij 30k tick で完全 takeover が完了した t≈13500 以降の tick:

```
13500..30000: proc=43, asm=37, group=37, hijLike=38, v2=0 (一定)
```

- 全 proc が hij_code を実行 → 全員が SCAN→PMEM_WRITE→cooldown を回し続ける
- 既存の hijLike 同士の上書きは「同じ memory を書き直す」ので変化なし
- assembler は 37 体存在するが、駆動する proc がいない (= recipe を設定する
  CSCAN 駆動コードを持つ proc が存在しない) ため `assemble_started` は
  takeover 以後ゼロ
- 5 体の all-zero proc は所属グループに固定で残り、永遠に NOP を実行
- 非グループ材料/エネルギーは消費されず random walk のみ

つまり **「すべての生物が同じ相手探しをやり続けるが何も生まれない」 死んだ
生態系** に陥る。

## 想定イベントとの対応

最初に想定した「観察対象イベント」 (issue で挙げたもの) との対応:

| 想定 | 観測結果 |
|------|----------|
| 全ての hijacker 子孫が自己複製機能を失う | **発生**: 全 hijacker (元含む) は v2 由来の Assembler 駆動コードを失っており、Assembler を operate する子孫は最初から存在しない |
| 全ての v2 個体が hijack される | **条件次第で発生**: 30×30 dense world または 10v2/30k tick で完全 takeover |
| 資源が使い切られて v2 の自己複製ができなくなる | **発生**: takeover 完了後、Assembler 駆動が止まり資源は残るがそもそも消費されない (= 別の理由で停止) |
| hijacker と v2 両方の機能を持つ個体の出現 | **未観測**: 上述の通り原理的に発生しない経路 |
| 両方に由来しない機能の出現 | **未観測** (同上) |
| hijack または v2 の効率化変異 | **未観測** (同上) |

## 結論

1. **hijacker の伝播機構は機械的に安定**: 1 体が世代数百を作り、世界の半数〜全数を
   takeover する。cooldown は 50/100/200 すべてで挙動が同じ (proximity 待ち時間が
   支配的)。
2. **変異は発生しない**: 自己複製と hijack の双方が「自メモリへの SW 命令を一切
   含まない I/O ベースの操作」で構成されているため、メモリ内容が確率的に
   揺らぐ余地が無い。tick atomic な書き込みと processor 順次実行が
   「書き込み途中の状態が観測される」可能性も封じている。
3. **観測される多様性は 2 種類だけ**: clean hijacker と hij+v2_tail。後者が
   propagation の不動点となり、最終的にすべての hij_like proc がこの形に収束する。
4. **takeover 後は完全停止**: 全員が hijacker になると Assembler を駆動する個体が
   いなくなり、世界は random walk のみが残る「動いているが何も起きない」状態に
   入る。
5. **想定イベントのうち発生したのは「自己複製機能の喪失」「v2 の絶滅」「v2 自己複製の停止」
   の 3 つ。変異由来のイベントはいずれも未観測**。

## 次の分析候補 (本 PR では実施しない)

変異が発生する経路を作るためには、以下のいずれかが必要と推察される:

### A. 自己メモリ書き換えを許す機構の追加 (仕様変更)
SW/SWL/PUSH/POP は既に v8 の VM に存在するが、現行の hijacker / v2 は
これを使っていない。意図的に 「自分のメモリの一部を破壊する」 動作を
含むプログラム (例: hijack 時に `mem[random_addr] = random_val` を 1 word 仕込む)
を導入すると変異点が生まれる。プリミティブの追加は不要、プログラム側の
工夫で実現可能。

### B. PMEM 書き込みを sub-word 化、または部分的に失敗させる仕様変更
書き込みを 1 tick で完了させず、`copy_words_per_tick` のような上限を導入して
複数 tick に分割すれば、書き込み中に「他の hijacker が同じ proc を上書き」
する race が発生し、結果メモリは時系列で interleave された hybrid になる。
これは仕様変更が必要。

### C. PMEM 書き込みを **target の現在の PC 周辺に対して** 行う (仕様変更)
現状はアドレス 0 から書く決め打ちだが、target の PC を読んでその辺りに
書く protocol を導入すれば、target の現実行コードを直接置き換える/混ぜる
ことができる。これは「target 内部メモリ可読 (= PC を取れる)」を要する。

### D. 短い hijacker / 長い hijacker を混ぜて propagation を多様化
hijacker の長さが v2 と一致しない (97 vs 184) ことで `hij + v2_tail` という
特定の不動点ができている。複数長の hijacker を世代別に混ぜると propagation
の組み合わせが指数的に増え、機械的多様性は得られる (が、真の意味での変異
ではない)。

### E. 完全 takeover 後を「Assembler/材料を再投入する」介入で観察する
takeover 後の生態系は完全停止する。介入で v2 を再投入すると、hijacker は
新規 v2 を見つけ次第 hij 化するため、再び (hij + v2_tail) 状態が広がるだけと
推測されるが、もし「hijacker が長期間 idle する間に何らかの変異が積み上がる」
ような効果があるかは未検証。

## 設定ファイル

- [configs/hijack/baseline-seed1.json](configs/hijack/baseline-seed1.json) — ベースライン (5v2+1h, 10k tick)
- [configs/hijack/baseline-seed2.json](configs/hijack/baseline-seed2.json) / [baseline-seed3.json](configs/hijack/baseline-seed3.json)
- [configs/hijack/cooldown-short.json](configs/hijack/cooldown-short.json) / [cooldown-long.json](configs/hijack/cooldown-long.json)
- [configs/hijack/dense-world.json](configs/hijack/dense-world.json) — 30×30 small world
- [configs/hijack/dense-many.json](configs/hijack/dense-many.json) — 30×30 + 10 v2
- [configs/hijack/v2-many.json](configs/hijack/v2-many.json) — 50×50 + 10 v2
- [configs/hijack/v2-many-30k.json](configs/hijack/v2-many-30k.json) — 30k tick 完全 takeover 観察
- [configs/hijack/many-hijackers.json](configs/hijack/many-hijackers.json) — 3 hijacker (集団崩壊)
