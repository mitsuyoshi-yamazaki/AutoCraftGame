# プロトタイプ実装プロンプト

このプロンプトは、ゲーム仕様（`docs/specs/`）と開発ルール（`CLAUDE.md`, `.claude/rules/`）が格納されたリポジトリに対して実行し、動作するプロトタイプを生成するためのものである。

---

CLAUDE.md を読み、仕様（`docs/specs/`）と開発ルール（`.claude/rules/`）を把握せよ。
その後、以下の手順でプロトタイプを実装せよ。

## 1. プロジェクト初期化

- `package.json` を作成（`type: "module"`, scripts: `test`, `sim`）
- `vitest.config.ts` を作成（`test/**/*.test.ts` を対象）
- 依存パッケージをインストール（`typescript`, `vitest`, `tsx`）
- `tsconfig.json` が存在しない場合のみ作成する

## 2. 仕様の読み込みと型定義（src/types.ts）

`docs/specs/` 配下の全仕様ファイルを読み、以下の型を定義する:

- 素材の型（原料・加工素材・コンポーネント）— `game_spec.md`
- インベントリ、座標、方向
- 資源ノード — `application_spec.md`
- Condition / Action / Rule / Program — `character_program_spec.md`
- Character（components, inventory, durability, program, senseData）— `character_spec.md`
- World（width, height, resourceNodes, characters, tick）— `application_spec.md`
- SimulationEvent, TickResult, ActionResult
- レシピ型（ProcessRecipe, CraftRecipe）— `game_spec.md`

## 3. コアモジュールの実装（依存順に着手）

**実装順序を厳守する。各モジュールは前段のモジュールのみに依存する。**

### 3-1. src/recipes.ts（game_spec.md）
- PROCESS_RECIPES: 原料 → 加工素材
- CRAFT_RECIPES: 加工素材 → コンポーネント
- MIN_COMPONENTS: 最小構成キャラクターのコンポーネントリスト
- FRAME_DURABILITY: 定数（仕様のキャラクター耐久モデルに基づく）
- ヘルパー: `findProcessRecipe`, `findCraftRecipe`, `hasItems`, `removeItems`, `addItem`

### 3-2. src/world.ts（application_spec.md）
- `createWorld(width, height)`: マップ生成、資源ノード配置
- `regenerateResources`: 資源ノード再生（仕様の再生ルールに従う）
- `resourceNodeAt`, `depleteNode`: 資源ノード操作
- `updateCharacter`, `addCharacter`, `removeCharacter`, `getCharacter`
- `isInBounds`: マップ境界チェック
- `nextCharacterId`: ID採番（Worldの状態として管理）

### 3-3. src/character.ts（character_spec.md）
- `createCharacter`: アクティブキャラクター生成（Program付き）
- `createInactiveCharacter`: 非活性キャラクター生成（Program=null）
- `hasComponent`, `isActive`, `decayDurability`, `isDead`
- durability初期値 = Frame数 × FRAME_DURABILITY

### 3-4. src/program.ts（character_program_spec.md）— 最大かつ最重要

**Condition評価:**
- `inventory_has`, `nearby`, `durability_below`, `true`
- 論理結合: `and`, `or`, `not`（ネスト可能）

**Action実行:**
- MOVE, HARVEST, PROCESS, CRAFT, ASSEMBLE, WRITE, ACTIVATE, SENSE, REPAIR, NOOP

**設計上の重要ポイント（過去の実装から得た知見）:**

1. **EvalContext パターン**: `toward_nearest` は、同一ルールの Condition 内で最後にマッチした `nearby` の対象型に基づいて方向を決定する必要がある。Condition評価時にコンテキストを蓄積し、Action実行に渡す。
   - `evaluateProgram` は `{ action, context }` を返す
   - `context` には `lastNearbyType` を含む
   - `executeAction` は `context` を受け取り、MOVE の `toward_nearest` 解決に使う

2. **`nearest_inactive` ターゲット解決**: WRITE と ACTIVATE は `target` にキャラクターIDまたは `"nearest_inactive"` を受け取る。`"nearest_inactive"` は実行時に隣接する非活性キャラクターのIDに解決する。
   - ASSEMBLE で生成された子のIDは事前に不明
   - `resolveTarget()` ヘルパーで実行時に解決する

3. **ASSEMBLE**: inventoryからコンポーネントを消費し、隣接タイルに非活性キャラクター（program=null）を配置する。character_spawned イベントを発行する。

4. **WRITE**: 親のProgramを `JSON.parse(JSON.stringify())` でディープコピーし、対象のMemoryCoreに書き込む。shallow copyでは親子間で参照が共有されるため不可。

5. **Action失敗**: 対象コンポーネント未搭載・素材不足・対象不在はすべて `success: false`。ティックは消費するが副作用なし。

### 3-5. src/replication.ts（self_replication_spec.md）
- `deepCopyProgram`: JSON deep copy
- `programsAreEqual`: JSON文字列比較
- `evolveProgram`: ASSEMBLEのコンポーネントリストを差し替え
- `getAssemblyComponents`: Programから組立指示を抽出
- `findAdjacentInactive`: 隣接する非活性キャラクターを検索

### 3-6. src/simulation.ts（application_spec.md のゲームループ）

ゲームループの**フェーズ順序を厳守**する:
```
1. 全アクティブキャラクターの行動決定（Program評価）
2. 全アクションの実行（決定フェーズのスナップショットに基づく）
3. 耐久値の自然劣化（全キャラクター）
4. 死亡判定（durability ≤ 0 を除去、character_died イベント）
5. 資源ノード再生
6. ティックカウンタ++
```

- `executeTick(world)`: 1ティック実行 → `TickResult`
- `runSimulation(world, ticks, onTick?)`: N ティック実行、キャラクター0体で早期終了

**注意**: ステップ1で決定リストを作成し、ステップ2でそれを順に実行する。ステップ2中に生成された新キャラクターは同一ティックでは行動しない。

## 4. テストの作成と実行

各モジュールに対応するテストファイルを `test/` に作成する。

### 必須テスト（検証事項）— replication.test.ts

仕様の検証事項3件を**直接テストケースとして**記述する:

1. **Programの組立指示でBody構成を自由に決定できる**
   - ASSEMBLEに異なるコンポーネントリストを渡し、生成されたキャラクターのBody構成が指示通りであることを確認

2. **MemoryCoreのデータコピーでProgramが正しく伝達される**
   - WRITEで親のProgramを子にコピーし、内容が一致すること、かつディープコピーであること（参照非共有）を確認

3. **Program内の組立指示の変更で進化（異なる構成の娘）が実現できる**
   - ASSEMBLE指示のコンポーネントリストを変更したProgramで子を生成し、元のProgramとは異なるBody構成であることを確認
   - WRITEで変更後のProgramが伝達されることを確認

### その他テスト
- recipes.test.ts: レシピ定義、素材計算
- character.test.ts: 生成、コンポーネント確認、耐久値減衰
- program.test.ts: Condition評価、Action実行（MOVE, HARVEST, PROCESS, CRAFT）
- simulation.test.ts: ティック進行、死亡判定、資源再生

**テスト実行**: 各モジュール実装後に `npm test` を実行し、全テストが通過することを確認する。

## 5. CLIとサンプルProgram

### 5-1. src/cli.ts
- CLIオプション: `--ticks N`, `--program <path>`, `--map-size WxH`, `--output <tick|final|events>`
- ProgramのJSONファイルを読み込み、`comment` フィールドを除去して `Program` 型に変換する
- 初期キャラクターをマップ中央に配置
- JSON形式で結果を標準出力

### 5-2. programs/self-replicator.json

自己複製を行う最小構成のProgram。ルール優先度順:

1. **WRITE** — 隣接する非活性キャラクターにProgramをコピー（`target: "nearest_inactive"`）
2. **ASSEMBLE** — 全コンポーネントが揃ったら組み立て
3. **CRAFT** — 各コンポーネントを製造（素材が揃い次第、1つずつ）
4. **PROCESS** — 原料を加工素材に変換（しきい値まで）
5. **HARVEST** — 資源ノード上にいるとき採取（`nearby(type, radius=0)` で判定）
6. **MOVE** — 必要な資源に向かって移動（`toward_nearest`）
7. **NOOP** — デフォルト

**設計上の注意点:**

- HARVEST は `nearby(OreNode/CrystalNode, radius=0)` で「資源ノード上にいる」ことを判定する。radius > 0 で MOVE が先にマッチするとノード上で永遠に移動し続ける問題を回避する
- CRAFT ルールは素材が揃い次第即座に実行される（全素材を先に蓄積する必要はない）
- PROCESS のしきい値は仕様の必要素材合計に基づく
- WRITE を最優先にすることで、ASSEMBLE 直後の次ティックで子にProgramがコピーされる。WRITE後は子が `program != null` となり `InactiveCharacter` ではなくなるため、WRITE ルールは1回だけ発火する
- 全素材数（Ore, Crystal）、全加工素材数（Metal, Circuit）の正確な計算が必要

### 5-3. シミュレーション実行

```
npm run sim -- --ticks 500 --program programs/self-replicator.json --output events
```

を実行し、`character_spawned` イベントが発生すること（= 自己複製の成功）を確認する。

もし自己複製が成功しない場合:
- `--output tick` で毎ティックの状態を確認する
- キャラクターの位置が振動していないか（移動ルールとharvestルールの優先度問題）
- 素材の蓄積が進んでいるか（PROCESSのしきい値が正しいか）
- 耐久値が複製完了前に尽きていないか（FRAME_DURABILITYの調整が必要か）

## 6. 結果の保存

`results/` ディレクトリを作成し、以下を保存する:

- `results/events.json` — 500ティックのイベント出力
- `results/tick_log.jsonl` — 全ティックの状態ログ（`--output tick`）
- `results/initial_conditions.json` — 再現に必要な初期条件（マップサイズ、Program、初期位置、再現コマンド）
- `results/report.md` — 世代交代の記録、統計（複製周期、寿命）、検証結果

## 7. README.md の作成

- セットアップ手順（`npm install`）
- コマンド一覧（test, sim + 全オプション）
- 実行例
- Programの書き方（Condition/Action一覧、レシピ一覧）
- プロジェクト構造
