# 自己複製仕様

キャラクターの自己複製メカニズムを定義する。本プロジェクトの核心部分。

---

## 設計原理 — クワイン方式

再帰問題（「自分を作るには自分の設計図が必要だが、設計図の中にも設計図が…」）を以下の2層分離で解決する。

```
物理媒体(MemoryCore) → クラフトで製造（素材が必要）
データ(Program)       → コピーで複製（素材不要、Processorが必要）
```

- **MemoryCore** = 物理媒体。素材から製造する
- **Program** = MemoryCoreに格納されるデータ。親からコピーする

Programは全行動を記述する。「何を作るか」もProgramの一部（組立指示）。
Program自体は素材から作るのではなく、親のMemoryCoreからコピーする。

## Blueprintが不要な理由

「何を作るか」は静的データ（Blueprint）ではなくProgramの行動指示であり、変更可能。
Programの組立指示を変えれば異なる構成の娘が生まれる。これにより進化が自然に発生する。

## 自己複製の手順

Programが以下の行動を記述し、Processorが各コンポーネントへ命令を発行する:

```
1. GATHER   資源ノードへ移動(Actuator) → 採取(Harvester) → 原料を取得
2. PROCESS  原料を加工素材へ変換(Assembler)
3. CRAFT    加工素材からコンポーネントを製造(Assembler) ← 何を作るかはProgramが指定
4. CRAFT    空のMemoryCoreを製造(Assembler)
5. ASSEMBLE コンポーネント群を組み立て(Assembler) → 非活性キャラクター体（隣接タイルに配置）
6. WRITE    自身のMemoryCore内容を娘のMemoryCoreへコピー(Processor) → 娘が活性化
```

### 各ステップの意味

- **ステップ3**: 「何を作るか」がProgramに埋め込まれた組立指示。ここを変えれば異なる構成の娘が生まれる
- **ステップ4**: 空のMemoryCoreを物理製造する（データなし）
- **ステップ5**: MemoryCoreを含むコンポーネント群を組み立てると `program: null` の非活性キャラクターが生成される
- **ステップ6**: データをコピーする。ステップ4と6でクワインの2段階構造が成立する。WRITEによりProgramが書き込まれた時点で娘は活性化する（`program: null` → `program: Program`）

### ACTIVATEについて

仕様上は手順の最終ステップとしてACTIVATEが定義されていたが、実装ではWRITEによるProgramの書き込みが
完了した時点でキャラクターが活性状態（`program != null`）になるため、ACTIVATEは冪等な操作となる。
ACTIVATEを省略してもProgramの伝達と活性化は成立する。

### WRITEの対象指定

WRITEの `target` に `"nearest_inactive"` を指定すると、隣接タイル（マンハッタン距離1以内）にいる
非活性キャラクターが自動的に解決される。ASSEMBLEで生成された娘は必ず隣接タイルに配置されるため、
ASSEMBLE直後のWRITEで `nearest_inactive` を使用すればIDを事前に知らなくてもProgramを伝達できる。

- 各コンポーネントの製造レシピは**世界のルール**として存在し、Programは「何を作れ」と指示するだけ

## 検証ポイント

1. Programの組立指示でBody構成を自由に決定できるか
2. MemoryCoreのデータコピーでProgramが正しく伝達されるか
3. Program内の組立指示の変更で進化（異なる構成の娘）が実現できるか

## 進化のメカニズム

自己複製のステップ3で指定するコンポーネントリストを変更すると、親とは異なる構成の娘が生まれる。
Programの自己書き換え（ステップ6の前にMemoryCoreを編集）により、行動ロジックも変更可能。

### 実装上の進化の実現方法

プロトタイプでは、Program内のASSEMBLE命令が保持するコンポーネントリストを外部から変更する
`evolveProgram()` ユーティリティにより進化をテストで検証している。
ランタイムでのProgram自己書き換え機構は本プロトタイプの範囲外とする。
