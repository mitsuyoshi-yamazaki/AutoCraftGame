/**
 * パレットを処方から導出し、検査して書き出す。
 *
 *   node apps/standards/simulation-ui-lab/derive.js            # 導出して書き出し、報告を出す
 *   node apps/standards/simulation-ui-lab/derive.js --check    # 書き出さず検査だけ（失敗で終了コード 1）
 *
 * 出力:
 *   tokens.json  機械が読む正のトークン（他のアプリはこれを読む）
 *   tokens.js    ブラウザ用。file:// で開ける古典スクリプトにするため、同じ内容を window へ載せる
 *
 * 依存ゼロ（Node 同梱モジュールのみ）。npm を使わないのは本リポジトリの制約に合わせたもの。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Recipes = require('./lib/recipes.js');
const Checks = require('./lib/checks.js');

const OUT_DIR = __dirname;
const STATUS_MARK = { pass: '  OK ', warn: ' WARN', fail: ' FAIL' };

function write(line) { process.stdout.write(line + '\n'); }

function report(palette, audit) {
  write('');
  write('■ ' + palette.id + ' — ' + palette.label);
  write('  面 ' + palette.surface.base + ' / 文字 ' + palette.surface.ink
    + ' / 原典 ' + palette.source.categorical + '・' + palette.source.sequential + '・' + palette.source.diverging);
  write('  カテゴリ ' + palette.categorical.length + '色: ' + palette.categorical.join(' '));
  audit.checks.forEach((check) => {
    write('  [' + STATUS_MARK[check.status] + '] ' + check.rule + ' ' + check.label + ' — ' + check.detail);
  });
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const palettes = Recipes.deriveAll();
  const audits = palettes.map((palette) => Checks.auditPalette(palette));

  palettes.forEach((palette, index) => report(palette, audits[index]));

  const failed = audits.filter((audit) => audit.status === 'fail').length;
  const warned = audits.filter((audit) => audit.status === 'warn').length;
  write('');
  write('パレット ' + palettes.length + ' 件・fail ' + failed + '・warn ' + warned);

  if (!checkOnly) {
    const payload = { generatedBy: 'derive.js', palettes };
    fs.writeFileSync(path.join(OUT_DIR, 'tokens.json'), JSON.stringify(payload, null, 2) + '\n');
    fs.writeFileSync(
      path.join(OUT_DIR, 'tokens.js'),
      '/* 生成物。手で編集しない。`node derive.js` で作り直す。 */\n'
      + 'window.SimUITokens = ' + JSON.stringify(payload, null, 2) + ';\n'
    );
    write('書き出し: tokens.json / tokens.js');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
