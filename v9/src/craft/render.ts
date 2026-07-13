import { planProduction } from './analysis';
import { formatComposition } from './atoms';
import { RECIPES, RECIPE_CODES } from './recipes';
import { stabilityOf } from './stability';
import { SUBSTANCES, SUBSTANCE_CODES, SUBSTANCE_MAP } from './substances';
import type { ItemStack, Recipe, RecipeKind, Substance, SubstanceTier } from './types';

/**
 * クラフトツリーデータのMarkdown表現を生成する。
 * docs/plan/craft_tree/spec_draft.md の生成セクションはここから出力され、
 * test/docs-sync.test.ts がデータとドキュメントの一致を保証する。
 */

const ABUNDANCE_LABEL: Record<string, string> = {
  abundant: '豊富',
  common: '中程度',
  limited: '限定的',
  rare: '希少',
};

const TIER_LABEL: Record<SubstanceTier, string> = {
  base: '最下層物質',
  intermediate: '中間物質',
  component: 'コンポーネント',
};

const KIND_LABEL: Record<RecipeKind, string> = {
  synthesis: '合成型',
  decomposition: '分解型',
  rearrangement: '再配置型',
  refine: '精製型',
  component: 'コンポーネント生成',
  disassembly: 'コンポーネント分解',
};

const formatStacks = (stacks: readonly ItemStack[]): string =>
  stacks
    .map(itemStack =>
      itemStack.count === 1 ? itemStack.substanceId : `${itemStack.substanceId}×${itemStack.count}`,
    )
    .join(' + ');

const substanceRow = (substance: Substance): string => {
  const natural =
    substance.naturalAbundance === undefined
      ? '-'
      : `産出（${ABUNDANCE_LABEL[substance.naturalAbundance]}）`;
  return `| ${substance.id} | ${SUBSTANCE_CODES.get(substance.id)} | ${formatComposition(substance.composition)} | ${stabilityOf(substance)} | ${natural} | ${substance.description} |`;
};

const substanceTable = (tier: SubstanceTier): string => {
  const rows = SUBSTANCES.filter(substance => substance.tier === tier).map(substanceRow);
  return [
    `### ${TIER_LABEL[tier]}（${rows.length}種）`,
    '',
    '| 物質 | コード | 構成 | 安定性 | 自然産出 | 説明 |',
    '|------|:---:|------|--------|----------|------|',
    ...rows,
    '',
  ].join('\n');
};

const recipeRow = (recipe: Recipe): string =>
  `| ${recipe.id} | ${RECIPE_CODES.get(recipe.id)} | ${formatStacks(recipe.inputs)} | ${formatStacks(recipe.outputs)} | ${recipe.energyCost} | ${recipe.summary} |`;

const recipeTable = (kind: RecipeKind): string => {
  const rows = RECIPES.filter(recipe => recipe.kind === kind).map(recipeRow);
  return [
    `### ${KIND_LABEL[kind]}（${rows.length}件）`,
    '',
    '| ID | コード | 入力 | 出力 | E | 概要 |',
    '|----|:---:|------|------|---|------|',
    ...rows,
    '',
  ].join('\n');
};

const costTable = (): string => {
  const components = SUBSTANCES.filter(substance => substance.tier === 'component');
  const planRow = (label: string, targets: readonly ItemStack[]): string => {
    const plan = planProduction(targets, SUBSTANCE_MAP, RECIPES);
    const naturals = [...plan.naturalConsumption.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([substanceId, count]) => `${substanceId}×${count}`)
      .join(', ');
    return `| ${label} | ${plan.totalEnergy} | ${plan.totalSteps} | ${naturals} |`;
  };
  return [
    '### 生産コスト（自然資源からの正準経路・貪欲展開による上界）',
    '',
    '| 対象 | エネルギー | 工程数 | 自然資源消費 |',
    '|------|-----------|--------|--------------|',
    ...components.map(component =>
      planRow(component.id, [{ substanceId: component.id, count: 1 }]),
    ),
    planRow('**一式（8種×1）**', components.map(component => ({ substanceId: component.id, count: 1 }))),
    '',
  ].join('\n');
};

export const renderCraftTables = (): string =>
  [
    '## 物質一覧',
    '',
    substanceTable('base'),
    substanceTable('intermediate'),
    substanceTable('component'),
    '## レシピ一覧',
    '',
    '全レシピの原子収支・到達可能性・循環は `npm test` で機械検証される。',
    'エネルギーコスト（E）は暫定値（正=消費、負=放出）。',
    'コード列はプログラムI/Oで使用する数値ID（データ定義順の連番。docs/specs/03_program_io.md）。',
    '',
    recipeTable('synthesis'),
    recipeTable('decomposition'),
    recipeTable('rearrangement'),
    recipeTable('refine'),
    recipeTable('component'),
    recipeTable('disassembly'),
    '## 生産コスト解析',
    '',
    costTable(),
  ].join('\n');
