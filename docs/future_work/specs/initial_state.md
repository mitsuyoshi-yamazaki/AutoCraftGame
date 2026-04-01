# 初期状態仕様 — v2

本文書はゲーム世界の初期状態（ワールド生成時のオブジェクト配置）を定義する。
ゲームの法則（物理ルール）は `game_spec.md` で定義される。

初期状態はCLIパラメータまたは設定ファイルで変更可能とする。以下はデフォルトの初期状態である。

---

## 1. マップ

- サイズ: 20×20（CLIパラメータ `--map-size` でオーバーライド可能）

## 2. ResourceNode配置

- ノード数: 各タイプ12個（OreNode 12、CrystalNode 12）
- 各ノードの初期remaining: `NODE_DEFAULT_REMAINING`（CLIパラメータで指定、要調整）
- 配置方式: `--distribution` パラメータで制御

### 配置方式

#### uniform（デフォルト）
- v1互換。マップ上にランダム配置（seeded PRNG使用）

#### clustered
- 各資源タイプについて、クラスタ中心をランダムに決定（中心数はパラメータ `--clusters`）
- 各ノードをいずれかのクラスタ中心の周辺にランダム配置
- クラスタ中心に近いノードほど `remaining` が大きい（鉱脈の中心は豊か）

## 3. EnergyNode配置

- ノード数: CLIパラメータ `--energy-nodes` で指定（要調整）
- 各ノードのパラメータ:
  - `productionRate`: CLIパラメータで指定（要調整）
  - `maxStored`: CLIパラメータで指定（要調整）
  - `stored`: 初期値は `maxStored`（開始時は満タン）
- 配置方式: ResourceNodeと同様、`--distribution` パラメータに従う

## 4. 初期キャラクター

- 1体をマップ中央に配置
- ProgramはCLIパラメータ `--program <path>` で指定したJSONファイルから読み込む
- コンポーネント構成: MIN_COMPONENTS（v1と同様）
- 初期エネルギー: CLIパラメータ `--initial-energy` で指定（要調整。自己複製1回分以上を推奨）
- キャラクターIDは `char-001` から順に割り当て

## 5. 初期状態の定数

| 定数名 | 意味 | デフォルト値 | 備考 |
|--------|------|-------------|------|
| `NODE_DEFAULT_REMAINING` | ResourceNodeのデフォルト初期資源量 | (要調整) | |
| `ENERGY_NODE_COUNT` | EnergyNodeの数 | (要調整) | |
| `ENERGY_NODE_PRODUCTION_RATE` | EnergyNodeのデフォルト生産レート | (要調整) | |
| `ENERGY_NODE_MAX_STORED` | EnergyNodeのデフォルト蓄積上限 | (要調整) | |
| `INITIAL_CHARACTER_ENERGY` | 初期キャラクターのエネルギー | (要調整) | |
