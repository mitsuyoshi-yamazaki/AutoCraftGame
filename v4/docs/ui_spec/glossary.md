# GUI 用語集 — v4

v3からの変更箇所のみ記載。記載のない項目はv3仕様（v3/docs/ui_spec/glossary.md）に従う。

## 変更のある用語

| 用語 | v3 | v4 |
|------|----|----|
| characterActions | Map<string, Action> | Map<string, Action[]>（複数アクション対応） |

## 追加の用語

| 用語 | 説明 |
|------|------|
| VMState | キャラクターのVM実行状態（PC, レジスタ, メモリ） |
| ActionReservation | VMプログラムによるアクション予約 |
| LocalID | キャラクターごとのオブジェクト参照ID |

## 廃止された用語

| 用語 | 理由 |
|------|------|
| Program (Rule列) | VM命令列に置き換え |
| Rule | 廃止 |
| Condition | 廃止 |
| set_registers | 廃止（VMの命令で代替） |
| FnValue | 廃止 |
| Register (コンポーネント) | 廃止（VMに内蔵） |
