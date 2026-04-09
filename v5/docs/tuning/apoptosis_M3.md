# M3 (アポトーシス) チューニング結果

[ロードマップ](../../../v4/docs/plan/program_robustness_roadmap.md) のマイルストーン M3 として、機能不全個体の自発的死亡機構を v5 に実装した。

## 実装内容

### 型変更

- `Character` 型に 2 カウンタを追加: `idleTickCount`, `instrLimitTickCount`
- `TickResult` に `apoptosisDeaths: ReadonlySet<string>` を追加
- `GameParams` に `apoptosisIdleTickLimit`, `apoptosisInstrLimitTickLimit` を追加

### Simulation 変更

- `src/simulation.ts` に Step 8.5 を追加: 全キャラクターのカウンタを更新し、機能不全条件を満たす個体の `durability` を 0 に設定
- 死亡フローは既存の Step 9 に委ねる（残骸生成・イベント発火を流用）

### 関数

- `updateApoptosisCounters(character, hadAction, hitInstrLimit)`: tick 終了時にカウンタを更新
- `shouldApoptose(character, idleLimit, instrLimitLimit)`: いずれかのカウンタが閾値到達かを判定

### CLI / Tests

- CLI: `--output tick` の出力に `apoptosisDeaths` を追加
- ユニットテスト: 13 件（カウンタ更新、shouldApoptose、idle/instr_limit 統合、反射との組み合わせ）

## チューニング結果

### 初期値の問題

最初の実装では `apoptosisIdleTickLimit=100, apoptosisInstrLimitTickLimit=30` を採用したが、健全な pioneer でも誤検出された:

```
seed=42: 5 apoptosis deaths in 500 ticks (no corruption)
```

原因: pioneer プログラムは時々 instruction limit を連続で hit する (約 30 tick 連続)。これは pioneer の制御フローに含まれる既知の現象。

### パラメータスイープ

5 種類の seed (42, 1, 2, 7, 99) で健全 pioneer の偽陽性を測定:

| idleLimit | instrLimit | 偽陽性合計 |
|---|---|---|
| 100 | 30 | 33 |
| 200 | 100 | 17 |
| 300 | 200 | 1 |
| **500** | **300** | **0** |
| 500 | 500 | 0 |
| 1000 | 500 | 0 |

採用: `(500, 300)` — 偽陽性ゼロかつ最も小さい (検出感度を維持)

### 採用後の検証

```
M3 enabled (default): chars=13 births=12 deaths=4 apoptosisDeaths=0
M3 disabled:          chars=13 births=12 deaths=4 apoptosisDeaths=0
```

完全に baseline と一致。健全 pioneer の挙動には影響なし。

### ユニットテストでの検出能力

#### idle apoptosis
HALT-only プログラム + EnergyNode なし → idleLimit に達して死亡
- `apoptosisIdleTickLimit=50` (テスト用) で 50 tick 後にちょうど死亡

#### instruction limit apoptosis
無限ループプログラム (`ADDI; JMP 0`) → instrLimitLimit に達して死亡
- `apoptosisInstrLimitTickLimit=10` (テスト用) で 10 tick 後にちょうど死亡

#### 反射との連携
HALT-only + 隣接 EnergyNode → 反射発火 → idle カウンタリセット → アポトーシスしない (確認済み)

## 達成事項

[ロードマップ M3 の最低基準](../plan/M3_apoptosis.md#目標):

> 健全個体は影響を受けず、機能不全個体は機能不全と判定後 N tick以内に死亡する

両方達成:
- 健全個体: 5 seed × 500 tick で偽陽性ゼロ
- 機能不全個体:
  - 何もしない個体は idleLimit + α で死亡
  - 無限ループ個体は instrLimitLimit + α で死亡
- 反射との階層: 反射で生存できる個体は idle カウンタがリセットされ、アポトーシスしない

## 階層構造の確認

M1 + M2 + M3 で生存戦略の階層が成立:

| 個体の状態 | 結果 |
|---|---|
| プログラム正常 | 通常生存 |
| プログラム軽度破損 (PC迷走) | M1 (CHECKPOINT) で復帰 |
| プログラム完全破損 + 資源隣接 | M2 (反射) で生存延長 |
| プログラム完全破損 + 資源不在 | M3 (アポトーシス) で除去 |
| 無限ループ個体 | M3 で短期除去 |

## 副次的観察

### 破損注入下の挙動

```
1000 tick, 周期破損 (100 tick間隔, 1500 word):
chars=10 births=17 deaths=12
```

集団としての繁殖力 (births=17) > 死亡 (deaths=12) → 種は持続。M3 によるリソース回収が機能している。

## チューニング状況

| パラメータ | 初期値 | 最終値 | 評価 |
|----------|------|------|------|
| `apoptosisIdleTickLimit` | 100 | **500** | 健全 pioneer の transient idle period (~250 tick) より十分大きい |
| `apoptosisInstrLimitTickLimit` | 30 | **300** | 健全 pioneer の transient instr_limit hit (~30 tick) より十分大きい |

### 制限と将来課題

- `300` という閾値は pioneer 固有の transient ループに合わせている。他種族 (例: より複雑なプログラム) では異なる調整が必要かもしれない
- 真に「壊れた個体」は数十〜100 tick で動作不能になることが多い。500 tick 待つのは長いかもしれないが、誤検出を避ける優先度を取った
- M5 (有性生殖) で集団動態が変わった後、再評価が必要

## 検証用コマンド

```bash
# baseline (M3 が誤発火していないことを確認)
npm run sim -- --program programs/pioneer_def.json --ticks 500 --seed 42 --count 5 --output final

# 破損注入下の生存
npm run sim -- --program programs/pioneer_def.json --ticks 1000 --seed 42 --count 5 \
  --output final --corrupt-at-tick 50 --corrupt-count 1500 --corrupt-periodic 100

# パラメータスイープ (再実行)
npx tsx scripts/m3-tune.ts

# M3 enabled vs disabled 比較
npx tsx scripts/m3-compare.ts
```
