/**
 * 色計算。sRGB / 線形 RGB / OKLab / OKLCh の相互変換、色覚多様性の模擬、
 * WCAG コントラスト比、OKLab 上の色差（ΔE）。
 *
 * 依存ゼロ。ブラウザ（古典スクリプト）と Node の双方から読める形にしてある
 * （alife-sketches と同じ制約——ES module にすると file:// で CORS に弾かれる）。
 *
 * 出典:
 *  - OKLab: Björn Ottosson "A perceptual color space for image processing" (2020)
 *    https://bottosson.github.io/posts/oklab/
 *  - 色覚多様性の模擬行列: Viénot, Brettel & Mollon (1999) の線形 RGB 近似。
 *    https://vision.psychol.cam.ac.uk/jdmollon/papers/colourmaps.pdf
 *  - コントラスト比: WCAG 2.1 相対輝度の定義
 *    https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimUIColor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SRGB_THRESHOLD = 0.04045;
  var SRGB_LINEAR_DIVISOR = 12.92;
  var SRGB_OFFSET = 0.055;
  var SRGB_GAMMA = 2.4;
  var LUMINANCE_OFFSET = 0.05;
  var DELTA_E_SCALE = 100;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  /** '#rgb' / '#rrggbb' を 0..1 の3要素へ。受け付けない文字列は null を返す。 */
  function parseHex(hex) {
    if (typeof hex !== 'string') return null;
    var body = hex.trim().replace(/^#/, '');
    if (body.length === 3) body = body.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(body)) return null;
    return [
      parseInt(body.slice(0, 2), 16) / 255,
      parseInt(body.slice(2, 4), 16) / 255,
      parseInt(body.slice(4, 6), 16) / 255,
    ];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (channel) {
      var byte = Math.round(clamp(channel, 0, 1) * 255);
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function srgbToLinear(channel) {
    return channel <= SRGB_THRESHOLD
      ? channel / SRGB_LINEAR_DIVISOR
      : Math.pow((channel + SRGB_OFFSET) / (1 + SRGB_OFFSET), SRGB_GAMMA);
  }

  function linearToSrgb(channel) {
    return channel <= SRGB_THRESHOLD / SRGB_LINEAR_DIVISOR
      ? channel * SRGB_LINEAR_DIVISOR
      : (1 + SRGB_OFFSET) * Math.pow(channel, 1 / SRGB_GAMMA) - SRGB_OFFSET;
  }

  function toLinear(rgb) { return rgb.map(srgbToLinear); }
  function fromLinear(rgb) { return rgb.map(linearToSrgb); }

  function linearToOklab(lin) {
    var r = lin[0], g = lin[1], b = lin[2];
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
  }

  function oklabToLinear(lab) {
    var L = lab[0], a = lab[1], b = lab[2];
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  }

  function hexToOklab(hex) {
    var rgb = parseHex(hex);
    return rgb ? linearToOklab(toLinear(rgb)) : null;
  }

  function oklabToHex(lab) { return toHex(fromLinear(oklabToLinear(lab))); }

  /** OKLab → OKLCh（L, C, h[度]）。 */
  function labToLch(lab) {
    var hue = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    return [lab[0], Math.hypot(lab[1], lab[2]), hue < 0 ? hue + 360 : hue];
  }

  function lchToLab(lch) {
    var rad = lch[2] * Math.PI / 180;
    return [lch[0], lch[1] * Math.cos(rad), lch[1] * Math.sin(rad)];
  }

  function hexToLch(hex) {
    var lab = hexToOklab(hex);
    return lab ? labToLch(lab) : null;
  }

  function lchToHex(lch) { return oklabToHex(lchToLab(lch)); }

  /** その OKLCh が sRGB の枠に収まるか（丸めずに判定する）。 */
  function inGamut(lch) {
    var lin = oklabToLinear(lchToLab(lch));
    return lin.every(function (channel) { return channel >= -1e-4 && channel <= 1 + 1e-4; });
  }

  /** 色相と明度を保ったまま、彩度を下げて sRGB の枠へ入れる。 */
  function clipToGamut(lch) {
    if (inGamut(lch)) return lch.slice();
    var low = 0, high = lch[1];
    for (var i = 0; i < 24; i++) {
      var mid = (low + high) / 2;
      if (inGamut([lch[0], mid, lch[2]])) low = mid; else high = mid;
    }
    return [lch[0], low, lch[2]];
  }

  /** その明度・色相で sRGB が出せる彩度の上限（二分探索）。 */
  function maxChroma(lightness, hue) {
    var low = 0, high = 0.5;
    for (var i = 0; i < 24; i++) {
      var mid = (low + high) / 2;
      if (inGamut([lightness, mid, hue])) low = mid; else high = mid;
    }
    return low;
  }

  var CVD_MATRICES = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
  };

  /** 色覚多様性の見え方を模擬した hex を返す。kind は protan / deutan / tritan。 */
  function simulateCvd(hex, kind) {
    var matrix = CVD_MATRICES[kind];
    if (!matrix) return hex;
    var lin = toLinear(parseHex(hex) || [0, 0, 0]);
    var out = matrix.map(function (row) {
      return clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2], 0, 1);
    });
    return toHex(fromLinear(out));
  }

  /** OKLab 上のユークリッド距離を ×100 したもの（dataviz スキルと同じ尺度）。 */
  function deltaE(hexA, hexB) {
    var a = hexToOklab(hexA), b = hexToOklab(hexB);
    if (!a || !b) return 0;
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * DELTA_E_SCALE;
  }

  /** 色覚3型それぞれで模擬したうえでの最小 ΔE。「最悪どれだけ近づくか」。 */
  function minCvdDeltaE(hexA, hexB) {
    return Object.keys(CVD_MATRICES).reduce(function (worst, kind) {
      return Math.min(worst, deltaE(simulateCvd(hexA, kind), simulateCvd(hexB, kind)));
    }, Infinity);
  }

  /**
   * 画素単位の変換器を返す。kind は 'grayscale' か色覚3型のいずれか、
   * それ以外は恒等変換。ImageData をまとめて通すために用意してある
   * （hex を経由すると1画面あたり数万回の文字列変換になるため）。
   */
  function makePixelTransform(kind) {
    if (kind === 'grayscale') {
      return function (r, g, b) {
        var lab = linearToOklab(toLinear([r / 255, g / 255, b / 255]));
        var out = fromLinear(oklabToLinear([lab[0], 0, 0]));
        return [out[0] * 255, out[1] * 255, out[2] * 255];
      };
    }
    var matrix = CVD_MATRICES[kind];
    if (!matrix) return function (r, g, b) { return [r, g, b]; };
    return function (r, g, b) {
      var lin = toLinear([r / 255, g / 255, b / 255]);
      return matrix.map(function (row) {
        var value = clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2], 0, 1);
        return linearToSrgb(value) * 255;
      });
    };
  }

  function relativeLuminance(hex) {
    var lin = toLinear(parseHex(hex) || [0, 0, 0]);
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrastRatio(hexA, hexB) {
    var a = relativeLuminance(hexA) + LUMINANCE_OFFSET;
    var b = relativeLuminance(hexB) + LUMINANCE_OFFSET;
    return a > b ? a / b : b / a;
  }

  /** 脱彩度検査（squint test の機械版）に使う、明度だけを残した hex。 */
  function toGrayscale(hex) {
    var lab = hexToOklab(hex);
    return lab ? oklabToHex([lab[0], 0, 0]) : hex;
  }

  /** 2色の間を OKLab 上で線形に補間する（連続量のランプ生成に使う）。 */
  function mix(hexA, hexB, t) {
    var a = hexToOklab(hexA), b = hexToOklab(hexB);
    return oklabToHex([0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }));
  }

  /** 与えた hex 列を OKLab 上で等間隔に再標本し、count 段のランプにする。 */
  function resample(hexes, count) {
    if (count <= 1) return [hexes[0]];
    var out = [];
    for (var i = 0; i < count; i++) {
      var pos = (i / (count - 1)) * (hexes.length - 1);
      var lower = Math.floor(pos);
      var upper = Math.min(lower + 1, hexes.length - 1);
      out.push(mix(hexes[lower], hexes[upper], pos - lower));
    }
    return out;
  }

  return {
    clamp: clamp,
    parseHex: parseHex,
    toHex: toHex,
    hexToOklab: hexToOklab,
    oklabToHex: oklabToHex,
    hexToLch: hexToLch,
    lchToHex: lchToHex,
    labToLch: labToLch,
    lchToLab: lchToLab,
    inGamut: inGamut,
    clipToGamut: clipToGamut,
    maxChroma: maxChroma,
    simulateCvd: simulateCvd,
    cvdKinds: Object.keys(CVD_MATRICES),
    deltaE: deltaE,
    minCvdDeltaE: minCvdDeltaE,
    relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio,
    toGrayscale: toGrayscale,
    makePixelTransform: makePixelTransform,
    mix: mix,
    resample: resample,
  };
});
