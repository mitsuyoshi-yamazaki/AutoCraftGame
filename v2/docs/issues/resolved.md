## 概要

- issues.md に記載の項目が完全に解決したら本ファイルへ移動する

## 内容

### GUIアプリケーションの初期キャラクター追加

- v2/programs/ に3種類のプログラムを用意し、GUI起動時に各2体ずつ配置するようにした
  - **Replicator** (self-replicator.json): 標準的な自己複製。Harvester持ち、自力で資源を採掘してバランスよく複製する
  - **Scavenger** (scavenger.json): 死体漁り型。Harvester無し・Disassembler持ち。EnergyNode付近で待機し、残骸を分解して資源を得る
  - **Explorer** (explorer.json): 探索特化型。エネルギー閾値を低く、修理を行わず短命だが素早く複製する
- Program型にoptionalな `name` フィールドを追加し、GUI上でキャラクター選択時にプログラム名を表示するようにした
- 各プログラムJSONにルートレベルの `comment` で性格概要、`components` でコンポーネント構成を記載
- GUI起動時に最初のキャラクターが自動選択された状態で表示されるようにした

### スポーン時のイベントログの種族名表示

- spawnイベントでは子のprogram（WRITE前はnull）ではなく親のprogram名を表示するよう修正

### GUI: オブジェクトのクリック選択と状態表示

- エネルギーノード、リソースノード、残骸をクリックして状態を表示できるようにした
  - ResourceNode: type, position, remaining
  - EnergyNode: position, stored/maxStored, productionRate
  - Remains: position, components, inventory
- 選択モデルをcharacterIdベースから汎用的なSelection型に変更

### GUI: 種族ごとの個体数表示

- Statsパネルに、1体以上存在する種族（program.name）ごとの個体数を表示するようにした
- 個体数の多い順にソートして表示
