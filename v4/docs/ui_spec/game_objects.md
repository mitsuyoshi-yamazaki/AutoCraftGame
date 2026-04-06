# GUI描画対象オブジェクト一覧 — v4

v3からの変更箇所のみ記載。記載のない項目はv3仕様（v3/docs/ui_spec/game_objects.md）に従う。

## 1. ResourceNode

v3と同じ。

## 2. EnergyNode

v3と同じ。

## 3. Remains

v3と同じ。ただし、componentsにRegisterは含まれない。

## 4. Character

### プロパティの変更

| プロパティ | v3 | v4 |
|-----------|----|----|
| program | Program \| null | 廃止 |
| registers | (number \| null)[] | number[8]（VMレジスタ r0-r7） |
| senseData | SenseData \| null | 廃止（I/Oスロット経由） |
| active | program !== null で判定 | boolean フィールド |
| pc | なし | number（プログラムカウンタ） |
| memory | なし | number[]（VMメモリ） |

### 選択時の詳細パネル

| 項目 | 表示内容 |
|------|---------|
| ID | キャラクターID |
| Active/Inactive | active状態 |
| Species | 種族名 |
| Position | 座標 |
| Mass | 質量 |
| Durability | 現在値 / 最大値 |
| Energy | エネルギー |
| PC | プログラムカウンタの現在位置 |
| Registers | r0-r7 の値 |
| Memory | メモリサイズ（ワード数） |
| Actions | 前tickの予約アクション一覧 |
| Components | コンポーネント一覧 |
| Inventory | アイテム一覧 |

### 描画

v3と同じ（セル生物メタファー）。
コンポーネントリングのRegisterの色は削除。

## 5. Ground

v3と同じ。

## 6. Wall

v3と同じ。
