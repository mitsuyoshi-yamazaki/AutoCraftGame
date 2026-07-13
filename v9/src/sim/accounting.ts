/**
 * 世界の原子・エネルギー会計。
 * 原子種ごとの総量は不変でなければならない（docs/specs/04_craft_energy.md の世界不変条件）。
 */

import { ATOMS, addCompositions, emptyComposition } from '../craft/atoms';
import type { Atom } from '../craft/atoms';
import { recipeByCode, substanceByCode, SUBSTANCE_MAP } from './codes';
import type { World } from './types';

/**
 * 世界に存在する全原子を種類別に集計する。
 * 対象: MatterNode残量、地面の物体、コンポーネント自身、Storage内容物、
 * 作業中Assemblerの消費済み材料（クラフト中は原子が「機械の中」にある）。
 */
export const totalAtoms = (world: World): Readonly<Record<Atom, number>> => {
  let total = emptyComposition();
  for (const obj of world.objects) {
    if (obj.kind === 'matterNode') {
      const substance = substanceByCode(obj.substanceCode);
      if (substance !== undefined) total = addCompositions(total, substance.composition, obj.remaining);
    } else if (obj.kind === 'ground') {
      const substance = substanceByCode(obj.substanceCode);
      if (substance !== undefined) total = addCompositions(total, substance.composition, obj.count);
    } else if (obj.kind === 'component') {
      const substance = SUBSTANCE_MAP.get(obj.componentType);
      if (substance !== undefined) total = addCompositions(total, substance.composition, 1);
      if (obj.componentType === 'Storage') {
        for (const [code, count] of obj.items) {
          const item = substanceByCode(code);
          if (item !== undefined) total = addCompositions(total, item.composition, count);
        }
      }
      if (obj.componentType === 'Assembler' && (obj.phase === 'crafting' || obj.phase === 'assembling')) {
        const recipe = recipeByCode(obj.configuredRecipe);
        if (recipe !== undefined) {
          for (const input of recipe.inputs) {
            const substanceIn = SUBSTANCE_MAP.get(input.substanceId);
            if (substanceIn !== undefined) total = addCompositions(total, substanceIn.composition, input.count);
          }
        }
      }
    }
  }
  return total;
};

export const totalEnergy = (world: World): number => {
  let sum = 0;
  for (const obj of world.objects) {
    if (obj.kind === 'component' && obj.componentType === 'Storage') sum += obj.energy;
    else if (obj.kind === 'energyPile') sum += obj.amount;
  }
  return sum;
};

export const formatAtomTotals = (totals: Readonly<Record<Atom, number>>): string =>
  ATOMS.map(atom => `${atom}:${totals[atom]}`).join(' ');
