/**
 * パレットの**処方**と、そこからトークンを機械的に導出する手続き。
 *
 * ユーザ回答（2026-09-21・Q-73 ④）「既存の検証済みパレット（ColorBrewer / viridis 系）から
 * 機械的に導出する」を実装したもの。**ここで色を手で選ばない**——選ぶのは
 * 「どの検証済み系列を、どういう面の上で、どう寄せるか」という処方だけで、
 * 実際の値は導出が決める。処方を変えれば全トークンが作り直される。
 *
 * 導出が同時に規約の一部を構造的に保証している:
 *  - カテゴリ色を**単一の明度**へ揃える → B-2「群の identity を明度・大きさに載せない」
 *  - 連続量を**面から遠ざかる向きの単調な明度**へ再アンカー → A-3「連続量は単一色相の明暗」
 *  - 発散の中央を**強制的に無彩色**にする → A-3「発散は2色相＋中立灰」
 *  - 面・マークとも OKLCh 経由で生成し純黒・純色を作らない → B-5
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(
    isNode ? require('./color.js') : root.SimUIColor,
    isNode ? require('./sources.js') : root.SimUISources
  );
  if (isNode) module.exports = api;
  else root.SimUIRecipes = api;
})(typeof self !== 'undefined' ? self : this, function (Color, Sources) {
  'use strict';

  var CATEGORICAL_BAND = { dark: 0.74, light: 0.54 };
  /**
   * カテゴリ色に許す明度の幅。**0 にしてはいけない**——本ラボでの測定（2026-09-21）で、
   * 明度を完全に揃えると色覚多様性での色差が ΔE 1 前後まで落ち、
   * 色でカテゴリを運ぶことが原理的にできなくなる。±0.07〜0.08 で ΔE 8〜9 まで戻る。
   * これは規約 B-2 を**弱いルール**に置いたことの実質的な根拠にあたる。
   */
  var CATEGORICAL_SPREAD = 0.07;
  /**
   * カテゴリ色の上限。測定（同上）では固定明度・最大彩度でも
   * 通常視 ΔE 15 を保てるのは 5 色まで、明度幅を許して 6〜7 色。
   * それ以上は色を増やさず**形と組み合わせる**（規約 A-2）。
   */
  var MAX_CATEGORICAL = 6;
  var SEQUENTIAL_STEPS = 9;
  var DIVERGING_STEPS = 11;
  var CHROMA_FLOOR = 0.055;
  var SURFACE_LIGHTNESS_FLOOR = 0.12;   // 純黒を作らないための下限（B-5）
  var SURFACE_LIGHTNESS_CEILING = 0.97; // 純白も同様
  var STATUS_HUES = { good: 148, warn: 92, bad: 27 };

  /**
   * 処方。`surface` は面の基準色、`categorical` は原典のカテゴリ系列名、
   * `sequential` / `diverging` は原典のランプ名、`chromaScale` は sRGB が出せる彩度の上限に対する比。
   */
  var RECIPES = {
    acg: {
      label: 'AutoCraft v9 系',
      note: 'v9 の暗緑の面を採る。豊富な資源（構造系・廃棄系）を無彩色へ逃がす前提なので、カテゴリ色は4で足りる',
      surface: '#14201a',
      categorical: 'Dark2',
      sequentialPerceptual: 'viridis',
      diverging: 'PuOr',
      chromaScale: 0.70,
    },
    pale: {
      label: '淡い色系',
      note: '明るい面に中明度のマーク。図と地の分離を彩度ではなく明度で作る。紙に近い見え方',
      surface: '#f4f6f9',
      categorical: 'Set2',
      sequential: 'Blues',
      diverging: 'RdBu',
      chromaScale: 0.55,
    },
    neon: {
      label: 'ネオン系',
      note: '暗い面に高彩度・高明度のマーク。発光しているように見せる。長時間見るには向かない',
      surface: '#0d0f14',
      categorical: 'Set1',
      sequentialPerceptual: 'viridis',
      diverging: 'PuOr',
      chromaScale: 0.98,
    },
    micro: {
      label: '微小生物系',
      note: '淡い青の面（培養液）に緑・茶・黒系のオブジェクト。顕微鏡下の見え方に寄せる',
      surface: '#dfe9f3',
      categorical: 'Dark2',
      sequential: 'Greens',
      diverging: 'BrBG',
      chromaScale: 0.80,
    },
    abyss: {
      label: '深海生物系',
      note: '濃い青の面に淡いマーク。暗所で少数の個体を追うのに向く',
      surface: '#0a1c33',
      categorical: 'Set2',
      sequentialPerceptual: 'cividis',
      diverging: 'RdBu',
      chromaScale: 0.72,
    },
    slate: {
      label: '青灰系（既存のダッシュボード由来）',
      note: 'apps/alife-sketches/dashboard/style.css の :root を面として採り、マークだけ導出で作り直したもの',
      surface: Sources.EXISTING_SURFACES.slate.base,
      categorical: 'Set2',
      sequentialPerceptual: 'viridis',
      diverging: 'RdBu',
      chromaScale: 0.82,
    },
    sepia: {
      label: 'セピア系（既存の harness.js 由来）',
      note: 'apps/alife-sketches/dashboard/harness.js の CSS を面として採ったもの。暖色の面は寒色のマークとよく分かれる',
      surface: Sources.EXISTING_SURFACES.sepia.base,
      categorical: 'Accent',
      sequential: 'Oranges',
      diverging: 'BrBG',
      chromaScale: 0.78,
    },
  };

  function isDark(hex) { return Color.hexToOklab(hex)[0] < 0.5; }

  /** 明度だけを動かして色相・彩度を保ち、sRGB の枠へ収める。 */
  function withLightness(hex, lightness) {
    var lch = Color.hexToLch(hex);
    return Color.lchToHex(Color.clipToGamut([lightness, lch[1], lch[2]]));
  }

  /** 面の基準色から panel / line / ink / inkDim を導く。ink はコントラスト下限まで押し込む。 */
  function deriveSurface(baseHex) {
    var base = Color.hexToLch(baseHex);
    var lightness = Color.clamp(base[0], SURFACE_LIGHTNESS_FLOOR, SURFACE_LIGHTNESS_CEILING);
    var dark = lightness < 0.5;
    var step = dark ? 1 : -1;
    var safeBase = Color.lchToHex(Color.clipToGamut([lightness, base[1], base[2]]));
    var ink = safeBase;
    for (var i = 0; i < 40; i++) {
      var candidate = withLightness(safeBase, Color.clamp(lightness + step * (0.10 + i * 0.02), 0.04, 0.99));
      ink = candidate;
      if (Color.contrastRatio(candidate, safeBase) >= 7) break;
    }
    return {
      base: safeBase,
      panel: withLightness(safeBase, Color.clamp(lightness + step * 0.045, 0.03, 0.99)),
      line: withLightness(safeBase, Color.clamp(lightness + step * 0.12, 0.03, 0.99)),
      ink: ink,
      inkDim: withLightness(ink, Color.clamp(Color.hexToLch(ink)[0] - step * 0.22, 0.10, 0.95)),
    };
  }

  /**
   * カテゴリ色を導出する。色相は原典のまま、明度は狭い帯へ押し込む——
   * 明度を identity の主チャネルにしない（B-2）が、完全には潰さない（上の測定より）。
   * 手順は ①帯の中心へ揃える ②色覚多様性での分離が最大になる順へ並べ替える
   * ③その順に沿って明度を上下に振る ④通常視で弁別できないものを落とす ⑤上限で切る。
   */
  function deriveCategorical(sourceName, surfaceHex, chromaScale) {
    var band = isDark(surfaceHex) ? CATEGORICAL_BAND.dark : CATEGORICAL_BAND.light;
    var flattened = Sources.QUALITATIVE[sourceName].map(function (hex) {
      return atBand(Color.hexToLch(hex)[2], band, chromaScale);
    });
    var alternated = orderByCvdSeparation(flattened).map(function (hex, index) {
      var offset = (index % 2 === 0 ? -1 : 1) * CATEGORICAL_SPREAD;
      return atBand(Color.hexToLch(hex)[2], band + offset, chromaScale);
    });
    return dropUndistinguishable(alternated).slice(0, MAX_CATEGORICAL);
  }

  /**
   * ある色相を、指定した明度で「sRGB が出せる彩度の chromaScale 倍」に置く。
   * 原典の彩度をそのまま使わないのは、明度を揃えた時点で原典の彩度が意味を失い、
   * 色相ごとに出せる彩度の上限が大きく違うため——**上限に対する比**で揃えるほうが
   * 弁別が安定する（chromaScale はそのまま「鮮やかさの寄せ方」になる）。
   */
  function atBand(hue, lightness, chromaScale) {
    var ceiling = Color.maxChroma(lightness, hue);
    return Color.lchToHex([lightness, Math.max(ceiling * chromaScale, Math.min(CHROMA_FLOOR, ceiling)), hue]);
  }

  /** 隣り合う色が色覚多様性で最も離れるよう、貪欲に並べ替える。 */
  function orderByCvdSeparation(colors) {
    if (colors.length < 3) return colors.slice();
    var remaining = colors.slice(1);
    var ordered = [colors[0]];
    while (remaining.length) {
      var last = ordered[ordered.length - 1];
      var bestIndex = 0, bestScore = -Infinity;
      remaining.forEach(function (hex, index) {
        var score = Color.minCvdDeltaE(last, hex);
        if (score > bestScore) { bestScore = score; bestIndex = index; }
      });
      ordered.push(remaining.splice(bestIndex, 1)[0]);
    }
    return ordered;
  }

  /** 通常視で弁別できない色を落とす（増やして誤魔化さない——規約 A-2 の「巡回させない」）。 */
  function dropUndistinguishable(colors) {
    var kept = [];
    colors.forEach(function (hex) {
      var distinct = kept.every(function (other) { return Color.deltaE(hex, other) >= 15; });
      if (distinct) kept.push(hex);
    });
    return kept;
  }

  /** ランプの明度プロファイルを [fromL, toL] へ線形に貼り直す（色相は原典のまま）。 */
  function reanchorLightness(ramp, fromL, toL) {
    var lightness = ramp.map(function (hex) { return Color.hexToLch(hex)[0]; });
    var min = Math.min.apply(null, lightness);
    var max = Math.max.apply(null, lightness);
    var span = max - min || 1;
    return ramp.map(function (hex, index) {
      var lch = Color.hexToLch(hex);
      var t = (lightness[index] - min) / span;
      return Color.lchToHex(Color.clipToGamut([fromL + (toL - fromL) * t, lch[1], lch[2]]));
    });
  }

  /** 連続量のランプ。面に近い側から始めて、面から遠ざかる向きへ単調に進む。 */
  function deriveSequential(recipe, surface) {
    var dark = isDark(surface.base);
    var surfaceL = Color.hexToLch(surface.base)[0];
    var source = recipe.sequentialPerceptual
      ? Sources.PERCEPTUAL[recipe.sequentialPerceptual]
      : Sources.SEQUENTIAL[recipe.sequential];
    var ramp = Color.resample(source, SEQUENTIAL_STEPS);
    var oriented = Color.hexToLch(ramp[0])[0] > Color.hexToLch(ramp[ramp.length - 1])[0]
      ? ramp.slice().reverse() : ramp;
    return dark
      ? reanchorLightness(oriented, surfaceL + 0.10, 0.93)
      : reanchorLightness(oriented.slice().reverse(), surfaceL - 0.08, 0.30).slice().reverse();
  }

  /** 発散のランプ。中央を面に近い無彩色に置き、両翼が面から遠ざかる。 */
  function deriveDiverging(recipe, surface) {
    var dark = isDark(surface.base);
    var surfaceL = Color.hexToLch(surface.base)[0];
    var source = Color.resample(Sources.DIVERGING[recipe.diverging], DIVERGING_STEPS);
    var middle = (DIVERGING_STEPS - 1) / 2;
    var midL = dark ? surfaceL + 0.14 : surfaceL - 0.05;
    var poleL = dark ? 0.90 : 0.32;
    return source.map(function (hex, index) {
      var distance = Math.abs(index - middle) / middle;
      var lightness = midL + (poleL - midL) * distance;
      var hue = Color.hexToLch(hex)[2];
      // 中央は彩度 0（中立灰）。そこから両翼へ向けて彩度が立ち上がる。
      return distance < 0.08
        ? Color.lchToHex([lightness, 0, hue])
        : atBand(hue, lightness, recipe.chromaScale * distance);
    });
  }

  /** 状態色は固定色相から作り、カテゴリ色と同じ明度帯に置く（使い回さないための予約枠）。 */
  function deriveStatus(surfaceHex, chromaScale) {
    var band = isDark(surfaceHex) ? CATEGORICAL_BAND.dark : CATEGORICAL_BAND.light;
    var status = {};
    Object.keys(STATUS_HUES).forEach(function (name) {
      status[name] = atBand(STATUS_HUES[name], band, chromaScale);
    });
    return status;
  }

  /** 処方1件からトークン一式を作る。 */
  /**
   * v9 での追加（2026-09-21）: 第2引数に処方そのものを渡せる。
   * ダッシュボードから処方を動かして即座に導出するため。名前だけの呼び出しは従来どおり。
   */
  function derive(name, spec) {
    var recipe = (spec !== null && typeof spec === 'object') ? spec : RECIPES[name];
    var surface = deriveSurface(recipe.surface);
    return {
      id: name,
      label: recipe.label,
      note: recipe.note,
      source: {
        categorical: recipe.categorical,
        sequential: recipe.sequentialPerceptual || recipe.sequential,
        diverging: recipe.diverging,
        chromaScale: recipe.chromaScale,
      },
      surface: surface,
      categorical: deriveCategorical(recipe.categorical, surface.base, recipe.chromaScale),
      sequential: deriveSequential(recipe, surface),
      diverging: deriveDiverging(recipe, surface),
      status: deriveStatus(surface.base, recipe.chromaScale),
    };
  }

  function deriveAll() {
    return Object.keys(RECIPES).map(derive);
  }

  return {
    RECIPES: RECIPES,
    CATEGORICAL_BAND: CATEGORICAL_BAND,
    derive: derive,
    deriveAll: deriveAll,
  };
});
