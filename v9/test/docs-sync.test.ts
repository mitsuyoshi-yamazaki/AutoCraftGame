import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderCraftTables } from '../src/craft/render';

/**
 * 仕様ドキュメント（docs/plan/craft_tree/spec_draft.md）の生成セクションが
 * 実データ（src/craft/）と一致することを保証する。
 * データを変更したら `npm run craft:report -- --markdown` の出力を
 * 生成セクションへ貼り直すこと。
 */

const specPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/plan/craft_tree/spec_draft.md',
);

describe('仕様ドキュメントとデータの同期', () => {
  it('spec_draft.md の生成セクションは renderCraftTables() の出力と一致する', () => {
    const content = readFileSync(specPath, 'utf-8');
    const match = content.match(
      /<!-- generated:craft-tables:start[^>]*-->\n([\s\S]*?)<!-- generated:craft-tables:end -->/,
    );
    expect(match, '生成セクションのマーカーが見つからない').not.toBeNull();
    expect(match![1].trim()).toBe(renderCraftTables().trim());
  });
});
