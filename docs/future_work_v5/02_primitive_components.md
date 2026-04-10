## ゲーム性の実現に向けた提案 — primitive制御コンポーネントの導入

本文書は [01_program_robustness.md](01_program_robustness.md) の「ゲーム性」項に記載されたオンボーディング体験を、現状の v5 アプリケーションから達成するために必要な要素と実現方法をまとめる。

---

### 1. 現状（v5）と「ゲーム性」項とのギャップ

| 要求 | v5現状 | ギャップ |
|---|---|---|
| 単純機能の制御コンポーネント | Processor (Mini-C+VM) しか制御手段がない | **存在しない** |
| プレイヤーが段階的にキャラを組む | UIは観察者専用。初期状態は `*_def.json` で固定 | **構築UI不在** |
| 「Processor は他コンポーネントより遥かに高価」 | 原料換算は Frame=6, Processor=6 と同等。基礎代謝も `Processor=2` 程度 | **コスト差が小さい** |
| 「単純制御だけで自己複製可能」 | 全種が Mini-C プログラムに依存 | **未検証** |
| プレイヤーの段階的オンボーディング | チュートリアル・段階制限なし | **未設計** |

「進化が可能なこと」は v5 が既に実証済み（asex_evolver / sex_evolver）だが、**「人間がプログラム可能」かつ「単純制御で動く」** 側がまったく整備されていない。

---

### 2. 達成に必要な要素と実現案

#### 2-1. 制御プリミティブ層の新設（最優先）

「論理ゲート（閾値設定可）」イメージの**単純制御コンポーネント**を新規導入する。Processor は触らずに並置する（仕様の `ComponentType` を拡張）。

候補となる primitive コンポーネント（最小セット）:

| 名称 | 役割 | 設定パラメータ | コスト目安 |
|---|---|---|---|
| `Threshold` | 入力センス値が閾値を超えたら出力ON | comparator(<,>), threshold | Circuit ×1 |
| `Selector` | 「最近接の○○」のようなターゲット選択 | type filter (resource/energy/character) | Circuit ×1 |
| `Sequencer` | 複数アクションを順番に発火 | step list (固定長, 例: 4) | Circuit ×2 |
| `Trigger` | 特定イベント（インベントリ満杯, durability 低下等）でアクション発火 | event id, action id | Circuit ×1 |
| `Wire` | コンポーネント間を接続（結線） | from, to | (質量0, 構造のみ) |

**重要な設計原則**:
- 各 primitive は **設定値が破壊されても致命的に壊れない**（不正値→デフォルト動作）
- 構成要素の数・種類が変わっても**部分動作する**
- VM や PC の概念を持たず、tick ごとに**入力→出力**の組合せ論理だけで動く
- 既存の reflexes (M2) を一般化したものと見なせる

実装イメージ：`v5/src/types.ts` に `PrimitiveComponent` 型を追加し、`v5/src/engine.ts` のループで Processor 実行（ステップ2）と並列に「primitive 評価フェーズ」を挿入する。

#### 2-2. 段階的オンボーディングを成立させる「機能対応表」

ゲーム性項の各ステージに必要な primitive 構成を逆算する。

| ステージ | 必要コンポーネント | 想定構成例 |
|---|---|---|
| ① 探して移動 | Frame + Actuator + Sensor + `Selector` + `Sequencer` | Sensor → Selector(nearest ResourceNode) → Actuator(MOVE toward) |
| ② 一定期間生存 | + Charger + `Threshold` + `Trigger` | Threshold(energy<X) → Trigger(RECHARGE) （実質ステージ① + 自動充電） |
| ③ クラフト可能 | + Harvester + Assembler + `Sequencer`(harvest→process) | 資源回収 → PROCESS シーケンス |
| ④ コンポーネントクラフト | （同上、ASSEMBLE出力先=世界） | CRAFT → 放出 |
| ⑤ コンポーネント集合 | （ASSEMBLE 引数を `Sequencer` で組む） | 構造の固定パターン射出 |
| ⑥ 自己複製 | + Disassembler 不要、自己コピーループ | primitive構成を**コピーして子に転写**する Assembler 拡張が必要 |
| ⑦+ Processor 含む | Processor / MemoryCore 投入 | ここから先は既存 v5 と接続 |

**ステージ⑥の壁**：現状の ASSEMBLE は「コンポーネント数を指定」するだけで「子に何を組み込むか」のレシピを指定できない。primitive ベースの自己複製を可能にするには、ASSEMBLE I/O に **「子の primitive 構成と結線パターン」を指定する欄** を追加する必要がある（または「自分の構成を丸ごとコピー」する `SELF_REPLICATE` プリミティブ動作）。後者の方が単純で、解決案Aの精神に合致する。

#### 2-3. コスト体系の再設計

`game_spec.md` の原料換算と、`params.ts` の `metabolism` を以下方針で書き換える：

- **Processor**: 原料換算 6 → **20 程度**（Circuit ×10 等）、metabolism 2 → **10 程度**
- **MemoryCore**: 原料換算 4 → **8 程度**
- **新 primitive**: いずれも原料換算 1〜2、metabolism 0〜1
- 結果: 「primitive 5個」≒ Processor 1個 のコスト感（仕様文の「組合せより遥かに安価だが他より遥かに高価」を満たす）

これにより：
- 序盤プレイヤーが Processor なしで生存サイクルを組める
- 進化系統（既存 asex_evolver 等）は Processor を使い続けられるが、コストペナルティとして表れる → 自然な圧として primitive 化を促す

#### 2-4. プレイヤー向け構築UI

`v5/ui/main.ts` 側に**キャラクター・エディタ画面**を追加する。最小機能：

1. パレット：使用可能なコンポーネントとprimitiveの一覧
2. キャラクター枠：選んだコンポーネント数を編集
3. 結線エディタ（primitive 同士の `Wire` を引く簡易グラフUI）
4. 「世界に配置」ボタン：現在のシミュレーションへ初期キャラとして注入
5. ステージ進行：上記対応表の順にロックを解除する（チュートリアル制）

ここは仕様書（`docs/specs/`）には現状エディタUIの記述がないので、`docs/specs/editor_spec.md` を新設する必要がある。

#### 2-5. プログラム定義フォーマットの拡張

現状の `v5/programs/*_def.json` は `name / count / components / program(bin)` の形式。primitive 構成を扱うには、`def.json` 仕様に以下を加える：

```json
{
  "name": "stage1_seeker",
  "components": { "Frame":1, "Actuator":1, "Sensor":1 },
  "primitives": [
    { "id":"sel1", "type":"Selector", "config": {"filter":"ResourceNode"} },
    { "id":"seq1", "type":"Sequencer", "config": {"steps":["MOVE_TOWARD"]} }
  ],
  "wires": [ ["sel1.out", "seq1.in"] ],
  "program": null
}
```

`program` フィールドを optional 化し、Processor 非搭載キャラを表現できるようにする。

#### 2-6. 検証ステップ（解決案Aの核心問題への回答）

> 「そのような低機能コンポーネントの組み合わせだけで自己複製や進化が可能か？」

これは仕様策定と並行して **CLI 実験スクリプト**で検証すべき。具体的には：

1. ステージ①〜⑤の各構成を `programs/primitives/` 配下に手書き
2. `v5/src/tools/` に `runPrimitiveExperiment.ts` を追加し、Processor を持たないキャラ群だけで 10000 tick 走らせる
3. 結果を `v5/docs/tuning/primitive_viability.md` に記録
4. 「自己複製まで可能」の構成が見つかれば solution A は成立

これに失敗する場合は、primitive のセットが不足しているか、ASSEMBLE 仕様の拡張（2-2のステージ⑥の壁）が必要、と判断できる。

---

### 3. 実装順序の提案

依存関係の浅い順に：

1. **コスト体系の暫定パラメータ更新** — `params.ts` のみ書き換えで試せる、既存種に影響を出して動機を実証
2. **`PrimitiveComponent` 型と評価ループ** — `types.ts`/`engine.ts` 拡張、Processor 実行と並走
3. **最小 primitive セット実装**（Threshold / Selector / Trigger / Sequencer）
4. **`def.json` フォーマット拡張と loader 対応**
5. **ステージ①②の手書き構成 → CLI で生存検証**
6. **ASSEMBLE 拡張（自己構成の転写機構）** ← 自己複製まで一気通貫させるための鍵
7. **エディタ UI**（ここで初めてプレイヤー視点が成立）
8. **チュートリアル進行制御** — 段階解禁機構
9. **`docs/specs/editor_spec.md`, `primitives_spec.md` 整備**

---

### 4. 留意点

- v5 は既に進化シミュレータとしては動いている。**「ゲーム性」項は別軸の機能追加**であり、既存の進化実験を壊さないよう Processor 系統と primitive 系統を**並走**させる設計が望ましい。
- 解決案A の検証が不成立（primitive だけでは自己複製不能）だった場合、それはバージョンを変える根拠になる（v6 で primitive をより表現力ある形に再設計、等）。先にステップ5の検証で**「行ける手応え」を取る** ことを推奨する。
- これは大きな機能群なので、まず本文書のような提案を起点に、`primitives_spec.md` の草案作成へ進むのが現実的な次の一歩。
