/**
 * 形の族を処方から導出し、弁別を測って書き出す。
 *
 *   node apps/standards/simulation-shape-lab/derive-shapes.js
 *   node apps/standards/simulation-shape-lab/derive-shapes.js --check   # 書き出さない
 *
 * 出力: shapes.json（機械が読む正）と shapes.js（file:// のブラウザ用）。
 * 依存ゼロ（Node 同梱モジュールのみ）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Shapes = require('./lib/shapes.js');
const Family = require('./lib/family.js');

function write(line) { process.stdout.write(line + '\n'); }

function pad(text, width) {
  const visual = Array.from(text).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0);
  return text + ' '.repeat(Math.max(0, width - visual));
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const result = Family.derive();

  write('■ 採った形（' + result.kept.length + '）');
  result.kept.forEach((shape) => {
    write('  ' + pad(shape.id, 10) + pad(shape.label, 10)
      + '対称 ' + (shape.m || '∞') + ' / 角 n=' + shape.n
      + ' / 面積合わせ ×' + shape.areaScale.toFixed(3) + '  — ' + shape.note);
  });

  if (result.dropped.length) {
    write('');
    write('■ 落とした形（' + result.dropped.length + '）');
    result.dropped.forEach((entry) => {
      write('  ' + pad(entry.shape.id, 10) + entry.reason);
    });
  }

  write('');
  write('■ 弁別（起伏の差 / 卓上 ' + Shapes.RASTER_NEAR + 'px枠 / 遠景 ' + Shapes.RASTER_FAR + 'px枠）');
  const cells = Family.matrix(result.kept);
  write('  ' + pad('', 9) + result.kept.map((s) => pad(s.id, 18)).join(''));
  cells.forEach((row, i) => {
    write('  ' + pad(result.kept[i].id, 9) + row.map((cell) => pad(
      cell ? cell.ripple.toFixed(3) + ' ' + cell.near.toFixed(2) + ' ' + cell.far.toFixed(2) : '—', 18
    )).join(''));
  });

  const collapses = Family.farCollapses(result.kept, cells);
  write('');
  if (collapses.length) {
    write('■ 遠景（円が約 12px）で輪郭の差が消える対 — ' + collapses.length + ' 組');
    collapses.forEach((entry) => {
      write('  ' + pad(entry.a + ' ↔ ' + entry.b, 24) + '重なりの食い違い ' + entry.far.toFixed(2));
    });
    write('  → **遠景では形に頼らない。** 点に落として色で運ぶ（Screeps も半径 3.2px 未満で同じことをする）');
  } else {
    write('■ 遠景でも全対の輪郭が見分けられる');
  }

  if (!checkOnly) {
    const payload = {
      generatedBy: 'derive-shapes.js',
      farCollapse: Family.FAR_COLLAPSE,
      shapes: Family.plain(result.kept),
      dropped: result.dropped,
    };
    fs.writeFileSync(path.join(__dirname, 'shapes.json'), JSON.stringify(payload, null, 2) + '\n');
    fs.writeFileSync(
      path.join(__dirname, 'shapes.js'),
      '/* 生成物。手で編集しない。`node derive-shapes.js` で作り直す。 */\n'
      + 'window.SimUIShapeTokens = ' + JSON.stringify(payload, null, 2) + ';\n'
    );
    write('書き出し: shapes.json / shapes.js');
  }

  process.exit(0);
}

main();
