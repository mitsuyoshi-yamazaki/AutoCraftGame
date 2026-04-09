# M5: 有性生殖 (Sexual Reproduction) 実装計画

## 目標

[ロードマップ M5](../../../v4/docs/plan/program_robustness_roadmap.md#マイルストーン5-集団遺伝学的動態-案e-有性生殖) の達成。

2 親のメモリを混合 (crossover) して子を作る機構を導入する。これにより:
- 1親の致死的破損が他親により遮蔽される (劣性致死変異の遮蔽)
- 異なる進化系統の遺伝子が組み合わさる
- 集団内の遺伝的多様性が維持される

達成基準: **2 親から作られた子が、両親のメモリ領域を引き継いで動作する**。

## 設計方針

### 基本フロー

```
親A (caller)
  ├─ ASSEMBLE で子コンポーネントを作る (既存)
  ├─ SENSE で親B を発見し、ローカルID を取得 (既存機構を流用)
  └─ CROSS_WRITE: 親A自身のメモリ + 親B のメモリを子にコピー (新規)
```

caller 側のキャラクター (親A) が能動的に親Bを選んでメモリ統合を行う。親B は受動的（同意不要）。これは生物の有性生殖とは厳密には異なるが、ゲームメカニクスとしては最もシンプルで実装可能。

### Crossover スキーム

複数の選択肢を検討:

| スキーム | 説明 | 評価 |
|---------|------|------|
| **A. 固定ブロック交互** | block_size word ごとに交互に親A/親B | シンプル、決定論的 |
| B. ランダム切替点 | LCG で交差点を決定 | 現状のparameter evolutionと整合するが乱数源が問題 |
| C. 1ワードずつ交互 | 細かすぎ、関数境界で分割される可能性 | 不採用 |
| D. プログラム指定 | プログラムが crossover パターンを指定 | 表現力大だが API 複雑 |

採用: **方式A (固定ブロック交互)**。block_size = 64 word (パラメータ化可能)。

```
親Aメモリ:  [aaaa aaaa aaaa aaaa ...]
親Bメモリ:  [bbbb bbbb bbbb bbbb ...]
                ↓
子メモリ:    [aaaa bbbb aaaa bbbb ...]
            ←64→ ←64→ ←64→ ←64→
```

### API 設計

新組み込み関数:
```c
void cross_write(int target_local_id, int parent2_local_id,
                 int src_addr, int dst_addr, int length);
```

- `target_local_id`: 子 (assemble で得たローカルID)
- `parent2_local_id`: もう一方の親 (sense+register で得たローカルID)
- `src_addr`: 自身 (親A) メモリの開始アドレス。親Bも同じアドレスから読む
- `dst_addr`: 子メモリの書き込み開始アドレス
- `length`: コピー長

引数を 5 個に抑えるため、block_size はゲームパラメータで固定 (`crossWriteBlockSize`)。プログラムからは指定できない。

実装では、各 word `i ∈ [0, length)` について:
- `block = i / block_size`
- `block` が偶数なら親Aから、奇数なら親Bから読み込み
- 子の `dst_addr + i` に書き込み (アドレスはラップ)

### エネルギーコスト

通常の `write_memory` と同等 + α:
- `params.energyCosts['CROSS_WRITE']` (基本コスト)
- `length × params.crossWriteCostPerWord` (ワード単価)

`crossWriteCostPerWord >= writeCostPerWord` （現状 0）。M5 投入時に決める。

### 距離・前提条件

- 親A と 子 が `interactRange` 内 (既存の WRITE と同じ)
- 親A と 親B が `interactRange` 内 (新規)
- 親B が active or inactive のいずれでも可 (生死問わず、メモリが取れれば良い)
- 親A は Processor 必須 (既存の WRITE と同じ)

### 子コンポーネント構成

ASSEMBLE は既存のまま（親Aが指定）。子のコンポーネント構成は親A が単独で決める。M5 で混合されるのはメモリ内容のみ。

これは設計上の妥協:
- 「コンポーネント構成も混合」は複雑度が高い (どの順番で混ぜるか、合計は何個か等)
- メモリ内容の混合だけでも進化的にはほぼ等価 (プログラムが構成情報を持っているため、結果的にコンポーネント選択も変異する)

### 既存メカニズムとの共存

- `write_memory` (1親) は既存のまま動作
- `cross_write` (2親) は新規追加
- 既存プログラムは何も変更しなくても動く (cross_write を呼ばなければ何も変わらない)

## 実装詳細

### 修正: v5/src/io.ts

新 I/O アドレス:
```typescript
const PRC0_PARENT2 = 0x5006;  // 第2親の local_id (CROSS_WRITE 用)
```

`WriteReservation` を拡張せず、新しい `CrossWriteReservation` を追加:
```typescript
export interface CrossWriteReservation {
  readonly op: 'CROSS_WRITE';
  readonly slotIndex: number;
  readonly targetLocalId: number;
  readonly parent2LocalId: number;
  readonly srcAddr: number;
  readonly dstAddr: number;
  readonly length: number;
}

export type ActionReservation =
  | ... (既存) ...
  | CrossWriteReservation;
```

`handleProcessorCommand` に `cmd=2` ケース追加 (既存の cmd=1 が WRITE):
```typescript
case 2: { // CROSS_WRITE
  const targetLocalId = data[2] ?? 0;
  const srcAddr = data[3] ?? 0;
  const dstAddr = data[4] ?? 0;
  const length = data[5] ?? 0;
  const parent2LocalId = data[6] ?? 0;
  reservationMap.set(key, {
    op: 'CROSS_WRITE',
    slotIndex: index, targetLocalId, parent2LocalId,
    srcAddr, dstAddr, length,
  });
  // Clear buffer
  for (let i = 2; i <= 6; i++) slotData[i] = 0;
  break;
}
```

### 修正: v5/src/actions.ts

新 `executeCrossWrite` 関数 (executeWrite と類似):

```typescript
function executeCrossWrite(
  world: World,
  character: Character,    // 親A (caller)
  reservation: CrossWriteReservation,
  localIdTable: Map<number, string>,
): InnerResult {
  if (!hasComponent(character, 'Processor')) {
    return { ..., reason: 'MISSING_COMPONENT' };
  }

  // 子の解決
  const targetSysId = resolveLocalId(reservation.targetLocalId, localIdTable);
  if (!targetSysId) return { ..., reason: 'INVALID_TARGET' };
  const target = getCharacter(world, targetSysId);
  if (!target) return { ..., reason: 'TARGET_NOT_FOUND' };
  if (distance(character.position, target.position) > params.interactRange) {
    return { ..., reason: 'OUT_OF_RANGE' };
  }
  if (!target.components.includes('MemoryCore')) {
    return { ..., reason: 'INVALID_TARGET' };
  }

  // 親B の解決
  const parent2SysId = resolveLocalId(reservation.parent2LocalId, localIdTable);
  if (!parent2SysId) return { ..., reason: 'INVALID_TARGET' };
  const parent2 = getCharacter(world, parent2SysId);
  if (!parent2) return { ..., reason: 'TARGET_NOT_FOUND' };
  if (distance(character.position, parent2.position) > params.interactRange) {
    return { ..., reason: 'OUT_OF_RANGE' };
  }

  // メモリ統合
  const srcA = character.vm.memory;
  const srcB = parent2.vm.memory;
  const dstMem = [...target.vm.memory];
  const blockSize = params.crossWriteBlockSize;

  for (let i = 0; i < reservation.length; i++) {
    const block = Math.floor(i / blockSize);
    const useA = (block % 2 === 0);
    const src = useA ? srcA : srcB;
    const srcSize = src.length;
    const srcAddr = ((reservation.srcAddr + i) % srcSize + srcSize) % srcSize;
    const dstAddr = ((reservation.dstAddr + i) % dstMem.length + dstMem.length) % dstMem.length;
    dstMem[dstAddr] = src[srcAddr];
  }

  return {
    world: updateCharacter(world, { ...target, vm: { ...target.vm, memory: dstMem } }),
    success: true,
    events: [],
  };
}
```

`getActionEnergyCostForReservation` に `CROSS_WRITE` ケース追加。
`executeReservations` の switch に新ケース追加。

### 修正: v5/src/types.ts

```typescript
export type ActionOp =
  | ... (既存) ...
  | 'CROSS_WRITE';
```

### 修正: v5/src/vm/compiler/builtins.ts

```typescript
{ name: 'cross_write', argCount: 5, returnsValue: false,
  emit: () => ({ lines: [
    ...popOut(PRC0_TARGET),    // target_local_id
    ...popOut(PRC0_PARENT2),   // parent2_local_id
    ...popOut(PRC0_SRC),       // src_addr
    ...popOut(PRC0_DST),       // dst_addr
    ...popOut(PRC0_LEN),       // length
    ...constOut(PRC0_CMD, 2),  // cmd = 2 (CROSS_WRITE)
  ], pops: 5 })
},
```

### 修正: v5/src/params.ts

```typescript
export interface GameParams {
  // ... 既存 ...
  readonly crossWriteBlockSize: number;
  readonly crossWriteCostPerWord: number;
  readonly energyCosts: {
    // ... 既存 ...
    readonly CROSS_WRITE: number;
  };
}

export const DEFAULT_GAME_PARAMS: GameParams = {
  // ... 既存 ...
  crossWriteBlockSize: 64,
  crossWriteCostPerWord: 0,  // M5 投入時は無料、後でチューニング
  energyCosts: {
    // ... 既存 ...
    CROSS_WRITE: 20,  // WRITE の倍 (両親のメモリを読むため)
  },
};
```

### 新規プログラム: v5/programs/sexual_pioneer.c

既存 pioneer.c をベースに、`do_replicate` を以下のように変更:

```c
void do_replicate(void) {
    // Phase 5: assemble + find partner + cross_write
    if (energy < ENERGY_ASSEMBLE) { do_recharge(); return; }

    // Find a nearby active character (potential mate)
    int n = sense(FILTER_ACTIVE_CHAR);
    if (n == 0) { do_wander(); return; }
    sense_select(0);
    if (sense_distance() > 2) { move(sense_angle()); return; }

    int parent2 = sense_register();

    // Assemble child
    child_id = assemble(2, 1, 1, 1, 1, 1);
    cross_write(child_id, parent2, 0, 0, COPY_SIZE);
    halt();  // next tick: activate
}
```

これは pioneer.c とは別ファイル `sexual_pioneer.c` として配置し、デモ用の新種族として登録する。pioneer.c は無性生殖のままにする。

これにより:
- 既存 pioneer は影響を受けない (回帰なし)
- sexual_pioneer は M5 のデモ
- ゲームに両種族を配置すれば、有性生殖と無性生殖の競争を観察できる

### 仕様書更新: v5/docs/specs/vm/c_compiler_spec.md

`8.x` 節に `cross_write` を追加:
```c
void cross_write(int target_local_id, int parent2_local_id,
                 int src_addr, int dst_addr, int length);
// 自身 (親A) と parent2 (親B) のメモリを交互ブロックで混合し、
// target のメモリにコピーする。block_size はゲームパラメータ (固定値)。
```

### 仕様書更新: v5/docs/specs/vm/vm_spec.md

`6-2 コンポーネントI/Oレイアウト` の Processor セクションに `cmd=2 (CROSS_WRITE)` を追加。
`+0x06` フィールドを `parent2_local_id` として記述。

### 仕様書更新: v5/docs/specs/game_spec.md

「有性生殖」セクションを追加:
- crossover アルゴリズム (固定ブロック交互)
- 距離制約 (親A-子, 親A-親B 両方とも interactRange 内)
- block_size パラメータ
- 親B の同意不要

## テスト計画

### ユニットテスト (test/actions.test.ts に追加)

1. **基本動作**: 親A と 親B のメモリを設定し、cross_write 実行 → 子メモリが交互ブロックパターンになる
2. **距離不足**: 親B が範囲外 → OUT_OF_RANGE で失敗
3. **無効な親B**: parent2_local_id が未登録 → INVALID_TARGET
4. **境界条件**: length=0、length が memory size 超過、block_size より小さい length 等
5. **アドレスラップ**: src/dst が memory 末尾を越える → 正しくラップ
6. **エネルギーコスト**: 親A から CROSS_WRITE のコストが引かれる

### 統合テスト

1. **2親の連携**: sexual_pioneer 個体が他個体と隣接 → 子が両親のメモリを継承
2. **無性 vs 有性**: pioneer (無性) と sexual_pioneer (有性) を同じ世界に配置 → 両方とも生存・複製を続ける

### 破損遮蔽テスト

```bash
# 1親の特定領域を破損 → 子が他親の対応領域で補われるか
npm run sim -- --program programs/sexual_pioneer_def.json --ticks 1000 \
  --seed 42 --count 10 --output events --corrupt-at-tick 100 --corrupt-count 50
```

期待: 破損個体の子も生存・複製を続ける（非有性版より生存率が高い）。

## チューニング目標

| 指標 | 目標値 |
|------|--------|
| sexual_pioneer の baseline 増殖率 | pioneer (無性) と同程度 |
| 破損注入下の集団生存率 | 無性版より高い |
| crossover ブロックサイズ最適値 | 16, 32, 64, 128 でスイープ |
| 親探索の成功率 | 50% 以上 (sense で見つかる確率) |

## 想定リスク

| リスク | 緩和策 |
|--------|--------|
| 親B が見つからず複製率低下 | 個体密度を上げる、または親B 不在時に通常 write_memory にフォールバック |
| crossover で関数境界が壊れる | block_size を関数サイズ程度 (64 word) に設定 |
| 親A と親B のアドレス対応が崩れる (異なるサイズ等) | 同種族間でのみ使うことを暗黙の前提とする (異種族交配は失敗確率高い) |
| エネルギーコストが高すぎて使われない | crossWriteCostPerWord を 0 で開始し、必要なら上げる |
| 既存 pioneer に影響 | sexual_pioneer を別種族として追加。pioneer.c は変更しない |

## 実装ステップ（順序）

1. **types.ts**: ActionOp に CROSS_WRITE 追加
2. **io.ts**: PRC0_PARENT2 定数、CrossWriteReservation 型、handleProcessorCommand に cmd=2 ケース
3. **params.ts**: blockSize, costPerWord, energyCosts.CROSS_WRITE
4. **actions.ts**: executeCrossWrite、コスト計算、reservation 振り分け
5. **builtins.ts**: cross_write 組み込み関数
6. **test/actions.test.ts**: ユニットテスト追加
7. **programs/sexual_pioneer.c** (新規) と def.json 生成
8. **test/io.test.ts**: cross_write の I/O 経由テスト
9. **test/compiler.test.ts**: cross_write builtin のコンパイルテスト
10. **docs/specs/vm/vm_spec.md, c_compiler_spec.md, game_spec.md**: 仕様更新
11. **CLI 検証**: 2 種族併存シミュレーション
12. **docs/tuning/sexual_reproduction_M5.md**: 結果記録
13. **version.ts, package.json**: マイナー更新

## 決定事項のサマリ

| 項目 | 決定 |
|------|------|
| crossover スキーム | 固定ブロック交互 (block_size=64) |
| API 引数数 | 5 (block_size はパラメータ化、引数に含めない) |
| 親B の同意 | 不要 (caller が能動的に取得) |
| 親B の生死 | active/inactive どちらも可 |
| 親B の種族 | 制限なし (異種交配可) |
| 距離 | 親A-子, 親A-親B の両方が interactRange 内 |
| 子のコンポーネント | 親A 単独で決定 (assemble) |
| 既存 pioneer | 変更しない (sexual_pioneer を別種族として追加) |
| エネルギーコスト | CROSS_WRITE 基本20 + write per word (初期 0) |

## 未決事項

- **crossWriteBlockSize の最適値**: 16/32/64/128 のスイープでチューニングする (実装後)
- **異種族交配時の挙動**: 失敗するわけではない (メモリのコピーは可能) が、子の動作は予測不能。これは進化の自由度として許容する
- **親B が消滅した場合**: ローカルIDは有効でも getCharacter で取得失敗 → TARGET_NOT_FOUND 失敗

## 観察対象

実装後、以下を観察する:

1. **遺伝的多様性**: 種内のメモリ多様性の経時変化（無性 vs 有性で比較）
2. **致死変異の遮蔽**: 破損注入下で、無性版より集団生存率が高くなるか
3. **分岐**: 複数の系統が共存できるか
4. **コスト最適化**: cross_write のコストが高すぎる/低すぎるとどうなるか
