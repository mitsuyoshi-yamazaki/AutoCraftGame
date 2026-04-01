# クラフトシステム仕様

素材の階層構造、レシピ、加工・製造ルールを定義する。

---

## 素材の階層

### Layer 0: 原料（資源ノードから採取）

| 素材 | 説明 |
|------|------|
| Ore | 鉱石 |
| Crystal | 結晶 |

### Layer 1: 加工素材（原料から加工）

| 素材 | レシピ |
|------|--------|
| Metal | Ore x2 |
| Circuit | Crystal x2 |

### Layer 2: コンポーネント（加工素材から製造）

| コンポーネント | レシピ | 用途 |
|--------------|--------|------|
| Frame | Metal x3 | 構造体（耐久値） |
| Actuator | Metal x1 + Circuit x1 | 移動能力 |
| Sensor | Circuit x2 | 知覚能力 |
| Processor | Circuit x3 | 演算能力（プログラム実行） |
| Harvester | Metal x2 | 採取能力 |
| Assembler | Metal x2 + Circuit x1 | 加工・組立能力 |
| MemoryCore | Circuit x2 | データ格納媒体（空） |

### Layer 3: キャラクター（コンポーネントの組み合わせ）

最小構成 = Frame + Actuator + Sensor + Processor + Harvester + Assembler + MemoryCore

## 必要素材の合計（最小構成キャラクター1体）

```
Metal  = Frame(3) + Actuator(1) + Harvester(2) + Assembler(2) = 8
Circuit = Actuator(1) + Sensor(2) + Processor(3) + Assembler(1) + MemoryCore(2) = 9

→ Ore x16, Crystal x18 が必要
```

## 加工ルール

- PROCESS: Layer 0 → Layer 1 への変換。Assemblerコンポーネントが必要
- CRAFT: Layer 1 → Layer 2 への製造。Assemblerコンポーネントが必要
- ASSEMBLE: Layer 2 → Layer 3 への組み立て。Assemblerコンポーネントが必要
- 各操作は1ティックで完了する
- レシピに必要な素材がinventoryに不足している場合、操作は失敗する（素材は消費されない）
