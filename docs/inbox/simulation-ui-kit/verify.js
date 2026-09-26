/**
 * キット一式の検査。**導入したプロジェクトの CI でこれを回す。**
 *
 *   node verify.js                 パレットと形を検査する
 *   node verify.js --scan <dir>    そのディレクトリに生の色が直書きされていないかも調べる
 *
 * 終了コードは 0（通過）/ 1（不合格）。依存ゼロ（Node 同梱モジュールのみ）。
 *
 * 検査できるのは「色と形と寸法が規則を満たすか」だけである。
 * **「その絵が現象の意味を成しているか」は検査できない**——そこは人間が見る。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Recipes = require('./lib/recipes.js');
const Checks = require('./lib/checks.js');
const Shapes = require('./lib/shapes.js');
const Family = require('./lib/family.js');

const MARK = { pass: '  OK ', warn: ' WARN', fail: ' FAIL' };
/** 生の色の直書きを拾う。トークンを経由していれば hex は現れないはず。 */
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const SCAN_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.css', '.html'];
const SCAN_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'simulation-ui-kit']);

function write(line) { process.stdout.write(line + '\n'); }

function checkPalettes() {
  let failed = 0;
  Recipes.deriveAll().forEach((palette) => {
    const audit = Checks.auditPalette(palette);
    write('');
    write('■ パレット ' + palette.id + ' — ' + palette.label);
    audit.checks.forEach((check) => {
      write('  [' + MARK[check.status] + '] ' + check.rule + ' ' + check.label + ' — ' + check.detail);
    });
    if (audit.status === 'fail') failed++;
  });
  return failed;
}

function checkShapes() {
  const derived = Family.derive();
  const cells = Family.matrix(derived.kept);
  write('');
  write('■ 形の族（' + derived.kept.length + '）');
  derived.kept.forEach((shape) => {
    const even = Shapes.hasEvenSymmetry(shape);
    write('  [' + MARK[even ? 'pass' : 'fail'] + '] ' + shape.id
      + ' 対称 ' + (shape.m || '∞') + ' / 面積合わせ ×' + shape.areaScale.toFixed(3));
  });
  const collapses = Family.farCollapses(derived.kept, cells);
  if (collapses.length) {
    write('  [' + MARK.warn + '] 遠景で輪郭の差が消える対 ' + collapses.length + ' 組 — '
      + collapses.map((c) => c.a + '↔' + c.b).join('、'));
    write('        → 遠景では形に頼らず、点に落として色で運ぶ（規約 B-8）');
  }
  return derived.kept.filter((shape) => !Shapes.hasEvenSymmetry(shape)).length;
}

/** 導入先に生の色が直書きされていないか（規約 B-1 / B-5 を守れているかの目安）。 */
function scanRawColors(root) {
  const hits = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (error) { return; }
    entries.forEach((entry) => {
      if (entry.name.startsWith('.') || SCAN_SKIP.has(entry.name)) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!SCAN_EXTENSIONS.includes(path.extname(entry.name))) return;
      fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
        if (RAW_COLOR.test(line)) hits.push(full + ':' + (index + 1) + '  ' + line.trim().slice(0, 90));
      });
    });
  }
  walk(root);
  write('');
  write('■ 生の色の直書き（' + root + '）');
  if (!hits.length) {
    write('  [' + MARK.pass + '] 見つからなかった。色はトークン経由で来ている');
    return 0;
  }
  write('  [' + MARK.warn + '] ' + hits.length + ' 箇所。トークンへ寄せられないか見よ');
  hits.slice(0, 40).forEach((hit) => write('    ' + hit));
  if (hits.length > 40) write('    …ほか ' + (hits.length - 40) + ' 箇所');
  return 0;
}

/**
 * 本リポジトリの中でだけ働く検査: 配布用の写し（CONVENTION.md）と
 * 原本（docs/subprojects/standards/simulation-ui/convention.md）の**条項の見出しが一致するか**。
 * 配布先には原本が無いので、その場合は黙って飛ばす。
 */
function checkConventionSync() {
  const source = path.join(__dirname, '../../../docs/subprojects/standards/simulation-ui/convention.md');
  const copy = path.join(__dirname, 'CONVENTION.md');
  if (!fs.existsSync(source) || !fs.existsSync(copy)) return 0;
  const clauses = (file) => (fs.readFileSync(file, 'utf8').match(/^### [ABC]-\d+\..*$/gm) || [])
    .map((line) => line.replace(/^### /, '').trim());
  const a = clauses(source), b = clauses(copy);
  const missing = a.filter((clause) => b.indexOf(clause) < 0);
  const extra = b.filter((clause) => a.indexOf(clause) < 0);
  write('');
  write('■ 配布用の写しと原本の条項（本リポジトリ内でのみ検査）');
  if (!missing.length && !extra.length) {
    write('  [' + MARK.pass + '] ' + a.length + ' 条が一致している');
    return 0;
  }
  missing.forEach((clause) => write('  [' + MARK.fail + '] 写しに無い: ' + clause));
  extra.forEach((clause) => write('  [' + MARK.fail + '] 原本に無い: ' + clause));
  return missing.length + extra.length;
}

function main() {
  const scanIndex = process.argv.indexOf('--scan');
  let failed = checkPalettes() + checkShapes() + checkConventionSync();
  if (scanIndex >= 0 && process.argv[scanIndex + 1]) failed += scanRawColors(process.argv[scanIndex + 1]);
  write('');
  write(failed ? '不合格 ' + failed + ' 件' : 'すべて通過');
  process.exit(failed ? 1 : 0);
}

main();
