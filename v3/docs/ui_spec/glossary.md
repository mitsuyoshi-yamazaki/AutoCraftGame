# GUI 用語集 — v3

UIコンポーネント、状態、アクションの名前を統一するための用語集。

---

## UIコンポーネント（画面要素）

| 用語 | HTML id / CSS | 説明 |
|------|--------------|------|
| ControlBar | `#controls` | 画面最上部の操作バー |
| ResetButton | `#btn-reset` | ランダムシードでリセット |
| FitButton | `#btn-fit` | ワールド全体表示にリセット |
| SaveButton | `#btn-save` | ゲーム状態をJSONで保存 |
| LoadButton | `#btn-load` | JSONからゲーム状態を復元 |
| PlayPauseButton | `#btn-play-pause` | 一時停止/再開トグル（▶ / ⏸） |
| StepButton | `#btn-step` | 一時停止中のみ有効、1tick進める |
| SpeedDownButton | `#btn-speed-down` | tick/sを1減らす（◀） |
| SpeedUpButton | `#btn-speed-up` | tick/sを1増やす（▶） |
| SpeedDisplay | `#speed-display` | 現在のtick/s値表示 |
| TickDisplay | `#tick-display` | 現在のtick番号表示 |
| VersionDisplay | `#version-display` | ゲームバージョン表示（`vX.Y.Z`） |
| Canvas | `#canvas-container` | pixi.js描画領域 |
| SidePanel | `#side-panel` | 右サイドパネル（統計 + 選択情報） |
| StatsPanel | `#stats` | 統計情報セクション |
| SelectedPanel | `#selected` | 選択オブジェクト詳細セクション |
| SelectedContent | `#selected-content` | 選択オブジェクト詳細の内容領域 |
| EventLog | `#event-log` | 画面下部のイベントログ領域 |
| EventLogContent | `#event-log-content` | イベントログのスクロール可能な内容領域 |

### StatsPanel 内の統計項目

| 用語 | HTML id | 表示内容 |
|------|---------|---------|
| StatCharacters | `#stat-characters` | 生存キャラクター数 |
| StatBirths | `#stat-births` | 累計誕生数 |
| StatDeaths | `#stat-deaths` | 累計死亡数 |
| StatResources | `#stat-resources` | 残存ResourceNode数 |
| StatEnergy | `#stat-energy` | EnergyNode総stored量 |
| StatRemains | `#stat-remains` | 残骸数 |
| StatSpecies | `#stat-species` | 種族ごとの個体数（クリック可能） |

---

## 状態（UIState）

| 用語 | 型 | 説明 |
|------|-----|------|
| UIState | interface | UI全体の状態を保持するオブジェクト |
| Selection | union type | 現在選択中のオブジェクト情報（null = 未選択） |
| DrawSelection | union type | renderer.tsに渡す選択情報（Selectionと同構造） |
| running | boolean | シミュレーション実行中かどうか |
| ticksPerSecond | number | 現在のtick/s設定値 |
| characterActions | Map | 直前のtickで各キャラクターが実行したアクション |
| sessionStartedAt | string | セーブ用のセッション開始日時 |
| resumedAt | string \| null | ロード後のセッション再開日時 |
| recentSavedEvents | SavedEvent[] | セーブに含める直近イベント（最大10件） |

### Selection の kind 一覧

| kind | 選択対象 | 追加フィールド |
|------|---------|---------------|
| `'character'` | キャラクター | `id: string` |
| `'resourceNode'` | 資源ノード | `id: string` |
| `'energyNode'` | エネルギーノード | `id: string` |
| `'remains'` | 残骸 | `id: string` |
| `'ground'` | 地面セル | `cellX: number, cellY: number` |
| `null` | 未選択 | — |

---

## ユーザーアクション

| 用語 | トリガー | 説明 |
|------|---------|------|
| ToggleRunning | PlayPauseButton click / Space key | 一時停止⇔再開を切り替える |
| Step | StepButton click | 一時停止中に1tick進める |
| SpeedUp | SpeedUpButton click | tick/sを+1する |
| SpeedDown | SpeedDownButton click | tick/sを-1する |
| Reset | ResetButton click | ランダムシードで新規ゲーム開始 |
| FitView | FitButton click | ズーム・パンをリセットしワールド全体を表示 |
| Save | SaveButton click | ゲーム状態をJSONファイルとしてダウンロード |
| Load | LoadButton click → ファイル選択 | JSONファイルからゲーム状態を復元 |
| SelectObject | Canvas上のオブジェクトをクリック | 対象を選択し詳細パネルに表示 |
| SelectGround | Canvas上の空き地面をクリック | 該当GroundGridセルを選択 |
| Deselect | 選択中のオブジェクトを再クリック | 選択を解除（hit=ground に遷移） |
| CycleSpecies | StatSpecies内の種族名をクリック | その種族のキャラクターを順に選択 + auto-pan |
| ZoomIn | マウスホイール上 | カーソル位置を中心にズームイン |
| ZoomOut | マウスホイール下 | カーソル位置を中心にズームアウト |
| Pan | マウスドラッグ | 表示領域をスクロール |

---

## 描画関連

| 用語 | 説明 |
|------|------|
| Transform | ワールド座標→スクリーン座標の変換パラメータ（baseScale, zoom, offsetX, offsetY） |
| effectiveScale | `baseScale × zoom` — 実際の描画スケール |
| LOD (Level of Detail) | 画面上サイズが閾値以下の場合に使う簡略描画モード |
| HitResult | クリック位置のオブジェクト判定結果（character / resourceNode / energyNode / remains / ground） |
| SelectionRing | 選択中オブジェクトの黄色い枠（円形 or 矩形） |
| SenseRangeCircle | 選択中キャラクターのSENSE_RANGE表示（灰色の円） |
| AutoPan | 画面外のオブジェクト選択時に自動的に画面中央にパンする機能 |

---

## イベントログ関連

| 用語 | CSSクラス | 説明 |
|------|----------|------|
| LogEntry | `.log-entry` | ログの1行 |
| BirthLog | `.log-birth` | 誕生イベント（緑色） |
| DeathLog | `.log-death` | 死亡イベント（赤色） |
| ExtinctionLog | `.log-extinction` | 絶滅イベント（オレンジ色太字） |

---

## ゲームオブジェクト（描画対象）

| 用語 | ゲーム上の型 | Canvas上の形状 |
|------|------------|---------------|
| Character | Character | 円（コンポーネントリング構造） |
| ResourceNode | ResourceNode | 角丸矩形 |
| OreNode | ResourceNode (type='OreNode') | 灰青色の角丸矩形 |
| CrystalNode | ResourceNode (type='CrystalNode') | 薄緑色の角丸矩形 |
| EnergyNode | EnergyNode | ダイヤモンド形 |
| Remains | Remains | 破断円弧 + 中央充填円 |
| Ground | GroundCell | 通常不可視、選択時に矩形枠 |
| Wall | — (暗黙) | 矩形枠線 |
