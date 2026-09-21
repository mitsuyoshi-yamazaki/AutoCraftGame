/**
 * ダッシュボードの調整UI。仕様を1か所へ書いて、そこから DOM を組む。
 *
 * 制御は**一度だけ組み立てて、以後は作り直さない**——range を掴んでいる最中に
 * DOM を作り直すと操作が切れるため。値の反映は描画と検査の側だけが行う。
 */
(function (root) {
  'use strict';

  var Model = root.V9Visual;
  var Sources = root.SimUISources;

  var create = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  var options = function (list) {
    return list.map(function (item) {
      var option = create('option', undefined, item.label);
      option.value = item.value;
      return option;
    });
  };

  var field = function (spec, onChange) {
    var row = create('label', 'field');
    row.appendChild(create('span', 'field-label', spec.label));
    var input;
    var readout = null;

    if (spec.type === 'select') {
      input = create('select');
      options(spec.options).forEach(function (option) { input.appendChild(option); });
      input.value = spec.value;
    } else if (spec.type === 'check') {
      input = create('input');
      input.type = 'checkbox';
      input.checked = spec.value;
    } else {
      input = create('input');
      input.type = spec.type;
      input.value = spec.value;
      if (spec.type === 'range' || spec.type === 'number') {
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
      }
      if (spec.type === 'range') {
        readout = create('span', 'field-value', String(spec.value));
      }
    }

    input.addEventListener('input', function () {
      var value = spec.type === 'check' ? input.checked
        : (spec.type === 'range' || spec.type === 'number') ? Number(input.value)
          : input.value;
      if (readout !== null) readout.textContent = String(value);
      onChange(value);
    });

    row.appendChild(input);
    if (readout !== null) row.appendChild(readout);
    if (spec.note !== undefined) row.appendChild(create('span', 'field-note', spec.note));
    return row;
  };

  var group = function (title, note, specs, onChange) {
    var section = create('section', 'group');
    section.appendChild(create('h2', undefined, title));
    if (note !== undefined) section.appendChild(create('p', 'group-note', note));
    specs.forEach(function (spec) {
      section.appendChild(field(spec, function (value) { onChange(spec.path, value); }));
    });
    return section;
  };

  var namesOf = function (dictionary) {
    return Object.keys(dictionary).map(function (key) { return { value: key, label: key }; });
  };

  var shapeOptions = function (state) {
    return Model.shapeCatalog(state.tuning.corner).map(function (shape) {
      return { value: shape.id, label: shape.label };
    });
  };

  var slotOptions = function () {
    return Model.COLOR_SLOTS.map(function (slot) {
      return { value: slot.id, label: slot.label };
    });
  };

  var rampOptions = function () {
    return namesOf(Sources.PERCEPTUAL).concat(namesOf(Sources.SEQUENTIAL));
  };

  /** 制御の仕様。`path` は [状態の区画, キー] */
  var specsFor = function (state) {
    var recipe = [
      { path: ['recipe', 'surface'], type: 'color', label: '面の色', value: state.recipe.surface },
      { path: ['recipe', 'categorical'], type: 'select', label: '原典の系列', value: state.recipe.categorical, options: namesOf(Sources.QUALITATIVE) },
      { path: ['recipe', 'chromaScale'], type: 'range', label: '彩度（個体＝主役）', value: state.recipe.chromaScale, min: 0.35, max: 1, step: 0.01, note: '主体である個体をいちばん鮮やかにする' },
      { path: ['tuning', 'environmentChroma'], type: 'range', label: '彩度（環境）', value: state.tuning.environmentChroma, min: 0.35, max: 1, step: 0.01, note: '物質・単独部品・エネルギー。下げるほど個体が前に出る' },
      { path: ['recipe', 'sequentialPerceptual'], type: 'select', label: '連続色の系列', value: state.recipe.sequentialPerceptual, options: rampOptions() },
    ];

    var energy = [
      { path: ['tuning', 'energyHue'], type: 'range', label: '色相', value: state.tuning.energyHue, min: 60, max: 120, step: 1, note: 'エネルギーは処方に依らず黄で固定する（v9 固有）' },
      { path: ['tuning', 'energyChroma'], type: 'range', label: '彩度', value: state.tuning.energyChroma, min: 0.3, max: 1, step: 0.01 },
      { path: ['tuning', 'energyLightness'], type: 'range', label: '明度', value: state.tuning.energyLightness, min: 0.5, max: 0.95, step: 0.01, note: '上げすぎると個体より目立つ' },
      { path: ['tuning', 'energyBackdrop'], type: 'range', label: '湧出点の下敷きの薄さ', value: state.tuning.energyBackdrop, min: 0, max: 0.95, step: 0.01, note: '黄を面へ寄せる度合い。1 に近いほど薄い' },
    ];

    var greys = [
      { path: ['tuning', 'structureLightness'], type: 'range', label: '構造系の明度', value: state.tuning.structureLightness, min: 0.25, max: 0.85, step: 0.01, note: '豊富な資源は無彩色にして後ろへ下げる。上げすぎると環境色と混ざる' },
      { path: ['tuning', 'wasteLightness'], type: 'range', label: '廃棄系の明度', value: state.tuning.wasteLightness, min: 0.25, max: 0.85, step: 0.01 },
    ];

    var form = [
      { path: ['tuning', 'corner'], type: 'range', label: '角の丸み', value: state.tuning.corner, min: 0, max: 0.45, step: 0.01, note: '菱形の辺は直線のまま、角だけ丸める' },
    ];

    var shapes = Model.KINDS.map(function (kind) {
      return { path: ['shapes', kind.id], type: 'select', label: kind.label, value: state.shapes[kind.id], options: shapeOptions(state), note: kind.note };
    });

    var areas = Model.KINDS.map(function (kind) {
      return { path: ['areas', kind.id], type: 'range', label: kind.label, value: state.areas[kind.id], min: 0.1, max: 2.5, step: 0.05 };
    });

    var slots = Model.CLASSES.map(function (cls) {
      return { path: ['slots', cls.id], type: 'select', label: cls.label, value: state.slots[cls.id], options: slotOptions(), note: cls.note };
    });

    var scene = [
      { path: ['scene', 'seed'], type: 'number', label: 'seed', value: state.scene.seed, min: 0, max: 9999, step: 1 },
      { path: ['scene', 'matter'], type: 'range', label: '物質の数', value: state.scene.matter, min: 0, max: 600, step: 10 },
      { path: ['scene', 'organisms'], type: 'range', label: '個体の数', value: state.scene.organisms, min: 0, max: 200, step: 2 },
      { path: ['scene', 'parts'], type: 'range', label: '単独部品の数', value: state.scene.parts, min: 0, max: 200, step: 2 },
      { path: ['scene', 'energyNodes'], type: 'range', label: 'エネルギー湧出点の数', value: state.scene.energyNodes, min: 0, max: 60, step: 1 },
      { path: ['scene', 'energyPiles'], type: 'range', label: '散布エネルギーの数', value: state.scene.energyPiles, min: 0, max: 60, step: 1 },
    ];

    var view = [
      { path: ['view', 'zoom'], type: 'range', label: 'ズーム（px/世界単位）', value: state.view.zoom, min: 1, max: 16, step: 0.1, note: '下げると遠景。形の差が消えるのを確かめる（規約 B-8）' },
      { path: ['view', 'gap'], type: 'range', label: '面の間の隙間（px）', value: state.view.gap, min: 0, max: 4, step: 0.5, note: '規約 B-4' },
      { path: ['view', 'desaturate'], type: 'check', label: '脱彩度して見る', value: state.view.desaturate, note: '規約 A-4 の判定の一問' },
    ];

    var demo = [
      { path: ['demo', 'durability'], type: 'range', label: '耐久・残流量', value: state.demo.durability, min: 0, max: 1, step: 0.01, note: '個体と単独部品では耐久、エネルギー湧出点では当tickの残流量。物質は状態を持たない' },
      { path: ['demo', 'running'], type: 'range', label: '稼働 Processor 数', value: state.demo.running, min: 0, max: 4, step: 1 },
      { path: ['demo', 'selected'], type: 'check', label: '選択中', value: state.demo.selected },
    ];

    return [
      { title: '処方（色はここから導出する）', note: '値を手で選ばない。面の色・原典の系列・彩度の寄せ方の3つだけを指定する', specs: recipe },
      { title: 'エネルギーの黄（固定）', note: 'パレットを変えても動かない。手で hex を書かず色相・彩度・明度から導出する', specs: energy },
      { title: '無彩色（豊富な資源）', note: '文字用の色を流用せず、明度だけを指定して導出する', specs: greys },
      { title: '大分類 → 形', note: '形が運ぶのは大分類だけ。状態のために形を変えない（規約 A-6）', specs: shapes },
      { title: '形の調整', specs: form },
      { title: '大分類 → 面積係数', note: '面積は量に比例する。ここで掛けるのは大分類ごとの定数の誇張。主体である個体をいちばん大きくする', specs: areas },
      { title: '表示クラス → 色', note: '色相は形で文脈化されるので、形をまたいで同じ色を使い回してよい', specs: slots },
      { title: '場面', specs: scene },
      { title: '見え方', specs: view },
      { title: '状態のデモ（見本に反映）', specs: demo },
    ];
  };

  var build = function (container, state, onChange) {
    specsFor(state).forEach(function (section) {
      container.appendChild(group(section.title, section.note, section.specs, onChange));
    });
  };

  root.V9VisualControls = { build: build, create: create };
})(window);
