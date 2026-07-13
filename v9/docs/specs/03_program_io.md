# プログラム・I/O 仕様

v8のVMとI/O体系の互換拡張である（3_v9_goal「VMの命令セットとI/O体系を互換で拡張する」）。
本書はv8からの差分を中心に記述する。v8の詳細は `v8/docs/specs/game_spec.md` を参照。

## VM（v8から変更なし）

| 項目 | 値 |
|------|-----|
| アーキテクチャ | 16bit von Neumann（プログラム=データ同一空間、自己参照可能） |
| レジスタ | 8本（r0=常に0、r7=スタックポインタ） |
| pmem | 1024ワード（アドレスは mod 1024 で巡回） |
| 実行 | instructionsPerTick 命令/tick、PCはtick跨ぎで保持、HALTでtick終了 |
| 命令セット | v8と同一（ADD〜HALT、PC相対分岐 BEQL/BNEL/BLTL/BGEL、JMP、LABEL/JMPL/LWL/SWL、LI等） |
| ラベルキャッシュ | v8と同一（メモリ書込で無効化、JMPLは同IDラベルの次ワードへ） |

v9で追加される命令はない。**プログラムの複製・変異はすべて既存のLW/SW＋外部pmem I/Oで行う**
（進化手法の非提供 R6: システムは書込手段という物理法則のみ提供し、変異の方針はプログラムが実装する）。

v9固有の変更:

- **Processorの実行にエネルギーが必要**: 毎tick PROC_TICK_COST をグループのStorageから消費する。
  支払えないtickは実行されない（飢餓）。v8では実行コスト0だった

## I/Oアドレス空間（v8互換＋拡張）

`IN rd, rs` = ioRead(reg[rs])、`OUT rs1, rs2` = ioWrite(reg[rs1], reg[rs2])。

### 自身状態 0x0000〜0x00FF（読み取り専用）

| アドレス | 名称 | 内容 |
|:---:|------|------|
| 0x0000 | SELF_POS_X | floor(実効x) |
| 0x0001 | SELF_POS_Y | floor(実効y) |
| 0x0002 | SELF_TICK | world.tick & 0xFFFF |
| 0x0003 | SELF_GROUP_ID | 所属グループID（単独なら0） |
| 0x0004 | GROUP_ENERGY | グループのStorage群の合計エネルギー（0xFFFF上限で飽和）**（v9追加）** |
| 0x0005 | SELF_DURABILITY | このProcessor自身の耐久度 **（v9追加）** |
| その他 | — | 0 |

### 自身opmem 0x0100〜0x01FF（読み書き）

自身（Processor）の操作メモリ。レイアウトは下記「Processor opmem」。

### 外部opmem 0x1000〜0x1FFF（v8と同一機構）

| アドレス | 名称 | 内容 |
|:---:|------|------|
| 0x1000 | OPMEM_TARGET_ID | 対象のローカルID設定（tick跨ぎ永続） |
| 0x1001 | OPMEM_OFFSET | オフセット設定（永続） |
| 0x1002 | OPMEM_VALUE | 生値の読み書き |
| 0x1003 | OPMEM_TARGET_TYPE | 対象の種別コード（読み取り） |
| 0x1004 | OPMEM_AUTO_VALUE | 生値の読み書き＋アクセス後 OFFSET++ |
| 0x1005 | OPMEM_VALUE_LOCAL_ID | ローカルID変換付き読み書き |

- **対象は8種すべてのコンポーネント**（v8はAssembler/Processorのみ）
- 0x1005の変換規則: 対象がProcessorの場合は対象のローカルIDテーブルで変換（v8と同一）、
  **それ以外のコンポーネントのopmem上のIDスロットは生のオブジェクトID**として扱い、
  読み手側でローカルIDへ変換する（v8のAssembler扱いを踏襲）

### 外部pmem 0x2000〜0x2FFF（対象拡張）

| アドレス | 名称 | 内容 |
|:---:|------|------|
| 0x2000 | PMEM_TARGET_ID | 対象のローカルID（永続） |
| 0x2001 | PMEM_ADDR | アドレス（mod 対象サイズ、永続） |
| 0x2002 | PMEM_VALUE | 生値の読み書き |
| 0x2003 | PMEM_AUTO_VALUE | 生値の読み書き＋アクセス後 ADDR++ |

- 対象: **ProcessorまたはMemoryCore**（v8はProcessorのみ）。
  MemoryCoreは MEMCORE_WORDS ワードの記憶領域を提供する（実行はされない）
- 書込はフェーズ1終了時に一括反映（v8と同一）

### アクセス規則（v8と同一）

- 到達可能: **同一グループ** または **実効位置間の距離 ≤ PROXIMITY_RANGE** の論理和
- 無効アクセス: 読み取りは0、書き込みはサイレントドロップ
- **AUTO系のインクリメントは書込がドロップされても進行する**（v8と同一）。
  これは意図された仕様である: コピー中に対象が到達範囲から外れると「穴あきコピー」が生じ、
  プログラム側の対策（検証・再送）も含めてプログラムの責任領域になる

## 種別コード（0x1003 / SCAN結果で使用）

| コード | 種別 |
|:---:|------|
| 1〜8 | コンポーネント: 1=Assembler, 2=Processor, 3=MemoryCore, 4=Actuator, 5=Sensor, 6=Harvester, 7=Disassembler, 8=Storage |
| 20 | EnergyNode |
| 30 | グループ |
| 100+n | 物質（n = 物質コード）。MatterNode・地面の物体の双方で使用 |

- 物質コードは `src/craft/` のデータ定義順の1始まり連番（クラフトツリー仕様の生成テーブルに併記）
- レシピコード（Assemblerのrecipe指定に使用）も同様にデータ定義順の1始まり連番

## 各コンポーネントのopmemレイアウト

外部からは 0x1000系（OFFSET=下表のoff）でアクセスする。自身opmem（0x0100+off）はProcessorのみ。
トリガは処理開始時に自動で0クリアされる。ステータス: 0=idle, 1=busy。
結果コード: 0=なし, 1=成功, 2=材料不足, 3=エネルギー不足, 4=対象不到達, 5=容量不足, 6=辺使用済み, 7=無効指定。

### Processor（サイズ38）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | run_flag | 0=停止, 1=実行。外部からの書込が起動/停止手段（ACTIVATE相当） |
| 1 | cscan_trigger | 1=グループ内スキャン（同グループメンバーの列挙） |
| 2 | cscan_filter | 0=全種, 1〜8=種別コードで絞り込み |
| 3 | cscan_count | 結果件数 |
| 4〜35 | cscan_results | 4ワード×最大8件: [ローカルID, 種別, 0, aux] ID昇順 |
| 36 | disconnect_trigger | 1=切断要求 |
| 37 | disconnect_target_id | 切断対象（ローカルID） |

### Assembler（サイズ10）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | action_trigger | 1=SET_RECIPE, 2=CRAFT, 3=ASSEMBLE, 4=REPAIR |
| 1 | recipe_code | SET_RECIPEで構成するレシピコード |
| 2 | connection_target_id | ASSEMBLE: 接続先（ローカルID）。0=自由設置 |
| 3 | connection_edge | ASSEMBLE: 接続先の辺0〜5、0xFF=AUTO |
| 4 | repair_target_id | REPAIR対象（ローカルID） |
| 5 | status | 0=idle, 1=busy |
| 6 | progress | 残りtick |
| 7 | result | 直近アクションの結果コード |
| 8 | configured_recipe | 現在構成されているレシピコード（0=未構成） |
| 9 | last_product_id | 直近のCRAFT/ASSEMBLE生成物（ローカルID変換対象の生ID） |

### Harvester（サイズ4）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | harvest_trigger | 1=HARVEST（最近傍自動対象） |
| 1 | result | 結果コード |
| 2 | last_type | 回収した種別コード |
| 3 | last_amount | 回収量（物質は個数、エネルギーは量） |

### Disassembler（サイズ5）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | disassemble_trigger | 1=DISASSEMBLE |
| 1 | target_id | 対象（ローカルID。SCANの一時IDも可） |
| 2 | status | 0=idle, 1=busy |
| 3 | progress | 残りtick |
| 4 | result | 結果コード |

### Actuator（サイズ3）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | direction | 推進方向 0〜255（= 0〜2π） |
| 1 | magnitude | 推進の強さ 0〜THRUST_MAX。0で停止（トリガ不要の継続動作） |
| 2 | status | 0=停止, 1=作動, 3=エネルギー不足 |

### Sensor（サイズ35）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | scan_trigger | 1=SCAN |
| 1 | scan_filter | 0=全種, 1〜8=コンポーネント種別, 9=物質（ノード・地面）, 10=EnergyNode |
| 2 | scan_count | 結果件数 |
| 3〜34 | scan_results | 4ワード×最大 SCAN_MAX_RESULTS 件: [生オブジェクトID, 種別コード, floor(距離), aux] 距離昇順 |

- aux: コンポーネント→耐久度（残骸=0）、MatterNode/地面の物体→残量/個数、EnergyNode→当tick残流量
- 結果のIDスロットは生のオブジェクトIDで格納される。プログラムは0x1005経由で読むことで
  自分のローカルIDとして取得できる。結果は次のSCANまで保持される

### Storage（サイズ9）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | transfer_trigger | 1=TRANSFER |
| 1 | target_storage_id | 転送先Storage（ローカルID。同グループまたは近接） |
| 2 | substance_code | 転送する物質コード。0=エネルギー |
| 3 | amount | 転送量 |
| 4 | result | 結果コード |
| 5 | stored_energy | 現在のエネルギー格納量（読み取り） |
| 6 | stored_atoms | 現在の物質格納量（総原子数、読み取り） |
| 7 | query_code | 在庫照会する物質コード（書込） |
| 8 | query_count | 照会結果の個数（読み取り） |

### MemoryCore（サイズ1）

| off | 名称 | 内容 |
|:---:|------|------|
| 0 | reserved | 常に0。記憶領域へのアクセスは外部pmem I/O（0x2000系）で行う |

## ローカルID（v8と同一機構）

- 各Processorは独自の localIdTable（localId → objectId）と採番カウンタを持つ（tick跨ぎ永続）
- CSCAN・0x1005読取で未知のobjectIdが現れたとき採番する
- 自己複製での親子間ID受け渡し（例: 子Processorへ「隣のAssemblerのID」を教える）は
  0x1005書込で行う（親のローカルID → 生ID → 子のローカルIDへ変換されて格納）

## v8からの変更点まとめ

| 項目 | v8 | v9 |
|------|----|----|
| SCAN | Processorのopmem・即時実行 | Sensorコンポーネントへ移動・アクションフェーズ処理（結果は次tick） |
| CSCAN | Processor・即時実行 | Processorに残置・アクションフェーズ処理 |
| ACTIVATE | run_flag外部書込 | 同じ（変更なし） |
| 外部opmem対象 | Assembler/Processor | 8種すべて |
| 外部pmem対象 | Processor | Processor + MemoryCore |
| Processor実行コスト | 0 | PROC_TICK_COST/tick |
| Assembler材料調達 | 世界から吸収（gathering） | 同グループのStorageから即時引当（Harvesterが回収を担う） |
| レシピ | 固定4種 | クラフトツリー（データ定義、コード=定義順連番） |
