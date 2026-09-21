/**
 * 視覚言語ダッシュボードの組み立て。
 *
 * やっていることは3つだけ:
 *  1. 調整UIの値から**2組のパレットを導出**する——個体用（高彩度）と環境用（低彩度）。
 *     エネルギーの黄だけは処方の外で、色相・彩度・明度から別に導出する
 *  2. そのパレットで見本と場面を描く
 *  3. キットの検査（checks.js）をその場で回して結果を出す
 *
 * 状態はオブジェクトを作り直して差し替える。既存のオブジェクトは変えない。
 */
(function (root) {
  'use strict';

  var Model = root.V9Visual;
  var Draw = root.V9VisualDraw;
  var Controls = root.V9VisualControls;
  var Recipes = root.SimUIRecipes;
  var Checks = root.SimUIChecks;
  var contrast = root.SimUIColor.contrastRatio;
  var deltaE = root.SimUIColor.deltaE;

  var create = Controls.create;

  var state = Model.DEFAULTS;
  var scene = Model.buildScene(state.scene);
  var specimenCanvases = {};

  var nodes = {
    controls: document.getElementById('controls'),
    specimens: document.getElementById('specimens'),
    scene: document.getElementById('scene-canvas'),
    checks: document.getElementById('checks'),
    encoding: document.getElementById('encoding'),
    stateChannels: document.getElementById('state-channels'),
    swatches: document.getElementById('swatches'),
    recipeOut: document.getElementById('recipe-out'),
  };

  /**
   * 個体用と環境用を同じ面・同じ系列から、彩度だけ変えて導出する。
   * **個体がいちばん鮮やかになる**ので、色が濃い点を探せば主体が見つかる。
   */
  var palettesOf = function (current) {
    var organism = Recipes.derive('v9-organism', current.recipe);
    var environment = Recipes.derive('v9-environment',
      Object.assign({}, current.recipe, { chromaScale: current.tuning.environmentChroma }));
    return {
      organism: organism,
      environment: environment,
      energy: Model.energyColor(current.tuning),
      grey: Model.greyColor(current.tuning.structureLightness),
      greyDim: Model.greyColor(current.tuning.wasteLightness),
      surface: organism.surface,
    };
  };

  /** 下敷きは黄が決まってからでないと作れないので、二段構えで組む */
  var withBackdrop = function (palettes, tuning) {
    return Object.assign({}, palettes, {
      energyBackdrop: Model.backdropColor(palettes.energy, palettes.surface.base, tuning.energyBackdrop),
    });
  };

  /** 面のトークンを CSS 変数へ。ページ自身の色もトークン経由で来る */
  var applySurface = function (surface) {
    var style = document.documentElement.style;
    style.setProperty('--surface-base', surface.base);
    style.setProperty('--surface-panel', surface.panel);
    style.setProperty('--surface-line', surface.line);
    style.setProperty('--ink', surface.ink);
    style.setProperty('--ink-dim', surface.inkDim);
  };

  var replaceChildren = function (node, children) {
    node.textContent = '';
    children.forEach(function (child) { node.appendChild(child); });
  };

  var indexed = function (key, value) {
    var entry = {};
    entry[key] = value;
    return entry;
  };

  // === 見本 ===

  var buildSpecimens = function () {
    var columns = Model.KINDS.map(function (kind) {
      var column = create('div', 'specimen-group');
      column.appendChild(create('h3', undefined, kind.label));
      Model.CLASSES.filter(function (cls) { return cls.kind === kind.id; }).forEach(function (cls) {
        var card = create('div', 'specimen');
        var canvas = create('canvas', 'specimen-canvas');
        specimenCanvases = Object.assign({}, specimenCanvases, indexed(cls.id, canvas));
        card.appendChild(canvas);
        card.appendChild(create('span', 'specimen-label', cls.label));
        column.appendChild(card);
      });
      return column;
    });
    replaceChildren(nodes.specimens, columns);
  };

  // === 表 ===

  var tableOf = function (head, rows) {
    var table = create('table');
    var header = create('tr');
    head.forEach(function (label) { header.appendChild(create('th', undefined, label)); });
    table.appendChild(header);
    rows.forEach(function (cells) {
      var row = create('tr');
      cells.forEach(function (cell) { row.appendChild(create('td', undefined, cell)); });
      table.appendChild(row);
    });
    return table;
  };

  var renderTables = function () {
    replaceChildren(nodes.encoding, [tableOf(['チャネル', '運んでいるもの'],
      Model.ENCODING.map(function (entry) { return [entry.channel, entry.carries]; }))]);
    replaceChildren(nodes.stateChannels, [tableOf(['状態チャネル', '運んでいるもの'],
      Model.STATE_CHANNELS.map(function (entry) { return [entry.label, entry.carries]; }))]);
  };

  /** 色見本。文字は ink で書き、identity は隣の見本が運ぶ（規約 B-6） */
  var renderSwatches = function (palettes) {
    var named = function (colors, prefix) {
      return colors.map(function (color, index) {
        return { color: color, label: prefix + ' ' + (index + 1) };
      });
    };
    var items = named(Model.assignableColors(palettes.organism, palettes), '個体用')
      .concat(named(Model.assignableColors(palettes.environment, palettes), '環境用'))
      .concat([
        { color: palettes.energy, label: '【予約】エネルギーの黄' },
        { color: palettes.energyBackdrop, label: '　湧出点の下敷き' },
        { color: palettes.grey, label: '【予約】無彩色・明（構造系）' },
        { color: palettes.greyDim, label: '【予約】無彩色・暗（廃棄系）' },
      ]);
    replaceChildren(nodes.swatches, items.map(function (item) {
      var row = create('div', 'swatch');
      var chip = create('span', 'swatch-chip');
      chip.style.background = item.color;
      row.appendChild(chip);
      row.appendChild(create('span', undefined, item.label));
      row.appendChild(create('code', undefined, item.color));
      return row;
    }));
  };

  // === 検査 ===

  /** 処方が出した色数を超えるスロットを指しているクラスが無いか */
  var checkSlotsAvailable = function (palettes) {
    var missing = Model.CLASSES.filter(function (cls) {
      var slot = state.slots[cls.id];
      return !Model.slotAvailable(palettes, slot, cls.kind);
    }).map(function (cls) { return cls.label; });
    return {
      id: 'slots-available',
      label: '色スロットが処方の色数に収まっている',
      status: missing.length ? 'warn' : 'pass',
      detail: missing.length
        ? '出ていない色を指していて無彩色へ落ちている: ' + missing.join('、')
        : '全クラスが導出された色を指している',
      rule: 'A-2',
    };
  };

  /**
   * **実際に使っている色**だけで弁別を見る。
   * カテゴリは形で文脈化されるので、同じ大分類の中で分かれていれば足りる——
   * パレット全体を見る検査より、この絵にとって意味のある問いになる。
   */
  var checkUsedSeparation = function (palettes) {
    var failing = Model.KINDS.map(function (kind) {
      var colors = Model.CLASSES
        .filter(function (cls) { return cls.kind === kind.id; })
        .map(function (cls) { return Model.colorOf(palettes, state.slots[cls.id], kind.id); });
      var unique = colors.filter(function (color, index) { return colors.indexOf(color) === index; });
      return { kind: kind, result: Checks.checkCategoricalSeparation(unique) };
    }).filter(function (entry) { return entry.result.status !== 'pass'; });
    return {
      id: 'used-separation',
      label: '同じ形の中で使っている色が分かれている',
      status: failing.length ? failing[0].result.status : 'pass',
      detail: failing.length
        ? failing.map(function (entry) { return entry.kind.label + ': ' + entry.result.detail; }).join(' / ')
        : '全ての大分類で、使っている色どうしが通常視・色覚3型で分かれている',
      rule: 'A-2',
    };
  };

  /**
   * 実際に使っているマークの色が面から見えるか（規約 A-4 の下限 3:1）。
   * キットの検査はカテゴリ色しか見ないので、固定の黄と無彩色をここで見る。
   */
  var checkMarkContrast = function (palettes) {
    var used = Model.CLASSES.map(function (cls) {
      return { label: cls.label, color: Model.colorOf(palettes, state.slots[cls.id], cls.kind) };
    });
    var weak = used.filter(function (item) {
      return Checks.THRESHOLDS.markContrast > contrast(item.color, palettes.surface.base);
    });
    return {
      id: 'mark-contrast',
      label: 'マークが面から見える',
      status: weak.length ? 'warn' : 'pass',
      detail: weak.length
        ? '面とのコントラストが 3:1 未満: ' + weak.map(function (item) {
          return item.label + '（' + contrast(item.color, palettes.surface.base).toFixed(2) + ':1）';
        }).join('、')
        : '全クラスが面とのコントラスト 3:1 を超えている',
      rule: 'A-4',
    };
  };

  /**
   * パレット全体の弁別は**使っていない色の対まで**数える。
   * この絵にとって効くのは checkUsedSeparation のほうなので、参考として出す。
   */
  /**
   * 予約色（黄・2段の灰）が他のクラスへ漏れていないか。
   * 割り当ての段階で候補から外しているので通るはずで、ここは**その保証の確認**である。
   */
  var checkReserved = function (palettes) {
    var reserved = [
      { label: 'エネルギーの黄', color: palettes.energy, owners: ['energyNode', 'energyPile'] },
      { label: '構造系の灰', color: palettes.grey, owners: ['structure', 'otherPart'] },
      { label: '廃棄系の灰', color: palettes.greyDim, owners: ['waste'] },
    ];
    var leaks = reserved.reduce(function (found, entry) {
      return found.concat(Model.CLASSES
        .filter(function (cls) { return entry.owners.indexOf(cls.id) < 0; })
        .map(function (cls) {
          return {
            text: cls.label + ' が ' + entry.label + ' に近い（ΔE '
              + deltaE(entry.color, Model.colorOf(palettes, state.slots[cls.id], cls.kind)).toFixed(1) + '）',
            near: deltaE(entry.color, Model.colorOf(palettes, state.slots[cls.id], cls.kind)) < Model.RESERVED_DISTANCE,
          };
        })
        .filter(function (item) { return item.near; }));
    }, []);
    return {
      id: 'reserved-colors',
      label: '予約色が他のクラスへ漏れていない',
      status: leaks.length ? 'warn' : 'pass',
      detail: leaks.length ? leaks.map(function (item) { return item.text; }).join('、')
        : '黄と2段の灰は、持ち主のクラス以外では ΔE ' + Model.RESERVED_DISTANCE + ' 以上離れている',
      rule: 'v9',
    };
  };

  var labelled = function (prefix, check) {
    var informational = check.id === 'categorical-separation';
    return Object.assign({}, check, {
      label: prefix + (informational ? '（参考）' : '') + check.label,
      status: informational && check.status === 'warn' ? 'note' : check.status,
    });
  };

  var renderChecks = function (palettes) {
    var results = Checks.auditPalette(palettes.organism).checks
      .map(function (check) { return labelled('個体用 ', check); })
      .concat(Checks.auditPalette(palettes.environment).checks
        .map(function (check) { return labelled('環境用 ', check); }))
      .concat([
        checkUsedSeparation(palettes),
        checkReserved(palettes),
        checkMarkContrast(palettes),
        checkSlotsAvailable(palettes),
        Checks.checkEncodingDeclared(Model.ENCODING),
        Checks.checkFillGap(state.view.gap),
        Checks.checkTextColor([palettes.surface.ink, palettes.surface.inkDim], palettes.surface),
      ]);
    replaceChildren(nodes.checks, results.map(function (item) {
      var row = create('div', 'check check-' + item.status);
      row.appendChild(create('span', 'check-mark',
        item.status === 'pass' ? 'OK' : item.status === 'note' ? '参考' : item.status === 'warn' ? 'WARN' : 'FAIL'));
      row.appendChild(create('span', 'check-rule', item.rule));
      row.appendChild(create('span', 'check-label', item.label));
      row.appendChild(create('span', 'check-detail', item.detail));
      return row;
    }));
  };

  /** 気に入った設定をそのまま v9 側へ写せる形で出す */
  var renderSettings = function (palettes) {
    var recipe = state.recipe;
    nodes.recipeOut.value = [
      '// ui/simulation-ui-kit/lib/recipes.js の RECIPES へ',
      '    acg: {',
      "      label: '" + recipe.label + "',",
      "      surface: '" + recipe.surface + "',",
      "      categorical: '" + recipe.categorical + "',",
      "      sequentialPerceptual: '" + recipe.sequentialPerceptual + "',",
      "      diverging: '" + recipe.diverging + "',",
      '      chromaScale: ' + recipe.chromaScale.toFixed(2) + ',  // 個体用',
      '    },',
      '',
      '// v9 固有の設定',
      'environmentChroma: ' + state.tuning.environmentChroma.toFixed(2),
      'energy: 色相 ' + state.tuning.energyHue + ' / 彩度 ' + state.tuning.energyChroma.toFixed(2)
        + ' / 明度 ' + state.tuning.energyLightness.toFixed(2) + ' → ' + palettes.energy
        + '（下敷き ' + palettes.energyBackdrop + '）',
      'corner: ' + state.tuning.corner.toFixed(2),
      'areas: ' + Model.KINDS.map(function (kind) {
        return kind.id + ' ' + state.areas[kind.id];
      }).join(' / '),
      'gap: ' + state.view.gap,
    ].join('\n');
  };

  // === 描画 ===

  var render = function () {
    var palettes = withBackdrop(palettesOf(state), state.tuning);
    var catalog = Model.shapeCatalog(state.tuning.corner);
    applySurface(palettes.surface);
    renderSwatches(palettes);
    renderChecks(palettes);
    renderSettings(palettes);
    Model.CLASSES.forEach(function (cls) {
      Draw.drawSpecimen(specimenCanvases[cls.id], palettes, state, catalog, cls.id);
    });
    Draw.drawScene(nodes.scene, palettes, state, catalog, scene);
  };

  var onChange = function (path, value) {
    state = Model.patch(state, path[0], indexed(path[1], value));
    if (path[0] === 'scene') scene = Model.buildScene(state.scene);
    render();
  };

  var start = function () {
    Controls.build(nodes.controls, state, onChange);
    buildSpecimens();
    renderTables();
    render();
    window.addEventListener('resize', render);
  };

  start();
})(window);
