# 実験09の初期状態を UI に追加する — 状態

## ① 状態

**完了**（2026-09-23）。コミット済み、push はしていない。

## ② 追加した3項（`src/experiments.ts` の `EXPERIMENTS`、`evolution` と `competition` の間）

| id | label | build | params | defaultSeed |
|---|---|---|---|---:|
| `evolution-param-best` | 形質の進化（最良シード） | `buildLongevousConfig(seed, { evolvable: { target: 'param', gateMask: 0 } })` | `EVOLUTION_PARAMS` | 12 |
| `evolution-plan` | 振る舞いの進化（工程表の変異） | `buildLongevousConfig(seed, { evolvable: { target: 'plan', gateMask: 0 } })` | `EVOLUTION_PARAMS` | 26 |
| `evolution-param-mobile-world` | 形質の進化（資源を増やさない世界） | `buildLongevousConfig(seed, { evolvable: { target: 'param', gateMask: 0 } })` | `MOBILE_PARAMS` | 26 |

既存項の振る舞いは変えていない。変えたのは `evolution` の description だけで、末尾に
「変異率1/2で、下の『形質の進化（最良シード）』とは条件が違う」を足した。

## ③ 検査

| 検査 | 結果 |
|---|---|
| `npx tsc --noEmit` | 通過 |
| `npm test` | 20ファイル・115件すべて通過 |
| `npm run verify:ui` | すべて通過（WARN 1件は既存の `ui/visual-language-model.js:220`。今回の変更とは無関係） |
| 既存実験の不変 | `recording`/seed 5・`longevous`/seed 26・`evolution`/seed 26 を UI と同じ経路で3000tick回し、ワールド全体の sha256 が変更前と一致 |
| 新3項＝CLIの本番条件 | UI の経路（`experiment.build(seed)`）と `evolution-run.ts` の経路（`founders: 4, mutate: true, paramOverrides: {}` と `{...config, seed}`）で4000tick回し、3項ともワールド全体の sha256 が一致 |
| 生ログの再現 | `evolution-run.ts --target param --gate 0 --seed 12 --ticks 60000` の births を、コミット済みの `data/09/births_evolve-param-g0_s12.jsonl` と比べた → **バイト単位で一致**（`cmp` 差分なし）。集計は births 165・peakAlive 55・finalAlive 54。依頼文の 164／54 とは1ずれるが、ログ自体が同一なので集計の数え方の違いと見ている |
| UI の実機 | vite と headless Chrome（DevTools プロトコル）で確認。3項がドロップダウンに出る。選ぶと seed 欄が 12/26/26 になり、説明文が出て、再生で tick が進む。コンソールエラーなし |

## ④ 起動

```
cd v9
npm run ui        # vite。表示された URL をブラウザで開く
```

「実験」のドロップダウンで3項のどれかを選び、▶ 再生を押す。

## ⑤ 申し送り

- **報告された数（出生164など）は 60000tick の値。** 20000tick 時点では seed 12 の形質の腕でも
  出生33・同時23しかない。画面で違いを見るには速度スライダを上げて 60000tick 近くまで回す必要がある。
  コード中のコメントには「60000tickで」と書いた。
- `recording` は 1 行も変えていないが、字幕の台本 `ui/recording-captions.json` は **今回より前から**
  v9.5.9 で作られており、今の版（今回 9.5.11 → 9.5.12）と合わず、画面に作り直しを促す注記が出る。
  今回の変更はこのずれに関係しない。録画に使うなら `npm run recording:script` で作り直すこと。
- 版は規約どおりパッチを上げた（9.5.12）。シミュレータの処理は変えていない。
