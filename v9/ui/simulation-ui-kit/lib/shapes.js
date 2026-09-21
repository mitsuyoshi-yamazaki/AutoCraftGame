/**
 * マークの形を**ひとつの生成器から**作る。手で形を描かない。
 *
 * 生成器は Gielis の superformula（1個の式で円・角丸四角・菱形・正多角形を出す）:
 *
 *     r(θ) = ( |cos(mθ/4) / a|^n2 + |sin(mθ/4) / b|^n3 ) ^ (-1/n1)
 *
 * ここでは n1 = n2 = n3 = n に固定し、形を **{ m, n, rot, sx, sy }** の5値で表す。
 *   m   … 回転対称の位数（0 は円）。**偶数に限る**（理由は下）
 *   n   … 角の鋭さ。n < 2 で角が内へ（菱形）、n > 2 で外へ（四角）
 *   rot … 向き。偶対称なので「どちらが前か」は生まれない
 *   sx, sy … 縦横比
 *
 * **なぜ十字と奇数頂点を外したか**（2026-09-21 ユーザ指摘「練られた形である感じがしない」）:
 *
 *  1. **奇数頂点は向きを勝手に運ぶ。** 3角形・5角形は回転対称の位数が奇数で、
 *     頂点の向きが「前」に見える。向きは Bertin の視覚変数の1つであり、
 *     カテゴリを表すために形を使った時点で、**使っていないはずの向きまで占有してしまう**。
 *     偶対称（4・6・8・∞）なら、回しても「どちらが前か」が生まれない。
 *  2. **十字は輪郭ではなく記号である。** 腕の太さという、族の他の形が持たない
 *     自由パラメータを1つ増やし、生成器の外側に立つ。角が8つあるので小さくすると潰れる。
 *  3. どちらも**小さくすると円に還る**。遠景での弁別は rasterize して測れる（distinctness）。
 *
 * 面積は**幾何的に揃える**（同じ半径ではなく同じ面積にする）。
 * 同じ半径で描くと、円と四角では見た目の重さが 4:π ≒ 1.27 倍ちがう——
 * 「練られていない」と感じる原因の半分はここにある。
 *
 * 出典は README。依存ゼロ・古典スクリプト（file:// で開けること）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimUIShapes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SAMPLE_STEPS = 512;      // 輪郭を標本化する分割数（面積計算と描画に使う）
  var RASTER_EXTENT = 1.5;     // 走査する枠の半幅。族で最も広い形（横長）が収まる値に取る
  var RASTER_NEAR = 48;        // 卓上。円が約 32px で描かれるときに相当する
  var RASTER_FAR = 18;         // 遠景。円が約 12px で描かれるときに相当する
  var TARGET_AREA = Math.PI;   // 半径 1 の円と同じ面積に揃える

  function superRadius(shape, theta) {
    if (!shape.m) return 1;
    var angle = (shape.m * theta) / 4;
    var left = Math.pow(Math.abs(Math.cos(angle)), shape.n);
    var right = Math.pow(Math.abs(Math.sin(angle)), shape.n);
    return Math.pow(left + right, -1 / shape.n);
  }

  /** 輪郭上の点列。rot と縦横比はここで掛ける。 */
  /**
   * v9 での追加（2026-09-21）: 輪郭を点列で直接渡せる。
   * 「直線の辺＋角だけ丸い」のように超楕円の式で書けない形のため。
   * 面積合わせ（areaScale）も点列から計算されるので、既存の形と同じに扱える。
   */
  function outline(shape, steps) {
    if (shape.points !== undefined) return shape.points;
    var count = steps || SAMPLE_STEPS;
    var rot = (shape.rot || 0) * Math.PI / 180;
    var sx = shape.sx === undefined ? 1 : shape.sx;
    var sy = shape.sy === undefined ? 1 : shape.sy;
    var points = [];
    for (var i = 0; i < count; i++) {
      var theta = (i / count) * Math.PI * 2;
      var radius = superRadius(shape, theta);
      var x = radius * Math.cos(theta) * sx;
      var y = radius * Math.sin(theta) * sy;
      points.push([
        x * Math.cos(rot) - y * Math.sin(rot),
        x * Math.sin(rot) + y * Math.cos(rot),
      ]);
    }
    return points;
  }

  /** 多角形近似の面積（靴紐公式）。 */
  function rawArea(shape) {
    var points = outline(shape);
    var sum = 0;
    for (var i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  }

  /** 面積を揃えるための倍率。これを掛けて初めて「同じ大きさ」になる。 */
  function areaScale(shape) {
    return Math.sqrt(TARGET_AREA / rawArea(shape));
  }

  /** 面積を揃え、さらに人間が付けた光学補正（既定 1）を掛けた最終倍率。 */
  function scaleOf(shape) {
    return areaScale(shape) * (shape.opticalScale === undefined ? 1 : shape.opticalScale);
  }

  /** 正規化済みの輪郭（半径 1 の円と同じ重さになる）。 */
  function normalizedOutline(shape, steps) {
    var scale = scaleOf(shape);
    return outline(shape, steps).map(function (point) {
      return [point[0] * scale, point[1] * scale];
    });
  }

  /** 点が形の内側にあるか（偶奇規則で数える）。 */
  function contains(points, x, y) {
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
      var xi = points[i][0], yi = points[i][1];
      var xj = points[j][0], yj = points[j][1];
      var crosses = (yi > y) !== (yj > y)
        && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  /** 形を size×size の白黒へ落とす。遠景での見分けを測るために使う。 */
  function rasterize(shape, size) {
    var points = normalizedOutline(shape);
    var grid = new Uint8Array(size * size);
    var extent = RASTER_EXTENT;
    for (var row = 0; row < size; row++) {
      for (var col = 0; col < size; col++) {
        var x = ((col + 0.5) / size - 0.5) * 2 * extent;
        var y = ((row + 0.5) / size - 0.5) * 2 * extent;
        grid[row * size + col] = contains(points, x, y) ? 1 : 0;
      }
    }
    return grid;
  }

  /**
   * 2つの形がどれだけ違って見えるか。0 で同一、1 で重なりなし。
   * 色の ΔE に対応する量で、**これが形の「弁別の下限」を測る唯一の手段**である。
   */
  function distinctness(gridA, gridB) {
    var intersection = 0, union = 0;
    for (var i = 0; i < gridA.length; i++) {
      if (gridA[i] && gridB[i]) intersection++;
      if (gridA[i] || gridB[i]) union++;
    }
    return union === 0 ? 0 : 1 - intersection / union;
  }

  /** 回転対称の位数が偶数（または円）か。奇数は向きを運ぶので族に入れない。 */
  function hasEvenSymmetry(shape) {
    return shape.m === 0 || (shape.m % 2 === 0);
  }

  /** Canvas へ輪郭を引く（ブラウザ専用。radius px の大きさで中心 x, y に置く）。 */
  function path(ctx, shape, x, y, radius) {
    var points = normalizedOutline(shape, 128);
    ctx.beginPath();
    points.forEach(function (point, index) {
      var px = x + point[0] * radius;
      var py = y + point[1] * radius;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }

  return {
    SAMPLE_STEPS: SAMPLE_STEPS,
    RASTER_EXTENT: RASTER_EXTENT,
    RASTER_NEAR: RASTER_NEAR,
    RASTER_FAR: RASTER_FAR,
    TARGET_AREA: TARGET_AREA,
    outline: outline,
    normalizedOutline: normalizedOutline,
    rawArea: rawArea,
    areaScale: areaScale,
    scaleOf: scaleOf,
    contains: contains,
    rasterize: rasterize,
    distinctness: distinctness,
    hasEvenSymmetry: hasEvenSymmetry,
    path: path,
  };
});
