# C言語コンパイラ仕様書 — v4

本VM向けのC言語サブセットと、それをアセンブリに変換するコンパイラの仕様。

## 1. 概要

本VMをターゲットとするC言語のサブセット（以下「Mini-C」）を定義する。
Mini-Cのソースコードは、コンパイラによりアセンブリに変換され、アセンブラによりバイナリに変換される。

```
Mini-C (.c) → コンパイラ → アセンブリ (.asm) → アセンブラ → バイナリ (.bin / .hex)
```

## 2. データ型

| 型 | サイズ | 値の範囲 |
|----|--------|---------|
| int | 1ワード（16bit） | 0-65535（符号なし） |
| bool | 1ワード（16bit） | 0（false）または 1（true） |
| void | なし | 関数の戻り値なしを示す |

- ポインタ型は提供しない
- 構造体は提供しない
- 配列は提供しない
- 暗黙の型変換: bool → int（false=0, true=1）。int → bool（0=false, 非0=true）

## 3. 変数

### 3-1. グローバル変数

```c
int energy_threshold = 500;
int state = 0;
```

- メモリ上のデータ領域に配置される
- 初期値を持てる
- tick間で保持される（VMメモリが保持されるため）

### 3-2. ローカル変数

```c
void foo(void) {
    int x = 10;
    int y = x + 1;
}
```

- スタック上に配置される
- 関数スコープで有効
- ブロックスコープの変数宣言も可能

## 4. 演算子

### 4-1. 算術演算子

| 演算子 | 動作 | 備考 |
|--------|------|------|
| `+` | 加算 | オーバーフローはラップ |
| `-` | 減算 | アンダーフローはラップ |
| `*` | 乗算 | 下位16bit |
| `/` | 除算 | 0除算は0 |
| `%` | 剰余 | 0除算は0 |

### 4-2. 比較演算子

| 演算子 | 動作 | 結果 |
|--------|------|------|
| `==` | 等価 | bool |
| `!=` | 非等価 | bool |
| `<` | 未満（符号なし） | bool |
| `>` | 超過（符号なし） | bool |
| `<=` | 以下（符号なし） | bool |
| `>=` | 以上（符号なし） | bool |

全て符号なし比較。

### 4-3. 論理演算子

| 演算子 | 動作 |
|--------|------|
| `&&` | 論理AND（短絡評価） |
| `\|\|` | 論理OR（短絡評価） |
| `!` | 論理NOT |

### 4-4. ビット演算子

| 演算子 | 動作 |
|--------|------|
| `&` | ビットAND |
| `\|` | ビットOR |
| `^` | ビットXOR |
| `~` | ビットNOT |
| `<<` | 左シフト |
| `>>` | 右シフト（論理） |

### 4-5. 代入演算子

`=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`

### 4-6. インクリメント/デクリメント

`++`, `--`（前置・後置）

### 4-7. カンマ演算子

```c
int x = (f(), g());  // f()を評価し捨て、g()の結果をxに代入
```

左辺を評価し結果を破棄、右辺を評価しその値を返す。

## 5. 制御構文

### 5-1. if-else

```c
if (condition) {
    // ...
} else if (condition2) {
    // ...
} else {
    // ...
}
```

### 5-2. while

```c
while (condition) {
    // ...
}
```

### 5-3. for

```c
for (int i = 0; i < 10; i++) {
    // ...
}
```

for文の初期化式で変数宣言が可能。

### 5-4. break / continue

```c
while (1) {
    if (done) break;
    if (skip) continue;
    // ...
}
```

ループ（while, for）内でのみ使用可能。

break/continueはジャンプ前にスタックの巻き戻しを行う。ループ本体内で宣言されたローカル変数はbreak/continueにより自動的に解放される。for文のinit変数はcontinueでは保持され、breakでは解放される（for文のepilogueが処理する）。

同様に、if文のthen/elseブランチ内で宣言されたローカル変数は、ブランチ終了時に自動的に解放される。

### 5-5. return

```c
int foo(void) {
    return 42;
}
```

void関数では `return;`（値なし）。

### 5-6. switch-case は提供しない

if-else で代替する。

## 6. プリプロセッサ

### 6-1. #define（マクロ定義）

```c
// 定数マクロ
#define MAX_ENERGY 3000

// 関数マクロ
#define square(x) ((x) * (x))
```

- テキスト置換方式（C言語の標準的なプリプロセッサと同様）
- 引数付きマクロを使用可能
- マクロ内で `\` による行継続が可能

```c
#define assemble_full(fr,act,har,cha,asm_,proc,sen,dis,mem) \
    (assemble_ext(sen,dis,mem), assemble(fr,act,har,cha,asm_,proc))
```

### 6-2. その他のプリプロセッサ指令

以下は提供しない:
- `#ifdef` / `#ifndef` / `#if` / `#else` / `#endif`（条件コンパイル）
- `#undef`
- `#include`（標準定数はコンパイラ組み込み）

## 7. 関数

### 7-1. 定義と呼び出し

```c
int add(int a, int b) {
    return a + b;
}

void main(void) {
    int result = add(10, 20);
}
```

- 引数は最大6個（r1-r6で渡す。r7はスタックポインタ）
- 戻り値はr1で返す
- 前方宣言は不要（コンパイラが2パスで解決）
- 再帰呼び出し可能

### 7-2. エントリポイント

`void main(void)` がプログラムのエントリポイント。
VMのPC=0から実行が開始される。コンパイラはmain関数へのジャンプを先頭に配置する。

### 7-3. 呼び出し規約

| 項目 | 規約 |
|------|------|
| 引数 | r1-r6（最大6個、左から順） |
| 戻り値 | r1 |
| リターンアドレス | r6（JALR rd, rs で保存） |
| callee-saved | なし（全レジスタはcaller-saved） |
| スタック | r7をスタックポインタとして使用。下方成長 |

引数が6個を超える場合はコンパイルエラー。

## 8. ゲームAPI

I/O操作をラップする組み込み関数群。コンパイラが対応するIN/OUTシーケンスに展開する。

### 8-1. 環境情報取得

```c
int my_energy(void);       // 自身のエネルギー
int my_durability(void);   // 自身の耐久値
int my_x(void);            // 自身のX座標
int my_y(void);            // 自身のY座標
int my_vx(void);           // 自身のVX
int my_vy(void);           // 自身のVY
int current_tick(void);    // 現在のtick
```

### 8-2. アクション

```c
void move(int direction);
// Actuator[0]にMOVEを予約。direction: 0-359

void harvest(void);
// Harvester[0]にHARVESTを予約（最近接ResourceNode）

void harvest_target(int local_id);
// Harvester[0]にHARVESTを予約（ローカルIDで指定したResourceNode）

void recharge(void);
// Charger[0]にRECHARGEを予約（最近接EnergyNode）

void recharge_target(int local_id);
// Charger[0]にRECHARGEを予約（ローカルIDで指定したEnergyNode）

void process(int recipe);
// Assembler[0]にPROCESSを予約

void craft(int component_type);
// Assembler[0]にCRAFTを予約

int assemble(int frame, int actuator, int harvester, int charger,
             int assembler, int processor);
// Assembler[0]にASSEMBLEを予約（引数6個制限のため分割）
// 残りのコンポーネント（sensor, disassembler, memorycore）は
// assemble_ext() で指定する（後述）
// 戻り値: 子のローカルID

void assemble_ext(int sensor, int disassembler, int memorycore);
// ASSEMBLEの追加引数。assemble()の前に呼ぶ

void write_memory(int target_id, int src_addr, int dst_addr, int length);
// Processor[0]にWRITEを予約

void activate(int target_id);
// Processor[0]にACTIVATEを予約

void disassemble(int target_id);
// Disassembler[0]にDISASSEMBLEを予約

void repair(void);
// Assembler[0]にREPAIRを予約
```

注: assemble関数は引数6個制限により2つに分割。assemble_ext()でsensor, disassembler, memorycoreの個数をI/Oスロットに書き込み、assemble()で残りを書き込んでcommandを発行する。

### 8-3. SENSE

```c
int sense(int filter);
// Sensor[0]にフィルタSENSEを即時実行。戻り値: 検出件数

void sense_select(int index);
// 結果バッファのindex番エントリを選択

int sense_type(void);      // 選択エントリの種別
int sense_angle(void);     // 選択エントリの角度
int sense_distance(void);  // 選択エントリの距離
int sense_amount(void);    // 選択エントリの残量（リソース/エネルギーノードの残量、その他は0）

int sense_register(void);
// 選択エントリを登録。戻り値: ローカルID

int sense_id(int local_id);
// Sensor[0]にID指定SENSEを即時実行。戻り値: 対象の種別（0=未発見）
// 発見時は sense_angle(), sense_distance(), sense_amount() で情報取得可能
```

### 8-4. 個別クエリ

```c
int query(int local_id, int property);
// ローカルIDで対象を指定し、属性を取得。戻り値: 属性値
// property: PROP_ENERGY, PROP_DURABILITY, etc.（定数で定義）

bool query_valid(void);
// 直前のqueryが成功したか
```

### 8-5. ローカルID管理

```c
void release_id(int local_id);
// ローカルIDを解放
```

**注意**: release_idはVM実行中に即座に実行される。同一tick内でアクション予約にローカルIDを使用した場合（harvest_target, recharge_target, write_memory, activate, disassemble）、予約後・アクション実行前にrelease_idを呼ぶと、アクション実行時にIDが見つからず失敗する。release_idは対象アクションが実行された後のtickで呼ぶこと。

### 8-6. インベントリクエリ

```c
int inventory_count(int item_type);
// 指定アイテムの所持数を返す。item_type: ITEM_ORE(0)〜ITEM_MEMORYCORE(12)
```

### 8-7. コンポーネントディスカバリ

```c
int component_count(int type);
// 指定種別の存在コンポーネント数

int component_total(int type);
// 指定種別の接続総数（欠番を含む上限）

bool component_status(int type, int index);
// 指定スロットが存在するか
```

### 8-8. プログラム制御

```c
void halt(void);
// HALT命令を発行。このtickの実行を終了
```

## 9. 定数

コンパイラが提供する組み込み定数:

### 9-1. フィルタ値

```c
#define FILTER_ALL          0
#define FILTER_ORE          1
#define FILTER_CRYSTAL      2
#define FILTER_ENERGY       3
#define FILTER_RESOURCE     4
#define FILTER_ALL_NODE     5
#define FILTER_REMAINS      6
#define FILTER_ACTIVE_CHAR  7
#define FILTER_INACTIVE_CHAR 8
#define FILTER_ALL_CHAR     9
```

### 9-2. オブジェクト種別

```c
#define TYPE_ORE_NODE       1
#define TYPE_CRYSTAL_NODE   2
#define TYPE_ENERGY_NODE    3
#define TYPE_REMAINS        4
#define TYPE_ACTIVE_CHAR    5
#define TYPE_INACTIVE_CHAR  6
```

### 9-3. コンポーネント種別

```c
#define COMP_FRAME          0
#define COMP_ACTUATOR       1
#define COMP_HARVESTER      2
#define COMP_CHARGER        3
#define COMP_ASSEMBLER      4
#define COMP_PROCESSOR      5
#define COMP_SENSOR         6
#define COMP_DISASSEMBLER   7
#define COMP_MEMORYCORE     8
```

### 9-4. クエリ属性

```c
#define PROP_TYPE           0
#define PROP_ANGLE          1
#define PROP_DISTANCE       2
#define PROP_ENERGY         3
#define PROP_DURABILITY     4
#define PROP_COMPONENTS     5
#define PROP_SPECIES        6
#define PROP_RESOURCE_TYPE  7
#define PROP_REMAINING      8
```

### 9-5. レシピ

```c
#define RECIPE_METAL        0
#define RECIPE_CIRCUIT      1
```

### 9-6. アイテム種別（インベントリクエリ用）

```c
#define ITEM_ORE            0
#define ITEM_CRYSTAL        1
#define ITEM_METAL          2
#define ITEM_CIRCUIT        3
#define ITEM_FRAME          4
#define ITEM_ACTUATOR       5
#define ITEM_HARVESTER      6
#define ITEM_CHARGER        7
#define ITEM_ASSEMBLER      8
#define ITEM_PROCESSOR      9
#define ITEM_SENSOR         10
#define ITEM_DISASSEMBLER   11
#define ITEM_MEMORYCORE     12
```

## 10. コンパイラの出力

コンパイラはアセンブリソース（.asm）を出力する。

出力構造:
```
; ヘッダ: エントリポイントへのジャンプ
    JMP _main

; グローバル変数領域
_global_vars:
    .word 500              ; energy_threshold
    .word 0                ; state

; 関数群
_main:
    ; main関数のコード
    ...

_add:
    ; add関数のコード
    ...
```

## 11. 制限事項

- ポインタなし
- 構造体なし
- 配列なし（グローバル変数 + .word ディレクティブで代替可能）
- 文字列なし
- #include なし（コンパイラが標準定数を組み込み提供）
- 可変長引数なし
- 関数引数は最大6個
- typedef なし
- enum なし
- sizeof なし
- 三項演算子なし
- do-while なし

## 12. エラー処理

コンパイラは以下のエラーを検出して報告する:

| エラー | 説明 |
|--------|------|
| 型エラー | void値の使用、型の不一致 |
| 未定義変数 | 宣言されていない変数の使用 |
| 未定義関数 | 定義されていない関数の呼び出し |
| 引数数エラー | 関数の引数数が定義と不一致 |
| 引数上限超過 | 引数が6個を超える |
| break/continue | ループ外でのbreak/continue |
| return | void関数での値返却、または非void関数での値なしreturn |

## 13. 自己複製の記述例

```c
// 自己複製プログラムの概要

// assemble_fullマクロ: 9引数を分割して2関数呼び出し
#define assemble_full(fr,act,har,cha,asm_,proc,sen,dis,mem) \
    (assemble_ext(sen,dis,mem), assemble(fr,act,har,cha,asm_,proc))

#define PROGRAM_SIZE 256

int child_id = 0;
int state = 0;

void main(void) {
    if (state == 0) {
        // 初期状態: SENSEして資源を探す
        gather_resources();
    } else if (state == 1) {
        // 資源収集中
        collect_and_craft();
    } else if (state == 2) {
        // 複製実行
        replicate();
    }
    halt();
}

void replicate(void) {
    // 子の身体を組み立て（マクロで一括呼び出し）
    child_id = assemble_full(3,1,1,1,1,1,1,0,2);
    // frame=3, actuator=1, harvester=1, charger=1, assembler=1,
    // processor=1, sensor=1, disassembler=0, memorycore=2

    // 自身のメモリを子にコピー（WRITEはProcessorスロット）
    write_memory(child_id, 0, 0, PROGRAM_SIZE);

    // WRITE→ACTIVATEは同一Processorスロットのため同一tickで予約できない
    // HALTでtick境界を作り、次tickでACTIVATEを発行する
    halt();
    activate(child_id);

    state = 0;  // 資源収集に戻る
}
```
