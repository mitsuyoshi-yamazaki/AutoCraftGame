# シミュレーションUIキット

**他のプロジェクトへ丸ごと渡すための一式。** シミュレーションの状態を単純な形と色で表示する UI の規約と、その規約を満たす値を作る生成器が入っている。

渡すときは**このディレクトリごとコピー**し、相手のセッション（Claude Code）に [INSTRUCTIONS.md](INSTRUCTIONS.md) を読ませる。それ以外に説明は要らない。

```sh
cp -R apps/standards/simulation-ui-kit <相手のプロジェクト>/
```

---

## 何が入っているか

| ファイル | 中身 | 渡す相手にとって |
|---|---|---|
| **[INSTRUCTIONS.md](INSTRUCTIONS.md)** | **導入の指示書**（Claude Code 向け） | **最初に読ませるもの** |
| **[CONVENTION.md](CONVENTION.md)** | 規約の条項 15（A 強い / B 弱い / C 優先されない） | 従うもの。**原本の写し** |
| `lib/color.js` | sRGB / OKLab / OKLCh 変換、色覚多様性の模擬、コントラスト比、色差 | 生成器 |
| `lib/sources.js` | ColorBrewer と viridis 系の原データ（原典のまま） | 生成器 |
| `lib/recipes.js` | パレットの**処方**と導出 | **書き換える対象** |
| `lib/checks.js` | 色の機械検査 | 検査 |
| `lib/shapes.js` | 形の生成器（superformula）・面積の正規化・弁別の測定 | 生成器 |
| `lib/family.js` | 形の**処方**と測定 | **書き換える対象** |
| `lib/state-marks.js` | 状態チャネルの実装と一覧（採否つき） | 描画 |
| `derive-palette.js` | パレットを作り直す | 実行する |
| `derive-shapes.js` | 形を作り直す | 実行する |
| `verify.js` | 検査一式。CI へ置く | 実行する |
| `tokens.json` / `tokens.js` | 導出済みのパレット 6 種 | **生成物**。手で編集しない |
| `shapes.json` / `shapes.js` | 導出済みの形 4 種 | **生成物**。手で編集しない |
| `example.html` | 最小の動作例 | コピー直後の確認 |

**依存ゼロ。** npm パッケージではなく、ES module でもない（`file://` で開けなくなるため、あえて古典スクリプトにしてある）。ブラウザと Node のどちらからも同じファイルが読める。

---

## 本リポジトリの中での位置づけ

**このキットが原本である。** 同じ階層の2つのラボは、キットの `lib/` を読んでいる側であって、コードを持っていない。

```
simulation-ui-kit/     ← 生成器・検査・トークン・規約（ここが正）
simulation-ui-lab/     ← 「どの条項が効くか」を見比べる画面。キットを読む
simulation-shape-lab/  ← 「マーク1個をどう作るか」を見る画面。キットを読む
```

**写しを作らない作りにしてあるのは、乖離を防ぐためである。** 渡した先では当然コピーになるが、少なくとも本リポジトリの中では生成器が1箇所にしかない。

規約の**原本**は `docs/subprojects/standards/simulation-ui/convention.md`（決定の経緯を持つ）。`CONVENTION.md` はそこから条項だけを写したものにあたる。**`verify.js` が両者の条項の見出しを突き合わせる**ので、片方だけ直すと検査が落ちる。

---

## 動かす

```sh
node apps/standards/simulation-ui-kit/verify.js                    # 検査一式
node apps/standards/simulation-ui-kit/verify.js --scan ./src       # 生の色の直書きも探す
node apps/standards/simulation-ui-kit/derive-palette.js            # パレットを作り直す
node apps/standards/simulation-ui-kit/derive-shapes.js             # 形を作り直す
open apps/standards/simulation-ui-kit/example.html                 # 動作例
```

---

## 渡すときに言い添えること

指示書に書いてあるので繰り返さなくてよいが、口頭で足すなら次の2つ。

1. **条項を足したり削ったりするのは人間の仕事である。** 相手側の Claude Code が「この条項は合わない」と判断しても、消してはいけない——具体例を作って人間に見せるところまでが範囲
2. **検査が通っても、絵が良いとは限らない。** 機械が見ているのは色と形と寸法だけで、「その絵が現象の意味を成しているか」は人間が見るしかない
