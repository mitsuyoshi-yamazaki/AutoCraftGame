/**
 * 凡例と符号化表の描画。
 *
 * **手書きしない。** 表示クラスも符号化表も `visual-language-model.js` が持っているので、
 * そこから生成する——手で書くと実装と凡例がすぐ食い違う。
 * 符号化表を画面に出すのは規約 A-5（強いルール）の要求でもある。
 */

import { classColor, encodingTable, stateChannels, visualClasses, visualKinds } from './renderer.js';

const swatch = (color: string): string =>
  `<span class="swatch" style="background:${color}"></span>`;

const row = (color: string, label: string): string =>
  `<div class="leg-row">${swatch(color)}${label}</div>`;

/** 大分類ごとに、形の名前と、その中の表示クラスを色見本つきで並べる */
export const renderLegend = (host: HTMLElement): void => {
  host.innerHTML = visualKinds.map(kind => {
    const classes = visualClasses
      .filter(cls => cls.kind === kind.id)
      .map(cls => row(classColor(cls.id), cls.label))
      .join('');
    return `<div class="leg-sub">${kind.label}</div>${classes}`;
  }).join('');
};

/** 何をどのチャネルで運んでいるかの宣言（規約 A-5）と、状態チャネルの割り当て */
export const renderEncoding = (host: HTMLElement): void => {
  const channels = encodingTable
    .map(entry => `<div class="enc-row"><b>${entry.channel}</b><span>${entry.carries}</span></div>`)
    .join('');
  const states = stateChannels
    .map(entry => `<div class="enc-row"><b>${entry.label}</b><span>${entry.carries}</span></div>`)
    .join('');
  host.innerHTML = `${channels}<div class="leg-sub">状態</div>${states}`;
};
