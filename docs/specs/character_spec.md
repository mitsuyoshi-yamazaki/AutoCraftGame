# キャラクター仕様

キャラクターの構造、コンポーネントシステム、損傷・死亡モデルを定義する。

---

## キャラクターの構造

CPU + ROM + ペリフェラル モデル。全コンポーネントが汎用部品。

```
Character = {
  id: string,             // 一意な識別子（例: "char-001"）
  position: {x, y},       // マップ上の座標
  components: [...],      // 搭載コンポーネント一覧 = Body
  inventory: {...},       // 所持アイテム（アイテム名 → 個数 の辞書）
  durability: number,     // Frameの耐久値 → 0で死亡
  program: Program | null // null = 非活性（WRITEされるまでProgramなし）
}
```

- キャラクター = `(Body, Program)`
- Bodyの構成はProgramの組立指示によって決まる
- 概念上、ProgramはMemoryCoreに格納されたデータである
- 実装上、`program` フィールドとしてキャラクターオブジェクトが直接保持する
- `program: null` は非活性状態を表す（ASSEMBLEで生成された直後、WRITEされるまで）
- `program: Program` は活性状態を表す（毎ティックProcessorがProgramを評価・実行する）
- ProcessorはProgramを読み出し、接続コンポーネントへ命令を発行する
- 各コンポーネントはProcessorからの命令に応じて動作する汎用ペリフェラル

## コンポーネント一覧

| コンポーネント | 役割 | Processorからの命令 |
|--------------|------|------------------|
| Frame | 構造体 | 耐久値の源泉（命令不要） |
| Actuator | 移動ペリフェラル | MOVE(direction) → 隣接タイルへ移動 |
| Sensor | 知覚ペリフェラル | SENSE → 周囲情報を返す |
| Processor | 汎用演算器(CPU) | MemoryCoreからProgramを読み実行 |
| Harvester | 採取ペリフェラル | HARVEST → 資源ノードから原料取得 |
| Assembler | 加工・組立ペリフェラル | PROCESS / CRAFT / ASSEMBLE / REPAIR |
| MemoryCore | データ格納媒体(ROM/RAM) | Program + 作業データを保持 |

### 各コンポーネントの詳細

#### Frame
- 耐久値の源泉。初期値 = Frame数 × 100
- 命令を受け付けない（受動コンポーネント）

#### Actuator
- `MOVE(direction)` 命令を受けて、指定方向（N/S/E/W）へ1タイル移動する
- 移動先がマップ外の場合、移動しない（操作失敗）

#### Sensor
- `SENSE` 命令を受けて、周囲の情報を収集する
- 収集した情報は次ティックのCondition評価に使用される
- 取得情報: 周囲の資源ノードの位置と種類、他キャラクターの位置

#### Processor
- MemoryCoreからProgramを読み出し、毎ティック実行する
- Condition評価 → マッチしたルールのActionを各コンポーネントへ発行
- `WRITE(target)` — 自身のMemoryCore内容を対象のMemoryCoreへコピー
- `ACTIVATE(target)` — 非活性キャラクターを起動

#### Harvester
- `HARVEST` 命令を受けて、現在地の資源ノードから原料を1つ取得しinventoryに追加する
- 現在地に資源ノードがない場合、操作失敗

#### Assembler
- `PROCESS(recipe)` — 原料を加工素材へ変換
- `CRAFT(component)` — 加工素材からコンポーネントを製造
- `ASSEMBLE(component_list)` — コンポーネント群を組み立てて非活性キャラクター体を生成し、隣接タイルに配置
  - 配置先はN→S→E→Wの順で最初のマップ内タイルが選択される
  - マップ内の隣接タイルが存在しない場合（マップ角など）、操作失敗
  - コンポーネントの重複や種類の制約はない（任意の組み合わせが指定可能）
- `REPAIR` — inventory内のFrameを消費してdurabilityを100回復

#### MemoryCore
- Programデータを格納する物理媒体
- WRITE命令によりデータのコピーが可能
- 製造直後は空（データなし）

## 存在しないコンポーネントへの命令

操作失敗として処理する（キャラクターは死なない）。

## 損傷と死

- 毎ティック、durabilityが1減少する（自然劣化）
- durability ≤ 0 でキャラクターは死亡（マップから除去）
- 修復: `REPAIR` アクションでinventory内のFrameを消費し、durabilityを100回復

## 派生する設計上の性質

1. **コンポーネント欠落 = 能力制限**: Harvesterを省けば軽量だが自力採取不可 → 他者から奪う/貰う必要がある（生態系の発生）
2. **組立指示の変更 = 進化**: Programの組立指示を変えれば、異なる構成の娘が生まれる
3. **行動ロジックの変更 = 戦略の多様性**: 同じBody構成でもProgramが違えば異なる戦略をとる
4. **自己改造**: Programが自身のMemoryCoreを書き換えてから複製すれば「変異体」を産める
