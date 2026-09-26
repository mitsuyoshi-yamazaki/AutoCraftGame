/**
 * 形の族の**処方**と、その弁別の測定。
 *
 * 色のときと違い、**機械は形を落とさない**。測って材料を出すところまでで、
 * 採否は人間が決める——理由は測定そのものから出た:
 *
 *   面積の重なり（IoU）も輪郭の起伏の差も、**角の有無を過小評価する**。
 *   円と四角の重なりは 0.92（差 0.08）しかないが、人間は角を一瞬で見分ける。
 *   逆に円と八弁の形は数値上よく離れるのに、見ると「どちらも丸い」。
 *   **形の弁別は、色の ΔE のようには計算で閉じない。**
 *
 * それでも機械が確実に言えることが2つある。これは測る価値がある:
 *
 *   1. **回転対称の位数が奇数かどうか**（奇数は向きを運ぶので族に入れない）
 *   2. **遠景で輪郭の違いが消えること**——12px 相当まで縮めると、
 *      縦横比の違い以外はほぼ区別が付かなくなる（下の測定を見よ）。
 *      Screeps が半径 3.2px 未満で所有者の色の点に落とすのと同じ結論にあたる。
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./shapes.js') : root.SimUIShapes);
  if (isNode) module.exports = api;
  else root.SimUIFamily = api;
})(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';

  var SIGNATURE_STEPS = 256;
  /** これを下回ったら「遠景では形が効かない」と判定する目安（測定から置いた）。 */
  var FAR_COLLAPSE = 0.25;

  /**
   * 候補。**すべて同じ生成器の引数ちがい**で、手で描いた形は1つも無い。
   * 奇数対称（3角・5角）と十字は候補にすら入れていない（理由は shapes.js 冒頭）。
   *
   * **六角を外した理由**（2026-09-21・測定）: この生成器では m を増やしても角の深さが
   * 増えないため、六角は円に最も近い形になる——遠景での食い違いが **0.03** しかなく、
   * 卓上でも 0.08。**丸い形を2つ持つ意味は無い**。角を深くすると花びらのようになり、
   * 今度は「練られていない」側へ戻る。よって円・四角・菱形・横長の4つに絞った。
   */
  var CANDIDATES = [
    { id: 'circle', label: '円', m: 0, n: 1, rot: 0, sx: 1, sy: 1,
      note: '基準。起伏が無く、どの大きさでも壊れない' },
    { id: 'square', label: '四角', m: 4, n: 4.6, rot: 0, sx: 1, sy: 1,
      note: '4 回対称で角が外へ出る側。円との差は角の有無だけ' },
    { id: 'diamond', label: '菱形', m: 4, n: 1.25, rot: 0, sx: 1, sy: 1,
      note: '同じ 4 回対称で角が内へ入る側。四角とは起伏の符号が逆で、族の中で最も離れる対' },
    { id: 'capsule', label: '横長', m: 4, n: 8, rot: 0, sx: 1.55, sy: 0.6,
      note: '唯一の縦横比ちがい。**遠景まで生き残る唯一の差**' },
  ];

  /** 半径関数から平均を抜いたもの＝「起伏」。大きさの差ではなく形の差を見るため。 */
  function signature(shape) {
    var radii = Shapes.normalizedOutline(shape, SIGNATURE_STEPS).map(function (point) {
      return Math.hypot(point[0], point[1]);
    });
    var mean = radii.reduce(function (sum, value) { return sum + value; }, 0) / radii.length;
    return radii.map(function (value) { return value - mean; });
  }

  function signatureDistance(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) sum += (a[i] - b[i]) * (a[i] - b[i]);
    return Math.sqrt(sum / a.length);
  }

  /** 族を作る。落とすのは奇数対称のものだけ。 */
  function derive() {
    var kept = [];
    var dropped = [];
    CANDIDATES.forEach(function (candidate) {
      if (!Shapes.hasEvenSymmetry(candidate)) {
        dropped.push({ id: candidate.id, reason: '回転対称の位数が奇数（向きを運んでしまう）' });
        return;
      }
      kept.push({
        id: candidate.id, label: candidate.label, note: candidate.note,
        m: candidate.m, n: candidate.n, rot: candidate.rot, sx: candidate.sx, sy: candidate.sy,
        opticalScale: 1,
        areaScale: Shapes.areaScale(candidate),
        signature: signature(candidate),
        grids: {
          near: Shapes.rasterize(candidate, Shapes.RASTER_NEAR),
          far: Shapes.rasterize(candidate, Shapes.RASTER_FAR),
        },
      });
    });
    return { kept: kept, dropped: dropped };
  }

  /**
   * 全対の弁別。3つの量を返す:
   *   ripple … 輪郭の起伏の差（角の有無を拾うが、過小評価する）
   *   near   … 卓上（円が約 32px）での面積の食い違い
   *   far    … 遠景（円が約 12px）での面積の食い違い
   */
  function matrix(kept) {
    return kept.map(function (a) {
      return kept.map(function (b) {
        return a.id === b.id ? null : {
          ripple: signatureDistance(a.signature, b.signature),
          near: Shapes.distinctness(a.grids.near, b.grids.near),
          far: Shapes.distinctness(a.grids.far, b.grids.far),
        };
      });
    });
  }

  /** 「遠景で形が効かない」対を挙げる。人間へ渡す材料であって、落とす根拠ではない。 */
  function farCollapses(kept, cells) {
    var collapses = [];
    cells.forEach(function (row, i) {
      row.forEach(function (cell, j) {
        if (cell && j > i && cell.far < FAR_COLLAPSE) {
          collapses.push({ a: kept[i].id, b: kept[j].id, far: cell.far });
        }
      });
    });
    return collapses;
  }

  /** 書き出し用に、測定の中身を落とした素の形だけを返す。 */
  function plain(kept) {
    return kept.map(function (shape) {
      return {
        id: shape.id, label: shape.label, note: shape.note,
        m: shape.m, n: shape.n, rot: shape.rot, sx: shape.sx, sy: shape.sy,
        opticalScale: shape.opticalScale,
        areaScale: Number(shape.areaScale.toFixed(6)),
      };
    });
  }

  return {
    CANDIDATES: CANDIDATES,
    FAR_COLLAPSE: FAR_COLLAPSE,
    derive: derive,
    matrix: matrix,
    farCollapses: farCollapses,
    plain: plain,
    signature: signature,
    signatureDistance: signatureDistance,
  };
});
