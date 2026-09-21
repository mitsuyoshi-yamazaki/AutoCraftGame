/**
 * 規約の機械検査。**目で判断してはいけない部分だけ**をここに集める。
 *
 * 検査できるのは「色と寸法が規則を満たすか」であって、
 * 「その絵が現象の意味を成しているか」ではない（後者は人間の担当）。
 *
 * 各検査は { id, label, status: 'pass'|'warn'|'fail', detail, rule } を返す。
 * rule は docs/subprojects/standards/simulation-ui/convention.md の条項番号。
 * **条項が消えた検査はここから削除する**——規約に無い規則が機械の側で生き続けると、
 * 規約と実装のどちらが正なのか分からなくなる（2026-09-21 に発散と時間エイリアシングを削除した）。
 */
(function (root, factory) {
  var api = factory(
    typeof module === 'object' && module.exports ? require('./color.js') : root.SimUIColor
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimUIChecks = api;
})(typeof self !== 'undefined' ? self : this, function (Color) {
  'use strict';

  /** 閾値。dataviz スキルの六検査に合わせてある（OKLab ΔE ×100 の尺度）。 */
  var THRESHOLDS = {
    cvdDeltaE: 8,          // 色覚多様性で隣接対が分離している下限
    normalDeltaE: 15,      // 通常視での弁別の下限（これを割るのは必ず fail）
    chromaFloor: 0.045,    // これ未満だと無彩色に見え、カテゴリとして読めない
    markContrast: 3,       // マークと面のコントラスト比の下限
    inkContrast: 4.5,      // 文字と面のコントラスト比の下限
    grayscaleDelta: 0.06,  // 脱彩度したときに図と地が保つべき OKLab 明度差
  };

  function result(id, label, status, detail, rule) {
    return { id: id, label: label, status: status, detail: detail, rule: rule };
  }

  function worst(statuses) {
    if (statuses.indexOf('fail') >= 0) return 'fail';
    if (statuses.indexOf('warn') >= 0) return 'warn';
    return 'pass';
  }

  /** A-3 連続量: 明度が単調に変化しているか（虹色はここで落ちる）。 */
  function checkSequentialMonotone(ramp) {
    var lightness = ramp.map(function (hex) { return Color.hexToOklab(hex)[0]; });
    var rising = 0, falling = 0;
    for (var i = 1; i < lightness.length; i++) {
      if (lightness[i] > lightness[i - 1]) rising++;
      else if (lightness[i] < lightness[i - 1]) falling++;
    }
    var breaks = Math.min(rising, falling);
    return result(
      'sequential-monotone', '連続量の明度が単調',
      breaks === 0 ? 'pass' : breaks <= 1 ? 'warn' : 'fail',
      breaks === 0 ? '段ごとに明度が一方向へ動いている'
        : '明度の向きが ' + breaks + ' 回反転している（脱彩度すると大小が読めなくなる）',
      'A-3'
    );
  }

  /** A-2 カテゴリ: 全対が通常視と色覚3型で弁別できるか。 */
  function checkCategoricalSeparation(colors) {
    var failures = [], warnings = [];
    for (var i = 0; i < colors.length; i++) {
      for (var j = i + 1; j < colors.length; j++) {
        var normal = Color.deltaE(colors[i], colors[j]);
        var cvd = Color.minCvdDeltaE(colors[i], colors[j]);
        if (normal < THRESHOLDS.normalDeltaE) failures.push((i + 1) + '-' + (j + 1) + '（通常視 ΔE ' + normal.toFixed(1) + '）');
        else if (cvd < THRESHOLDS.cvdDeltaE) warnings.push((i + 1) + '-' + (j + 1) + '（色覚 ΔE ' + cvd.toFixed(1) + '）');
      }
    }
    return result(
      'categorical-separation', 'カテゴリ色の弁別',
      failures.length ? 'fail' : warnings.length ? 'warn' : 'pass',
      failures.length ? '通常視で見分けられない対: ' + failures.join('、')
        : warnings.length ? '色だけでは足りない対（形との二重符号化が要る）: ' + warnings.join('、')
          : colors.length + '色すべてが通常視・色覚3型で弁別できる',
      'A-2'
    );
  }

  /** A-2 カテゴリ色が無彩色に沈んでいないか（色相が identity を運べる下限）。 */
  function checkChromaFloor(colors) {
    var flat = colors.filter(function (hex) { return Color.hexToLch(hex)[1] < THRESHOLDS.chromaFloor; });
    return result(
      'chroma-floor', 'カテゴリ色の彩度下限',
      flat.length ? 'warn' : 'pass',
      flat.length ? '無彩色に近い色がある: ' + flat.join('、') + '（「その他」の枠にだけ使う）'
        : '全色が彩度の下限を超えている',
      'A-2'
    );
  }

  /** A-4 図と地: マークと文字が面から浮いているか。 */
  function checkSurfaceContrast(colors, surface, ink) {
    var weak = colors.filter(function (hex) { return Color.contrastRatio(hex, surface) < THRESHOLDS.markContrast; });
    var inkRatio = Color.contrastRatio(ink, surface);
    var statuses = [weak.length ? 'warn' : 'pass', inkRatio < THRESHOLDS.inkContrast ? 'fail' : 'pass'];
    return result(
      'surface-contrast', '面とのコントラスト',
      worst(statuses),
      (weak.length ? '面に沈むマーク色: ' + weak.join('、') + ' / ' : '')
      + '文字と面 ' + inkRatio.toFixed(2) + ':1（下限 ' + THRESHOLDS.inkContrast + '）',
      'A-4'
    );
  }

  /** A-4 脱彩度検査（squint test の機械版）。図と地が明度だけで分離しているか。 */
  function checkGrayscaleSeparation(colors, surface) {
    var surfaceL = Color.hexToOklab(surface)[0];
    var merged = colors.filter(function (hex) {
      return Math.abs(Color.hexToOklab(hex)[0] - surfaceL) < THRESHOLDS.grayscaleDelta;
    });
    return result(
      'grayscale-separation', '脱彩度しても図と地が分かれる',
      merged.length ? 'fail' : 'pass',
      merged.length ? 'グレースケールで地に溶ける色: ' + merged.join('、') + '（明度構造が無い＝のっぺりの正体）'
        : '全色が地と明度で分離している',
      'A-4'
    );
  }

  /** A-5 符号化表: 宣言があり、使っている視覚チャネルがすべて宣言に含まれるか。 */
  var KNOWN_CHANNELS = ['色相', '明度', '形', '大きさ', '長さ', '位置', '向き', '不透明度'];

  function checkEncodingDeclared(encoding) {
    if (!encoding || !encoding.length) {
      return result('encoding-declared', '符号化表の宣言', 'fail',
        '宣言が無い（何が量で何がカテゴリかを機械が知りようがない）', 'A-5');
    }
    var unknown = encoding.filter(function (entry) {
      return KNOWN_CHANNELS.indexOf(entry.channel) < 0;
    }).map(function (entry) { return entry.channel; });
    var blank = encoding.filter(function (entry) { return !entry.carries; }).length;
    return result('encoding-declared', '符号化表の宣言',
      unknown.length || blank ? 'warn' : 'pass',
      unknown.length ? '既知でないチャネル: ' + unknown.join('、')
        : blank ? '運んでいるものが空の行が ' + blank + ' 件ある'
          : encoding.length + ' チャネルを宣言している（中身が正しいかは人間が見る）',
      'A-5');
  }

  /** B-6 文字色: 文字にトークンの ink / inkDim 以外を使っていないか。 */
  function checkTextColor(usedTextColors, surface) {
    var allowed = [surface.ink, surface.inkDim];
    var stray = usedTextColors.filter(function (hex) { return allowed.indexOf(hex) < 0; });
    return result('text-color', '文字に系列の色を使っていない',
      stray.length ? 'warn' : 'pass',
      stray.length ? '文字用でない色が使われている: ' + stray.join('、')
        : '文字は ink / inkDim だけで書かれている',
      'B-6');
  }

  /** B-4 面と面の間に地の色の隙間があるか（描画側が申告した値を検査する）。 */
  function checkFillGap(gapPx) {
    return result(
      'fill-gap', '面と面の間の隙間',
      gapPx >= 1 ? 'pass' : 'warn',
      gapPx >= 1 ? '隣接する塗りの間に ' + gapPx + 'px の地色がある'
        : '塗りが直接触れている（重なりか同一かが読めない）',
      'B-4'
    );
  }

  /** パレット1式に対する検査をまとめて走らせる。 */
  function auditPalette(palette) {
    var checks = [
      checkCategoricalSeparation(palette.categorical),
      checkChromaFloor(palette.categorical),
      checkSurfaceContrast(palette.categorical, palette.surface.base, palette.surface.ink),
      checkGrayscaleSeparation(palette.categorical, palette.surface.base),
      checkSequentialMonotone(palette.sequential),
    ];
    return { status: worst(checks.map(function (c) { return c.status; })), checks: checks };
  }

  return {
    THRESHOLDS: THRESHOLDS,
    auditPalette: auditPalette,
    checkCategoricalSeparation: checkCategoricalSeparation,
    checkChromaFloor: checkChromaFloor,
    checkSurfaceContrast: checkSurfaceContrast,
    checkGrayscaleSeparation: checkGrayscaleSeparation,
    checkSequentialMonotone: checkSequentialMonotone,
    checkEncodingDeclared: checkEncodingDeclared,
    checkTextColor: checkTextColor,
    checkFillGap: checkFillGap,
    worst: worst,
  };
});
