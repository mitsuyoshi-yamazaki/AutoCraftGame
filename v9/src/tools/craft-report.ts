import { planProduction } from '../craft/analysis';
import { RECIPES } from '../craft/recipes';
import { renderCraftTables } from '../craft/render';
import { spontaneousRecipes, stabilityDelta } from '../craft/stability';
import { SUBSTANCES, SUBSTANCE_MAP } from '../craft/substances';
import { validateCraftTree } from '../craft/validate';

/**
 * クラフトツリーの検証・解析レポートをCLIに出力する。
 *
 * 使い方:
 *   npm run craft:report              -- 人間向けサマリー
 *   npm run craft:report -- --markdown -- ドキュメント用生成テーブル（spec_draft.mdへ転記）
 */

const printMarkdown = (): void => {
  console.log(renderCraftTables());
};

const printSummary = (): void => {
  const issues = validateCraftTree(SUBSTANCES, RECIPES);
  console.log('# クラフトツリー検証レポート');
  console.log('');
  console.log(`物質: ${SUBSTANCES.length}種 / レシピ: ${RECIPES.length}件`);
  console.log('');
  if (issues.length === 0) {
    console.log('検証: すべての検査を通過（原子保存・到達可能性・デッドエンド・原子循環・供給源）');
  } else {
    console.log(`検証: ${issues.length}件の問題`);
    for (const issue of issues) {
      console.log(`  [${issue.severity}] ${issue.code} ${issue.subject}: ${issue.message}`);
    }
  }
  console.log('');
  console.log('## 自発変化しうるレシピ（分解系かつ安定性増加）');
  for (const recipe of spontaneousRecipes(RECIPES, SUBSTANCE_MAP)) {
    console.log(`  ${recipe.id} (Δ安定性=+${stabilityDelta(recipe, SUBSTANCE_MAP)}): ${recipe.summary}`);
  }
  console.log('');
  console.log('## コンポーネント一式（8種×1）の生産計画');
  const fullSet = SUBSTANCES.filter(substance => substance.tier === 'component').map(substance => ({
    substanceId: substance.id,
    count: 1,
  }));
  const plan = planProduction(fullSet, SUBSTANCE_MAP, RECIPES);
  console.log(`  エネルギー: ${plan.totalEnergy}`);
  console.log(`  工程数（レシピ実行回数）: ${plan.totalSteps}`);
  console.log('  自然資源消費:');
  for (const [substanceId, count] of [...plan.naturalConsumption.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`    ${substanceId} ×${count}`);
  }
  console.log('  余剰在庫（副産物）:');
  for (const [substanceId, count] of [...plan.leftovers.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`    ${substanceId} ×${count}`);
  }
  console.log('  レシピ実行回数:');
  for (const [recipeId, invocations] of plan.recipeInvocations.entries()) {
    console.log(`    ${recipeId} ×${invocations}`);
  }
};

if (process.argv.includes('--markdown')) {
  printMarkdown();
} else {
  printSummary();
}
