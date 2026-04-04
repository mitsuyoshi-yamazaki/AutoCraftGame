# Reset後のパフォーマンス低下

## 現象

- GUIアプリケーションでResetボタンを押すと処理落ち（時間あたりtick数の減少）が発生する
- ブラウザのページリロードでは問題なし
- Resetボタンを複数回押しても悪化しない（初回Resetのみ低下し、以降は同程度）

## 実施済みの対策

1. **pixi.js Graphics の破棄漏れ修正** — `removeChildren()` 後に各子要素の `.destroy()` を呼び出し
2. **pixi.js 自動レンダーティッカーの停止** — `app.ticker.stop()` で60fps自動レンダーを停止し、`draw()` 内で明示的に `app.render()` を呼び出す方式に変更
3. **不要な `allEvents` 蓄積の除去** — 毎tick O(n) の配列コピーを行っていた未参照フィールドを削除

いずれも合理的な改善だが、「初回Resetのみ低下」の現象は解消されていない。

## 未検証の仮説

- pixi.js の `resizeTo` による内部リサイズ監視の干渉
- pixi.js のシェーダ/バッチキャッシュによるGPUメモリ圧迫
- V8 JIT 最適化の破棄（`createEngine()` でのオブジェクト再生成時）
- `setInterval` と `requestAnimationFrame` のスケジューリング競合

## 推奨する調査方法

ブラウザの Performance プロファイラで以下を比較計測する:

1. 初回実行時の `step()` 1回あたりの所要時間
2. Reset後の `step()` 1回あたりの所要時間

内訳（`engine.executeTick` / `appendEvents` / `renderer.draw`）を特定し、ボトルネック箇所を絞り込む。
