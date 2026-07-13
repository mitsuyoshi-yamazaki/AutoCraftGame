import { ATOMS, addCompositions, emptyComposition } from './atoms';
import type { Atom, AtomComposition } from './atoms';
import type { ItemStack, Recipe, Substance } from './types';

/**
 * クラフトツリーの静的検証。
 * クラフトツリーは「原子保存付きグラフ設計問題」であり（policy.md）、
 * 以下の性質を機械的に検査する:
 * - 原子保存: 全レシピで入力と出力の原子収支が一致する
 * - 到達可能性: 全物質が自然産出またはレシピ連鎖で入手可能
 * - デッドエンドなし: 全物質がいずれかのレシピで消費可能
 * - 原子循環: 使用中の全原子種が長さ2以上の変換循環を持つ
 * - 供給源: 使用中の全原子種が自然産出物質に含まれる
 */

export type ValidationCode =
  | 'DUPLICATE_ID'
  | 'UNKNOWN_SUBSTANCE'
  | 'INVALID_COUNT'
  | 'ATOM_IMBALANCE'
  | 'UNREACHABLE'
  | 'DEAD_END'
  | 'NO_ATOM_CYCLE'
  | 'NO_NATURAL_SOURCE'
  | 'RECIPE_SIZE';

export type ValidationIssue = Readonly<{
  severity: 'error' | 'warning';
  code: ValidationCode;
  /** レシピID・物質ID・原子記号のいずれか */
  subject: string;
  message: string;
}>;

/** 材料/生成物の記載数の目安（requirements.md。強い制約ではないためwarning） */
const MAX_RECIPE_STACKS = 4;

const sumComposition = (
  stacks: readonly ItemStack[],
  substanceMap: ReadonlyMap<string, Substance>,
): Readonly<Record<Atom, number>> =>
  stacks.reduce<Readonly<Record<Atom, number>>>(
    (acc, itemStack) =>
      addCompositions(acc, substanceMap.get(itemStack.substanceId)?.composition ?? {}, itemStack.count),
    emptyComposition(),
  );

const checkDuplicateIds = (substances: readonly Substance[], recipes: readonly Recipe[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const { id, kind } of [
    ...substances.map(substance => ({ id: substance.id, kind: '物質' })),
    ...recipes.map(recipe => ({ id: recipe.id, kind: 'レシピ' })),
  ]) {
    if (seen.has(id)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_ID', subject: id, message: `${kind}ID ${id} が重複している` });
    }
    seen.add(id);
  }
  return issues;
};

const checkRecipeIntegrity = (
  recipes: readonly Recipe[],
  substanceMap: ReadonlyMap<string, Substance>,
): ValidationIssue[] =>
  recipes.flatMap(recipe => {
    const issues: ValidationIssue[] = [];
    for (const itemStack of [...recipe.inputs, ...recipe.outputs]) {
      if (!substanceMap.has(itemStack.substanceId)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_SUBSTANCE',
          subject: recipe.id,
          message: `レシピ ${recipe.id} が未定義の物質 ${itemStack.substanceId} を参照している`,
        });
      }
      if (!Number.isInteger(itemStack.count) || itemStack.count <= 0) {
        issues.push({
          severity: 'error',
          code: 'INVALID_COUNT',
          subject: recipe.id,
          message: `レシピ ${recipe.id} の ${itemStack.substanceId} の個数 ${itemStack.count} が正の整数でない`,
        });
      }
    }
    if (recipe.inputs.length > MAX_RECIPE_STACKS || recipe.outputs.length > MAX_RECIPE_STACKS) {
      issues.push({
        severity: 'warning',
        code: 'RECIPE_SIZE',
        subject: recipe.id,
        message: `レシピ ${recipe.id} の材料/生成物の記載数が目安の${MAX_RECIPE_STACKS}を超えている`,
      });
    }
    return issues;
  });

const checkAtomBalance = (
  recipes: readonly Recipe[],
  substanceMap: ReadonlyMap<string, Substance>,
): ValidationIssue[] =>
  recipes.flatMap(recipe => {
    const hasUnknownReference = [...recipe.inputs, ...recipe.outputs].some(
      itemStack => !substanceMap.has(itemStack.substanceId),
    );
    if (hasUnknownReference) {
      return []; // 参照エラーとして別途報告済み
    }
    const inputTotal = sumComposition(recipe.inputs, substanceMap);
    const outputTotal = sumComposition(recipe.outputs, substanceMap);
    const imbalancedAtoms = ATOMS.filter(atom => inputTotal[atom] !== outputTotal[atom]);
    if (imbalancedAtoms.length === 0) {
      return [];
    }
    const detail = imbalancedAtoms
      .map(atom => `${atom}: ${inputTotal[atom]}→${outputTotal[atom]}`)
      .join(', ');
    return [
      {
        severity: 'error' as const,
        code: 'ATOM_IMBALANCE' as const,
        subject: recipe.id,
        message: `レシピ ${recipe.id} の原子収支が一致しない（${detail}）`,
      },
    ];
  });

/** 自然産出物質を起点に、材料が全て揃うレシピを繰り返し適用して到達可能集合を求める */
const reachableSubstances = (
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): Set<string> => {
  const reachable = new Set(
    substances.filter(substance => substance.naturalAbundance !== undefined).map(substance => substance.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const recipe of recipes) {
      const applicable = recipe.inputs.every(itemStack => reachable.has(itemStack.substanceId));
      if (!applicable) {
        continue;
      }
      for (const itemStack of recipe.outputs) {
        if (!reachable.has(itemStack.substanceId)) {
          reachable.add(itemStack.substanceId);
          changed = true;
        }
      }
    }
  }
  return reachable;
};

const checkReachability = (
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): ValidationIssue[] => {
  const reachable = reachableSubstances(substances, recipes);
  return substances
    .filter(substance => !reachable.has(substance.id))
    .map(substance => ({
      severity: 'error' as const,
      code: 'UNREACHABLE' as const,
      subject: substance.id,
      message: `物質 ${substance.id} は自然産出せず、どのレシピ連鎖でも生成できない`,
    }));
};

const checkDeadEnds = (
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): ValidationIssue[] => {
  const consumed = new Set(recipes.flatMap(recipe => recipe.inputs.map(itemStack => itemStack.substanceId)));
  return substances
    .filter(substance => !consumed.has(substance.id))
    .map(substance => ({
      severity: 'error' as const,
      code: 'DEAD_END' as const,
      subject: substance.id,
      message: `物質 ${substance.id} を消費するレシピがない（デッドエンド）`,
    }));
};

/** 原子ごとの変換グラフ（その原子を含む物質間の入力→出力エッジ）に長さ2以上の閉路があるか */
const hasAtomCycle = (
  atom: Atom,
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): boolean => {
  const carriers = new Set(
    substances.filter(substance => (substance.composition[atom] ?? 0) > 0).map(substance => substance.id),
  );
  const edges = new Map<string, Set<string>>();
  for (const recipe of recipes) {
    for (const input of recipe.inputs) {
      if (!carriers.has(input.substanceId)) {
        continue;
      }
      for (const output of recipe.outputs) {
        if (!carriers.has(output.substanceId) || output.substanceId === input.substanceId) {
          continue;
        }
        const targets = edges.get(input.substanceId) ?? new Set<string>();
        targets.add(output.substanceId);
        edges.set(input.substanceId, targets);
      }
    }
  }
  // DFSで有向閉路を探す
  const visitState = new Map<string, 'visiting' | 'done'>();
  const visit = (node: string): boolean => {
    const state = visitState.get(node);
    if (state === 'visiting') {
      return true;
    }
    if (state === 'done') {
      return false;
    }
    const found = [...(edges.get(node) ?? [])].some(next => {
      visitState.set(node, 'visiting');
      return visit(next);
    });
    visitState.set(node, 'done');
    return found;
  };
  return [...carriers].some(carrier => {
    visitState.clear();
    return visit(carrier);
  });
};

const checkAtomCirculation = (
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): ValidationIssue[] => {
  const usedAtoms = ATOMS.filter(atom =>
    substances.some(substance => (substance.composition[atom] ?? 0) > 0),
  );
  return usedAtoms
    .filter(atom => !hasAtomCycle(atom, substances, recipes))
    .map(atom => ({
      severity: 'error' as const,
      code: 'NO_ATOM_CYCLE' as const,
      subject: atom,
      message: `原子 ${atom} に長さ2以上の循環経路がない`,
    }));
};

const checkNaturalSources = (substances: readonly Substance[]): ValidationIssue[] => {
  const usedAtoms = ATOMS.filter(atom =>
    substances.some(substance => (substance.composition[atom] ?? 0) > 0),
  );
  return usedAtoms
    .filter(
      atom =>
        !substances.some(
          substance => substance.naturalAbundance !== undefined && (substance.composition[atom] ?? 0) > 0,
        ),
    )
    .map(atom => ({
      severity: 'error' as const,
      code: 'NO_NATURAL_SOURCE' as const,
      subject: atom,
      message: `原子 ${atom} を含む自然産出物質がなく、世界に供給されない`,
    }));
};

export const validateCraftTree = (
  substances: readonly Substance[],
  recipes: readonly Recipe[],
): ValidationIssue[] => {
  const substanceMap = new Map(substances.map(substance => [substance.id, substance]));
  return [
    ...checkDuplicateIds(substances, recipes),
    ...checkRecipeIntegrity(recipes, substanceMap),
    ...checkAtomBalance(recipes, substanceMap),
    ...checkReachability(substances, recipes),
    ...checkDeadEnds(substances, recipes),
    ...checkAtomCirculation(substances, recipes),
    ...checkNaturalSources(substances),
  ];
};

export const validationErrors = (issues: readonly ValidationIssue[]): ValidationIssue[] =>
  issues.filter(issue => issue.severity === 'error');
