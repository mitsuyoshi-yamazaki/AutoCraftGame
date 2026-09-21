/**
 * 検証済みパレットの原データ。**ここに手で色を作らない**——外部の知覚検証済みの
 * 系列をそのまま写し、加工は recipes.js の導出側で行う。
 *
 * 出典:
 *  - ColorBrewer 2.0（Cynthia Brewer, Mark Harrower, Penn State）https://colorbrewer2.org/
 *    地図学の配色として知覚検証された系列。JASSS 2009 の指針5 が名指しで推奨している。
 *  - viridis / magma / inferno / cividis（matplotlib 既定系列。知覚的一様・明度単調・色覚多様性に安全）
 *    https://cran.r-project.org/web/packages/viridis/vignettes/intro-to-viridis.html
 *  - cividis: Nuñez, Anderton & Renslow (2018) https://doi.org/10.1371/journal.pone.0199239
 *
 * 命名は原典のまま（Set2 / Dark2 / Blues / RdBu …）。**改名しない**——出典を辿れなくなるため。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimUISources = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** カテゴリ用（名義尺度）。順序に意味は無く、弁別されることだけが要件。 */
  var QUALITATIVE = {
    Set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    Dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    Set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
    Paired: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
    Accent: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
  };

  /** 連続量用（単一色相の明暗）。明度が単調に変化する。 */
  var SEQUENTIAL = {
    Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
    Oranges: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#a63603', '#7f2704'],
    Purples: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#54278f', '#3f007d'],
    Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
  };

  /**
   * 知覚的一様な系列。単一色相ではないが**明度が単調**なので、
   * 規約の「連続量は明暗で表す」を満たす。暗い面の上で特に強い。
   */
  var PERCEPTUAL = {
    viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6dcd59', '#b4de2c', '#fde725'],
    magma: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#fec98d', '#fcfdbf'],
    inferno: ['#000004', '#1b0c42', '#4b0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9a06', '#f7d03c', '#fcffa4'],
    cividis: ['#00204d', '#00306f', '#39486b', '#575d6d', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#ffea46'],
  };

  /** 発散用（2色相＋中立灰）。必ず中央が中立であること。 */
  var DIVERGING = {
    RdBu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
    BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
    PuOr: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'],
  };

  /**
   * 既存実装から採った色。**規約に照らして検証する対象**であって、正ではない。
   * 出所: apps/alife-sketches/dashboard/style.css（青灰系）と同 harness.js（セピア系）。
   * 2026-09-21 ユーザ回答「既存の実装には何も規約は入っていないので考慮しなくて良い。
   * ただし本プロジェクトが持っておくカラーパレットのひとつとしてこれらを使っても良い」。
   */
  var EXISTING_SURFACES = {
    slate: { base: '#101219', panel: '#181b24', line: '#2a2f3d', ink: '#e8ebf2', inkDim: '#8b93a7' },
    sepia: { base: '#221f1a', panel: '#2c2823', line: '#4a4238', ink: '#e8e2d6', inkDim: '#a89f8e' },
  };

  return {
    QUALITATIVE: QUALITATIVE,
    SEQUENTIAL: SEQUENTIAL,
    PERCEPTUAL: PERCEPTUAL,
    DIVERGING: DIVERGING,
    EXISTING_SURFACES: EXISTING_SURFACES,
  };
});
