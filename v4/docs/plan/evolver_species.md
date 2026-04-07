# パラメータ進化種（Evolver）実装計画

## 要件

自己複製の際に、子個体のプログラム処理自体は親と同一だが、一部の定数値を小さく変異させることで「パラメータの進化」が起きる種族を実装する。

### 進化メカニズム

- 複製時に親が自身のグローバル変数を一時的に変異値に書き換え、`write_memory` で子にコピーし、直後に復元する
- 子は変異後の値をパラメータとして使用し、さらにその子へ変異を累積する
- **変異は連続的**: パラメータの性質に応じた小さなdelta（コンポーネント数: ±1、エネルギー閾値: ±50程度）

### 変異源

- `current_tick()` をseedとする16bit LCG（線形合同法）
- 決定論的であり、シード値が異なれば異なる変異列を生成する

## 進化対象パラメータ

| パラメータ | 初期値 | 変異幅 | 下限 | 上限 | 備考 |
|-----------|-------|--------|------|------|------|
| `param_recharge_enter` | 250 | ±30 | 100 | 600 | 充電開始エネルギー閾値 |
| `param_recharge_exit` | 700 | ±50 | 400 | 1500 | 充電終了エネルギー閾値 |
| `param_repair_enter` | 2000 | ±200 | 500 | 4000 | 修理開始耐久値閾値 |
| `param_repair_exit` | 4000 | ±300 | 2000 | 8000 | 修理終了耐久値閾値 |
| `param_assemble_energy` | 700 | ±50 | 400 | 1500 | 組立開始エネルギー閾値 |
| `param_wander_step` | 90 | ±15 | 15 | 180 | 探索角度ステップ |
| `param_frame_count` | 2 | ±1 | 1 | 4 | 子のFrame数 |

コンポーネント数の変異は `param_frame_count` のみとする。MemoryCore数はプログラムサイズに直結するため固定（2個）。

### 素材必要量の動的計算

`param_frame_count` が変動するため、素材必要量を定数ではなく実行時に計算する。

```
metal_needed  = 6 + param_frame_count * 3
circuit_needed = 13  （Frame非依存）
ore_needed    = metal_needed * 2
crystal_needed = circuit_needed * 2
craft_steps   = param_frame_count + 8  （非Frame8種 + Frame×N）
```

## 実装計画

### 1. プログラム作成: `v4/programs/evolver.c`

Pioneer をベースに以下を変更:
- `#define` → グローバル変数（上記7パラメータ）
- `next_rng()`, `mutate()` 関数の追加
- `calc_ore_needed()` 等の動的素材計算関数
- 複製フェーズ: 退避→変異→WRITE→復元パターン
- craftフェーズ: `param_frame_count` に応じた動的Frame craft

### 2. コンパイル・バイナリ生成

```
npx tsx src/vm/compiler/compile.ts programs/evolver.c
npx tsx src/vm/assembler-cli.ts programs/evolver.asm
```

### 3. GUI定義ファイル: `v4/ui/evolver_def.json`

- 初期コンポーネント: Frame×2, Actuator, Harvester, Charger, Assembler, Processor, Sensor, MemoryCore×2
- species名: "Evolver"
- count: 3（Pioneer/Survivorと同程度）

### 4. GUI更新: `v4/ui/main.ts`

- `PROGRAM_DEF_FILES` に `evolver_def.json` を追加
- 既存のPioneer/Survivorと共存させる（置き換えではない）

### 5. 動作確認

- コンパイル成功（1024×2=2048ワード以内）
- GUIで起動し、複製が正常に行われることを確認
- 子個体のパラメータが親と微小に異なることを確認（VMメモリの該当アドレス）
