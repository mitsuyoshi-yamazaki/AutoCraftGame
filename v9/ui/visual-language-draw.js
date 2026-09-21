/**
 * 視覚言語ダッシュボードの描画。キットの Shapes / StateMarks でマークを描く。
 *
 * 描いているのは2つ:
 *  - 見本（specimen）: 表示クラス1件を1枚のマークで。何がどの色・どの形かを読むためのもの
 *  - 場面（scene）: 多数のマークを同じ面へ。図と地が分離しているか（規約 A-4）を見るためのもの
 *
 * 状態の値（durability / running）は 0〜1 と 0〜4 の汎用の状態値で、
 * 大分類によって意味が変わる——個体では平均耐久、単独部品では耐久、
 * エネルギー湧出点では当tickの残流量。**物質では使わない**（残量は大きさが運ぶ）。
 */
(function (root) {
  'use strict';

  var Model = root.V9Visual;
  var Shapes = root.SimUIShapes;
  var StateMarks = root.SimUIStateMarks;

  /** 画面上でこれより小さくしない（遠景でも存在は見えるべき） */
  var shapeById = function (catalog, id) {
    return catalog.find(function (shape) { return shape.id === id; });
  };

  var markOf = function (palettes, state, catalog, classId, x, y, radiusPx) {
    var cls = Model.classById(classId);
    var kind = Model.kindById(cls.kind);
    return {
      shape: shapeById(catalog, state.shapes[cls.kind]),
      x: x,
      y: y,
      radius: Math.max(kind.minPx, radiusPx),
      color: Model.colorOf(palettes, state.slots[classId], cls.kind),
      ink: palettes.surface.ink,
      surface: palettes.surface.base,
    };
  };

  /**
   * 状態チャネルへの割り当て。
   * 外周の弧は円のときしか描かれないので、耐久は個体では弧・単独部品では塗りへ回す。
   * 物質には状態を載せない——残量は大きさが運んでいて、塗りは同じ数字の重複になる。
   */
  var stateOf = function (cls, values) {
    if (cls.kind === 'organism') {
      return { ring: values.durability, pips: values.running, outline: values.selected };
    }
    if (cls.kind === 'component') {
      return { fill: values.durability, outline: values.selected };
    }
    return { outline: values.selected };
  };

  /**
   * エネルギー湧出点。**量を持たないので大きさでは何も運べない。**
   * 固定サイズの薄い下敷きを敷き、その上に当tickの残流量ぶんの**面積**で黄を重ねる。
   * 満量なら下敷きがちょうど隠れて、ふつうの黄の四角に見える。
   */
  var drawEnergyNode = function (ctx, mark, palettes, level) {
    ctx.fillStyle = palettes.energyBackdrop;
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius);
    ctx.fill();
    var ratio = Math.max(0, Math.min(1, level));
    if (ratio <= 0) return;
    ctx.fillStyle = mark.color;
    // 面積を比に合わせるので、半径は平方根で縮める
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius * Math.sqrt(ratio));
    ctx.fill();
  };

  var drawMark = function (ctx, mark, cls, palettes, values) {
    if (cls.id === 'energyNode') {
      drawEnergyNode(ctx, mark, palettes, values.durability);
      StateMarks.outline(ctx, mark, values.selected);
      return;
    }
    StateMarks.draw(ctx, mark, stateOf(cls, values));
  };

  /** 隣り合う面の間に地の色の隙間を置く（規約 B-4） */
  var carveGap = function (ctx, mark, gapPx) {
    if (gapPx <= 0) return;
    ctx.lineWidth = gapPx * 2;
    ctx.strokeStyle = mark.surface;
    Shapes.path(ctx, mark.shape, mark.x, mark.y, mark.radius);
    ctx.stroke();
  };

  var prepare = function (canvas, palettes) {
    var rect = canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = palettes.surface.base;
    ctx.fillRect(0, 0, rect.width, rect.height);
    return { ctx: ctx, width: rect.width, height: rect.height };
  };

  /**
   * 見本を1枚。状態チャネルは調整UIの値をそのまま反映する。
   * 大分類ごとの面積係数もそのまま効くので、個体が最も大きいことがここで確かめられる。
   */
  var drawSpecimen = function (canvas, palettes, state, catalog, classId) {
    var cls = Model.classById(classId);
    var surface = prepare(canvas, palettes);
    var radius = Math.min(surface.width, surface.height) * 0.22 * Math.sqrt(state.areas[cls.kind]);
    var mark = markOf(palettes, state, catalog, classId, surface.width / 2, surface.height / 2, radius);
    drawMark(surface.ctx, mark, cls, palettes, state.demo);
  };

  /** 場面。ワールドを画面の中央へ置き、ズーム倍率だけを変える */
  var drawScene = function (canvas, palettes, state, catalog, scene) {
    var surface = prepare(canvas, palettes);
    var scale = state.view.zoom;
    var span = Model.WORLD_SIZE * scale;
    var originX = (surface.width - span) / 2;
    var originY = (surface.height - span) / 2;

    surface.ctx.strokeStyle = palettes.surface.line;
    surface.ctx.lineWidth = 1;
    surface.ctx.strokeRect(originX, originY, span, span);

    scene.forEach(function (item) {
      var cls = Model.classById(item.classId);
      // 湧出点は量を持たないので、量ではなく基準の大きさで描く
      var amount = cls.id === 'energyNode' ? 1 : item.amount;
      var radius = Model.radiusOf(amount, state.areas[cls.kind]) * scale;
      var mark = markOf(palettes, state, catalog, item.classId,
        originX + item.x * scale, originY + item.y * scale, radius);
      carveGap(surface.ctx, mark, state.view.gap);
      drawMark(surface.ctx, mark, cls, palettes, {
        durability: item.durability,
        running: item.running,
        selected: false,
      });
    });

    canvas.style.filter = state.view.desaturate ? 'grayscale(1)' : 'none';
  };

  root.V9VisualDraw = {
    drawSpecimen: drawSpecimen,
    drawScene: drawScene,
  };
})(window);
