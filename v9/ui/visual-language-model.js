/**
 * v9 視覚言語ダッシュボードの定義と状態。
 *
 * キットの規約（ui/simulation-ui-kit/CONVENTION.md）を出発点にしつつ、
 * **v9 固有の判断は規約より優先する**（2026-09-21 ユーザ判断）。優先した箇所:
 *
 *  1. エネルギーの色はパレットに依らず黄で固定する。処方が変わっても動かない
 *  2. 物質の菱形は辺を直線にする（角だけ丸める）。資源は無機的なものなので直線で構成する
 *  3. 主体は個体なので、**個体だけ大きさと彩度を上げる**
 *  4. **エネルギーの黄と2段の灰は予約色**で、他のクラスへは割り当てられない。
 *     導出したカテゴリ色のうち予約色に近いものは、割り当ての候補から機械的に外す
 *
 * 色を手で選ばない原則は保っている——黄も灰も、彩度の違う2組の色も、すべて導出である。
 *
 * **色覚多様性への対応は範囲外**（2026-09-22 ユーザ判断）。本プロジェクトはプロトタイプで、
 * アクセシビリティを考慮しないと決めている。キットの検査は色覚3型も見るので、
 * その結果は参考扱いにし、こちらの検査は通常視の色差だけで立てている。
 *
 * ## v9 の資源が持つ状態（src/sim/types.ts が正）
 *  - MatterNode  … 物質種 + 残量。回収で減るだけ、再生せず、0 で消滅する
 *  - EnergyNode  … **量を持たない。** 総量は無限で、当tickの流出量に上限があるだけ
 *  - 地面の物体  … 物質種 + 個数 ／ 散布エネルギー … 量
 * この違いがあるので、エネルギー湧出点だけは「大きさ＝量」が成り立たない。
 *
 * 素のスクリプト（ES module ではない）。キットが file:// で開けるよう古典スクリプトで
 * 揃えてあるため、こちらも合わせる。
 */
(function (root) {
  'use strict';

  var Color = root.SimUIColor;
  var Shapes = root.SimUIShapes;
  var ShapeTokens = root.SimUIShapeTokens;

  /** ワールドの一辺（世界単位）。場面の生成と描画が共有する */
  var WORLD_SIZE = 100;
  /** 半径の基準（世界単位）。量 1 のときの半径 */
  var BASE_RADIUS = 0.9;
  /** 量の基準。半径は sqrt(量 / この値) に比例する＝面積が量に比例する（規約 A-1） */
  var AMOUNT_REFERENCE = 1;
  /**
   * エネルギーの黄はカテゴリ色の帯より上に置く（2026-09-22 ユーザ判断）。
   * 帯を外れるぶん他より明るくなるが、エネルギーは予約色で1クラス専用なので、
   * 明度が identity を混ぜる心配（規約 B-2）がない。
   */
  var ENERGY_LIGHTNESS = 0.86;
  /** 角を丸めるときの1角あたりの分割数 */
  var CORNER_STEPS = 10;
  /**
   * 単位菱形の一辺の長さ（面積合わせ込み）。
   * 角丸の食い込み比を「px でいくら丸めたいか」から逆算するのに使う。
   */
  var DIAMOND_EDGE = Math.SQRT2 * 1.2533;
  /** 角丸が辺を食う比の上限。これを超えると辺が消えて菱形に見えなくなる */
  var CORNER_MAX_RATIO = 0.35;
  /** 無彩色のマークに残す彩度と色相。0 にすると面から浮くので、面の色相へわずかに寄せる */
  var GREY_CHROMA = 0.012;
  var GREY_HUE = 150;
  /** 予約色から離れているとみなす色差（通常視 ΔE）。checks.js の normalDeltaE と同じ */
  var RESERVED_DISTANCE = 15;

  // === 形 ===

  /** 菱形の頂点。上下左右の4点を直線で結ぶ */
  var DIAMOND_VERTICES = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  var towards = function (from, to, ratio) {
    return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
  };

  /** 2次ベジエ。角を1つ丸めるのに使う */
  var curveThrough = function (from, corner, to, steps) {
    return Array.from({ length: steps + 1 }, function (_, index) {
      var t = index / steps;
      var inv = 1 - t;
      return [
        inv * inv * from[0] + 2 * inv * t * corner[0] + t * t * to[0],
        inv * inv * from[1] + 2 * inv * t * corner[1] + t * t * to[1],
      ];
    });
  };

  /**
   * 多角形の辺を直線のまま、角だけ丸めた輪郭を点列で返す。
   * `ratio` は辺の長さに対する角の食い込み（0 で角のまま、0.5 で辺が消える）。
   * 角と角の間には点を置かないので、描画側の lineTo がそのまま直線の辺になる。
   */
  var roundedPolygon = function (vertices, ratio) {
    return vertices.reduce(function (points, vertex, index) {
      if (ratio <= 0) return points.concat([vertex]);
      var previous = vertices[(index + vertices.length - 1) % vertices.length];
      var next = vertices[(index + 1) % vertices.length];
      return points.concat(curveThrough(
        towards(vertex, previous, ratio), vertex, towards(vertex, next, ratio), CORNER_STEPS,
      ));
    }, []);
  };

  /**
   * 角丸の食い込み比。**マークの大きさに依らず角丸を一定の px にする**
   * （2026-09-22 ユーザ判断）ため、半径が小さいほど比は大きくなる。
   */
  var cornerRatio = function (cornerPx, radiusPx) {
    if (cornerPx <= 0 || radiusPx <= 0) return 0;
    return Math.min(CORNER_MAX_RATIO, cornerPx / (DIAMOND_EDGE * radiusPx));
  };

  /**
   * **角を丸めない**菱形の面積合わせ。角丸の大きさに関わらずこの値で固定する——
   * 面積はシミュレーション上の量の表現であり、角丸は表現上の装飾なので、
   * 装飾で量の表示が動いてはいけない（2026-09-22 ユーザ判断）。
   */
  var SHARP_DIAMOND = { m: 4, points: roundedPolygon(DIAMOND_VERTICES, 0) };
  var SHARP_DIAMOND_SCALE = Shapes.areaScale(SHARP_DIAMOND);

  /** キットの4形に、v9 固有の形を足したもの。角丸は描くときに大きさを見て決める */
  var shapeCatalog = function () {
    return ShapeTokens.shapes.concat([{
      id: 'diamondStraight',
      label: '菱形（直線・角丸）',
      note: 'v9 固有。資源は無機的なので辺を曲げない',
      // 4回対称であることを宣言する（規約 A-2 は偶対称に限る）。輪郭は points が決める
      m: 4,
      cornerScaled: true,
      areaScale: SHARP_DIAMOND_SCALE,
      points: SHARP_DIAMOND.points,
    }]);
  };

  /**
   * 描くときに、そのマークの大きさ用の輪郭へ差し替える。
   * 角丸を持たない形はそのまま返す。
   */
  var shapeAt = function (shape, cornerPx, radiusPx) {
    if (shape.cornerScaled !== true) return shape;
    return Object.assign({}, shape, {
      // 面積合わせは角を丸めない形の値のまま（装飾で大きさを動かさない）
      areaScale: SHARP_DIAMOND_SCALE,
      points: roundedPolygon(DIAMOND_VERTICES, cornerRatio(cornerPx, radiusPx)),
    });
  };

  /**
   * 大分類。**形が運ぶ**（規約 A-2）。
   * `palette` は彩度の系統。個体だけ高い彩度の組を使い、環境は低い彩度の組を使う。
   */
  var KINDS = [
    { id: 'matter', label: '物質', shape: 'diamondStraight', area: 0.7, minPx: 2.6, palette: 'environment', note: '菱形。辺は直線で角だけ丸い。残量は大きさだけが運ぶ。最小2.6pxは量696相当（基準4000のとき）' },
    { id: 'organism', label: '個体', shape: 'circle', area: 1.8, minPx: 2.2, palette: 'organism', note: '円。主体なので最も大きく・最も鮮やか。外周の弧が使えるのも円だけ' },
    { id: 'component', label: '単独部品', shape: 'capsule', area: 0.45, minPx: 1.0, palette: 'environment', note: '横長。加工された＝プリミティブな形状から離れた形' },
    { id: 'energy', label: 'エネルギー', shape: 'square', area: 0.2, minPx: 1.2, palette: 'environment', note: '四角。湧出点だけは量を持たないので固定サイズ。係数0.2は従来0.5の半径63%' },
  ];

  /**
   * 色のスロット。`cat*` は**予約色を除いたあと**のカテゴリ色を指す。
   * 黄と2段の灰は予約色で、他のクラスからは選べない。
   */
  var COLOR_SLOTS = [
    { id: 'cat0', label: '割り当て可能な色 1' },
    { id: 'cat1', label: '割り当て可能な色 2' },
    { id: 'cat2', label: '割り当て可能な色 3' },
    { id: 'cat3', label: '割り当て可能な色 4' },
    { id: 'cat4', label: '割り当て可能な色 5（処方しだいで出ない）' },
    { id: 'energy', label: '【予約】エネルギーの黄' },
    { id: 'grey', label: '【予約】無彩色・明（構造系）' },
    { id: 'greyDim', label: '【予約】無彩色・暗（廃棄系）' },
  ];

  /**
   * 表示クラス。色相が運ぶ「種別」の単位。
   * **色相は形で文脈化される**ので、同じ番号を別の形の上で使い回してよい。
   */
  var CLASSES = [
    { id: 'structure', kind: 'matter', label: '構造系（S/B）', slot: 'grey', note: 'BaseSolid・BindingShard ほか。abundant で世界を覆う' },
    { id: 'waste', kind: 'matter', label: '廃棄系（X）', slot: 'greyDim', note: 'ContaminatedMass ほか。くすんだ灰' },
    { id: 'active', kind: 'matter', label: '活性系（A）', slot: 'cat3', note: 'VolatileCore（limited）' },
    { id: 'transfer', kind: 'matter', label: '伝達系（T）', slot: 'cat0', note: 'SignalFluid（limited）' },
    { id: 'information', kind: 'matter', label: '情報系（I）', slot: 'cat1', note: 'InfoSeed（rare）' },
    { id: 'catalyst', kind: 'matter', label: '触媒系（C）', slot: 'cat2', note: 'CatalystGrain（rare）' },
    { id: 'settler', kind: 'organism', label: '定住種', slot: 'cat2', note: 'Harvester を持つ' },
    { id: 'mover', kind: 'organism', label: '移動種', slot: 'cat0', note: 'Actuator を持つ' },
    { id: 'predator', kind: 'organism', label: '捕食者', slot: 'cat3', note: 'Disassembler を持つ。3種は色覚3型でも分かれる組' },
    { id: 'wreck', kind: 'organism', label: '残骸のみの個体', slot: 'grey', note: '生存部品が無いものは種ではない。不活性な物質として無彩色で描く' },
    { id: 'harvester', kind: 'component', label: 'Harvester', slot: 'cat2' },
    { id: 'actuator', kind: 'component', label: 'Actuator', slot: 'cat0' },
    { id: 'disassembler', kind: 'component', label: 'Disassembler', slot: 'cat3' },
    { id: 'assembler', kind: 'component', label: 'Assembler', slot: 'cat1' },
    { id: 'otherPart', kind: 'component', label: 'その他の部品（4種）', slot: 'grey', note: 'Processor・Storage・Sensor・MemoryCore。割り当て可能な色が4なので畳む' },
    { id: 'wreckPart', kind: 'component', label: '残骸の部品', slot: 'grey', note: '同じ無彩色だが、耐久0なので内側の塗りが空になり、その他の部品と区別できる' },
    { id: 'energyNode', kind: 'energy', label: 'エネルギー湧出点', slot: 'energy', note: '量を持たない。固定サイズの薄い四角の上へ、当tickの残流量ぶんの面積で黄を重ねる' },
    { id: 'energyPile', kind: 'energy', label: '散布エネルギー', slot: 'energy', note: '量を持つので、ふつうに大きさが量を運ぶ' },
  ];

  /**
   * 符号化表（規約 A-5・強いルール）。**画面にも出す。**
   * チャネル名は checks.js の KNOWN_CHANNELS に合わせる——合わないと機械が検査できない。
   */
  var ENCODING = [
    { channel: '形', carries: '大分類（物質・個体・単独部品・エネルギー）' },
    { channel: '色相', carries: '種別。黄はエネルギー専用、2段の無彩色は構造系と廃棄系の専用' },
    { channel: '大きさ', carries: '量（面積に比例）。ただし下限あり（小さすぎると読めないため）。エネルギー湧出点は量を持たないので固定' },
    { channel: '位置', carries: '場所（ワールド座標）' },
    { channel: '長さ', carries: '耐久（個体は外周の弧、単独部品は内側の塗りの高さ）' },
    { channel: '明度', carries: '豊富な物質の区別（構造系＝明・廃棄系＝暗の2段）' },
  ];

  /** 状態チャネルの割り当て。語彙は state-marks.js の CHANNELS が正 */
  var STATE_CHANNELS = [
    { id: 'ring', label: '外周の弧', carries: '平均耐久（円＝個体のときだけ描かれる）' },
    { id: 'fill', label: '内側の塗りの高さ', carries: '耐久（単独部品のみ。資源では使わない）' },
    { id: 'pips', label: '中心の点', carries: '稼働中の Processor 数（0〜4）' },
    { id: 'outline', label: '縁の有無', carries: '選択' },
    { id: 'level', label: '薄い同形へ重ねた面積（v9 固有）', carries: 'エネルギー湧出点の当tick残流量。満量で下敷きを覆い隠す' },
  ];

  /** 既定の処方。`chromaScale` は**個体の**彩度で、環境は下の tuning で下げる */
  var DEFAULT_RECIPE = {
    label: 'AutoCraft v9 系',
    note: '黄と灰を予約色として外したうえで4色取れる系列を選ぶ。個体は高彩度、環境は低彩度',
    surface: '#14201a',
    categorical: 'Paired',
    sequentialPerceptual: 'viridis',
    diverging: 'PuOr',
    chromaScale: 0.95,
  };

  var indexBy = function (list, pick) {
    return list.reduce(function (acc, item) {
      var entry = {};
      entry[item.id] = pick(item);
      return Object.assign({}, acc, entry);
    }, {});
  };

  var DEFAULTS = {
    recipe: DEFAULT_RECIPE,
    tuning: {
      environmentChroma: 0.75,
      energyHue: 95, energyChroma: 0.90, energyLightness: ENERGY_LIGHTNESS,
      energyBackdrop: 0.55,
      structureLightness: 0.55, wasteLightness: 0.40,
      cornerPx: 1.5,
    },
    shapes: indexBy(KINDS, function (kind) { return kind.shape; }),
    areas: indexBy(KINDS, function (kind) { return kind.area; }),
    slots: indexBy(CLASSES, function (cls) { return cls.slot; }),
    scene: { seed: 7, matter: 220, organisms: 26, parts: 34, energyNodes: 10, energyPiles: 10 },
    demo: { durability: 0.65, running: 2, selected: false },
    view: { zoom: 6.4, gap: 1, desaturate: false },
  };

  /** 状態は作り直す。元のオブジェクトは変えない */
  var patch = function (state, section, changes) {
    var updated = {};
    updated[section] = Object.assign({}, state[section], changes);
    return Object.assign({}, state, updated);
  };

  var kindById = function (id) {
    return KINDS.find(function (kind) { return kind.id === id; });
  };

  var classById = function (id) {
    return CLASSES.find(function (cls) { return cls.id === id; });
  };

  // === 色 ===

  /**
   * エネルギーの黄。**処方の categorical には触らせない**——
   * 系列を変えても彩度を変えても、エネルギーは黄のまま動かない。
   */
  var energyColor = function (tuning) {
    var ceiling = Color.maxChroma(tuning.energyLightness, tuning.energyHue);
    return Color.lchToHex([tuning.energyLightness, ceiling * tuning.energyChroma, tuning.energyHue]);
  };

  /**
   * 無彩色のマーク。**文字用の ink を流用しない**——文字と面の色は別の仕事で、
   * マークに必要なのは「他の色から ΔE で離れていること」と「面から見えること」である。
   */
  var greyColor = function (lightness) {
    return Color.lchToHex([lightness, GREY_CHROMA, GREY_HUE]);
  };

  /** 湧出点の下敷き。予約色の黄を面へ寄せて作るので、これも手で選んでいない */
  var backdropColor = function (energy, surfaceBase, amount) {
    return Color.mix(energy, surfaceBase, amount);
  };

  /**
   * 予約色（黄・2段の灰）に近い色を、割り当ての候補から外す。
   * **これが「黄と灰を他へ使わない」の実装**である——禁止を検査で見つけるのではなく、
   * そもそも選べなくする。
   */
  var assignableColors = function (palette, palettes) {
    var reserved = [palettes.energy, palettes.grey, palettes.greyDim];
    return palette.categorical.filter(function (color) {
      return reserved.every(function (other) {
        return Color.deltaE(other, color) >= RESERVED_DISTANCE;
      });
    });
  };

  var assignableFor = function (palettes, kindId) {
    return assignableColors(palettes[kindById(kindId).palette], palettes);
  };

  /** そのスロットが実際に色を持っているか（割り当て可能な色の数を超えていないか） */
  var slotAvailable = function (palettes, slotId, kindId) {
    if (slotId.indexOf('cat') !== 0) return true;
    return assignableFor(palettes, kindId)[Number(slotId.slice(3))] !== undefined;
  };

  /** スロット名を実際の色へ。カテゴリ色は大分類の彩度の系統から引く */
  var colorOf = function (palettes, slotId, kindId) {
    if (slotId === 'energy') return palettes.energy;
    if (slotId === 'grey') return palettes.grey;
    if (slotId === 'greyDim') return palettes.greyDim;
    var color = assignableFor(palettes, kindId)[Number(slotId.slice(3))];
    return color === undefined ? palettes.greyDim : color;
  };

  // === 場面 ===

  /** 決定論的な擬似乱数（場面を seed で再現するため） */
  var randomFrom = function (seed) {
    var value = seed >>> 0;
    return function () {
      value = (value + 0x6d2b79f5) >>> 0;
      var t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 物質クラスの出現比。abundant なものほど多い（世界を覆う側） */
  var MATTER_WEIGHTS = [
    { id: 'structure', weight: 42 },
    { id: 'waste', weight: 26 },
    { id: 'active', weight: 12 },
    { id: 'transfer', weight: 10 },
    { id: 'information', weight: 5 },
    { id: 'catalyst', weight: 5 },
  ];

  var pickWeighted = function (entries, roll) {
    var total = entries.reduce(function (sum, entry) { return sum + entry.weight; }, 0);
    var target = roll * total;
    var seen = 0;
    var found = entries.find(function (entry) {
      seen += entry.weight;
      return target < seen;
    });
    return (found === undefined ? entries[entries.length - 1] : found).id;
  };

  var ORGANISM_IDS = ['settler', 'mover', 'predator'];
  var PART_IDS = ['harvester', 'actuator', 'disassembler', 'assembler', 'otherPart'];

  var spawn = function (next, classId, amountScale) {
    return {
      classId: classId,
      x: next() * WORLD_SIZE,
      y: next() * WORLD_SIZE,
      amount: (0.25 + next() * 0.95) * amountScale,
      durability: next(),
      running: Math.floor(next() * 3.4),
    };
  };

  /** 場面をひとつ作る。同じ seed なら同じ配置になる */
  var buildScene = function (config) {
    var next = randomFrom(config.seed);
    var matter = Array.from({ length: config.matter }, function () {
      return spawn(next, pickWeighted(MATTER_WEIGHTS, next()), 1.6);
    });
    var organisms = Array.from({ length: config.organisms }, function () {
      return spawn(next, ORGANISM_IDS[Math.floor(next() * ORGANISM_IDS.length)], 1.3);
    });
    var parts = Array.from({ length: config.parts }, function () {
      return spawn(next, PART_IDS[Math.floor(next() * PART_IDS.length)], 0.8);
    });
    var nodes = Array.from({ length: config.energyNodes }, function () {
      return spawn(next, 'energyNode', 1);
    });
    var piles = Array.from({ length: config.energyPiles }, function () {
      return spawn(next, 'energyPile', 1.1);
    });
    // 個体を最後に描いて前景へ置く（重なったときに主体が隠れない）
    return matter.concat(nodes, piles, parts, organisms);
  };

  /** 量から半径へ。面積が量に比例し、そこへ大分類ごとの誇張係数を掛ける（規約 A-1・B-3） */
  var radiusOf = function (amount, areaCoefficient) {
    return BASE_RADIUS * Math.sqrt(Math.max(amount, 0) / AMOUNT_REFERENCE) * Math.sqrt(areaCoefficient);
  };

  root.V9Visual = {
    WORLD_SIZE: WORLD_SIZE,
    RESERVED_DISTANCE: RESERVED_DISTANCE,
    KINDS: KINDS,
    CLASSES: CLASSES,
    COLOR_SLOTS: COLOR_SLOTS,
    ENCODING: ENCODING,
    STATE_CHANNELS: STATE_CHANNELS,
    DEFAULTS: DEFAULTS,
    patch: patch,
    kindById: kindById,
    classById: classById,
    shapeCatalog: shapeCatalog,
    shapeAt: shapeAt,
    energyColor: energyColor,
    greyColor: greyColor,
    backdropColor: backdropColor,
    assignableColors: assignableColors,
    slotAvailable: slotAvailable,
    colorOf: colorOf,
    buildScene: buildScene,
    radiusOf: radiusOf,
  };
})(window);
