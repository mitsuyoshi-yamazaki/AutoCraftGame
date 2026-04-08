# SENSE結果形式: 検討された案

採用: **案D（概要SENSE＋個別クエリ）**

以下は検討の記録。

---

## 案A: I/Oインデックス選択方式

SENSEの結果はI/O空間に保持。インデックスを書き込むと、そのエントリのフィールドが読める。

```asm
OUT  SENSOR0_CMD, 1
IN   r3, SENSOR0_COUNT
OUT  SENSOR0_INDEX, 0         ; entry 0 を選択
IN   r4, SENSOR0_TYPE
IN   r5, SENSOR0_ANGLE
IN   r6, SENSOR0_DIST
; 登録
OUT  SENSOR0_REGISTER, 1
IN   r7, SENSOR0_REG_ID
```

C:
```c
sense(0);
int n = sense_count(0);
for (int i = 0; i < n; i++) {
    sense_select(0, i);
    int type = sense_type(0);
    if (type == TYPE_RESOURCE) {
        int id = sense_register(0);
    }
}
```

- メモリ消費なし
- アクセスが遅い（フィールドごとにIN、index切り替えにOUT）
- C適合性が低い（配列・ポインタ操作と相性悪い）

## 案B: プログラムメモリへの直接書き込み

SENSEが結果をプログラムのメモリ空間に直接書き込む。LW命令で処理可能。

```asm
OUT  SENSOR0_DST, SENSE_BUF   ; 書き込み先アドレス
OUT  SENSOR0_MAX, 16
OUT  SENSOR0_CMD, 1
HALT                           ; 次tickで結果を読む

; 次tick
IN   r3, SENSOR0_COUNT
LW   r4, SENSE_BUF, 0         ; entry[0].type ← LW 1命令
LW   r5, SENSE_BUF, 1         ; entry[0].angle
```

C:
```c
SenseEntry buf[16];  // 固定8ワード/件
sense_to_memory(0, buf, 16);
yield();
int n = sense_count(0);
for (int i = 0; i < n; i++) {
    if (buf[i].type == TYPE_RESOURCE && buf[i].distance < 10) {
        int id = sense_register(0, i);
    }
}
```

- アクセスが速い（LW 1命令）
- C適合性が高い（構造体配列として自然）
- メモリ消費あり（8ワード × 件数）
- 結果は次tick（アクション予約モデルと整合）
- 登録のためにシステムが内部的にエントリ番号→システムIDのマッピングを保持する必要あり

## 案C: 型別SENSE

対象種別をフィルタ指定。結果エントリが型ごとに統一される。

```asm
OUT  SENSOR0_FILTER, TYPE_CHARACTER
OUT  SENSOR0_CMD, 1
```

C:
```c
SenseCharacter chars[8];
int n = sense_typed(0, TYPE_CHARACTER, chars, 8);
// chars[i].energy, chars[i].durability — 型固有フィールドに直接アクセス

SenseResource resources[8];
int m = sense_typed(0, TYPE_RESOURCE, resources, 8);
```

- C適合性が最も高い（型安全な構造体）
- 全種別を見るには複数回SENSEが必要
- フィルタがシステム側 →「primitive」からやや離れる

## 案D: 概要SENSE＋個別クエリ（採用）

→ 02_game_interface.md に記載
