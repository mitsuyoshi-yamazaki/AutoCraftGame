import type { ItemStack, Recipe, Substance } from './types';

/**
 * 生産計画の静的解析。
 * 「ある物質を自然資源からクラフトするには何をどれだけ集め、
 * 何回レシピを実行し、どれだけエネルギーを使うか」を決定論的に求める。
 *
 * 目的:
 * - 再生産コスト（コンポーネント一式の新規生産）の定量化
 * - 祖先種プログラムが実行すべき工程数の見積もり
 *
 * 方式は貪欲展開: 対象物質を生産する最初のレシピ（データ定義順）を
 * 正準レシピとして採用し、副産物は在庫として後続の要求に充当する。
 * 最適解ではないが、決定論的で再現可能な上界を与える。
 */

export type ProductionPlan = Readonly<{
  targets: readonly ItemStack[];
  /** レシピID → 実行回数 */
  recipeInvocations: ReadonlyMap<string, number>;
  /** 自然資源の消費量（物質ID → 個数） */
  naturalConsumption: ReadonlyMap<string, number>;
  /** 計画完了時の余剰在庫（副産物等） */
  leftovers: ReadonlyMap<string, number>;
  /** レシピのエネルギーコスト合計（正=消費） */
  totalEnergy: number;
  /** レシピ実行回数の合計（工程数） */
  totalSteps: number;
}>;

const canonicalProducer = (
  substanceId: string,
  recipes: readonly Recipe[],
): Recipe | undefined =>
  recipes.find(
    recipe =>
      recipe.kind !== 'disassembly' &&
      recipe.outputs.some(output => output.substanceId === substanceId) &&
      // 触媒パススルー等、入力に同じ物質を要求するレシピは正準生産経路にしない
      !recipe.inputs.some(input => input.substanceId === substanceId),
  );

export const planProduction = (
  targets: readonly ItemStack[],
  substanceMap: ReadonlyMap<string, Substance>,
  recipes: readonly Recipe[],
): ProductionPlan => {
  const inventory = new Map<string, number>();
  const naturalConsumption = new Map<string, number>();
  const recipeInvocations = new Map<string, number>();

  const takeFromInventory = (substanceId: string, count: number): number => {
    const stocked = inventory.get(substanceId) ?? 0;
    const taken = Math.min(stocked, count);
    if (taken > 0) {
      inventory.set(substanceId, stocked - taken);
    }
    return count - taken;
  };

  const produce = (substanceId: string, count: number, productionStack: readonly string[]): void => {
    const remaining = takeFromInventory(substanceId, count);
    if (remaining === 0) {
      return;
    }
    const substance = substanceMap.get(substanceId);
    if (substance === undefined) {
      throw new Error(`未定義の物質: ${substanceId}`);
    }
    if (substance.naturalAbundance !== undefined) {
      naturalConsumption.set(substanceId, (naturalConsumption.get(substanceId) ?? 0) + remaining);
      return;
    }
    if (productionStack.includes(substanceId)) {
      throw new Error(`生産経路が循環している: ${[...productionStack, substanceId].join(' → ')}`);
    }
    const recipe = canonicalProducer(substanceId, recipes);
    if (recipe === undefined) {
      throw new Error(`${substanceId} を生産するレシピがない`);
    }
    const outputCount =
      recipe.outputs.find(output => output.substanceId === substanceId)?.count ?? 0;
    const invocations = Math.ceil(remaining / outputCount);
    for (const input of recipe.inputs) {
      produce(input.substanceId, input.count * invocations, [...productionStack, substanceId]);
    }
    recipeInvocations.set(recipe.id, (recipeInvocations.get(recipe.id) ?? 0) + invocations);
    for (const output of recipe.outputs) {
      inventory.set(
        output.substanceId,
        (inventory.get(output.substanceId) ?? 0) + output.count * invocations,
      );
    }
    const shortfall = takeFromInventory(substanceId, remaining);
    if (shortfall > 0) {
      throw new Error(`${substanceId} の生産計画が不足した（残り${shortfall}）`);
    }
  };

  for (const target of targets) {
    produce(target.substanceId, target.count, []);
  }

  const totalEnergy = [...recipeInvocations.entries()].reduce((sum, [recipeId, invocations]) => {
    const recipe = recipes.find(candidate => candidate.id === recipeId);
    return recipe === undefined ? sum : sum + recipe.energyCost * invocations;
  }, 0);
  const totalSteps = [...recipeInvocations.values()].reduce((sum, invocations) => sum + invocations, 0);
  const leftovers = new Map([...inventory.entries()].filter(([, count]) => count > 0));

  return {
    targets,
    recipeInvocations,
    naturalConsumption,
    leftovers,
    totalEnergy,
    totalSteps,
  };
};
