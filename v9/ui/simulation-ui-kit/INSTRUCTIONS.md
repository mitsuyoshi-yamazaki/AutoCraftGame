# 導入の指示書（Claude Code 向け）

**これを読んでいるあなたへ。** このディレクトリは、シミュレーションの状態を単純な形と色で表示する UI の**規約と、その規約を満たす値を作る生成器**の一式です。あなたのプロジェクトへこれを導入し、以後の可視化をこの規約の下で作ってください。

まず `CONVENTION.md` を読んでください。**そこに書かれた条項が正です。この指示書は、それをあなたのプロジェクトで動かすための手順にすぎません。**

---

## 0. 30 秒で全体像

```
CONVENTION.md      規約（条項 15。A=強い / B=弱い / C=優先されない）
lib/               生成器と検査。依存ゼロ・ブラウザと Node の両方で読める
tokens.json        導出済みのパレット 6 種（面・カテゴリ色・連続色・発散色・状態色）
shapes.json        導出済みのマークの形 4 種（円・四角・菱形・横長）
derive-palette.js  パレットを処方から作り直す
derive-shapes.js   形を処方から作り直す
verify.js          検査。CI で回す
example.html       最小の動作例。コピー後、まずこれが開くか確かめる
```

**中核の考えは2つだけです。**

1. **値を手で選ばない。** 色も形も、検証済みの原データ（ColorBrewer / viridis）と生成器から**導出**します。あなたが書くのは「どの系列を、どういう面の上で、どう寄せるか」という**処方**だけです。
2. **identity（どれか）と状態（どうなっているか）は別のチャネルに載せる。** identity は形と色相が運びます。状態は、identity が使っていない輪郭・塗りの内側・縁・周囲に載せます。

---

## 1. 置く

このディレクトリを**丸ごと**コピーしてください。中のファイルを分解しないでください——`lib/` の中は互いを `require('./color.js')` の形で参照しています。

```
<あなたのプロジェクト>/
  simulation-ui-kit/     ← このディレクトリをそのまま置く
  src/ ...               ← あなたのコード
```

置いたら、**まず動作を確かめてください**:

```sh
node simulation-ui-kit/verify.js      # すべて通過 と出れば良い
open simulation-ui-kit/example.html   # 図が出れば良い
```

`verify.js` が「配布用の写しと原本の条項」の検査を飛ばすのは正常です。その検査は規約を作っている側のリポジトリでしか働きません。

---

## 2. 読み込む

**依存はゼロです。** npm パッケージではありません。ES module でもありません（`file://` で開けなくなるため、あえて古典スクリプトにしてあります）。

**ブラウザから:**

```html
<script src="simulation-ui-kit/lib/color.js"></script>
<script src="simulation-ui-kit/lib/shapes.js"></script>
<script src="simulation-ui-kit/lib/state-marks.js"></script>
<script src="simulation-ui-kit/tokens.js"></script>   <!-- window.SimUITokens -->
<script src="simulation-ui-kit/shapes.js"></script>   <!-- window.SimUIShapeTokens -->
```

**Node から:**

```js
const Color = require('./simulation-ui-kit/lib/color.js');
const Shapes = require('./simulation-ui-kit/lib/shapes.js');
const tokens = require('./simulation-ui-kit/tokens.json');
```

**バンドラを使うプロジェクトなら** — これらは UMD 風なので `require` でも `<script>` でも通ります。TypeScript から使うなら、型は自分で書いてください（`.d.ts` は同梱していません）。

---

## 3. そのプロジェクト用のトークンを作る

`tokens.json` に入っている 6 種のパレット（淡い色系・ネオン系・微小生物系・深海生物系・青灰系・セピア系）でよければ、そのまま使ってください。

**合わないときは、値ではなく処方を直します。** `lib/recipes.js` の `RECIPES` を編集してください。指定するのは3つだけです。

```js
myTheme: {
  label: '……',
  note: '……',
  surface: '#0d0f14',            // ① 面の色
  categorical: 'Set1',           // ② 原典の系列（lib/sources.js にあるもの）
  sequentialPerceptual: 'viridis',
  diverging: 'PuOr',
  chromaScale: 0.98,             // ③ 彩度の寄せ方（sRGB が出せる上限に対する比）
},
```

書いたら作り直して検査します。

```sh
node simulation-ui-kit/derive-palette.js   # tokens.json / tokens.js を書き直す
```

**`tokens.json` を手で編集しないでください。** 生成物です。次の導出で消えます。

形も同じです。`lib/family.js` の `CANDIDATES` に生成器の引数（`m` 対称の位数・`n` 角の鋭さ・`sx`/`sy` 縦横比）を足し、`node simulation-ui-kit/derive-shapes.js` で作り直します。**`m` は偶数か 0 に限ります**（奇数は向きを運んでしまうため、機械が弾きます）。

---

## 4. 描く

### マーク1個

```js
var palette = SimUITokens.palettes[0];
var shape = SimUIShapeTokens.shapes[speciesIndex % SimUIShapeTokens.shapes.length];

var mark = {
  shape: shape,
  x: x, y: y, radius: 12,
  color: palette.categorical[speciesIndex % palette.categorical.length],
  ink: palette.surface.ink,
  surface: palette.surface.base,
};

SimUIStateMarks.draw(ctx, mark, {
  ring: hp / hpMax,      // 外周の弧（円のときだけ描かれる）
  fill: cargo / cap,     // 内側の塗りの高さ
  outline: isSelected,   // 縁の有無
});
```

**状態に使えるチャネルは `SimUIStateMarks.CHANNELS` にあります。** それぞれ `adoption` を持ちます:

| 採否 | 意味 |
|---|---|
| `採用` | 使ってよい。ただし**1個のマークに3つまで**（規約 B-7） |
| `通常は採用しない` | 既定では外す。使ってよいが、理由が要る |
| `不採用` | 使わない。**検討した記録として残してあるだけ** |

**外周の弧は円のときしか描かれません。** 円でない形の周りに弧を回すと輪郭が崩れるためで、実装が自動的に飛ばします。円でないマークに割合を載せたいなら、内側の塗りの高さを使ってください。

### 符号化表を書く（規約 A-5・強いルール）

**描画モジュールは、自分が何をどのチャネルで運んでいるかを公開してください。**

```js
var encoding = [
  { channel: '色相', carries: '種（カテゴリ）' },
  { channel: '形',   carries: '種（カテゴリ・色と二重）' },
  { channel: '位置', carries: '場所' },
  { channel: '大きさ', carries: '個体の質量' },
];
```

これは飾りではありません。**これが無いと、何が量で何がカテゴリかを機械が知りようがなく、A-1 と A-2 を検査できません。** 画面にも出してください。

### 連続量の場

```js
var ramp = palette.sequential;                     // 単一色相の明暗・明度は単調
ctx.fillStyle = ramp[Math.round(value * (ramp.length - 1))];
```

`hsl()` で色相を一周させないでください（規約 A-3）。

---

## 5. 検査を回す

```sh
node simulation-ui-kit/verify.js                # パレットと形
node simulation-ui-kit/verify.js --scan ./src   # 生の色が直書きされていないかも見る
```

終了コードは 0 / 1 なので、そのまま CI に置けます。`--scan` は `#rrggbb` や `rgb(...)` を探します——**色はトークン経由で来るべきなので、原則ヒットしないはずです。**

**検査が通っても、絵が良いとは限りません。** 機械が見ているのは色と形と寸法だけです。**「その絵が現象の意味を成しているか」は人間が見るしかありません。**

---

## 6. してはいけないこと

| してはいけないこと | 理由 |
|---|---|
| **規約に条項を足す・削る** | 条項の増減は人間が決めます。足りないと思ったら**提案までにとどめ**、人間に訊いてください |
| **色を手で選ぶ** | 処方を直して導出します。`#4ade80` のような値をコードに書かないでください |
| **`tokens.json` / `shapes.json` を手で編集する** | 生成物です。次の導出で消えます |
| **状態のために形・色相を変える、マークを回す** | どれも identity か、進行方向のために空けてあるチャネルと衝突します（規約 A-6） |
| **色を増やしてカテゴリを増やす** | 色だけで確実に運べるのは 3〜4 種です。7 種以上を色で分けようとしても解決しません。形と組み合わせるか、「その他」に畳んでください |
| **`hsl()` で色相を一周させる** | 虹色は局所的なコントラストが一様でなく、データの一部だけを強調します（規約 A-3） |
| **`#000000` や `#ff0000` を使う** | 純黒は隣の色を殺し、原色は隣接すると振動します（規約 B-5） |
| **「不採用」のチャネルを消す** | 消すと同じ検討を繰り返すことになります。残したまま、使わないでください |

---

## 7. 人間に訊くこと

次に当たったら、自分で決めずに訊いてください。

1. **条項が現実と合わないとき。** 「この系では A-3 を守れない」と思ったら、まず**守れない具体例**を作って見せてください。条項を消すかどうかは人間が決めます
2. **パレットが題材に合わないとき。** 「淡い色系」「ネオン系」といった名前が何を意味するかは、その題材を見ている人にしか判定できません。直すときは**面の色・原典の系列・彩度の寄せ方**の3つで指定してもらってください
3. **形を足したいとき。** 形の採否は機械には決められません（面積の重なりも輪郭の差も**角の有無を過小評価します**）。生成器の引数で案を出し、並べて見てもらってください
4. **状態のチャネルを新しく作ったとき。** 判定の軸は「**その系を2次元へ投影している**（シミュレーションの考え方）」のままか、「**人間に見やすいように翻訳している**（ゲームの考え方）」へ寄るか、です。後者に寄るものは既定では採らない、という基準で運用されています

---

## 8. この規約がどこから来ているか

条項は思いつきではなく、次から引いています。反論するときはここを見てください。

- **エージェントベースモデル可視化の設計指針** — Kornhauser, Wilensky & Rand (2009), *JASSS* 12(2)1。NetLogo の開発陣による、シミュレーション描画に特化した明文の指針
- **視覚変数の理論** — Bertin の6変数と5性質、Mackinlay の表現力・有効性、Cleveland & McGill の知覚タスク順位
- **科学可視化の配色規範** — 知覚的一様性・色覚多様性・グレースケール耐性。虹色 colormap の有害性
- **Screeps** — creep の円周に body part の弧を置く描き方。設計目標は「**外観から仕様が読めること**」
- **Mini Metro** — 乗客は駅と**同じ形の小さい版**で、縁の有無だけで区別する
- **Into the Breach** — 次の一手を予告する。開発者いわく「**明快さのために、かっこいいアイデアを毎回捨てた**」
- **グリフ可視化の研究** — 同心リングで多変量を運ぶ定石と、Chernoff faces の失敗（チャネルを詰めすぎると制御できなくなる）

各ファイルの冒頭にも、その部分の出典が書いてあります。
