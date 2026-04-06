# 初期状態仕様 — v4

v3からの変更箇所のみ記載。記載のない項目はv3仕様（v3/docs/specs/initial_state.md）に従う。

## 1. ワールド

v3と同じ。

## 2. 配置制約

v3と同じ。

## 3. ResourceNode配置

v3と同じ。

## 4. EnergyNode配置

v3と同じ。

## 5. 初期キャラクター

### 変更点

- コンポーネント: MIN_COMPONENTSからRegisterを除外し、MemoryCoreを含む
- プログラム: JSONルール形式ではなく、VMバイナリ（16bitワード列）をロードする
- 初期状態:
  - active: false（ロード時にACTIVATE相当の処理でactiveにする）
  - memory: プログラムバイナリが先頭からロードされ、残りは0
  - registers: 全て0
  - pc: 0
  - localIdTable: 空
  - localIdCounter: 0
- species: プログラム定義ファイルのname属性

### MIN_COMPONENTS（v4）

v3のMIN_COMPONENTSからRegisterを除外し、MemoryCoreを含める。
具体的な構成は調整が必要（自己複製プログラムのメモリ要件に依存）。

最小構成案:
- Frame × 3
- Actuator × 1
- Harvester × 1
- Charger × 1
- Assembler × 1
- Processor × 1
- Sensor × 1
- MemoryCore × 1

### プログラムの供給形式

初期キャラクターのプログラムは以下のいずれかの形式で供給される:
- アセンブリソースファイル（アセンブラでバイナリに変換）
- バイナリファイル（16bitワード列を直接記述）

具体的なファイル形式は実装時に決定する。

## 6. 壁オブジェクト

v3と同じ。

## 7. GroundGrid初期化

v3と同じ。

## 8. 定数

v3と同じ。ただし、MIN_COMPONENTSの構成はセクション5に従う。
