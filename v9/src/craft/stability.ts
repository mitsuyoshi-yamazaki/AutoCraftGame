import { ATOMS } from './atoms';
import type { Atom } from './atoms';
import type { Recipe, Substance, SubstanceTier } from './types';

/**
 * 安定性モデル。
 *
 * 元ドラフト（spec_draft.md 初版）では
 *   安定性 = k1*S + k2*B - k3*A - k4*T - k5*I + k6*X
 * という原子構成の線形和だったが、原子保存の下では線形和の合計は
 * どのレシピでも不変になり、「より安定な物質へ自発変化する」という
 * 方向が定義できない（test/stability.test.ts で機械的に確認している）。
 *
 * そのため本実装では階層ペナルティ（複雑な構造ほど壊れやすい）を導入する。
 * 自発変化は独立した変換ルールテーブルを持たず、既存のレシピテーブルを再利用する:
 * 分解系レシピ（decomposition / disassembly）のうち合計安定性が閾値以上
 * 増加するものだけが、実行者なしで低速に発生しうる。
 * 発生速度・温度依存はシミュレータ仕様（Step 2）で定義する。
 */

export const STABILITY_COEFFICIENTS: Readonly<Record<Atom, number>> = {
  S: 10,
  B: 4,
  A: -12,
  T: -6,
  I: -8,
  C: 0,
  X: 8,
};

/** 構造の複雑さによる不安定化。高次の物質ほど自然分解しやすい */
export const TIER_STRUCTURE_PENALTY: Readonly<Record<SubstanceTier, number>> = {
  base: 0,
  intermediate: -5,
  component: -15,
};

/** 合計安定性がこの閾値以上増加する分解系レシピのみ自発変化しうる */
export const SPONTANEOUS_STABILITY_THRESHOLD = 10;

const linearStability = (substance: Substance): number =>
  ATOMS.reduce(
    (sum, atom) => sum + (substance.composition[atom] ?? 0) * STABILITY_COEFFICIENTS[atom],
    0,
  );

export const stabilityOf = (substance: Substance): number =>
  linearStability(substance) + TIER_STRUCTURE_PENALTY[substance.tier];

const totalStability = (
  stacks: Recipe['inputs'],
  substanceMap: ReadonlyMap<string, Substance>,
  scorer: (substance: Substance) => number,
): number =>
  stacks.reduce((sum, itemStack) => {
    const substance = substanceMap.get(itemStack.substanceId);
    return substance === undefined ? sum : sum + scorer(substance) * itemStack.count;
  }, 0);

/** レシピ実行による合計安定性の変化（正=より安定な方向） */
export const stabilityDelta = (
  recipe: Recipe,
  substanceMap: ReadonlyMap<string, Substance>,
): number =>
  totalStability(recipe.outputs, substanceMap, stabilityOf) -
  totalStability(recipe.inputs, substanceMap, stabilityOf);

/** 線形項のみの変化。原子保存が成立していれば必ず0になる（モデルの退化の証明用） */
export const linearStabilityDelta = (
  recipe: Recipe,
  substanceMap: ReadonlyMap<string, Substance>,
): number =>
  totalStability(recipe.outputs, substanceMap, linearStability) -
  totalStability(recipe.inputs, substanceMap, linearStability);

export const isSpontaneousCandidate = (
  recipe: Recipe,
  substanceMap: ReadonlyMap<string, Substance>,
): boolean =>
  (recipe.kind === 'decomposition' || recipe.kind === 'disassembly') &&
  stabilityDelta(recipe, substanceMap) >= SPONTANEOUS_STABILITY_THRESHOLD;

export const spontaneousRecipes = (
  recipes: readonly Recipe[],
  substanceMap: ReadonlyMap<string, Substance>,
): Recipe[] => recipes.filter(recipe => isSpontaneousCandidate(recipe, substanceMap));
