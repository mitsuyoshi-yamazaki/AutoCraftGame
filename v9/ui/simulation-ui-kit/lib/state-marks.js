/**
 * マークに**状態**を載せるチャネルの語彙。
 *
 * 出発点は1つの観察である: **identity（どれか）を形と色相で運ぶと、マークの中には
 * まだ誰も使っていないチャネルが残っている。** 状態はそこへ載せる——
 * 形を変えたり色相を変えたりすると、identity と衝突して両方読めなくなる。
 *
 * 先行例（詳細は docs/methods/mark-shape-and-state.md）:
 *  - **Screeps**: creep は円で、円周に body part ごとの弧を置く。弧の長さは part 数 / 最大 part 数。
 *    TOUGH だけは弧ではなく外周の半透明リング、積載は中心の小点。**外観から仕様が読める**のが設計目標
 *  - **Mini Metro**: 乗客は駅と**同じ形の小さい版**で、縁を持たない。
 *    大きさと縁の有無だけで「駅」と「その駅へ行きたい乗客」を分け、意味の結び付きは形が保つ
 *  - **Into the Breach**: 敵の次の一手を盤上に**予告**として描く。開発者いわく
 *    「明快さのために、かっこいいアイデアを毎回捨てた」
 *
 * チャネルは**採否の3段**を持つ（2026-09-21 ユーザ判断。判定の軸は下の ADOPTION を見よ）。
 * **採らなかったものも消さない**——消すと同じ検討を繰り返すことになる。
 *
 *  | 状態の種類 | 載せる先 | 採否 |
 *  |---|---|---|
 *  | 連続した割合（HP・進捗） | 外周の弧 `ring` | 採用（**円のときだけ**） |
 *  | 二つ目の割合（積載・充填） | 内側の塗りの高さ `fill` | 採用 |
 *  | 離散の少数（0〜4） | 中心の点 `pips` | 採用（点の形・並びは差し替え可） |
 *  | 二値（選択・自分のもの） | 縁の有無 `outline` | 採用 |
 *  | 耐久・防御 | 外周の半透明リング `halo` | 採用 |
 *  | 従属関係（積荷・随伴） | 同じ形の小さい版 `companion` | 通常は採用しない |
 *  | 次にやること | 輪郭だけの複製 `ghost` | **不採用** |
 *  | **禁止: 形を変える** | — | 形は identity を運んでいる |
 *  | **禁止: 色相を変える** | — | 色相は identity を運んでいる |
 *  | **禁止: 回す** | — | 向きは別の量（進行方向）のために空けておく |
 *
 */
(function (root, factory) {
  root.SimUIStateMarks = factory(root.SimUIShapes);
})(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';

  var RING_WIDTH = 0.16;       // 半径に対する外周リングの太さ
  var RING_GAP = 0.10;         // 本体と外周リングの間に置く地色の隙間（規約 B-4）
  var PIP_RADIUS = 0.12;
  var COMPANION_SCALE = 0.34;
  var GHOST_DASH = [3, 3];

  /** screeps と同じく「0 度 = 上・時計回り」で弧を描く。 */
  function arcAngle(degrees) { return (degrees - 90) * Math.PI / 180; }

  function ringRadius(radius) { return radius * (1 + RING_GAP + RING_WIDTH / 2); }

  /** 外周の弧は円にしか使えない（2026-09-21 ユーザ判断）。 */
  function ringApplies(mark) {
    return !!mark.shape && mark.shape.id === 'circle';
  }

  /**
   * 連続した割合を外周の弧で。0〜1。
   * **円のときだけ描く**——円でない形の周りに弧を回すと、弧が輪郭に沿わず、
   * 形そのもの（identity）が読めなくなる。
   */
  function ring(ctx, mark, fraction) {
    if (!ringApplies(mark)) return;
    var r = ringRadius(mark.radius);
    ctx.lineWidth = mark.radius * RING_WIDTH;
    ctx.strokeStyle = mark.surface;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (fraction <= 0) return;
    ctx.strokeStyle = mark.color;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, r, arcAngle(0), arcAngle(360 * Math.min(fraction, 1)));
    ctx.stroke();
  }

  /** 二つ目の割合を、内側が下から満ちる塗りで。形でくり抜くので輪郭は変わらない。 */
  function fill(ctx, mark, fraction) {
    if (fraction <= 0) return;
    ctx.save();
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius);
    ctx.clip();
    ctx.fillStyle = mark.ink;
    var height = mark.radius * 2 * Math.min(fraction, 1);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(mark.x - mark.radius * 2, mark.y + mark.radius - height, mark.radius * 4, height);
    ctx.restore();
  }

  /**
   * 離散の少数を中心の点で。5 個以上は数えられないので載せない。
   * 点の形と並びは差し替えられる（2026-09-21 ユーザ判断）。
   * 今あるのは「円を横並び」だけで、増やすときはここへ足す。
   */
  var PIP_SHAPES = {
    circle: function (ctx, x, y, radius) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    },
  };

  var PIP_LAYOUTS = {
    row: function (count, radius) {
      var spacing = radius * 0.42;
      var start = -((count - 1) / 2) * spacing;
      var slots = [];
      for (var i = 0; i < count; i++) slots.push([start + i * spacing, 0]);
      return slots;
    },
  };

  function pips(ctx, mark, count, options) {
    var total = Math.min(count, 4);
    if (total <= 0) return;
    var settings = options || {};
    var drawPip = PIP_SHAPES[settings.pipShape] || PIP_SHAPES.circle;
    var layout = PIP_LAYOUTS[settings.pipLayout] || PIP_LAYOUTS.row;
    ctx.fillStyle = mark.surface;
    layout(total, mark.radius).forEach(function (offset) {
      drawPip(ctx, mark.x + offset[0], mark.y + offset[1], mark.radius * PIP_RADIUS);
    });
  }

  /** 二値を縁の有無で。Mini Metro が駅と乗客を分けるのと同じ手。 */
  function outline(ctx, mark, on) {
    if (!on) return;
    ctx.lineWidth = mark.radius * 0.17;
    ctx.strokeStyle = mark.ink;
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius * 1.14);
    ctx.stroke();
  }

  /** 従属するものを、同じ形の小さい版で脇に並べる。 */
  function companion(ctx, mark, count) {
    var total = Math.min(count, 3);
    var step = mark.radius * 0.78;
    for (var i = 0; i < total; i++) {
      ctx.fillStyle = mark.color;
      Shapes.path(ctx, mark.shape,
        mark.x + mark.radius * 1.5 + i * step, mark.y - mark.radius * 1.1,
        mark.radius * COMPANION_SCALE);
      ctx.fill();
    }
  }

  /** 次にやることを、輪郭だけの複製で予告する。 */
  function ghost(ctx, mark, offsetX, offsetY) {
    if (!offsetX && !offsetY) return;
    ctx.save();
    ctx.setLineDash(GHOST_DASH);
    ctx.lineWidth = Math.max(mark.radius * 0.12, 1);
    ctx.strokeStyle = mark.color;
    ctx.globalAlpha = 0.85;
    Shapes.path(ctx, mark.shape, mark.x + offsetX, mark.y + offsetY, mark.radius);
    ctx.stroke();
    ctx.restore();
  }

  /** 耐久を外周の半透明リングで（Screeps の TOUGH）。 */
  function halo(ctx, mark, fraction) {
    if (fraction <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.52 * Math.min(fraction, 1);
    ctx.lineWidth = mark.radius * 0.42;
    ctx.strokeStyle = mark.color;
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius * 1.34);
    ctx.stroke();
    ctx.restore();
  }

  /** 本体。identity（形と色相）だけを描く。 */
  function body(ctx, mark) {
    ctx.fillStyle = mark.color;
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius);
    ctx.fill();
  }

  /**
   * 1個のマークを描く。`state` に載せたものだけが描かれる。
   * 順序は固定——外側（halo → ring）から内へ、最後に付随物。
   * 順序を場面ごとに変えると、同じ状態が別の絵になってしまう。
   */
  function draw(ctx, mark, state) {
    var values = state || {};
    if (values.halo !== undefined) halo(ctx, mark, values.halo);
    if (values.ghost) ghost(ctx, mark, values.ghost[0], values.ghost[1]);
    body(ctx, mark);
    if (values.fill !== undefined) fill(ctx, mark, values.fill);
    if (values.outline !== undefined) outline(ctx, mark, values.outline);
    if (values.ring !== undefined) ring(ctx, mark, values.ring);
    if (values.pips !== undefined) pips(ctx, mark, values.pips, values);
    if (values.companion !== undefined) companion(ctx, mark, values.companion);
  }

  /**
   * 画面と文書で共有する、チャネルの一覧。
   *
   * `adoption` は3段（2026-09-21 ユーザ判断）:
   *   採用             … 既定で使う
   *   通常は採用しない … 使えるが、既定では外す。**強い否定ではない**
   *   不採用           … 使わない。**検討した記録として残す**（消すと同じ検討を繰り返す）
   *
   * 判定の軸は「**その系を2次元へ投影している**（シミュレーションの考え方）」のままか、
   * 「**人間に見やすいように翻訳している**（ゲームの考え方）」へ寄るか、である。
   */
  var ADOPTION = { USE: '採用', RARE: '通常は採用しない', NO: '不採用' };

  var CHANNELS = [
    {
      id: 'ring', label: '外周の弧', carries: '連続した割合（HP・進捗）',
      source: 'Screeps の body part', adoption: ADOPTION.USE, appliesTo: ['circle'],
      note: '**円のときだけ使える。** 円でない形の周りに弧を回すと、弧が輪郭に沿わず形そのものを崩す',
    },
    {
      id: 'fill', label: '内側の塗りの高さ', carries: '二つ目の割合（積載・充填）',
      source: 'Screeps の source / tower', adoption: ADOPTION.USE,
      note: '形でくり抜くので輪郭は変わらない',
    },
    {
      id: 'pips', label: '中心の点', carries: '離散の少数（0〜4）',
      source: '盤上遊戯の駒', adoption: ADOPTION.USE,
      note: '点の形と並びは差し替えられる。今あるのは「円を横並び」だけ',
    },
    {
      id: 'outline', label: '縁の有無', carries: '二値（選択・自分のもの）',
      source: 'Mini Metro の駅と乗客', adoption: ADOPTION.USE,
    },
    {
      id: 'halo', label: '外周の半透明リング', carries: '耐久・防御',
      source: 'Screeps の TOUGH', adoption: ADOPTION.USE,
    },
    {
      id: 'companion', label: '同じ形の小さい版', carries: '従属関係（積荷・随伴）',
      source: 'Mini Metro の乗客', adoption: ADOPTION.RARE,
      note: '**「その系を2次元へ投影している」より「人間に見やすいように翻訳している」が強くなる。** '
        + 'ゲームの考え方に寄るので既定では外す。ただし採用しないとするほど強い否定ではない',
    },
    {
      id: 'ghost', label: '輪郭だけの複製', carries: '次にやること（予告）',
      source: 'Into the Breach', adoption: ADOPTION.NO,
      note: '**位置がずれるため。またそのずれの方向に必然性がないため。** '
        + '予告そのものは規約 C-2 に条項として残してあるが、この実装では採らない',
    },
  ];

  return {
    ADOPTION: ADOPTION,
    CHANNELS: CHANNELS,
    ringApplies: ringApplies,
    RING_WIDTH: RING_WIDTH,
    draw: draw,
    body: body,
    ring: ring,
    fill: fill,
    pips: pips,
    outline: outline,
    companion: companion,
    ghost: ghost,
    halo: halo,
  };
});
